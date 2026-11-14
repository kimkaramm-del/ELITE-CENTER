import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export function createSqliteStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  chmodSync(databasePath, 0o600)
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = FULL')
  database.pragma('busy_timeout = 5000')
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const selectValue = database.prepare('SELECT value FROM app_data WHERE key = ?')
  const saveValue = database.prepare(`
    INSERT INTO app_data (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `)

  function get(key, fallback) {
    const row = selectValue.get(key)
    return row ? JSON.parse(row.value) : structuredClone(fallback)
  }

  function set(key, value) {
    saveValue.run(key, JSON.stringify(value))
    return value
  }

  function update(key, fallback, mutator) {
    return database.transaction(() => {
      const current = get(key, fallback)
      const result = mutator(current)
      if (result && typeof result.then === 'function') {
        throw new TypeError('SQLite data mutators must be synchronous.')
      }
      set(key, current)
      return result
    })()
  }

  function migrateLegacyFiles(entries) {
    database.transaction(() => {
      for (const { key, path, fallback } of entries) {
        if (selectValue.get(key)) continue
        let value = fallback
        try {
          value = JSON.parse(readFileSync(path, 'utf8'))
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        saveValue.run(key, JSON.stringify(value))
      }
    })()
  }

  return { get, set, update, migrateLegacyFiles, close: () => database.close() }
}
