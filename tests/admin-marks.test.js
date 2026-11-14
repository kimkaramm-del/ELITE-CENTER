import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gradeTitle = 'الصف التجريبي'
const requestId = '11111111-1111-4111-8111-111111111111'
let dataDirectory
let baseUrl
let serverProcess

async function findAvailablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const { port } = server.address()
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  return port
}

async function writeFixture(name, value) {
  await writeFile(join(dataDirectory, name), JSON.stringify(value), 'utf8')
}

function readStoredData(key) {
  const database = new Database(join(dataDirectory, 'elite-center.sqlite'))
  try {
    const row = database.prepare('SELECT value FROM app_data WHERE key = ?').get(key)
    assert.ok(row, `Missing database entry: ${key}`)
    return JSON.parse(row.value)
  } finally {
    database.close()
  }
}

function startApiServer() {
  serverProcess = spawn(process.execPath, [resolve(projectDirectory, 'server', 'api.js')], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: String(new URL(baseUrl).port),
      API_PORT: String(new URL(baseUrl).port),
      API_HOST: '127.0.0.1',
      ADMIN_ACCESS_CODE: 'test-admin-code',
      CORS_ORIGINS: baseUrl,
      ELITE_DATA_DIR: dataDirectory,
      ELITE_SKIP_DOTENV: 'true',
    },
    stdio: process.env.ELITE_TEST_SERVER_LOGS === 'true' ? 'inherit' : 'ignore',
  })
}

async function waitForApiServer() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`API server exited with code ${serverProcess.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    }
  }
  throw new Error('API server did not become ready in time.')
}

async function stopApiServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return
  serverProcess.kill()
  await once(serverProcess, 'exit')
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'elite-center-admin-marks-'))
  const port = await findAvailablePort()
  baseUrl = `http://127.0.0.1:${port}`
  const safeHash = '0'.repeat(128)
  const safeSalt = '0'.repeat(32)
  await Promise.all([
    writeFixture('catalog.json', {
      grades: [{
        id: 1,
        name: 'التجريبي',
        title: gradeTitle,
        stage: 'المرحلة التجريبية',
        subjects: [
          { id: 'math', name: 'رياضيات' },
          { id: 'science', name: 'علوم' },
        ],
      }],
      news: [],
      digitalCourses: [],
      settings: {},
    }),
    writeFixture('requests.json', [{
      id: requestId,
      status: 'approved',
      gradeId: 1,
      gradeTitle,
      subjectIds: ['math'],
      subjectNames: ['رياضيات'],
    }]),
    writeFixture('subscriptions.json', {
      codes: [
        { id: 'math-student', studentName: 'طالب الرياضيات', grade: gradeTitle, subjectIds: ['math'], active: true, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'science-student', studentName: 'طالب العلوم', grade: gradeTitle, subjectIds: ['science'], active: true, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'inactive-student', studentName: 'طالب متوقف', grade: gradeTitle, subjectIds: ['math'], active: false, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'other-grade-student', studentName: 'طالب صف آخر', grade: 'صف آخر', subjectIds: ['math'], active: true, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'stale-grade-id-student', studentName: 'طالب بمعرف صف قديم', grade: gradeTitle, gradeId: 2, subjectIds: ['math'], active: true, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'request-student', studentName: 'طالب طلب التسجيل', requestId, active: true, codeHash: safeHash, codeSalt: safeSalt },
        { id: 'grade-wide-student', studentName: 'طالب اشتراك عام', grade: gradeTitle, active: true, codeHash: safeHash, codeSalt: safeSalt },
      ],
    }),
  ])
  startApiServer()
  await waitForApiServer()
})

after(async () => {
  await stopApiServer()
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true })
})

test('lists enrolled students and saves marks only for the selected grade and subject', async () => {
  const originHeaders = { origin: baseUrl, 'X-Elite-CSRF': '1' }
  const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { ...originHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'test-admin-code' }),
  })
  assert.equal(loginResponse.status, 200)
  const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie?.startsWith('elite_admin_session='))
  const headers = { ...originHeaders, cookie }

  const rosterResponse = await fetch(`${baseUrl}/api/admin/marks/roster?gradeId=1&subjectId=math`, { headers })
  assert.equal(rosterResponse.status, 200)
  const roster = await rosterResponse.json()
  assert.deepEqual(roster.items.map((item) => item.id), [
    'grade-wide-student',
    'math-student',
    'request-student',
  ])

  const body = {
    gradeId: 1,
    subjectId: 'math',
    exam: 'الاختبار الأول',
    term: 'الفصل الأول',
    maxScore: 100,
    date: '2026-11-14',
    entries: [
      { subscriptionId: 'math-student', score: 95 },
      { subscriptionId: 'request-student', score: 91 },
    ],
  }
  const saveResponse = await fetch(`${baseUrl}/api/admin/marks/entry`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(saveResponse.status, 200)
  assert.deepEqual(await saveResponse.json(), {
    count: 2,
    replacedCount: 0,
    batchId: readStoredData('community').imports.at(-1).batchId,
  })

  const invalidSaveResponse = await fetch(`${baseUrl}/api/admin/marks/entry`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, entries: [{ subscriptionId: 'science-student', score: 70 }] }),
  })
  assert.equal(invalidSaveResponse.status, 400)

  const invalidScoreResponse = await fetch(`${baseUrl}/api/admin/marks/entry`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, entries: [{ subscriptionId: 'math-student', score: 101 }] }),
  })
  assert.equal(invalidScoreResponse.status, 400)

  const replaceResponse = await fetch(`${baseUrl}/api/admin/marks/entry`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, entries: [{ subscriptionId: 'math-student', score: 97 }] }),
  })
  assert.equal(replaceResponse.status, 200)
  assert.deepEqual(await replaceResponse.json(), {
    count: 1,
    replacedCount: 1,
    batchId: readStoredData('community').imports.at(-1).batchId,
  })

  const community = readStoredData('community')
  assert.equal(community.marks.length, 2)
  assert.equal(community.marks.find((item) => item.subscriptionId === 'math-student').score, 97)
  assert.equal(community.notifications.filter((item) => item.type === 'marks').length, 3)
  assert.equal(community.imports.filter((item) => item.source === 'manual').length, 2)
})
