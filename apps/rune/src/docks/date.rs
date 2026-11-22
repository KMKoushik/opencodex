//! GPU calendar for Rune's text-only input API. Values stay ISO/local, never UTC-shifted.
use super::*;
use rune::{Align, Side};
pub struct Calendar {
    year: i32,
    month: u32,
    key: String,
    datetime: bool,
    today: Option<(i32, u32, u32)>,
    local: std::sync::mpsc::Receiver<Option<(i32, u32, u32)>>,
}
fn today() -> (i32, u32, u32) {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = seconds / 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    ((y + i64::from(m <= 2)) as i32, m as u32, d as u32)
}
pub fn poll(s: &mut State) -> bool {
    let Some(c) = &mut s.docks.calendar else {
        return false;
    };
    if let Ok(today) = c.local.try_recv() {
        c.today = today;
        if s.docks.custom.text.is_empty()
            && let Some((year, month, _)) = today
        {
            c.year = year;
            c.month = month;
        }
        return true;
    }
    false
}
fn days(y: i32, m: u32) -> u32 {
    match m {
        4 | 6 | 9 | 11 => 30,
        2 => {
            if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 31,
    }
}
fn weekday(y: i32, m: u32) -> u32 {
    let offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = y - i32::from(m < 3);
    ((y + y / 4 - y / 100 + y / 400 + offsets[(m - 1) as usize] + 1) % 7) as u32
}
#[test]
fn gregorian_grid_keeps_leap_days_and_week_starts() {
    assert_eq!(days(2000, 2), 29);
    assert_eq!(days(1900, 2), 28);
    assert_eq!(days(2024, 2), 29);
    assert_eq!(days(2026, 2), 28);
    assert_eq!(weekday(2026, 11), 0);
    assert_eq!(weekday(2024, 2), 4);
}
pub fn input(s: &State, field: &Value, input: El) -> El {
    if field["format"] != "date" && field["format"] != "date-time" {
        return el().w_full().px(8.0).child(input);
    }
    let key = field["key"].as_str().unwrap_or("").to_owned();
    let datetime = field["format"] == "date-time";
    const CALENDAR: rune::Icon = rune::Icon {
        name: "question-calendar",
        view: 24.0,
        body: r#"<path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V8h14v11ZM7 10h5v5H7z"/>"#,
    };
    let field = row()
        .w_full()
        .center_y()
        .fill(s.theme.c("secondary"))
        .radius(8.0)
        .border(1.0, s.theme.c("border"))
        .child(
            input
                .placeholder(
                    if datetime {
                        "dd/mm/yyyy, --:-- --"
                    } else {
                        "dd/mm/yyyy"
                    },
                    s.theme.c("text-tertiary"),
                )
                .fill(rune::Color::TRANSPARENT)
                .border(0.0, s.theme.c("border"))
                .my(0.0)
                .grow(1.0)
                .min_w(0.0),
        )
        .child(
            el().child(rune::icon(&CALENDAR, 16.0).color(s.theme.c("text-secondary")))
                .key("question-calendar-trigger")
                .size(32.0, 32.0)
                .center()
                .mr(8.0)
                .role("button")
                .label("Show date picker")
                .focusable(true)
                .disabled(s.docks.sending)
                .on_press(move |s: &mut State| {
                    let (mut year, mut month, _) = today();
                    if let Some(v) = s.docks.answers.get(&key).and_then(Value::as_str) {
                        let date = v
                            .split('T')
                            .next()
                            .unwrap_or(v)
                            .split('-')
                            .collect::<Vec<_>>();
                        if date.len() == 3
                            && let (Ok(y), Ok(m)) = (date[0].parse::<i32>(), date[1].parse::<u32>())
                            && (1..=12).contains(&m)
                        {
                            year = y;
                            month = m;
                        }
                    }
                    let (send, local) = std::sync::mpsc::sync_channel(1);
                    let wake = s.waker.clone();
                    std::thread::spawn(move || {
                        let result = std::process::Command::new("/bin/date")
                            .arg("+%Y-%m-%d")
                            .output()
                            .ok()
                            .filter(|v| v.status.success())
                            .and_then(|v| String::from_utf8(v.stdout).ok())
                            .and_then(|v| {
                                let p = v.trim().split('-').collect::<Vec<_>>();
                                Some((
                                    p.first()?.parse().ok()?,
                                    p.get(1)?.parse().ok()?,
                                    p.get(2)?.parse().ok()?,
                                ))
                            });
                        let _ = send.send(result);
                        if let Some(wake) = wake {
                            wake();
                        }
                    });
                    s.docks.calendar = Some(Calendar {
                        year,
                        month,
                        key: key.clone(),
                        datetime,
                        today: None,
                        local,
                    });
                    s.composer.menu = Some(crate::composer::state::Menu::Calendar);
                }),
        );
    el().w_full().px(8.0).my(6.0).child(field)
}
fn choose(s: &mut State, day: Option<(i32, u32, u32)>) {
    let Some(c) = s.docks.calendar.take() else {
        return;
    };
    s.composer.menu = None;
    let value = day
        .map(|(y, m, d)| {
            let date = format!("{y:04}-{m:02}-{d:02}");
            if c.datetime {
                format!(
                    "{date}T{}",
                    s.docks
                        .custom
                        .text
                        .split_once('T')
                        .map(|(_, t)| t)
                        .unwrap_or("00:00")
                )
            } else {
                date
            }
        })
        .unwrap_or_default();
    s.docks.custom.replace_text(value.clone());
    s.docks.answers.insert(c.key, json!(value));
    s.docks.error = None;
}
pub fn view(s: &State) -> Option<El> {
    let c = s.docks.calendar.as_ref()?;
    let local_today = c.today;
    let selected_day = s
        .docks
        .custom
        .text
        .split('T')
        .next()
        .and_then(|v| v.rsplit('-').next())
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|d| (1..=days(c.year, c.month)).contains(d))
        .unwrap_or_else(|| local_today.map(|v| v.2).unwrap_or(1));
    let t = &s.theme;
    let control = |title: &str| {
        label(t, title, 13.0, 400.0, "text")
            .h(30.0)
            .px(8.0)
            .center()
            .radius(4.0)
            .hover(t.c("hover"))
            .role("button")
            .label(title)
            .focusable(true)
    };
    let name = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ][(c.month - 1) as usize];
    let mut panel = col()
        .key("question-calendar")
        .role("dialog")
        .label("Choose date")
        .on_key(move |s: &mut State, event, tx| {
            if event.mods.cmd || event.mods.ctrl || event.mods.alt {
                return false;
            }
            let Some(c) = &mut s.docks.calendar else {
                return false;
            };
            let mut day = tx
                .focused()
                .and_then(|k| k.strip_prefix("calendar-day-"))
                .and_then(|n| n.parse::<i32>().ok())
                .unwrap_or(selected_day as i32);
            if event.key == rune::Key::Enter {
                let value = (c.year, c.month, day as u32);
                choose(s, Some(value));
                tx.focus("question-custom", false);
                return true;
            }
            match event.key {
                rune::Key::Left => day -= 1,
                rune::Key::Right => day += 1,
                rune::Key::Up => day -= 7,
                rune::Key::Down => day += 7,
                rune::Key::Home => day -= ((weekday(c.year, c.month) + day as u32 - 1) % 7) as i32,
                rune::Key::End => {
                    day += 6 - ((weekday(c.year, c.month) + day as u32 - 1) % 7) as i32
                }
                rune::Key::PageUp => {
                    if c.month == 1 {
                        c.year -= 1;
                        c.month = 12;
                    } else {
                        c.month -= 1;
                    }
                    day = day.min(days(c.year, c.month) as i32);
                }
                rune::Key::PageDown => {
                    if c.month == 12 {
                        c.year += 1;
                        c.month = 1;
                    } else {
                        c.month += 1;
                    }
                    day = day.min(days(c.year, c.month) as i32);
                }
                _ => return false,
            }
            if day < 1 {
                if c.month == 1 {
                    c.year -= 1;
                    c.month = 12;
                } else {
                    c.month -= 1;
                }
                day += days(c.year, c.month) as i32;
            }
            if day > days(c.year, c.month) as i32 {
                day -= days(c.year, c.month) as i32;
                if c.month == 12 {
                    c.year += 1;
                    c.month = 1;
                } else {
                    c.month += 1;
                }
            }
            tx.focus(format!("calendar-day-{day}"), true);
            true
        })
        .w(280.0)
        .padding(12.0)
        .gap(4.0)
        .radius(8.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .child(
            row()
                .w_full()
                .center_y()
                .child(label(t, format!("{name} {}", c.year), 14.0, 500.0, "text").grow(1.0))
                .child(
                    control("‹")
                        .label("Previous month")
                        .on_press(|s: &mut State| {
                            let c = s.docks.calendar.as_mut().unwrap();
                            if c.month == 1 {
                                c.month = 12;
                                c.year -= 1;
                            } else {
                                c.month -= 1;
                            }
                        }),
                )
                .child(control("›").label("Next month").on_press(|s: &mut State| {
                    let c = s.docks.calendar.as_mut().unwrap();
                    if c.month == 12 {
                        c.month = 1;
                        c.year += 1;
                    } else {
                        c.month += 1;
                    }
                })),
        );
    let mut names = row();
    for name in ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] {
        names = names.child(
            label(t, name, 12.0, 400.0, "text-secondary")
                .size(36.0, 28.0)
                .center(),
        );
    }
    panel = panel.child(names);
    let offset = weekday(c.year, c.month);
    for week in 0..6 {
        if week * 7 >= offset + days(c.year, c.month) {
            break;
        }
        let mut line = row();
        for column in 0..7 {
            let n = week * 7 + column;
            if n < offset || n >= offset + days(c.year, c.month) {
                line = line.child(el().size(36.0, 30.0));
                continue;
            }
            let day = n - offset + 1;
            let year = c.year;
            let month = c.month;
            let mut button = control(&day.to_string())
                .w(36.0)
                .key(format!("calendar-day-{day}"))
                .tab_index(if day == selected_day { 0 } else { -1 })
                .on_press(move |s: &mut State| choose(s, Some((year, month, day))));
            if day == selected_day {
                button = button.autofocus();
            }
            line = line.child(button);
        }
        panel = panel.child(line);
    }
    panel = panel.child(
        row()
            .w_full()
            .justify_between()
            .child(control("Clear").on_press(|s: &mut State| choose(s, None)))
            .child(
                control("Today")
                    .disabled(local_today.is_none())
                    .on_press(move |s: &mut State| choose(s, local_today)),
            ),
    );
    Some(
        t.shadow(
            panel
                .anchored("question-calendar-trigger", Side::Top, Align::End, 4.0)
                .modal(true, |s: &mut State| {
                    s.docks.calendar = None;
                    s.composer.menu = None;
                }),
            "shadow",
        ),
    )
}
