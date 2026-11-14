import { constants } from 'node:fs'
import { access, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

export async function initializeRuntimeData({ dataDirectory, catalogSeedPath }) {
  await mkdir(dataDirectory, { recursive: true })

  const catalogPath = join(dataDirectory, 'catalog.json')
  if (!(await fileExists(catalogPath))) {
    try {
      await copyFile(catalogSeedPath, catalogPath, constants.COPYFILE_EXCL)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

export function migrateLegacyData(dataStore, dataDirectory) {
  dataStore.migrateLegacyFiles([
    { key: 'catalog', path: join(dataDirectory, 'catalog.json'), fallback: {} },
    { key: 'requests', path: join(dataDirectory, 'requests.json'), fallback: [] },
    { key: 'subscriptions', path: join(dataDirectory, 'subscriptions.json'), fallback: { codes: [] } },
    { key: 'newsReactions', path: join(dataDirectory, 'news-reactions.json'), fallback: { reactions: {} } },
    { key: 'community', path: join(dataDirectory, 'community-data.json'), fallback: {} },
    { key: 'studentProfiles', path: join(dataDirectory, 'student-profiles.json'), fallback: { profiles: {} } },
    { key: 'studentSessions', path: join(dataDirectory, 'student-sessions.json'), fallback: { sessions: [] } },
  ])
}
