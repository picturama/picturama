// Opens the SQLite database and runs pending migrations.
//
// The database connection is wrapped in Arc<Mutex<Connection>> and stored as
// Tauri managed state so all commands can access it.

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{Connection, params};

// Public handle type stored as managed Tauri state
pub type DbHandle = Arc<Mutex<Connection>>;

/// Open + migrate
pub fn open(db_path: &Path, migrations_dir: &Path) -> Result<DbHandle, String> {
    open_with_options(db_path, migrations_dir, false)
}

pub fn open_with_options(db_path: &Path, migrations_dir: &Path, force: bool) -> Result<DbHandle, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    migrate(&conn, migrations_dir, force)?;

    Ok(Arc::new(Mutex::new(conn)))
}

struct MigrationFile {
    id:       u32,
    name:     String,
    filename: String,
}

struct Migration {
    id:   u32,
    name: String,
    up:   String,
    down: String,
}

struct DbMigration {
    id:   u32,
    down: String,
}

/// Migration runner – port of DB.prototype.migrate from sqlite3-helper (https://github.com/Kauto/sqlite3-helper)
fn migrate(conn: &Connection, migrations_dir: &Path, force: bool) -> Result<(), String> {
    // --- Discover migration files, matching /^(\d+)-(.*?)\.sql$/ ---
    let mut files: Vec<MigrationFile> = std::fs::read_dir(migrations_dir)
        .map_err(|e| format!("Cannot read migrations dir {:?}: {}", migrations_dir, e))?
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let fname = entry.file_name().to_string_lossy().into_owned();
            // Regex equivalent: ^(\d+)-(.*?)\.sql$
            let stem = fname.strip_suffix(".sql")?;
            let dash = stem.find('-')?;
            let id_str = &stem[..dash];
            let name   = stem[dash + 1..].to_string();
            let id: u32 = id_str.parse().ok()?;
            Some(MigrationFile { id, name, filename: fname })
        })
        .collect();

    if files.is_empty() {
        return Ok(());
    }

    files.sort_by_key(|f| f.id);

    // --- Read file contents, enforce "-- Down" separator, strip comments ---
    let migrations: Vec<Migration> = files
        .into_iter()
        .map(|f| {
            let path = migrations_dir.join(&f.filename);
            let data = std::fs::read_to_string(&path)
                .map_err(|e| format!("Cannot read {:?}: {}", path, e))?;

            let (raw_up, down) = split_migration(&f.filename, &data)?;

            // Strip comment lines from up (mirrors .replace(/^-- .*?$/gm, '').trim())
            let up = raw_up
                .lines()
                .filter(|l| !l.trim_start().starts_with("--"))
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();

            Ok(Migration { id: f.id, name: f.name, up, down })
        })
        .collect::<Result<Vec<_>, String>>()?;

    // --- Create migrations table if needed (schema identical to sqlite3-helper) ---
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS \"migrations\" (
            id   INTEGER PRIMARY KEY,
            name TEXT    NOT NULL,
            up   TEXT    NOT NULL,
            down TEXT    NOT NULL
        )",
    )
    .map_err(|e| e.to_string())?;

    // --- Load already-applied migrations from DB, ordered by id ASC ---
    let mut db_migrations: Vec<DbMigration> = {
        let mut stmt = conn
            .prepare("SELECT id, down FROM \"migrations\" ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(DbMigration { id: row.get(0)?, down: row.get(1)? })
        })
        .map_err(|e| e.to_string())?;
        let collected: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        drop(stmt);
        collected
    };

    // Undo migrations that exist only in the DB but not in files, and also undo the last migration when force=true.
    // Iterates db_migrations in reverse (DESC) and stops as soon as a migration is found in both DB and files
    // (and force doesn't apply).
    let last_file_id = migrations.last().map(|m| m.id);
    let db_desc: Vec<DbMigration> = {
        let mut v: Vec<DbMigration> = db_migrations.iter()
            .map(|m| DbMigration { id: m.id, down: m.down.clone() })
            .collect();
        v.sort_by(|a, b| b.id.cmp(&a.id));
        v
    };
    for db_m in db_desc {
        let exists_in_files = migrations.iter().any(|m| m.id == db_m.id);
        let is_last_and_forced = force && Some(db_m.id) == last_file_id;

        if !exists_in_files || is_last_and_forced {
            log::info!("Rolling back migration {}", db_m.id);
            conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
            let result = (|| -> Result<(), String> {
                conn.execute_batch(&db_m.down)
                    .map_err(|e| format!("Migration {} down failed: {}", db_m.id, e))?;
                conn.execute("DELETE FROM \"migrations\" WHERE id = ?1", params![db_m.id])
                    .map_err(|e| e.to_string())?;
                Ok(())
            })();
            match result {
                Ok(()) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK");
                    return Err(e);
                }
            }
            db_migrations.retain(|m| m.id != db_m.id);
        } else {
            // sqlite3-helper breaks as soon as it hits a migration present in both
            break;
        }
    }

    // --- Apply pending migrations (id > last applied id in DB) ---
    let last_applied_id = db_migrations.last().map(|m| m.id).unwrap_or(0);
    for migration in &migrations {
        if migration.id <= last_applied_id {
            continue;
        }

        log::info!("Applying migration {}: {}", migration.id, migration.name);

        conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        let result = (|| -> Result<(), String> {
            conn.execute_batch(&migration.up)
                .map_err(|e| format!("Migration {}-{} up failed: {}", migration.id, migration.name, e))?;
            conn.execute(
                "INSERT INTO \"migrations\" (id, name, up, down) VALUES (?1, ?2, ?3, ?4)",
                params![migration.id, migration.name, migration.up, migration.down],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })();

        match result {
            Ok(()) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e);
            }
        }
    }

    Ok(())
}

/// Split a migration file on the "-- Down" separator (case-insensitive, mirrors sqlite3-helper).
/// Returns an error if no separator is found (matching sqlite3-helper behaviour).
/// Returns (raw_up, trimmed_down).
fn split_migration<'a>(filename: &str, sql: &'a str) -> Result<(&'a str, String), String> {
    // sqlite3-helper uses /^--\s+?down\b/im
    let mut byte_offset: usize = 0;
    for line in sql.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("--") {
            let after_dashes = trimmed[2..].trim_start();
            if after_dashes.eq_ignore_ascii_case("down")
                || after_dashes.to_ascii_lowercase().starts_with("down ")
                || after_dashes.to_ascii_lowercase().starts_with("down\t")
            {
                let up   = &sql[..byte_offset];
                let rest = &sql[byte_offset + line.len()..];
                // Skip the separator line's newline
                let down = rest.trim_start_matches('\n').trim_start_matches("\r\n").trim().to_string();
                return Ok((up, down));
            }
        }
        byte_offset += line.len() + 1; // +1 for '\n'
    }
    Err(format!(
        "The {} file does not contain '-- Down' separator.",
        filename
    ))
}