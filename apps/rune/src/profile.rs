//! Presentation preferences only. No gateway snapshots or OpenCode state live here.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Preferences {
    pub project_models: std::collections::BTreeMap<String, oc_gateway::types::ModelRef>,
    pub model_variants: std::collections::BTreeMap<String, Option<String>>,
    pub project: Option<String>,
    pub closed_projects: Vec<String>,
    #[serde(
        serialize_with = "serialize_folders",
        deserialize_with = "deserialize_folders"
    )]
    pub opened_projects: Vec<oc_gateway::types::Project>,
    pub sidebar_width: Option<f32>,
    pub sidebar_closed: bool,
    pub focus: bool,
    pub focus_excluded: std::collections::BTreeSet<String>,
    pub dark: Option<bool>,
    pub preset: String,
    pub accent: Option<String>,
    pub chat_font_size: Option<f32>,
    pub notifications: std::collections::BTreeMap<String, bool>,
    pub theme: Option<ThemePreference>,
    pub terminal_right: bool,
    pub task_assignee: String,
}
// Opened folders are presentation ownership, not cached OpenCode projects.
// Never write native IDs, VCS, icons or recency metadata into the profile.
fn serialize_folders<S: serde::Serializer>(
    projects: &[oc_gateway::types::Project],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    projects
        .iter()
        .map(|p| serde_json::json!({"directory":p.canonical,"name":p.name}))
        .collect::<Vec<_>>()
        .serialize(serializer)
}
fn deserialize_folders<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<oc_gateway::types::Project>, D::Error> {
    #[derive(Deserialize)]
    struct Folder {
        #[serde(alias = "canonical")]
        directory: String,
        name: Option<String>,
    }
    let folders = Vec::<Folder>::deserialize(deserializer)?;
    Ok(folders
        .into_iter()
        .map(|folder| oc_gateway::types::Project {
            id: format!("folder:{}", folder.directory),
            canonical: folder.directory,
            name: folder.name,
            icon: None,
            vcs: None,
            time: Default::default(),
        })
        .collect())
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct VariantPreference {
    pub preset: String,
    pub surface: Option<String>,
    pub ink: Option<String>,
    pub accent: Option<String>,
    pub contrast: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct ThemePreference {
    pub mode: String,
    pub light: VariantPreference,
    pub dark: VariantPreference,
}
impl Default for ThemePreference {
    fn default() -> Self {
        Self {
            mode: "system".into(),
            light: Default::default(),
            dark: Default::default(),
        }
    }
}
impl ThemePreference {
    pub fn variant(&self, dark: bool) -> &VariantPreference {
        if dark { &self.dark } else { &self.light }
    }
    pub fn variant_mut(&mut self, dark: bool) -> &mut VariantPreference {
        if dark {
            &mut self.dark
        } else {
            &mut self.light
        }
    }
}
pub struct Profile {
    pub loaded: Arc<Mutex<Option<Preferences>>>,
    save: mpsc::Sender<Preferences>,
}
impl Profile {
    pub fn start(wake: impl Fn() + Send + 'static) -> Self {
        let loaded = Arc::new(Mutex::new(None));
        let out = loaded.clone();
        let (save, receiver) = mpsc::channel::<Preferences>();
        std::thread::Builder::new()
            .name("preferences".into())
            .spawn(move || {
                let directory = std::env::var_os("OPENCODEX_DATA_DIR")
                    .map(PathBuf::from)
                    .or_else(|| {
                        std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".opencodex/rune"))
                    });
                let path = directory.as_ref().map(|d| d.join("preferences.json"));
                let prefs = path
                    .as_ref()
                    .and_then(|p| match std::fs::read(p) {
                        Ok(bytes) => match serde_json::from_slice(&bytes) {
                            Ok(prefs) => Some(prefs),
                            Err(e) => {
                                eprintln!("Rune preferences: {e}");
                                None
                            }
                        },
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                        Err(e) => {
                            eprintln!("Rune preferences: {e}");
                            None
                        }
                    })
                    .unwrap_or_default();
                *out.lock().expect("preferences") = Some(prefs);
                wake();
                while let Ok(mut prefs) = receiver.recv() {
                    while let Ok(next) = receiver.try_recv() {
                        prefs = next;
                    }
                    if let (Some(dir), Some(path)) = (&directory, &path) {
                        let write = || -> Result<(), Box<dyn std::error::Error>> {
                            std::fs::create_dir_all(dir)?;
                            let temp = dir.join("preferences.json.new");
                            std::fs::write(&temp, serde_json::to_vec(&prefs)?)?;
                            std::fs::rename(temp, path)?;
                            Ok(())
                        };
                        if let Err(e) = write() {
                            eprintln!("Rune preferences: {e}");
                        }
                    }
                }
            })
            .expect("preferences worker");
        Self { loaded, save }
    }
    pub fn save(&self, prefs: Preferences) {
        let _ = self.save.send(prefs);
    }
}
