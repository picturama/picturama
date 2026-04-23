// Rust-side i18n, backed by the same translations as the TypeScript frontend.
//
// Usage:
//   use crate::i18n::I18n;
//
//   // In a command or any function that has access to State:
//   fn build_menu(i18n: &I18n) {
//       let label = i18n.msg("MainMenu_settings");
//       let label = i18n.msg_args("MainMenu_version", &["2.0.0"]);
//   }

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// I18n state (stored via app.manage())
// ---------------------------------------------------------------------------

pub struct I18n {
    pub locale: String,
    texts: HashMap<String, String>,
}

impl I18n {
    pub fn new(locale: String, texts: HashMap<String, String>) -> Self {
        Self { locale, texts }
    }

    /// Look up a translation key and return the translated string.
    /// Falls back to `[key]` if the key is missing (same behaviour as the
    /// TypeScript `msg()` function).
    pub fn msg(&self, key: &str) -> String {
        self.texts
            .get(key)
            .cloned()
            .unwrap_or_else(|| format!("[{}]", key))
    }

    /// Look up a translation key and substitute positional placeholders.
    /// `{0}` is replaced by `args[0]`, `{1}` by `args[1]`, etc. — identical
    /// to the TypeScript `msg(key, ...args)` behaviour.
    pub fn msg_args(&self, key: &str, args: &[&str]) -> String {
        let template = self
            .texts
            .get(key)
            .cloned()
            .unwrap_or_else(|| format!("[{}]", key));

        if args.is_empty() {
            return template;
        }

        // Replace {0}, {1}, ... with the corresponding argument
        let mut result = template;
        for (i, arg) in args.iter().enumerate() {
            result = result.replace(&format!("{{{}}}", i), arg);
        }
        result
    }
}
