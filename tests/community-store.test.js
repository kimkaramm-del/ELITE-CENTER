import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { createCommunityStore } from '../server/community-store.js'
import { createSqliteStore } from '../server/sqlite-store.js'

test('serializes concurrent community updates and persists them in SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elite-community-store-'))
  const databasePath = join(directory, 'elite-center.sqlite')
  let dataStore = createSqliteStore(databasePath)
  const store = createCommunityStore(dataStore)
  try {
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.update((data) => {
      data.posts.push({ id: String(index) })
    })))
    const data = await store.read()
    assert.equal(data.posts.length, 20)
    assert.equal(new Set(data.posts.map((post) => post.id)).size, 20)
    dataStore.close()
    dataStore = createSqliteStore(databasePath)
    assert.equal((await createCommunityStore(dataStore).read()).posts.length, 20)
  } finally {
    dataStore.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('rolls back a community update when its mutator fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elite-community-store-'))
  const dataStore = createSqliteStore(join(directory, 'elite-center.sqlite'))
  const store = createCommunityStore(dataStore)
  try {
    await assert.rejects(store.update((data) => {
      data.posts.push({ id: 'not-saved' })
      throw new Error('test failure')
    }), /test failure/)
    assert.deepEqual((await store.read()).posts, [])
  } finally {
    dataStore.close()
    await rm(directory, { recursive: true, force: true })
  }
})
