use reqwest::blocking::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

pub struct Installed {
    pub path: PathBuf,
    pub version: String,
    requirement: String,
}
pub struct Release {
    pub version: String,
    url: String,
    digest: String,
    size: u64,
}
pub struct Staged {
    _directory: tempfile::TempDir,
    path: PathBuf,
    version: String,
}
const MAX_BYTES: u64 = 1024 * 1024 * 1024;
const ID: &str = "dev.opencodex.rune";
const REPO: &str = "https://api.github.com/repos/KMKoushik/opencodex/releases/latest";

fn run(command: &mut Command) -> Result<String, String> {
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().into())
}
fn plist(path: &Path, key: &str) -> Result<String, String> {
    run(Command::new("/usr/bin/plutil")
        .args(["-extract", key, "raw", "-o", "-"])
        .arg(path.join("Contents/Info.plist")))
}
impl Installed {
    pub fn load() -> Result<Self, String> {
        if !cfg!(target_os = "macos") {
            return Err("In-app updates are currently available on macOS only.".into());
        }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let path = exe
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .filter(|p| p.extension().is_some_and(|e| e == "app"))
            .ok_or("Updates are available in installed builds, not development.")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if plist(&path, "CFBundleIdentifier")? != ID {
            return Err("Unexpected application identifier.".into());
        }
        run(Command::new("/usr/bin/codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(&path))?;
        let output = Command::new("/usr/bin/codesign")
            .args(["-d", "-r-"])
            .arg(&path)
            .output()
            .map_err(|e| e.to_string())?;
        let details = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let requirement = signing_requirement(&details)?;
        let version = plist(&path, "CFBundleShortVersionString")?;
        semver::Version::parse(&version).map_err(|e| e.to_string())?;
        Ok(Self {
            path,
            version,
            requirement,
        })
    }
}
fn signing_requirement(details: &str) -> Result<String, String> {
    let requirement = details.lines()
        .find_map(|l| l.strip_prefix("# ").unwrap_or(l).strip_prefix("designated => "))
        .ok_or("Missing signing requirement.")?;
    if !requirement.contains("certificate") || requirement.contains("cdhash") {
        return Err("This ad-hoc build has no stable update signing identity. Install a signed release.".into());
    }
    Ok(requirement.into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn update_identity_accepts_codesigns_implicit_certificate_requirement_but_not_adhoc_cdhash() {
        assert!(super::signing_requirement("Executable=/app\n# designated => cdhash H\"1234\"").is_err());
        let requirement = "identifier dev.opencodex.rune and certificate leaf = H\"1234\"";
        assert_eq!(super::signing_requirement(&format!("# designated => {requirement}")).unwrap(), requirement);
        assert_eq!(super::signing_requirement(&format!("designated => {requirement}")).unwrap(), requirement);
    }
}
fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("OpenCodex-Rune-Updater")
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}
pub fn check(installed: &Installed) -> Result<Option<Release>, String> {
    let response = client()?
        .get(REPO)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    response
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Update release metadata is too large.".into());
    }
    let info: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if info["draft"] == true || info["prerelease"] == true {
        return Ok(None);
    }
    let version = info["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');
    let next = semver::Version::parse(version).map_err(|e| e.to_string())?;
    if !next.pre.is_empty()
        || next <= semver::Version::parse(&installed.version).map_err(|e| e.to_string())?
    {
        return Ok(None);
    }
    let name = format!("OpenCodex-Rune-{version}-arm64.zip");
    let asset = info["assets"]
        .as_array()
        .and_then(|a| a.iter().find(|a| a["name"] == name))
        .ok_or("This release has no Rune arm64 update asset.")?;
    let size = asset["size"]
        .as_u64()
        .filter(|s| *s > 0 && *s <= MAX_BYTES)
        .ok_or("Invalid update size.")?;
    let digest = asset["digest"]
        .as_str()
        .and_then(|d| d.strip_prefix("sha256:"))
        .filter(|d| d.len() == 64 && d.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("Update asset has no SHA-256 digest.")?
        .to_ascii_lowercase();
    let url = asset["browser_download_url"]
        .as_str()
        .ok_or("Missing update URL.")?;
    if !url.starts_with("https://github.com/KMKoushik/opencodex/releases/download/") {
        return Err("Unexpected update origin.".into());
    }
    Ok(Some(Release {
        version: version.into(),
        url: url.into(),
        digest,
        size,
    }))
}
fn verify(installed: &Installed, path: &Path, version: &str) -> Result<(), String> {
    if plist(path, "CFBundleIdentifier")? != ID
        || plist(path, "CFBundleShortVersionString")? != version
    {
        return Err("Update bundle identity/version does not match the release.".into());
    }
    run(Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict", "-R"])
        .arg(&installed.requirement)
        .arg(path))?;
    Ok(())
}
pub fn download(
    installed: &Installed,
    release: &Release,
    mut progress: impl FnMut(u64),
) -> Result<Staged, String> {
    let directory = tempfile::Builder::new()
        .prefix(".opencodex-update-")
        .tempdir_in(
            installed
                .path
                .parent()
                .ok_or("Missing installation folder.")?,
        )
        .map_err(|e| e.to_string())?;
    let archive = directory.path().join("update.zip");
    let mut response = client()?
        .get(&release.url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let mut output = fs::File::create(&archive).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut received = 0;
    let mut last = 0;
    let mut buffer = [0; 65536];
    loop {
        let n = response.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > release.size {
            return Err("Update exceeds its advertised size.".into());
        }
        output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        hash.update(&buffer[..n]);
        let percent = received * 100 / release.size;
        if percent != last {
            progress(percent);
            last = percent;
        }
    }
    if received != release.size || format!("{:x}", hash.finalize()) != release.digest {
        return Err("Update SHA-256 verification failed.".into());
    }
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    let root = directory.path().join("unpacked");
    fs::create_dir(&root).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(fs::File::open(&archive).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if zip.len() > 20000 {
        return Err("Update archive contains too many entries.".into());
    }
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.enclosed_name().ok_or("Unsafe update archive path.")?;
        // Rune has no framework symlinks; reject them before any extraction.
        let mode = entry.unix_mode().unwrap_or(0o644);
        if mode & 0o170000 == 0o120000 {
            return Err("Update archive contains a symbolic link.".into());
        }
        total = total
            .checked_add(entry.size())
            .filter(|s| *s <= MAX_BYTES * 2)
            .ok_or("Expanded update is too large.")?;
        let target = root.join(name);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&target)
            .map_err(|e| e.to_string())?;
        let size = entry.size();
        let copied = std::io::copy(&mut entry.by_ref().take(size + 1), &mut file)
            .map_err(|e| e.to_string())?;
        if copied != size {
            return Err("Invalid expanded update size.".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&target, fs::Permissions::from_mode(mode & 0o777))
                .map_err(|e| e.to_string())?;
        }
    }
    let path = root.join("OpenCodex Rune.app");
    verify(installed, &path, &release.version)?;
    Ok(Staged {
        _directory: directory,
        path,
        version: release.version.clone(),
    })
}
pub fn install(installed: &Installed, staged: &Staged) -> Result<(), String> {
    verify(installed, &staged.path, &staged.version)?;
    // A second directory lives until the helper completes; no worker TempDir can
    // delete the staged bundle while the helper waits for the parent to exit.
    let directory = tempfile::Builder::new()
        .prefix(".opencodex-install-")
        .tempdir_in(installed.path.parent().unwrap())
        .map_err(|e| e.to_string())?;
    let replacement = directory.path().join("OpenCodex Rune.app");
    run(Command::new("/usr/bin/ditto")
        .arg(&staged.path)
        .arg(&replacement))?;
    verify(installed, &replacement, &staged.version)?;
    let script = directory.path().join("install.sh");
    fs::write(&script, include_str!("install.sh")).map_err(|e| e.to_string())?;
    Command::new("/bin/sh")
        .arg(&script)
        .arg(std::process::id().to_string())
        .arg(&installed.path)
        .arg(&replacement)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let _ = directory.keep();
    Ok(())
}
