use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::params;

use crate::types::common_types::{PhotoId, Tag, TagId};
use crate::store::db::DbHandle;


// The orphan-tag cleanup in `fetch_tags` runs only after a photo→tag mapping was actually removed, not on every fetch.
// Initialised to `true`: the flag is in-memory and resets on every process start, so a mapping deleted in a
/// previous session — e.g. an import that removes a directory without adding new tags, the one path that sets the flag
/// without a following `fetch_tags` — would otherwise leave orphan tags lingering across restarts.
/// Starting `true` sweeps them once on the session's first `fetch_tags`, then stays lazy.
static TAGS_HAVE_BEEN_DELETED: AtomicBool = AtomicBool::new(true);

/// Signals that photo→tag mappings were removed, so the next `fetch_tags` runs the orphan-tag cleanup
pub fn mark_tags_deleted() {
    TAGS_HAVE_BEEN_DELETED.store(true, Ordering::Relaxed);
}


pub fn fetch_tags(db: &DbHandle) -> Result<Vec<Tag>, String> {
    let conn = db.lock().unwrap();

    // Remove tags that are no longer referenced by any photo — only after a mapping was actually deleted, so a plain
    // fetch does not run the subquery.
    if TAGS_HAVE_BEEN_DELETED.swap(false, Ordering::Relaxed) {
        conn.execute_batch(
            "DELETE FROM tags WHERE id NOT IN \
             (SELECT tag_id FROM photos_tags GROUP BY tag_id)",
        )
        .map_err(|e| e.to_string())?;
    }

    let mut stmt = conn
        .prepare("SELECT id, title, slug, created_at, updated_at FROM tags ORDER BY slug")
        .map_err(|e| e.to_string())?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id:         row.get("id")?,
                title:      row.get("title")?,
                slug:       row.get("slug")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Returns Some(tags) when the global tag list changed (new tags added or tags removed) so the caller can push an
/// updated list to the frontend.
/// Returns None when nothing changed
pub fn store_photo_tags(
    db: &DbHandle,
    photo_id: PhotoId,
    photo_tags: &[String],
) -> Result<Option<Vec<Tag>>, String> {
    let conn = db.lock().unwrap();

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result = apply_photo_tags(&conn, photo_id, photo_tags);

    let tags_changed = match result {
        Ok(changed) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            changed
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    };

    if tags_changed {
        // Re-fetch and return updated tag list (while still holding the lock)
        let updated = {
            conn.execute_batch(
                "DELETE FROM tags WHERE id NOT IN \
                 (SELECT tag_id FROM photos_tags GROUP BY tag_id)",
            )
            .map_err(|e| e.to_string())?;
            // This global cleanup removed every orphan (whoever caused it), so a following `fetch_tags`
            // need not repeat it.
            TAGS_HAVE_BEEN_DELETED.store(false, Ordering::Relaxed);
            let mut stmt = conn
                .prepare("SELECT id, title, slug, created_at, updated_at FROM tags ORDER BY slug")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| {
                Ok(Tag {
                    id:         row.get("id")?,
                    title:      row.get("title")?,
                    slug:       row.get("slug")?,
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                })
            })
            .map_err(|e| e.to_string())?;
            let collected: Vec<_> = rows.filter_map(|r| r.ok()).collect();
            drop(stmt);
            collected
        };
        Ok(Some(updated))
    } else {
        Ok(None)
    }
}

/// Applies the given tags to a photo on an already-open connection/transaction (no BEGIN/COMMIT here).
/// Existing tags are reused by slug, new tags are inserted, and the photo→tag mappings are replaced.
/// Returns whether the global tag set changed (new tags added or old mappings removed).
pub fn apply_photo_tags(
    conn: &rusqlite::Connection,
    photo_id: PhotoId,
    photo_tags: &[String],
) -> Result<bool, String> {
    let slugged: Vec<String> = photo_tags.iter().map(|t| slug(t)).collect();
    let mut tags_changed = false;

    // Find existing tags whose slugs match the new tags
    let existing_tags: Vec<(String, TagId)> = if slugged.is_empty() {
        vec![]
    } else {
        let placeholders = slugged.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!("SELECT id, slug FROM tags WHERE slug IN ({})", placeholders);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(slugged.iter().map(|s| s.as_str())),
            |row| Ok((row.get::<_, String>(1)?, row.get::<_, TagId>(0)?)),
        )
        .map_err(|e| e.to_string())?;
        let collected: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        drop(stmt);
        collected
    };

    let tag_id_by_slug: std::collections::HashMap<String, TagId> = existing_tags.into_iter().collect();

    // Insert new tags and build the mapping list
    let mut mappings: Vec<(PhotoId, TagId)> = vec![];
    let now = chrono::Utc::now().timestamp_millis();

    for (tag_text, tag_slug) in photo_tags.iter().zip(slugged.iter()) {
        let tag_id = if let Some(&id) = tag_id_by_slug.get(tag_slug) {
            id
        } else {
            conn.execute(
                "INSERT INTO tags (title, slug, created_at) VALUES (?1, ?2, ?3)",
                params![tag_text, tag_slug, now],
            )
            .map_err(|e| e.to_string())?;
            tags_changed = true;
            conn.last_insert_rowid()
        };
        mappings.push((photo_id, tag_id));
    }

    // Remove old photo→tag mappings
    let deleted = conn
        .execute("DELETE FROM photos_tags WHERE photo_id = ?", params![photo_id])
        .map_err(|e| e.to_string())?;
    if deleted > 0 {
        tags_changed = true;
        mark_tags_deleted();
    }

    // Insert new photo→tag mappings
    for (pid, tid) in &mappings {
        conn.execute(
            "INSERT OR IGNORE INTO photos_tags (photo_id, tag_id) VALUES (?1, ?2)",
            params![pid, tid],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(tags_changed)
}

pub fn delete_tags_of_photos(conn: &rusqlite::Connection, photo_ids: &[PhotoId]) -> Result<bool, String> {
    if photo_ids.is_empty() {
        return Ok(false);
    }
    let ids_csv = photo_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let deleted = conn
        .execute(
            &format!("DELETE FROM photos_tags WHERE photo_id IN ({})", ids_csv),
            [],
        )
        .map_err(|e| e.to_string())?;
    if deleted > 0 {
        mark_tags_deleted();
    }
    Ok(deleted > 0)
}

/// port of common/util/LangUtil.ts slug()
pub fn slug(text: &str) -> String {
    // Lowercase, then replace any run of non-alphanumeric characters with a
    // single hyphen, then strip leading/trailing hyphens.
    let lower = text.to_lowercase();
    let mut result = String::with_capacity(lower.len());
    let mut last_was_sep = true; // start true to strip leading hyphens

    for ch in lower.chars() {
        if ch.is_alphanumeric() {
            result.push(ch);
            last_was_sep = false;
        } else if !last_was_sep {
            result.push('-');
            last_was_sep = true;
        }
    }

    // Strip trailing hyphen
    if result.ends_with('-') {
        result.pop();
    }

    result
}
