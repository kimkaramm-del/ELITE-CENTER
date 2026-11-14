import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createCommunityStore } from './community-store.js'
import { inspectMarksWorkbook } from './marks-import.js'
import { initializeRuntimeData, migrateLegacyData } from './runtime-data.js'
import { createSqliteStore } from './sqlite-store.js'
import { createAdminApi } from './admin-api.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(serverDirectory, '..')
const dataDirectory = resolve(process.env.ELITE_DATA_DIR ?? serverDirectory)
const dataStore = createSqliteStore(resolve(dataDirectory, 'elite-center.sqlite'))
const communityStore = createCommunityStore(dataStore)
const studentPhotosPath = resolve(dataDirectory, 'student-photos')
const registrationRateLimits = new Map()
const codeVerificationRateLimits = new Map()
const studentAccessSessions = new Map()
let studentSessionsWriteQueue = Promise.resolve()
const registrationRateWindowMs = 15 * 60 * 1000
const studentSessionDurationMs = 6 * 60 * 60 * 1000
const maximumStudentPhotoBytes = 1_500_000
const accessCodeHashBytes = 64
const deriveAccessCodeHash = promisify(scrypt)
const nativeApiOrigins = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost'])

async function loadLocalEnvironment() {
  if (process.env.ELITE_SKIP_DOTENV === 'true') return
  try {
    const contents = await readFile(resolve(projectDirectory, '.env'), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function readCatalog() {
  return dataStore.get('catalog', {})
}

async function saveCatalog(catalog) {
  dataStore.set('catalog', catalog)
}

async function readRegistrationRequests() {
  const requests = dataStore.get('requests', [])
  return Array.isArray(requests) ? requests : []
}

async function saveRegistrationRequests(requests) {
  dataStore.set('requests', requests)
}

async function hashAccessCode(code) {
  const salt = randomBytes(16)
  const hash = await deriveAccessCodeHash(String(code).trim().toUpperCase(), salt, accessCodeHashBytes)
  return { codeSalt: salt.toString('hex'), codeHash: hash.toString('hex') }
}

async function matchesAccessCode(code, subscription) {
  if (!/^[a-f0-9]{32}$/.test(subscription.codeSalt ?? '') ||
      !/^[a-f0-9]{128}$/.test(subscription.codeHash ?? '')) return false
  const expectedHash = Buffer.from(subscription.codeHash, 'hex')
  const actualHash = await deriveAccessCodeHash(String(code).trim().toUpperCase(), Buffer.from(subscription.codeSalt, 'hex'), accessCodeHashBytes)
  return timingSafeEqual(expectedHash, actualHash)
}

function generateAccessCode() {
  return `ELITE-${randomBytes(16).toString('hex').toUpperCase()}`
}

let subscriptionReadQueue = Promise.resolve()

async function readSubscriptions() {
  const currentRead = subscriptionReadQueue.then(readSubscriptionsFromDisk)
  subscriptionReadQueue = currentRead.then(() => undefined, () => undefined)
  return currentRead
}

async function readSubscriptionsFromDisk() {
  const payload = dataStore.get('subscriptions', { codes: [] })
  const subscriptions = { codes: Array.isArray(payload.codes) ? payload.codes : [] }
  let needsSave = false
  for (const entry of subscriptions.codes) {
    if (!entry.id) {
      entry.id = randomUUID()
      needsSave = true
    }
    if (typeof entry.code === 'string') {
      const legacyCode = entry.code.trim().toUpperCase()
      delete entry.code
      if (/^[A-Z0-9-]{12,64}$/.test(legacyCode)) {
        Object.assign(entry, await hashAccessCode(legacyCode))
      } else {
        entry.active = false
      }
      needsSave = true
    } else if (!/^[a-f0-9]{32}$/.test(entry.codeSalt ?? '') || !/^[a-f0-9]{128}$/.test(entry.codeHash ?? '')) {
      if (entry.active !== false) {
        entry.active = false
        needsSave = true
      }
    }
  }
  if (needsSave) await saveSubscriptions(subscriptions)
  return subscriptions
}

async function saveSubscriptions(subscriptions) {
  const safeSubscriptions = {
    codes: subscriptions.codes.map(({ code: _code, ...entry }) => entry),
  }
  dataStore.set('subscriptions', safeSubscriptions)
}

function findSessionSubscription(subscriptions, session) {
  return subscriptions.codes.find((entry) =>
    entry.id === session.subscriptionId &&
    String(entry.email ?? '').toLowerCase() === session.email &&
    entry.active !== false
  ) ?? null
}

async function findAccessCodeSubscription(subscriptions, code, email) {
  for (const entry of subscriptions.codes) {
    if (String(entry.email ?? '').toLowerCase() !== email || entry.active === false) continue
    if (await matchesAccessCode(code, entry)) return entry
  }
  return null
}

async function revokeStudentSessions(subscriptionId) {
  let didRevoke = false
  for (const [token, session] of studentAccessSessions) {
    if (session.subscriptionId === subscriptionId) {
      await revokeStudentSession(token)
      didRevoke = true
    }
  }
  if (didRevoke) await persistStudentSessions()
}

async function readNewsReactions() {
  const payload = dataStore.get('newsReactions', { reactions: {} })
  return payload.reactions && typeof payload.reactions === 'object' ? payload.reactions : {}
}

async function saveNewsReactions(reactions) {
  dataStore.set('newsReactions', { reactions })
}

async function readStudentProfiles() {
  const payload = dataStore.get('studentProfiles', { profiles: {} })
  return payload.profiles && typeof payload.profiles === 'object' ? payload.profiles : {}
}

async function saveStudentProfiles(profiles) {
  dataStore.set('studentProfiles', { profiles })
}

function parseStudentPhoto(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > maximumStudentPhotoBytes) return null
  const isPng = match[1] === 'png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg = match[1] === 'jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const isWebp = match[1] === 'webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
  if (!isPng && !isJpeg && !isWebp) return null
  let dimensions
  if (isPng && buffer.length >= 24) {
    dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } else if (isJpeg) {
    let offset = 2
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) break
      const marker = buffer[offset + 1]
      const segmentLength = buffer.readUInt16BE(offset + 2)
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        dimensions = { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
        break
      }
      offset += 2 + segmentLength
    }
  } else if (isWebp && buffer.length >= 25) {
    const format = buffer.toString('ascii', 12, 16)
    if (format === 'VP8X' && buffer.length >= 30) {
      dimensions = {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      }
    } else if (format === 'VP8L' && buffer[20] === 0x2f) {
      dimensions = {
        width: 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]),
        height: 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6)),
      }
    } else if (format === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      dimensions = {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      }
    }
  }
  if (!dimensions || !dimensions.width || !dimensions.height ||
      dimensions.width > 4096 || dimensions.height > 4096 ||
      dimensions.width * dimensions.height > 16_777_216) return null
  return { buffer, extension: isPng ? 'png' : isJpeg ? 'jpg' : 'webp', mimeType: `image/${match[1]}` }
}

function studentProfileResponse(profile, subscription, photoDataUrl = '') {
  return {
    email: subscription.email,
    name: profile.displayName ?? subscription.studentName ?? '',
    phone: profile.contactPhone ?? subscription.phone ?? '',
    grade: subscription.grade ?? 'البكالوريا',
    programType: 'center',
    subjects: subscription.subjectNames ?? [],
    photoDataUrl,
  }
}

async function readJsonBody(request, maximumBytes = 12_000) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of request) {
    byteLength += chunk.length
    if (byteLength > maximumBytes) throw new Error('حجم الطلب أكبر من المسموح.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function getAccessToken(request, _requestUrl) {
  const authorization = request.headers.authorization ?? ''
  const headerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (headerToken) return headerToken
  const cookie = request.headers.cookie ?? ''
  const sessionCookie = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('elite_student_session='))
  if (!sessionCookie) return ''
  try {
    return decodeURIComponent(sessionCookie.slice('elite_student_session='.length))
  } catch {
    return ''
  }
}

function studentSessionId(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function persistStudentSessions() {
  const sessions = {
    sessions: [...studentAccessSessions.entries()].map(([id, session]) => ({ id, ...session })),
  }
  const write = studentSessionsWriteQueue.then(() => dataStore.set('studentSessions', sessions))
  studentSessionsWriteQueue = write.catch(() => {})
  await write
}

async function loadStudentSessions() {
  const payload = dataStore.get('studentSessions', { sessions: [] })
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
  for (const session of sessions) {
    if (/^[a-f0-9]{64}$/.test(session.id ?? '') &&
        /^[a-f0-9-]{36}$/.test(session.subscriptionId ?? '') &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(session.email ?? '') &&
        Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()) {
      studentAccessSessions.set(session.id, {
        subscriptionId: session.subscriptionId,
        email: session.email,
        expiresAt: session.expiresAt,
      })
    }
  }
}

async function revokeStudentSession(token) {
  if (!token) return
  if (studentAccessSessions.delete(studentSessionId(token))) await persistStudentSessions()
}

function studentSessionCookie(token, request, clear = false) {
  const secure = Boolean(request.socket.encrypted) ||
    process.env.TRUST_PROXY === 'true' && request.headers['x-forwarded-proto'] === 'https'
  return `elite_student_session=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : Math.floor(studentSessionDurationMs / 1000)}${secure ? '; Secure' : ''}`
}

function requiresCookieCsrfValidation(request) {
  const authorization = request.headers.authorization ?? ''
  const hasBearerToken = /^Bearer\s+\S+$/i.test(authorization)
  const hasBearerHeader = /^Bearer\s*$/i.test(authorization)
  const hasSessionCookie = (request.headers.cookie ?? '').split(';').some((part) => part.trim().startsWith('elite_student_session='))
  if (hasBearerToken || !hasSessionCookie || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false
  return (!hasBearerHeader && request.headers['x-elite-csrf'] !== '1') ||
    !request.headers.origin ||
    request.headers['sec-fetch-site'] !== 'same-origin'
}

function getValidAccessSession(token) {
  const id = studentSessionId(token)
  const session = studentAccessSessions.get(id)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    studentAccessSessions.delete(id)
    void persistStudentSessions().catch((error) => {
      console.error('Failed to persist expired student session cleanup:', error.message)
    })
    return null
  }
  return session
}

async function authenticateStudentRequest(request, requestUrl) {
  const token = getAccessToken(request, requestUrl)
  const session = getValidAccessSession(token)
  if (!session) return { error: { status: 401, message: 'سجّل الدخول للوصول إلى مساحة الطالب.' } }
  const subscriptions = await readSubscriptions()
  const subscription = findSessionSubscription(subscriptions, session)
  if (!subscription) {
    await revokeStudentSession(token)
    return { error: { status: 403, message: 'الاشتراك غير فعال.' } }
  }
  return { token, session, subscription }
}

function accountRequestResponse(accountRequest) {
  return {
    id: accountRequest.id,
    status: accountRequest.status,
    statusMessage: accountRequest.statusMessage,
    gradeTitle: accountRequest.gradeTitle,
    programType: 'center',
    subjects: accountRequest.subjectNames,
    createdAt: accountRequest.createdAt,
  }
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

async function serveWebApp(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400)
    response.end()
    return true
  }
  if (decodedPath === '/admin/') {
    response.writeHead(308, { location: '/admin' })
    response.end()
    return true
  }

  const webDirectory = resolve(projectDirectory, 'dist')
  const requestedPath = resolve(webDirectory, `.${decodedPath}`)
  const relativePath = relative(webDirectory, requestedPath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    response.writeHead(404)
    response.end()
    return true
  }

  let filePath = requestedPath
  try {
    if (!(await stat(filePath)).isFile()) {
      filePath = resolve(webDirectory, 'index.html')
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    if (extname(decodedPath)) return false
    filePath = resolve(webDirectory, 'index.html')
  }

  let contents
  try {
    contents = await readFile(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'content-length': contents.length,
    'cache-control': 'no-cache',
  })
  response.end(request.method === 'HEAD' ? undefined : contents)
  return true
}

const adminApi = createAdminApi({
  readJsonBody,
  jsonResponse,
  readCatalog,
  saveCatalog,
  readRegistrationRequests,
  saveRegistrationRequests,
  readSubscriptions,
  saveSubscriptions,
  hashAccessCode,
  generateAccessCode,
  revokeStudentSessions,
  communityStore,
  inspectMarksWorkbook,
})

const apiServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://127.0.0.1')
  const origin = request.headers.origin
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const developmentOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173']
  const allowedOrigins = new Set([
    ...nativeApiOrigins,
    ...developmentOrigins,
    ...configuredOrigins,
  ])
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('access-control-allow-methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS')
    response.setHeader('access-control-allow-headers', 'Authorization, Content-Type, Range, X-Elite-CSRF')
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader('access-control-expose-headers', 'Accept-Ranges, Content-Range, Content-Length')
    response.setHeader('vary', 'Origin')
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204)
    return response.end()
  }
  if (!requestUrl.pathname.startsWith('/api') &&
      await serveWebApp(request, response, requestUrl.pathname)) return
  if (requestUrl.pathname.startsWith('/api/admin/')) {
    await adminApi.handle(request, response, requestUrl, allowedOrigins)
    return
  }
  if (requiresCookieCsrfValidation(request)) {
    return jsonResponse(response, 403, { error: 'تعذر التحقق من مصدر الطلب.' })
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    return jsonResponse(response, 200, { ok: true })
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/catalog') {
    try {
      const catalog = await readCatalog()
      delete catalog.digitalCourses
      return jsonResponse(response, 200, catalog)
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر قراءة كتالوج المركز.' })
    }
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/news') {
    try {
      const catalog = await readCatalog()
      const reactions = await readNewsReactions()
      let viewerEmail = ''
      const session = getValidAccessSession(getAccessToken(request, requestUrl))
      if (session) {
        const subscriptions = await readSubscriptions()
        if (findSessionSubscription(subscriptions, session)) viewerEmail = session.email
      }
      const publicNews = Array.isArray(catalog.news) ? [...catalog.news] : []
      const items = publicNews.map((item) => {
        const likes = Array.isArray(reactions[item.id]) ? reactions[item.id] : []
        return { ...item, reactionCount: likes.length, isLiked: viewerEmail ? likes.includes(viewerEmail) : false }
      })
      return jsonResponse(response, 200, { items })
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر قراءة الأخبار.' })
    }
  }
  const newsReactionMatch = request.method === 'POST' && requestUrl.pathname.match(/^\/api\/news\/([\w-]+)\/reaction$/)
  if (newsReactionMatch) {
    try {
      const token = getAccessToken(request, requestUrl)
      const session = getValidAccessSession(token)
      if (!session) return jsonResponse(response, 401, { error: 'سجّل الدخول للتفاعل مع الأخبار.' })
      const subscriptions = await readSubscriptions()
      if (!findSessionSubscription(subscriptions, session)) {
        await revokeStudentSession(token)
        return jsonResponse(response, 403, { error: 'الاشتراك غير فعال.' })
      }
      const catalog = await readCatalog()
      if (!(catalog.news ?? []).some((item) => item.id === newsReactionMatch[1])) return jsonResponse(response, 404, { error: 'الخبر غير موجود.' })
      const reactions = await readNewsReactions()
      const likes = Array.isArray(reactions[newsReactionMatch[1]]) ? reactions[newsReactionMatch[1]] : []
      const existingIndex = likes.indexOf(session.email)
      if (existingIndex >= 0) likes.splice(existingIndex, 1)
      else likes.push(session.email)
      reactions[newsReactionMatch[1]] = likes
      await saveNewsReactions(reactions)
      return jsonResponse(response, 200, { isLiked: existingIndex < 0, reactionCount: likes.length })
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر حفظ التفاعل.' })
    }
  }
  if (requestUrl.pathname.startsWith('/api/community/') || requestUrl.pathname === '/api/announcements' ||
      requestUrl.pathname === '/api/notifications' || requestUrl.pathname.startsWith('/api/notifications/') ||
      requestUrl.pathname === '/api/marks') {
    let authenticated
    try {
      authenticated = await authenticateStudentRequest(request, requestUrl)
    } catch (error) {
      console.error('Student session lookup failed for community request:', error.message)
      return jsonResponse(response, 500, { error: 'تعذر التحقق من جلسة الطالب.' })
    }
    if (authenticated.error) return jsonResponse(response, authenticated.error.status, { error: authenticated.error.message })
    const { subscription } = authenticated
    const ownerId = subscription.id
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/api/community/posts') {
        const data = await communityStore.read()
        const offset = Number(requestUrl.searchParams.get('cursor') ?? 0)
        const query = (requestUrl.searchParams.get('q') ?? '').trim().toLocaleLowerCase('ar')
        if (query.length > 100) return jsonResponse(response, 400, { error: 'عبارة البحث طويلة جداً.' })
        if (!Number.isInteger(offset) || offset < 0 || offset > data.posts.length) return jsonResponse(response, 400, { error: 'مؤشر الصفحة غير صالح.' })
        const visible = data.posts.filter((post) => post.hiddenAt == null && (!query || `${post.text} ${post.author.studentName} ${post.author.grade}`.toLocaleLowerCase('ar').includes(query))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        const page = visible.slice(offset, offset + 20)
        const items = page.map((post) => ({
          id: post.id,
          text: post.text,
          createdAt: post.createdAt,
          author: post.author,
          reactionCount: post.likes.length,
          isLiked: post.likes.includes(ownerId),
          isSaved: data.bookmarks.some((bookmark) => bookmark.subscriptionId === ownerId && bookmark.postId === post.id),
          comments: post.comments.slice(-20).map(({ id, author, text, createdAt }) => ({ id, author, text, createdAt })),
          commentCount: post.comments.length,
        }))
        return jsonResponse(response, 200, { items, nextCursor: offset + page.length < visible.length ? offset + page.length : null })
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/community/mine') {
        const data = await communityStore.read()
        const ownPosts = data.posts.filter((post) => post.subscriptionId === ownerId && post.hiddenAt == null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        const items = ownPosts.slice(0, 30).map((post) => ({
          id: post.id,
          text: post.text,
          createdAt: post.createdAt,
          author: post.author,
          reactionCount: post.likes.length,
          isLiked: post.likes.includes(ownerId),
          isSaved: data.bookmarks.some((bookmark) => bookmark.subscriptionId === ownerId && bookmark.postId === post.id),
          comments: post.comments.slice(-20).map(({ id, author, text, createdAt }) => ({ id, author, text, createdAt })),
          commentCount: post.comments.length,
        }))
        return jsonResponse(response, 200, {
          items,
          count: ownPosts.length,
          reactionCount: ownPosts.reduce((total, post) => total + post.likes.length, 0),
        })
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/community/posts') {
        const body = await readJsonBody(request, 5000)
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text || text.length > 2000) return jsonResponse(response, 400, { error: 'اكتب منشوراً من 1 إلى 2000 حرف.' })
        const post = {
          id: randomUUID(),
          subscriptionId: ownerId,
          author: { studentName: String(subscription.studentName ?? 'طالب').slice(0, 100), grade: String(subscription.grade ?? '').slice(0, 100) },
          text,
          createdAt: new Date().toISOString(),
          likes: [],
          comments: [],
          hiddenAt: null,
        }
        await communityStore.update((data) => { data.posts.push(post) })
        return jsonResponse(response, 201, { item: { id: post.id, text: post.text, createdAt: post.createdAt, author: post.author, reactionCount: 0, isLiked: false, isSaved: false, comments: [], commentCount: 0 } })
      }
      const postRoute = requestUrl.pathname.match(/^\/api\/community\/posts\/([\da-f-]{36})(?:\/(reaction|comments|bookmark|report))?$/i)
      if (postRoute) {
        const postId = postRoute[1]
        const action = postRoute[2]
        const data = await communityStore.read()
        const post = data.posts.find((item) => item.id === postId && item.hiddenAt == null)
        if (!post) return jsonResponse(response, 404, { error: 'المنشور غير موجود.' })
        if (request.method === 'DELETE' && !action) {
          if (post.subscriptionId !== ownerId) return jsonResponse(response, 403, { error: 'لا يمكنك حذف منشور طالب آخر.' })
          const deleted = await communityStore.update((current) => {
            const target = current.posts.find((item) => item.id === postId && item.subscriptionId === ownerId && item.hiddenAt == null)
            if (!target) return false
            target.hiddenAt = new Date().toISOString()
            current.bookmarks = current.bookmarks.filter((bookmark) => bookmark.postId !== postId)
            return true
          })
          return deleted ? jsonResponse(response, 200, { ok: true }) : jsonResponse(response, 404, { error: 'المنشور غير موجود.' })
        }
        if (request.method === 'POST' && action === 'reaction') {
          const result = await communityStore.update((current) => {
            const target = current.posts.find((item) => item.id === postId && item.hiddenAt == null)
            if (!target) return null
            const index = target.likes.indexOf(ownerId)
            if (index >= 0) target.likes.splice(index, 1)
            else target.likes.push(ownerId)
            return { isLiked: index < 0, reactionCount: target.likes.length }
          })
          return result ? jsonResponse(response, 200, result) : jsonResponse(response, 404, { error: 'المنشور غير موجود.' })
        }
        if (request.method === 'POST' && action === 'comments') {
          const body = await readJsonBody(request, 3000)
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (!text || text.length > 1000) return jsonResponse(response, 400, { error: 'اكتب تعليقاً من 1 إلى 1000 حرف.' })
          const comment = {
            id: randomUUID(),
            subscriptionId: ownerId,
            author: { studentName: String(subscription.studentName ?? 'طالب').slice(0, 100), grade: String(subscription.grade ?? '').slice(0, 100) },
            text,
            createdAt: new Date().toISOString(),
          }
          const added = await communityStore.update((current) => {
            const target = current.posts.find((item) => item.id === postId && item.hiddenAt == null)
            if (!target) return false
            target.comments.push(comment)
            return true
          })
          if (!added) return jsonResponse(response, 404, { error: 'المنشور غير موجود.' })
          return jsonResponse(response, 201, { item: { id: comment.id, author: comment.author, text: comment.text, createdAt: comment.createdAt } })
        }
        if (request.method === 'POST' && action === 'bookmark') {
          const saved = await communityStore.update((current) => {
            if (!current.posts.some((item) => item.id === postId && item.hiddenAt == null)) return null
            const existing = current.bookmarks.findIndex((bookmark) => bookmark.subscriptionId === ownerId && bookmark.postId === postId)
            if (existing >= 0) {
              current.bookmarks.splice(existing, 1)
              return false
            }
            current.bookmarks.push({ subscriptionId: ownerId, postId, createdAt: new Date().toISOString() })
            return true
          })
          return saved === null ? jsonResponse(response, 404, { error: 'المنشور غير موجود.' }) : jsonResponse(response, 200, { isSaved: saved })
        }
        if (request.method === 'POST' && action === 'report') {
          const body = await readJsonBody(request, 1000)
          const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
          if (!reason || reason.length > 300) return jsonResponse(response, 400, { error: 'اذكر سبب الإبلاغ (حتى 300 حرف).' })
          const result = await communityStore.update((current) => {
            if (current.reports.some((report) => report.postId === postId && report.subscriptionId === ownerId)) return false
            current.reports.push({ id: randomUUID(), postId, subscriptionId: ownerId, reason, createdAt: new Date().toISOString(), resolvedAt: null })
            return true
          })
          return result ? jsonResponse(response, 201, { reported: true }) : jsonResponse(response, 200, { reported: true, duplicate: true })
        }
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/community/saved') {
        const data = await communityStore.read()
        const savedIds = new Set(data.bookmarks.filter((bookmark) => bookmark.subscriptionId === ownerId).map((bookmark) => bookmark.postId))
        const items = data.posts.filter((post) => savedIds.has(post.id) && post.hiddenAt == null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((post) => ({
            id: post.id, text: post.text, createdAt: post.createdAt, author: post.author,
            reactionCount: post.likes.length, isLiked: post.likes.includes(ownerId), isSaved: true,
            comments: post.comments.slice(-20).map(({ id, author, text, createdAt }) => ({ id, author, text, createdAt })),
            commentCount: post.comments.length,
          }))
        return jsonResponse(response, 200, { items })
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/announcements') {
        await communityStore.update((store) => {
          for (const announcement of store.announcements) {
            if (announcement.archivedAt || store.notifications.some((item) => item.type === 'announcement' && item.subscriptionId === ownerId && item.referenceId === announcement.id)) continue
            store.notifications.push({
              id: randomUUID(), subscriptionId: ownerId, type: 'announcement', referenceId: announcement.id,
              text: `إعلان إداري جديد: ${announcement.text.slice(0, 150)}`, createdAt: announcement.createdAt, readAt: null,
            })
          }
        })
        const data = await communityStore.read()
        const readById = new Map(data.notifications.filter((item) => item.subscriptionId === ownerId && item.type === 'announcement').map((item) => [item.referenceId, item]))
        const items = data.announcements.filter((item) => !item.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({
          id: item.id, text: item.text, createdAt: item.createdAt, isRead: Boolean(readById.get(item.id)?.readAt), notificationId: readById.get(item.id)?.id ?? '',
        }))
        return jsonResponse(response, 200, { items })
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/notifications') {
        await communityStore.update((store) => {
          for (const announcement of store.announcements) {
            if (announcement.archivedAt || store.notifications.some((item) => item.type === 'announcement' && item.subscriptionId === ownerId && item.referenceId === announcement.id)) continue
            store.notifications.push({
              id: randomUUID(), subscriptionId: ownerId, type: 'announcement', referenceId: announcement.id,
              text: `إعلان إداري جديد: ${announcement.text.slice(0, 150)}`, createdAt: announcement.createdAt, readAt: null,
            })
          }
        })
        const data = await communityStore.read()
        const items = data.notifications.filter((item) => item.subscriptionId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({
          id: item.id, type: item.type, text: item.text, referenceId: item.referenceId, createdAt: item.createdAt, isRead: Boolean(item.readAt),
        }))
        return jsonResponse(response, 200, { items, unreadCount: items.filter((item) => !item.isRead).length })
      }
      const readNotificationMatch = request.method === 'POST' && requestUrl.pathname.match(/^\/api\/notifications\/([\da-f-]{36})\/read$/i)
      if (readNotificationMatch) {
        const result = await communityStore.update((data) => {
          const notification = data.notifications.find((item) => item.id === readNotificationMatch[1] && item.subscriptionId === ownerId)
          if (!notification) return false
          notification.readAt ??= new Date().toISOString()
          return true
        })
        return result ? jsonResponse(response, 200, { ok: true }) : jsonResponse(response, 404, { error: 'الإشعار غير موجود.' })
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/marks') {
        const data = await communityStore.read()
        const items = data.marks.filter((mark) => mark.subscriptionId === ownerId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(({ id, subject, exam, term, score, maxScore, date }) => ({ id, subject, exam, term, score, maxScore, date }))
        return jsonResponse(response, 200, { items })
      }
      return jsonResponse(response, 404, { error: 'المسار غير موجود.' })
    } catch (error) {
      if (error instanceof SyntaxError || error.message.includes('حجم الطلب')) return jsonResponse(response, 400, { error: 'صيغة الطلب أو حجمه غير صالح.' })
      console.error('Student community request failed:', error.message)
      return jsonResponse(response, 500, { error: 'تعذر إتمام العملية. حاول مجدداً.' })
    }
  }
  if ((request.method === 'GET' || request.method === 'PUT') && requestUrl.pathname === '/api/profile') {
    const token = getAccessToken(request, requestUrl)
    const session = getValidAccessSession(token)
    if (!session) return jsonResponse(response, 401, { error: 'سجّل الدخول لعرض ملفك الشخصي.' })
    try {
      const subscriptions = await readSubscriptions()
      const subscription = findSessionSubscription(subscriptions, session)
      if (!subscription) {
        await revokeStudentSession(token)
        return jsonResponse(response, 403, { error: 'الاشتراك غير فعال.' })
      }
      const profiles = await readStudentProfiles()
      const profile = profiles[session.email] ?? {}
      if (request.method === 'GET') {
        if ('name' in profile || 'phone' in profile) {
          delete profile.name
          delete profile.phone
          await saveStudentProfiles(profiles)
        }
        let photoDataUrl = ''
        if (/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(profile.photoFile ?? '')) {
          try {
            const photo = await readFile(resolve(studentPhotosPath, profile.photoFile))
            const extension = profile.photoFile.split('.').at(-1)
            const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
            photoDataUrl = `data:${mimeType};base64,${photo.toString('base64')}`
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        return jsonResponse(response, 200, studentProfileResponse(profile, subscription, photoDataUrl))
      }

      const payload = await readJsonBody(request, maximumStudentPhotoBytes * 2 + 20_000)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          Object.keys(payload).some((key) => !['photoDataUrl', 'displayName', 'contactPhone'].includes(key))) {
        return jsonResponse(response, 400, { error: 'بيانات الملف الشخصي غير صالحة.' })
      }

      const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : null
      if (payload.displayName !== undefined &&
          (displayName === null || (displayName.length > 0 && (displayName.length < 2 || displayName.length > 100)))) {
        return jsonResponse(response, 400, { error: 'أدخل اسماً من حرفين إلى 100 حرف.' })
      }
      const contactPhone = typeof payload.contactPhone === 'string' ? payload.contactPhone.trim() : null
      if (payload.contactPhone !== undefined &&
          (contactPhone === null || (contactPhone.length > 0 && !/^[+\d\s()-]{7,24}$/.test(contactPhone)))) {
        return jsonResponse(response, 400, { error: 'أدخل رقم هاتف صحيحاً أو اتركه فارغاً.' })
      }

      let photoFile = profile.photoFile ?? ''
      if (payload.photoDataUrl === '') {
        if (photoFile) await unlink(resolve(studentPhotosPath, photoFile)).catch(() => {})
        photoFile = ''
      } else if (payload.photoDataUrl !== undefined) {
        const parsedPhoto = parseStudentPhoto(payload.photoDataUrl)
        if (!parsedPhoto) return jsonResponse(response, 400, { error: 'اختر صورة PNG أو JPEG أو WebP بحجم لا يتجاوز 1.5 ميغابايت.' })
        await mkdir(studentPhotosPath, { recursive: true })
        const emailHash = createHash('sha256').update(session.email).digest('hex')
        photoFile = `${emailHash}.${parsedPhoto.extension}`
        await writeFile(resolve(studentPhotosPath, photoFile), parsedPhoto.buffer)
      }

      const { name: _name, phone: _phone, ...updatedProfile } = profile
      if (displayName !== null) {
        if (displayName) updatedProfile.displayName = displayName
        else delete updatedProfile.displayName
      }
      if (contactPhone !== null) {
        if (contactPhone) updatedProfile.contactPhone = contactPhone
        else delete updatedProfile.contactPhone
      }
      profiles[session.email] = { ...updatedProfile, photoFile, updatedAt: new Date().toISOString() }
      await saveStudentProfiles(profiles)
      let photoDataUrl = ''
      if (photoFile) {
        const photo = await readFile(resolve(studentPhotosPath, photoFile))
        const extension = photoFile.split('.').at(-1)
        photoDataUrl = `data:${extension === 'jpg' ? 'image/jpeg' : `image/${extension}`};base64,${photo.toString('base64')}`
      }
      return jsonResponse(response, 200, studentProfileResponse(profiles[session.email], subscription, photoDataUrl))
    } catch (error) {
      const badPayload = error instanceof SyntaxError || error.message.includes('حجم الطلب')
      return jsonResponse(response, badPayload ? 400 : 500, { error: badPayload ? 'صيغة الملف الشخصي غير صحيحة.' : 'تعذر حفظ الملف الشخصي.' })
    }
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/session') {
    const token = getAccessToken(request, requestUrl)
    const session = getValidAccessSession(token)
    if (!session) return jsonResponse(response, 401, { error: 'جلسة الطالب غير صالحة أو منتهية.' })
    try {
      const subscriptions = await readSubscriptions()
      const subscription = findSessionSubscription(subscriptions, session)
      if (!subscription) {
        await revokeStudentSession(token)
        return jsonResponse(response, 403, { error: 'الاشتراك غير فعال.' })
      }
      const profiles = await readStudentProfiles()
      const profile = profiles[session.email] ?? {}
      return jsonResponse(response, 200, {
        studentName: profile.displayName ?? subscription.studentName ?? 'طالب',
        email: subscription.email,
        phone: profile.contactPhone ?? subscription.phone ?? '',
        grade: subscription.grade ?? 'البكالوريا',
        programType: 'center',
        subjects: subscription.subjectNames ?? [],
        expiresAt: session.expiresAt,
      })
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر التحقق من جلسة الطالب.' })
    }
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/logout') {
    const token = getAccessToken(request, requestUrl)
    await revokeStudentSession(token)
    response.setHeader('set-cookie', studentSessionCookie('', request, true))
    return jsonResponse(response, 200, { ok: true })
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/verify-code') {
    try {
      const clientAddress = request.socket.remoteAddress ?? 'unknown'
      const now = Date.now()
      const recentAttempts = (codeVerificationRateLimits.get(clientAddress) ?? []).filter((timestamp) => now - timestamp < registrationRateWindowMs)
      if (recentAttempts.length >= 10) return jsonResponse(response, 429, { error: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.' })
      recentAttempts.push(now)
      codeVerificationRateLimits.set(clientAddress, recentAttempts)

      const payload = await readJsonBody(request)
      const rawCode = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : ''
      const rawEmail = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
      if (!rawCode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) return jsonResponse(response, 400, { error: 'أدخل البريد الإلكتروني ورمز الدخول.' })
      const subscriptions = await readSubscriptions()
      const match = /^[A-Z0-9-]{12,64}$/.test(rawCode)
        ? await findAccessCodeSubscription(subscriptions, rawCode, rawEmail)
        : null
      if (!match) return jsonResponse(response, 403, { error: 'رمز الدخول غير صالح أو لا يطابق البريد الإلكتروني.' })
      const sessionToken = randomBytes(32).toString('base64url')
      const expiresAt = Date.now() + studentSessionDurationMs
      studentAccessSessions.set(studentSessionId(sessionToken), { subscriptionId: match.id, email: rawEmail, expiresAt })
      await persistStudentSessions()
      const isNativeClient = nativeApiOrigins.has(origin)
      if (!isNativeClient) response.setHeader('set-cookie', studentSessionCookie(sessionToken, request))
      return jsonResponse(response, 200, {
        ok: true,
        ...(isNativeClient ? { sessionToken } : {}),
        expiresAt,
        studentName: match.studentName ?? 'طالب',
        grade: match.grade ?? 'البكالوريا',
      })
    } catch (error) {
      return jsonResponse(response, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'صيغة الطلب غير صحيحة.' : 'تعذر التحقق من الرمز.' })
    }
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/requests') {
    try {
      const now = Date.now()
      const clientAddress = request.socket.remoteAddress ?? 'unknown'
      const recentRequests = (registrationRateLimits.get(clientAddress) ?? []).filter((timestamp) => now - timestamp < registrationRateWindowMs)
      if (recentRequests.length >= 4) return jsonResponse(response, 429, { error: 'وصلت إلى الحد المؤقت للطلبات. حاول بعد قليل.' })

      const payload = await readJsonBody(request)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return jsonResponse(response, 400, { error: 'صيغة الطلب غير صحيحة.' })
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      const phone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
      const gradeId = Number(payload.gradeId)
      const programType = payload.programType === undefined || payload.programType === 'center' ? 'center' : ''
      const subjectIds = Array.isArray(payload.subjectIds) ? [...new Set(payload.subjectIds.filter((id) => typeof id === 'string'))] : []
      const selectedCount = subjectIds.length
      if (name.length < 2 || name.length > 100 || !/^[+\d\s()-]{7,24}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !programType || selectedCount < 1 || selectedCount > 8) {
        return jsonResponse(response, 400, { error: 'تحقق من الاسم والهاتف والبريد والمواد المختارة.' })
      }

      const catalog = await readCatalog()
      if (catalog.settings?.registrationOpen === false || catalog.settings?.registrationOpen === 'false') {
        return jsonResponse(response, 403, { error: 'التسجيل مغلق حالياً. تواصل مع إدارة المركز.' })
      }
      const grade = catalog.grades.find((item) => item.id === gradeId)
      if (!grade) return jsonResponse(response, 400, { error: 'الصف المختار غير موجود.' })
      const selectedSubjects = subjectIds.map((id) => grade.subjects.find((subject) => subject.id === id))
      if (selectedSubjects.some((subject) => !subject)) return jsonResponse(response, 400, { error: 'إحدى المواد المختارة غير متاحة لهذا الصف.' })

      const requests = await readRegistrationRequests()
      const duplicateRequest = requests.find((item) => item.email === email && item.gradeId === gradeId && item.programType === programType && item.status === 'pending')
      if (duplicateRequest) return jsonResponse(response, 409, { error: 'لديك طلب قيد المراجعة لهذا الصف بالفعل.', requestId: duplicateRequest.id })

      const accountRequest = {
        id: randomUUID(),
        name,
        phone,
        email,
        gradeId,
        gradeTitle: grade.title,
        programType,
        subjectIds,
        subjectNames: selectedSubjects.map((subject) => subject.name),
        status: 'pending',
        statusMessage: '',
        createdAt: new Date(now).toISOString(),
      }
      requests.unshift(accountRequest)
      await saveRegistrationRequests(requests)
      recentRequests.push(now)
      registrationRateLimits.set(clientAddress, recentRequests)
      return jsonResponse(response, 201, accountRequestResponse(accountRequest))
    } catch (error) {
      const invalidRequest = error instanceof SyntaxError || error.message.includes('حجم الطلب')
      return jsonResponse(response, invalidRequest ? 400 : 500, { error: invalidRequest ? 'صيغة الطلب غير صحيحة.' : 'تعذر حفظ طلب التسجيل.' })
    }
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/my-requests') {
    const token = getAccessToken(request, requestUrl)
    const session = getValidAccessSession(token)
    if (!session) return jsonResponse(response, 401, { error: 'سجّل الدخول بكودك وبريدك لمتابعة الطلبات.' })
    try {
      const subscriptions = await readSubscriptions()
      if (!findSessionSubscription(subscriptions, session)) {
        await revokeStudentSession(token)
        return jsonResponse(response, 403, { error: 'الاشتراك غير فعال.' })
      }
      const requests = await readRegistrationRequests()
      const items = requests.filter((item) => String(item.email ?? '').toLowerCase() === session.email).map(accountRequestResponse)
      return jsonResponse(response, 200, { items })
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر قراءة طلبات الطالب.' })
    }
  }
  const requestStatusMatch = request.method === 'GET' && requestUrl.pathname.match(/^\/api\/requests\/([\da-f-]{36})$/i)
  if (requestStatusMatch) {
    try {
      const token = getAccessToken(request, requestUrl)
      const session = getValidAccessSession(token)
      if (!session) return jsonResponse(response, 401, { error: 'سجّل الدخول لمتابعة حالة الطلب.' })
      const subscriptions = await readSubscriptions()
      if (!findSessionSubscription(subscriptions, session)) {
        await revokeStudentSession(token)
        return jsonResponse(response, 403, { error: 'الاشتراك غير فعال.' })
      }
      const requests = await readRegistrationRequests()
      const accountRequest = requests.find((item) => item.id === requestStatusMatch[1])
      if (!accountRequest || String(accountRequest.email ?? '').toLowerCase() !== session.email) {
        return jsonResponse(response, 404, { error: 'لم نعثر على طلب التسجيل.' })
      }
      return jsonResponse(response, 200, accountRequestResponse(accountRequest))
    } catch {
      return jsonResponse(response, 500, { error: 'تعذر قراءة حالة الطلب.' })
    }
  }
  return jsonResponse(response, 404, { error: 'المسار غير موجود.' })
})

async function main() {
  await loadLocalEnvironment()
  await initializeRuntimeData({
    dataDirectory,
    catalogSeedPath: resolve(projectDirectory, 'server', 'catalog.json'),
  })
  migrateLegacyData(dataStore, dataDirectory)
  await readSubscriptions()
  await loadStudentSessions()
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001)
  const host = process.env.API_HOST ?? '0.0.0.0'
  apiServer.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`)
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
