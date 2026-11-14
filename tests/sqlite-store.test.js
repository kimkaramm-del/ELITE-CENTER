import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { createSqliteStore } from '../server/sqlite-store.js'

test('imports existing JSON once and keeps SQLite as the authoritative store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elite-sqlite-store-'))
  const dataStore = createSqliteStore(join(directory, 'elite-center.sqlite'))
  const legacyPath = join(directory, 'requests.json')
  try {
    await writeFile(legacyPath, JSON.stringify([{ id: 'legacy-request' }]), 'utf8')
    dataStore.migrateLegacyFiles([{ key: 'requests', path: legacyPath, fallback: [] }])
    assert.deepEqual(dataStore.get('requests', []), [{ id: 'legacy-request' }])

    dataStore.set('requests', [{ id: 'new-request' }])
    await writeFile(legacyPath, JSON.stringify([{ id: 'stale-request' }]), 'utf8')
    dataStore.migrateLegacyFiles([{ key: 'requests', path: legacyPath, fallback: [] }])
    assert.deepEqual(dataStore.get('requests', []), [{ id: 'new-request' }])
  } finally {
    dataStore.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('does not partially import data if a legacy file is corrupt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elite-sqlite-store-'))
  const dataStore = createSqliteStore(join(directory, 'elite-center.sqlite'))
  try {
    await writeFile(join(directory, 'valid.json'), JSON.stringify({ ok: true }), 'utf8')
    await writeFile(join(directory, 'broken.json'), '{invalid', 'utf8')
    assert.throws(() => dataStore.migrateLegacyFiles([
      { key: 'valid', path: join(directory, 'valid.json'), fallback: {} },
      { key: 'broken', path: join(directory, 'broken.json'), fallback: {} },
    ]))
    assert.deepEqual(dataStore.get('valid', null), null)
  } finally {
    dataStore.close()
    await rm(directory, { recursive: true, force: true })
  }
})
