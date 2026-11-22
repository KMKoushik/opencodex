//! Same Intl options and macOS application-locale negotiation as the Electron renderer.
use super::*;

// Chromium desktop resource locales: build/config/locales.gni, excluding extended
// mobile locales and pseudolocales. Apple bundle spelling: en-US -> en.
const LOCALES: &str = "en af am ar bg bn ca cs da de el en-GB es es-419 et fa fi fil fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nb nl pl pt-BR pt-PT ro ru sk sl sr sv sw ta te th tr uk ur vi zh-CN zh-TW";

pub fn browser_locale() -> String {
    thread_local! {
        static LOCALE: String = unsafe {
            let locales = object(c"NSMutableArray");
            for locale in LOCALES.split_whitespace() {
                let _: () = msg_send![&*locales, addObject: &*NSString::from_str(locale)];
            }
            // Chromium's bundle doesn't ship en-AU: Apple's normal localization
            // negotiation resolves it to en-GB. A bare JSContext instead uses en-AU,
            // producing different punctuation and a 12-hour clock on the same Mac.
            let preferred: Retained<AnyObject> = if let Ok(locale) = std::env::var("OPENCODEX_LOCALE") {
                let preferences = object(c"NSMutableArray");
                let _: () = msg_send![&*preferences, addObject: &*NSString::from_str(&locale)];
                msg_send![AnyClass::get(c"NSBundle").unwrap(), preferredLocalizationsFromArray: &*locales, forPreferences: &*preferences]
            } else {
                msg_send![AnyClass::get(c"NSBundle").unwrap(), preferredLocalizationsFromArray: &*locales]
            };
            let locale = string(msg_send![&*preferred, firstObject]).replace('_', "-");
            if locale == "en" || locale.is_empty() { "en-US".into() } else { locale }
        };
    }
    LOCALE.with(Clone::clone)
}
pub fn updated_label(milliseconds: f64) -> String {
    date_label(milliseconds, false)
}
pub fn short_time(milliseconds: f64) -> String {
    date_label(milliseconds, true)
}

// NSDateFormatter templates are not Intl (including their punctuation). WebKit and
// Chromium both implement Intl; provide the same resolved application locale, too.
#[link(name = "JavaScriptCore", kind = "framework")]
unsafe extern "C" {}
fn date_label(milliseconds: f64, time_only: bool) -> String {
    if !milliseconds.is_finite() {
        return String::new();
    }
    thread_local! {
        static FORMATTERS: Retained<AnyObject> = unsafe {
            let context = object(c"JSContext");
            let locale = serde_json::to_string(&browser_locale()).unwrap();
            let script = format!("const updated = new Intl.DateTimeFormat({locale}, {{month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}}); const time = new Intl.DateTimeFormat({locale}, {{timeStyle:'short'}});");
            let _: *mut AnyObject = msg_send![&*context, evaluateScript: &*NSString::from_str(&script)];
            context
        };
    }
    FORMATTERS.with(|context| unsafe {
        // macOS's older CLDR joins English date/time with " at "; Chromium's
        // current ICU uses ", " for these component options. Normalize only that
        // literal part, never date names, digits, time-zone or short-time content.
        let script = if time_only {
            format!("time.format(new Date({milliseconds}))")
        } else {
            format!("updated.formatToParts(new Date({milliseconds})).map(p => p.type === 'literal' && p.value === ' at ' && updated.resolvedOptions().locale.startsWith('en') ? ', ' : p.value).join('')")
        };
        let value: *mut AnyObject =
            msg_send![&**context, evaluateScript: &*NSString::from_str(&script)];
        string(msg_send![value, toString])
    })
}
