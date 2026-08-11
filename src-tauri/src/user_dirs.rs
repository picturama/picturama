// Directories the user actually chose.
//
// The web view can invoke any command with any argument, so a directory named in a command argument is not
// trustworthy by itself. Only directories the user picked in a native dialog — plus the photo directories
// already stored in `settings.json` when the app started — are honoured. Without this, `store_settings` would
// let the frontend put any path into `photoDirs` and thereby grant itself asset-protocol access to it, and
// `export_photo` would write to any directory.
//
// The sets only grow within a session, which is fine: they record what the user chose, and the user cannot
// un-choose a directory they already picked in this session.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct UserDirs {
    photo_dirs:  Mutex<HashSet<PathBuf>>,
    export_dirs: Mutex<HashSet<PathBuf>>,
}

impl UserDirs {
    pub fn add_photo_dirs(&self, dirs: &[String]) {
        let mut set = self.photo_dirs.lock().unwrap();
        for dir in dirs {
            set.insert(normalise(dir));
        }
    }

    pub fn contains_photo_dir(&self, dir: &str) -> bool {
        self.photo_dirs.lock().unwrap().contains(&normalise(dir))
    }

    /// Whether the directory is one of the photo directories or lies inside one. For paths that point at a
    /// single photo's own directory (`Photo.masterDir`) rather than at a configured root. `Path::starts_with`
    /// compares whole components, so `…/photos2` does not count as being inside `…/photos`.
    pub fn is_inside_photo_dir(&self, dir: &str) -> bool {
        let dir = normalise(dir);
        self.photo_dirs.lock().unwrap().iter().any(|root| dir.starts_with(root))
    }

    pub fn add_export_dir(&self, dir: &str) {
        self.export_dirs.lock().unwrap().insert(normalise(dir));
    }

    pub fn contains_export_dir(&self, dir: &str) -> bool {
        self.export_dirs.lock().unwrap().contains(&normalise(dir))
    }
}

/// Resolves a directory so the same location compares equal however it was spelled. Falls back to the path as
/// given when it cannot be resolved — a photo directory on an unplugged drive stays comparable that way.
fn normalise(dir: &str) -> PathBuf {
    let path = Path::new(dir);
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
        // These paths are only ever compared, never opened, so the Windows `\\?\` prefix that `canonicalize` adds
        // does no harm here.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_added_dirs_and_ignores_spelling() {
        let base = std::env::temp_dir().join(format!("picturama-userdirs-test-{}", std::process::id()));
        let photos = base.join("photos");
        std::fs::create_dir_all(&photos).unwrap();

        let user_dirs = UserDirs::default();
        user_dirs.add_photo_dirs(&[photos.to_string_lossy().to_string()]);

        assert!(user_dirs.contains_photo_dir(&photos.to_string_lossy()));
        // The same directory spelled with a detour resolves to the same path.
        let detour = photos.join("..").join("photos");
        assert!(user_dirs.contains_photo_dir(&detour.to_string_lossy()));
        // Anything the user never picked is rejected.
        assert!(!user_dirs.contains_photo_dir("/etc"));
        assert!(!user_dirs.contains_photo_dir(&base.to_string_lossy()));

        // Photo and export directories are tracked separately.
        assert!(!user_dirs.contains_export_dir(&photos.to_string_lossy()));

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn accepts_subdirs_only_below_a_photo_dir() {
        let base = std::env::temp_dir().join(format!("picturama-userdirs-sub-{}", std::process::id()));
        let photos = base.join("photos");
        std::fs::create_dir_all(photos.join("2024")).unwrap();
        // A sibling whose name merely starts with the same characters must not pass.
        std::fs::create_dir_all(base.join("photos2")).unwrap();

        let user_dirs = UserDirs::default();
        user_dirs.add_photo_dirs(&[photos.to_string_lossy().to_string()]);

        assert!(user_dirs.is_inside_photo_dir(&photos.to_string_lossy()));
        assert!(user_dirs.is_inside_photo_dir(&photos.join("2024").to_string_lossy()));
        assert!(!user_dirs.is_inside_photo_dir(&base.join("photos2").to_string_lossy()));
        assert!(!user_dirs.is_inside_photo_dir(&base.to_string_lossy()));
        assert!(!user_dirs.is_inside_photo_dir("/etc"));

        // A subdirectory is inside a photo dir, but is not itself a configured photo dir.
        assert!(!user_dirs.contains_photo_dir(&photos.join("2024").to_string_lossy()));

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn keeps_unresolvable_dirs_comparable() {
        let missing = std::env::temp_dir().join("picturama-does-not-exist");
        let user_dirs = UserDirs::default();
        user_dirs.add_export_dir(&missing.to_string_lossy());

        assert!(user_dirs.contains_export_dir(&missing.to_string_lossy()));
    }
}
