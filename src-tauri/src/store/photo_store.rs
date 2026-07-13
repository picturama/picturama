use rusqlite::types::Value;

use crate::types::common_types::*;
use crate::store::db::DbHandle;
use crate::store::tag_store;


pub fn fetch_total_photo_count(db: &DbHandle) -> Result<u32, String> {
    let conn = db.lock().unwrap();
    conn.query_row("SELECT count(*) FROM photos", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

pub fn fetch_sections(
    db: &DbHandle,
    filter: &PhotoFilter,
    section_ids_to_keep_loaded: Option<&[PhotoSectionId]>,
) -> Result<Vec<PhotoSection>, String> {
    let conn = db.lock().unwrap();
    let (where_sql, where_params) = filter_where(filter);
    let sql = format!(
        "SELECT date_section AS id, date_section AS title, count(*) AS count \
         FROM photos WHERE {where_sql} \
         GROUP BY date_section ORDER BY date_section DESC"
    );

    let mut sections: Vec<PhotoSection> = {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params_from_iter(where_params.iter()), |row| {
            Ok(PhotoSection {
                id:         row.get("id")?,
                title:      row.get("title")?,
                count:      row.get("count")?,
                photo_ids:  None,
                photo_data: None,
            })
        })
        .map_err(|e| e.to_string())?;
        let collected: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        drop(stmt);
        collected
    };
    drop(conn);

    // Eagerly load photos for sections that should stay loaded
    if let Some(ids) = section_ids_to_keep_loaded {
        if !ids.is_empty() {
            let photo_sets = fetch_section_photos(db, ids, filter)?;
            let mut set_by_id: std::collections::HashMap<&str, PhotoSet> = ids
                .iter()
                .map(|id| id.as_str())
                .zip(photo_sets.into_iter())
                .collect();

            for section in &mut sections {
                if let Some(set) = set_by_id.remove(section.id.as_str()) {
                    section.photo_ids  = Some(set.photo_ids);
                    section.photo_data = Some(set.photo_data);
                }
            }
        }
    }

    Ok(sections)
}

pub fn fetch_section_photos(
    db: &DbHandle,
    section_ids: &[PhotoSectionId],
    filter: &PhotoFilter,
) -> Result<Vec<PhotoSet>, String> {
    if section_ids.is_empty() {
        return Ok(vec![]);
    }

    let conn = db.lock().unwrap();
    let (where_sql, mut where_params) = filter_where(filter);

    let placeholders: Vec<&str> = section_ids.iter().map(|_| "?").collect();
    let in_clause = placeholders.join(", ");

    // Section IDs go before filter params in the param list
    let mut params: Vec<Value> = section_ids
        .iter()
        .map(|id| Value::Text(id.clone()))
        .collect();
    params.append(&mut where_params);

    let sql = format!(
        "SELECT * FROM photos \
         WHERE date_section IN ({in_clause}) AND {where_sql} \
         ORDER BY created_at ASC"
    );

    // Build per-section containers in the same order as section_ids
    let mut result: Vec<PhotoSet> = section_ids
        .iter()
        .map(|_| PhotoSet {
            photo_ids:  vec![],
            photo_data: std::collections::HashMap::new(),
        })
        .collect();
    let section_index: std::collections::HashMap<&str, usize> = section_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let photos: Vec<Photo> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), photo_from_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for photo in photos {
        if let Some(&idx) = section_index.get(photo.date_section.as_str()) {
            let id = photo.id;
            result[idx].photo_ids.push(id);
            // TypeScript uses string-keyed objects: { "42": Photo, ... }
            result[idx].photo_data.insert(id, photo);
        }
    }

    Ok(result)
}

pub fn fetch_photo_detail(db: &DbHandle, photo_id: PhotoId) -> Result<PhotoDetail, String> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT title FROM tags \
             WHERE id IN (SELECT tag_id FROM photos_tags WHERE photo_id = ?) \
             ORDER BY slug",
        )
        .map_err(|e| e.to_string())?;
    let tags: Vec<String> = stmt
        .query_map(rusqlite::params![photo_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(PhotoDetail { tags })
}

pub fn update_photos(
    db: &DbHandle,
    photo_ids: &[PhotoId],
    update: &serde_json::Value,
) -> Result<(), String> {
    let obj = update.as_object().ok_or("update must be a JSON object")?;
    if obj.is_empty() || photo_ids.is_empty() {
        return Ok(());
    }

    // Whitelist of columns that the frontend is allowed to update
    let allowed = &[
        "flag", "trashed", "edited_width", "edited_height",
        "master_width", "master_height",
    ];

    let filtered: Vec<(&String, &serde_json::Value)> = obj
        .iter()
        .filter(|(k, _)| allowed.contains(&k.as_str()))
        .collect();

    if filtered.is_empty() {
        return Ok(());
    }

    let set_parts: Vec<String> = filtered
        .iter()
        .enumerate()
        .map(|(i, (k, _))| format!("{} = ?{}", k, i + 1))
        .collect();

    let values: Vec<Value> = filtered
        .iter()
        .map(|(_, v)| json_to_sql_value(v))
        .collect();

    let ids_csv = photo_ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let sql = format!(
        "UPDATE photos SET {} WHERE id IN ({})",
        set_parts.join(", "),
        ids_csv
    );

    let conn = db.lock().unwrap();
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// emptyTrash helpers
// ---------------------------------------------------------------------------

pub struct TrashedPhoto {
    pub id:              PhotoId,
    pub master_dir:      String,
    pub master_filename: String,
}

pub fn fetch_trashed_photos(db: &DbHandle) -> Result<Vec<TrashedPhoto>, String> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, master_dir, master_filename FROM photos WHERE trashed = 1")
        .map_err(|e| e.to_string())?;
    let result = stmt.query_map([], |row| {
        Ok(TrashedPhoto {
            id:              row.get("id")?,
            master_dir:      row.get("master_dir")?,
            master_filename: row.get("master_filename")?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(result)
}

pub fn delete_photos(db: &DbHandle, photo_ids: &[PhotoId]) -> Result<(), String> {
    if photo_ids.is_empty() {
        return Ok(());
    }
    let ids_csv = photo_ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let conn = db.lock().unwrap();
    conn.execute_batch(&format!(
        "BEGIN;
         DELETE FROM photos_tags WHERE photo_id IN ({ids_csv});
         DELETE FROM versions     WHERE photo_id IN ({ids_csv});
         DELETE FROM photos       WHERE id       IN ({ids_csv});
         COMMIT;"
    ))
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

/// A photo row that is about to be inserted. `id` is assigned by the DB, and `trashed` is always 0
/// for freshly imported photos, so neither is part of this struct.
pub struct NewPhoto {
    pub master_dir: String,
    pub master_filename: String,
    pub master_width: u32,
    pub master_height: u32,
    pub edited_width: u32,
    pub edited_height: u32,
    pub date_section: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub imported_at: i64,
    pub flag: bool,
}

/// Inserts a batch of photos (and their tags) in a single transaction. This is the durable-write side
/// of the importer: probing/decoding already happened, so the write lock is held only briefly.
/// Returns `(inserted_count, tags_changed)` where `tags_changed` is true if any new tag was created.
pub fn insert_photos_batch(db: &DbHandle, items: &[(NewPhoto, Vec<String>)]) -> Result<(u32, bool), String> {
    if items.is_empty() {
        return Ok((0, false));
    }

    let conn = db.lock().unwrap();
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result = (|| -> Result<(u32, bool), String> {
        let mut added = 0u32;
        let mut tags_changed = false;
        for (photo, tags) in items {
            // The `master_is_raw` column still exists in the DB schema (kept, with `DEFAULT '0'`, so no
            // migration is needed) but is no longer used by the code: RAW is displayed on demand from its
            // embedded JPEG preview. We omit it from the INSERT and let the default apply.
            conn.execute(
                "INSERT INTO photos (\
                   master_dir, master_filename, master_width, master_height, \
                   edited_width, edited_height, date_section, created_at, updated_at, imported_at, flag, trashed\
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)",
                rusqlite::params![
                    photo.master_dir,
                    photo.master_filename,
                    photo.master_width,
                    photo.master_height,
                    photo.edited_width,
                    photo.edited_height,
                    photo.date_section,
                    photo.created_at,
                    photo.updated_at,
                    photo.imported_at,
                    photo.flag as i64,
                ],
            )
            .map_err(|e| e.to_string())?;

            let photo_id = conn.last_insert_rowid();
            if !tags.is_empty() && tag_store::apply_photo_tags(&conn, photo_id, tags)? {
                tags_changed = true;
            }
            added += 1;
        }
        Ok((added, tags_changed))
    })();

    match result {
        Ok(value) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(value)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Returns the `(id, master_filename)` of every photo already stored for the given directory.
/// Used to diff the filesystem against the DB (insert new files, delete vanished ones).
pub fn fetch_photos_of_directory(db: &DbHandle, dir: &str) -> Result<Vec<(PhotoId, String)>, String> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, master_filename FROM photos WHERE master_dir = ?")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![dir], |row| {
            Ok((row.get::<_, PhotoId>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Deletes all photos whose `master_dir` is not in `existing_dirs` (directories that no longer exist
/// or no longer contain photos). Returns the number of deleted photos.
pub fn delete_photos_of_removed_dirs(db: &DbHandle, existing_dirs: &[String]) -> Result<u32, String> {
    let ids: Vec<PhotoId> = {
        let conn = db.lock().unwrap();
        let (sql, params): (String, Vec<Value>) = if existing_dirs.is_empty() {
            ("SELECT id FROM photos".to_string(), vec![])
        } else {
            let placeholders = existing_dirs.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            (
                format!("SELECT id FROM photos WHERE master_dir NOT IN ({})", placeholders),
                existing_dirs.iter().map(|d| Value::Text(d.clone())).collect(),
            )
        };
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params.iter()), |row| row.get::<_, PhotoId>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    if ids.is_empty() {
        return Ok(0);
    }
    delete_photos(db, &ids)?;
    Ok(ids.len() as u32)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Build the WHERE clause for a PhotoFilter.
/// Returns (sql_fragment, bound_params).
fn filter_where(filter: &PhotoFilter) -> (String, Vec<Value>) {
    let trashed: i64 = if matches!(&filter.filter_type, PhotoFilterType::Trash) { 1 } else { 0 };
    let mut sql = "trashed = ?".to_string();
    let mut params: Vec<Value> = vec![Value::Integer(trashed)];

    if matches!(&filter.filter_type, PhotoFilterType::Favorites) {
        sql += " AND flag = 1";
    }

    if matches!(&filter.filter_type, PhotoFilterType::Tag) {
        if let Some(tag_id) = filter.tag_id {
            sql += " AND id IN (SELECT photo_id FROM photos_tags WHERE tag_id = ?)";
            params.push(Value::Integer(tag_id));
        }
    }

    (sql, params)
}

/// Map a rusqlite Row to a Photo.
/// SQLite stores booleans as 0/1 integers; we convert them here.
fn photo_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Photo> {
    Ok(Photo {
        id:              row.get("id")?,
        master_dir:      row.get("master_dir")?,
        master_filename: row.get("master_filename")?,
        master_width:    row.get("master_width")?,
        master_height:   row.get("master_height")?,
        edited_width:    row.get("edited_width")?,
        edited_height:   row.get("edited_height")?,
        date_section:    row.get("date_section")?,
        created_at:      row.get("created_at")?,
        updated_at:      row.get("updated_at")?,
        imported_at:     row.get("imported_at")?,
        flag:            row.get::<_, i64>("flag")? != 0,
        trashed:         row.get::<_, i64>("trashed")? != 0,
    })
}

fn json_to_sql_value(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null      => Value::Null,
        serde_json::Value::Bool(b)   => Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() { Value::Integer(i) }
            else if let Some(f) = n.as_f64() { Value::Real(f) }
            else { Value::Null }
        }
        serde_json::Value::String(s) => Value::Text(s.clone()),
        _ => Value::Null,
    }
}
