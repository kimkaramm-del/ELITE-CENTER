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
const requestId = '11111111-1111-4111-8111-111111111111'
const otherRequestId = '22222222-2222-4222-8222-222222222222'
const email = 'student@example.test'
const accessCode = 'ELITE-TEST-CODE-123'
const otherEmail = 'other-student@example.test'
const otherAccessCode = 'ELITE-OTHER-TEST-CODE-456'
let dataDirectory
let baseUrl
let apiPort
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

function writeStoredData(key, value) {
  const database = new Database(join(dataDirectory, 'elite-center.sqlite'))
  try {
    database.prepare(`
      INSERT INTO app_data (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(value))
  } finally {
    database.close()
  }
}

function startApiServer() {
  serverProcess = spawn(process.execPath, [resolve(projectDirectory, 'server', 'api.js')], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: String(apiPort),
      API_PORT: String(apiPort),
      API_HOST: '127.0.0.1',
      ADMIN_ACCESS_CODE: 'isam000',
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
      FIREBASE_PROJECT_ID: '',
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

function browserAuthHeaders(response, csrf = false) {
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie?.startsWith('elite_student_session='))
  return {
    cookie,
    ...(csrf ? {
      origin: 'http://127.0.0.1',
      'sec-fetch-site': 'same-origin',
      'X-Elite-CSRF': '1',
    } : {}),
  }
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'elite-center-auth-api-'))
  apiPort = await findAvailablePort()
  baseUrl = `http://127.0.0.1:${apiPort}`

  await Promise.all([
    writeFixture('catalog.json', {
      grades: [{ id: 1, title: 'الصف التجريبي', subjects: [{ id: 'math', name: 'رياضيات' }] }],
      news: [],
      digitalCourses: [],
      settings: { registrationOpen: true },
    }),
    writeFixture('requests.json', [
      { id: requestId, email, name: 'طالب اختبار', status: 'pending', gradeTitle: 'الصف التجريبي', subjectNames: [], createdAt: '2026-10-16T00:00:00.000Z' },
      { id: otherRequestId, email: 'other@example.test', name: 'طالب آخر', status: 'pending', gradeTitle: 'الصف التجريبي', subjectNames: [], createdAt: '2026-10-16T00:00:00.000Z' },
    ]),
    writeFixture('subscriptions.json', {
      codes: [
        {
          code: accessCode,
          email,
          studentName: 'طالب اختبار',
          phone: '+963 900 000 000',
          grade: 'الصف التجريبي',
          active: true,
        },
        {
          code: otherAccessCode,
          email: otherEmail,
          studentName: 'طالب آخر',
          phone: '+963 900 000 001',
          grade: 'الصف التجريبي',
          active: true,
        },
      ],
    }),
    writeFixture('student-profiles.json', {
      profiles: {
        [email]: { name: 'اسم قديم غير موثوق', phone: '+963 911 111 111' },
      },
    }),
  ])

  startApiServer()
  await waitForApiServer()
})

after(async () => {
  await stopApiServer()
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true })
})

test('protects request status, supports safe profile edits, and revokes student sessions on logout', async () => {
  const flutterPutPreflight = await fetch(`${baseUrl}/api/profile`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://localhost',
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization, content-type',
    },
  })

  assert.equal(flutterPutPreflight.status, 204)
  assert.match(flutterPutPreflight.headers.get('access-control-allow-methods'), /PUT/)
  assert.match(flutterPutPreflight.headers.get('access-control-allow-methods'), /DELETE/)

  const unauthenticatedRequest = await fetch(`${baseUrl}/api/requests/${requestId}`)
  assert.equal(unauthenticatedRequest.status, 401)
  assert.equal((await fetch(`${baseUrl}/api/community/posts`)).status, 401)
  assert.equal((await fetch(`${baseUrl}/api/marks`)).status, 401)
  const publicCatalogResponse = await fetch(`${baseUrl}/api/catalog`)
  assert.equal(publicCatalogResponse.status, 200)
  assert.equal('digitalCourses' in await publicCatalogResponse.json(), false)
  assert.equal((await fetch(`${baseUrl}/api/digital-courses`)).status, 404)
  const preservedCatalog = readStoredData('catalog')
  assert.equal('digitalCourses' in preservedCatalog, true)
  const migratedSubscriptions = readStoredData('subscriptions')
  assert.equal('code' in migratedSubscriptions.codes[0], false)
  assert.match(migratedSubscriptions.codes[0].codeHash, /^[a-f0-9]{128}$/)
  assert.match(migratedSubscriptions.codes[0].codeSalt, /^[a-f0-9]{32}$/)
  assert.ok(migratedSubscriptions.codes[0].id)

  const loginResponses = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/api/verify-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: accessCode }),
  })))
  assert.deepEqual(loginResponses.map((response) => response.status), [200, 200])
  const loginResults = await Promise.all(loginResponses.map((response) => response.json()))
  const authorization = browserAuthHeaders(loginResponses[0])
  const concurrentAuthorization = browserAuthHeaders(loginResponses[1])
  assert.equal('sessionToken' in loginResults[0], false)
  assert.match(loginResponses[0].headers.get('set-cookie'), /HttpOnly/)
  assert.match(loginResponses[0].headers.get('set-cookie'), /SameSite=Lax/)
  assert.equal(loginResponses[0].headers.get('set-cookie').includes('Secure'), false)
  const persistedSessions = readStoredData('studentSessions')
  assert.equal(persistedSessions.sessions.length, 2)
  assert.equal(JSON.stringify(persistedSessions).includes(authorization.cookie.split('=')[1]), false)

  await stopApiServer()
  startApiServer()
  await waitForApiServer()

  const invalidLoginResponse = await fetch(`${baseUrl}/api/verify-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: 'ELITE-WRONG-CODE-123' }),
  })
  assert.equal(invalidLoginResponse.status, 403)
  const queryTokenResponse = await fetch(`${baseUrl}/api/session?token=not-a-session`)
  assert.equal(queryTokenResponse.status, 401)

  const ownedRequestResponse = await fetch(`${baseUrl}/api/requests/${requestId}`, { headers: authorization })
  assert.equal(ownedRequestResponse.status, 200)
  const ownedRequest = await ownedRequestResponse.json()
  assert.equal(ownedRequest.status, 'pending')
  assert.equal('email' in ownedRequest, false)
  assert.equal('phone' in ownedRequest, false)

  const otherRequestResponse = await fetch(`${baseUrl}/api/requests/${otherRequestId}`, { headers: authorization })
  assert.equal(otherRequestResponse.status, 404)

  const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers: authorization })
  assert.equal(profileResponse.status, 200)
  const originalProfile = await profileResponse.json()
  assert.equal(originalProfile.name, 'طالب اختبار')
  assert.equal(originalProfile.phone, '+963 900 000 000')

  const legacyIdentityUpdateResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'اسم مزور', phone: '+963 911 111 111' }),
  })
  assert.equal(legacyIdentityUpdateResponse.status, 400)

  const emailUpdateResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'new-address@example.com' }),
  })
  assert.equal(emailUpdateResponse.status, 400)

  const detailsUpdateResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'اسم الطالب المعدل', contactPhone: '+963 911 111 111' }),
  })
  assert.equal(detailsUpdateResponse.status, 200)
  const detailsUpdatedProfile = await detailsUpdateResponse.json()
  assert.equal(detailsUpdatedProfile.name, 'اسم الطالب المعدل')
  assert.equal(detailsUpdatedProfile.phone, '+963 911 111 111')
  assert.equal(detailsUpdatedProfile.email, originalProfile.email)

  const invalidDetailsResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'A', contactPhone: 'not-a-phone' }),
  })
  assert.equal(invalidDetailsResponse.status, 400)

  const persistedProfileResponse = await fetch(`${baseUrl}/api/profile`, { headers: authorization })
  const persistedProfile = await persistedProfileResponse.json()
  assert.equal(persistedProfile.name, detailsUpdatedProfile.name)
  assert.equal(persistedProfile.phone, detailsUpdatedProfile.phone)

  const updatedSessionResponse = await fetch(`${baseUrl}/api/session`, { headers: authorization })
  const updatedSession = await updatedSessionResponse.json()
  assert.equal(updatedSession.studentName, detailsUpdatedProfile.name)
  assert.equal(updatedSession.phone, detailsUpdatedProfile.phone)

  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
  const photoUpdateResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ photoDataUrl: imageDataUrl }),
  })
  assert.equal(photoUpdateResponse.status, 200)
  const updatedProfile = await photoUpdateResponse.json()
  assert.equal(updatedProfile.name, detailsUpdatedProfile.name)
  assert.equal(updatedProfile.phone, detailsUpdatedProfile.phone)
  assert.equal(updatedProfile.photoDataUrl, imageDataUrl)

  const subscriptionsForPrivacy = readStoredData('subscriptions')
  const ownerSubscription = subscriptionsForPrivacy.codes.find((item) => item.email === email)
  const otherSubscription = subscriptionsForPrivacy.codes.find((item) => item.email === otherEmail)
  const announcementId = '33333333-3333-4333-8333-333333333333'
  const notificationId = '44444444-4444-4444-8444-444444444444'
  writeStoredData('community', {
    posts: [],
    announcements: [{ id: announcementId, text: 'إعلان تجريبي', createdAt: new Date().toISOString(), archivedAt: null }],
    notifications: [{
      id: notificationId,
      subscriptionId: otherSubscription.id,
      type: 'announcement',
      referenceId: announcementId,
      text: 'خاص بطالب آخر',
      createdAt: new Date().toISOString(),
      readAt: null,
    }],
    reports: [],
    bookmarks: [],
    imports: [],
    marks: [
      { id: 'mark-owner', subscriptionId: ownerSubscription.id, subject: 'رياضيات', exam: 'اختبار 1', term: 'الأول', score: 95, maxScore: 100, date: '2026-10-15', createdAt: new Date().toISOString() },
      { id: 'mark-other', subscriptionId: otherSubscription.id, subject: 'علوم سرية', exam: 'اختبار 2', term: 'الثاني', score: 10, maxScore: 100, date: '2026-10-15', createdAt: new Date().toISOString() },
    ],
  })
  const marksResponse = await fetch(`${baseUrl}/api/marks?studentId=${otherSubscription.id}`, { headers: authorization })
  assert.equal(marksResponse.status, 200)
  const ownMarks = await marksResponse.json()
  assert.deepEqual(ownMarks.items.map((item) => item.subject), ['رياضيات'])
  assert.equal(JSON.stringify(ownMarks).includes('علوم سرية'), false)

  const announcementsResponse = await fetch(`${baseUrl}/api/announcements`, { headers: authorization })
  assert.equal(announcementsResponse.status, 200)
  const announcements = await announcementsResponse.json()
  assert.equal(announcements.items.length, 1)
  assert.equal(announcements.items[0].isRead, false)
  assert.ok(announcements.items[0].notificationId)
  const stolenNotificationResponse = await fetch(`${baseUrl}/api/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal(stolenNotificationResponse.status, 404)
  const ownNotificationsResponse = await fetch(`${baseUrl}/api/notifications`, { headers: authorization })
  const ownNotifications = await ownNotificationsResponse.json()
  assert.equal(ownNotifications.items.some((item) => item.id === notificationId), false)
  assert.equal(ownNotifications.items.some((item) => item.referenceId === announcementId && item.type === 'announcement'), true)
  const ownNotificationId = announcements.items[0].notificationId
  const markReadResponse = await fetch(`${baseUrl}/api/notifications/${ownNotificationId}/read`, {
    method: 'POST',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal(markReadResponse.status, 200, `Could not mark owned notification ${ownNotificationId} as read: ${await markReadResponse.text()}`)
  const readAnnouncements = await (await fetch(`${baseUrl}/api/announcements`, { headers: authorization })).json()
  assert.equal(readAnnouncements.items[0].isRead, true)

  const createPostResponse = await fetch(`${baseUrl}/api/community/posts`, {
    method: 'POST',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'معلومة مفيدة للزملاء' }),
  })
  assert.equal(createPostResponse.status, 201)
  const createdPost = (await createPostResponse.json()).item
  assert.equal(createdPost.author.isVerified, true)
  assert.equal(createdPost.author.isTeacher, false)
  const postListResponse = await fetch(`${baseUrl}/api/community/posts`, { headers: authorization })
  assert.equal(postListResponse.status, 200)
  const postList = await postListResponse.json()
  assert.equal(postList.items[0].text, 'معلومة مفيدة للزملاء')
  assert.equal(postList.items[0].author.isVerified, true)
  assert.equal('email' in postList.items[0].author, false)
  const ownPostsResponse = await fetch(`${baseUrl}/api/community/mine`, { headers: authorization })
  assert.equal(ownPostsResponse.status, 200)
  const ownPosts = await ownPostsResponse.json()
  assert.equal(ownPosts.count, 1)
  assert.equal(ownPosts.items[0].id, createdPost.id)
  const reactionResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}/reaction`, {
    method: 'POST',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal((await reactionResponse.json()).isLiked, true)
  const commentResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}/comments`, {
    method: 'POST',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'تعليق للاختبار' }),
  })
  assert.equal(commentResponse.status, 201)
  assert.equal((await commentResponse.json()).item.author.isVerified, true)
  const bookmarkResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}/bookmark`, {
    method: 'POST',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal((await bookmarkResponse.json()).isSaved, true)
  const savedPostsResponse = await fetch(`${baseUrl}/api/community/saved`, { headers: authorization })
  assert.equal((await savedPostsResponse.json()).items[0].id, createdPost.id)
  const reportResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}/report`, {
    method: 'POST',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'محتوى غير مناسب' }),
  })
  assert.equal(reportResponse.status, 201)
  const duplicateReportResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}/report`, {
    method: 'POST',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'إبلاغ مكرر' }),
  })
  assert.equal((await duplicateReportResponse.json()).duplicate, true)

  const deletePostResponse = await fetch(`${baseUrl}/api/community/posts/${createdPost.id}`, {
    method: 'DELETE',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal(deletePostResponse.status, 200)
  const emptyOwnPosts = await (await fetch(`${baseUrl}/api/community/mine`, { headers: authorization })).json()
  assert.equal(emptyOwnPosts.count, 0)
  const hiddenPostList = await (await fetch(`${baseUrl}/api/community/posts`, { headers: authorization })).json()
  assert.equal(hiddenPostList.items.some((item) => item.id === createdPost.id), false)
  const emptySavedPosts = await (await fetch(`${baseUrl}/api/community/saved`, { headers: authorization })).json()
  assert.equal(emptySavedPosts.items.some((item) => item.id === createdPost.id), false)

  const largeImageBuffer = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(largeImageBuffer)
  largeImageBuffer.writeUInt32BE(4097, 16)
  largeImageBuffer.writeUInt32BE(1, 20)
  const oversizedDimensionsResponse = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: { ...browserAuthHeaders(loginResponses[0], true), 'content-type': 'application/json' },
    body: JSON.stringify({ photoDataUrl: `data:image/png;base64,${largeImageBuffer.toString('base64')}` }),
  })
  assert.equal(oversizedDimensionsResponse.status, 400)

  const csrfRejectedResponse = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { cookie: authorization.cookie, origin: 'http://127.0.0.1', 'sec-fetch-site': 'same-origin' },
  })
  assert.equal(csrfRejectedResponse.status, 403)
  const logoutResponse = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: browserAuthHeaders(loginResponses[0], true),
  })
  assert.equal(logoutResponse.status, 200)
  const invalidatedSessionResponse = await fetch(`${baseUrl}/api/session`, { headers: authorization })
  assert.equal(invalidatedSessionResponse.status, 401)
  const concurrentSessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: concurrentAuthorization,
  })
  assert.equal(concurrentSessionResponse.status, 200)
  const requestAfterLogoutResponse = await fetch(`${baseUrl}/api/requests/${requestId}`, { headers: authorization })
  assert.equal(requestAfterLogoutResponse.status, 401)

  const flutterLoginResponse = await fetch(`${baseUrl}/api/verify-code`, {
    method: 'POST',
    headers: {
      origin: 'https://localhost',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, code: accessCode }),
  })
  assert.equal(flutterLoginResponse.status, 200)
  assert.equal(flutterLoginResponse.headers.get('set-cookie'), null)
  const { sessionToken: flutterSessionToken } = await flutterLoginResponse.json()
  assert.match(flutterSessionToken, /^[A-Za-z0-9_-]{43}$/)
  const sessionsAfterFlutterLogin = readStoredData('studentSessions')
  assert.equal(JSON.stringify(sessionsAfterFlutterLogin).includes(flutterSessionToken), false)
  const flutterSessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: { authorization: `Bearer ${flutterSessionToken}` },
  })
  assert.equal(flutterSessionResponse.status, 200)

  const disabledAccountLoginResponse = await fetch(`${baseUrl}/api/verify-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: accessCode }),
  })
  const disabledAccountAuthorization = browserAuthHeaders(disabledAccountLoginResponse)
  writeStoredData('subscriptions', {
    codes: [{
      code: accessCode,
      email,
      studentName: 'طالب اختبار',
      phone: '+963 900 000 000',
      grade: 'الصف التجريبي',
      active: false,
    }],
  })
  const disabledSessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: disabledAccountAuthorization,
  })
  assert.equal(disabledSessionResponse.status, 403)

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const limitedLoginResponse = await fetch(`${baseUrl}/api/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: 'ELITE-WRONG-CODE-123' }),
    })
    assert.equal(limitedLoginResponse.status, 403)
  }
  const rateLimitedResponse = await fetch(`${baseUrl}/api/verify-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: 'ELITE-WRONG-CODE-123' }),
  })
  assert.equal(rateLimitedResponse.status, 429)
})

test('registration no longer exposes bot linking or delivery fields', async () => {
  const response = await fetch(`${baseUrl}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'طالب تجريبي جديد',
      phone: '+963 900 000 123',
      email: 'new-student@example.test',
      gradeId: 1,
      programType: 'center',
      subjectIds: ['math'],
    }),
  })

  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal('telegramLink' in result, false)
  const requests = readStoredData('requests')
  const createdRequest = requests.find((item) => item.id === result.id)
  assert.equal('telegramBindingTokenHash' in createdRequest, false)
  assert.equal('telegramUserId' in createdRequest, false)
})

test('rejects removed digital-course registrations without deleting legacy catalog data', async () => {
  const response = await fetch(`${baseUrl}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'طالب دورات',
      phone: '+963 900 000 124',
      email: 'digital-student@example.test',
      gradeId: 1,
      programType: 'digital',
      digitalCourseIds: ['old-course'],
    }),
  })
  assert.equal(response.status, 400)
  const catalog = readStoredData('catalog')
  assert.equal('digitalCourses' in catalog, true)
})

test('protects the web admin API with a session and strips stored access-code hashes', async () => {
  if (!serverProcess || serverProcess.exitCode !== null) startApiServer()
  await waitForApiServer()
  const anonymousData = await fetch(`${baseUrl}/api/admin/data`)
  assert.equal(anonymousData.status, 401)

  const invalidLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'not-the-code' }),
  })
  assert.equal(invalidLogin.status, 401)

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'isam000' }),
  })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  const cookie = login.headers.get('set-cookie').split(';', 1)[0]
  const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie } })
  assert.equal(session.status, 200)

  const dataResponse = await fetch(`${baseUrl}/api/admin/data`, { headers: { cookie } })
  assert.equal(dataResponse.status, 200)
  const data = await dataResponse.json()
  assert.equal(Array.isArray(data.catalog.grades), true)
  assert.deepEqual(data.teachers, [])
  assert.equal(JSON.stringify(data).includes('codeHash'), false)
  assert.equal(JSON.stringify(data).includes('codeSalt'), false)

  const csrfRejected = await fetch(`${baseUrl}/api/admin/catalog`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(data.catalog),
  })
  assert.equal(csrfRejected.status, 403)

  const missingTeacher = await fetch(`${baseUrl}/api/admin/teachers/unknown`, {
    method: 'PATCH',
    headers: { cookie, origin: baseUrl, 'X-Elite-CSRF': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ active: true }),
  })
  assert.equal(missingTeacher.status, 404)

  const teacherUid = 'google.com:teacher-1'
  writeStoredData('teacherProfiles', {
    teachers: {
      [teacherUid]: {
        uid: teacherUid,
        email: 'teacher@example.test',
        displayName: 'أستاذ تجريبي',
        specialty: '',
        title: '',
        subjects: [],
        active: false,
        createdAt: new Date().toISOString(),
        approvedAt: null,
      },
    },
  })
  const teacherUpdate = await fetch(`${baseUrl}/api/admin/teachers/${encodeURIComponent(teacherUid)}`, {
    method: 'PATCH',
    headers: { cookie, origin: baseUrl, 'X-Elite-CSRF': '1', 'content-type': 'application/json' },
    body: JSON.stringify({
      active: true,
      displayName: 'الأستاذ المعتمد',
      specialty: 'الرياضيات',
      title: 'مدرس',
      subjects: ['جبر', 'هندسة'],
    }),
  })
  assert.equal(teacherUpdate.status, 200)
  const approvedTeacher = await teacherUpdate.json()
  assert.equal(approvedTeacher.active, true)
  assert.equal(approvedTeacher.displayName, 'الأستاذ المعتمد')
  assert.deepEqual(approvedTeacher.subjects, ['جبر', 'هندسة'])
  const teacherDisabled = await fetch(`${baseUrl}/api/admin/teachers/${encodeURIComponent(teacherUid)}`, {
    method: 'PATCH',
    headers: { cookie, origin: baseUrl, 'X-Elite-CSRF': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ active: false }),
  })
  assert.equal(teacherDisabled.status, 200)
  assert.equal((await teacherDisabled.json()).active, false)
  writeStoredData('teacherProfiles', { teachers: {} })

  const linkedSubscription = readStoredData('subscriptions').codes.find((item) => item.email === email)
  writeStoredData('firebaseStudentLinks', {
    users: {
      'google.com:student-1': {
        subscriptionId: linkedSubscription.id,
        email,
        linkedAt: new Date().toISOString(),
      },
    },
  })
  const reissuedCode = await fetch(`${baseUrl}/api/admin/codes/${linkedSubscription.id}`, {
    method: 'PATCH',
    headers: { cookie, origin: baseUrl, 'X-Elite-CSRF': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'reissue' }),
  })
  assert.equal(reissuedCode.status, 200)
  assert.deepEqual(readStoredData('firebaseStudentLinks').users, {})

  const logout = await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: { cookie, origin: baseUrl, 'X-Elite-CSRF': '1' },
  })
  assert.equal(logout.status, 200)
  const expiredSession = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie } })
  assert.equal(expiredSession.status, 401)
})

test('requires a valid Firebase identity and reports missing server configuration', async () => {
  const invalidIdentity = await fetch(`${baseUrl}/api/auth/google/student`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://localhost' },
    body: JSON.stringify({ idToken: 'short' }),
  })
  assert.equal(invalidIdentity.status, 401)

  const unconfiguredIdentity = await fetch(`${baseUrl}/api/auth/google/teacher`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://localhost' },
    body: JSON.stringify({ idToken: 'valid-firebase-id-token-value' }),
  })
  assert.equal(unconfiguredIdentity.status, 503)
})

test('does not save a Google registration until the server verifies its Firebase token', async () => {
  const requestsBefore = readStoredData('requests')
  const response = await fetch(`${baseUrl}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://localhost' },
    body: JSON.stringify({
      name: 'Student Example',
      phone: '+963 900 000 000',
      email,
      gradeId: 1,
      programType: 'center',
      subjectIds: ['math'],
      googleIdToken: 'valid-firebase-id-token-value',
    }),
  })

  assert.equal(response.status, 503)
  assert.equal(readStoredData('requests').length, requestsBefore.length)
})
