import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const sessionDurationMs = 8 * 60 * 60 * 1000
const marksPreviewDurationMs = 15 * 60 * 1000
const maxAdminLoginAttempts = 8
const adminLoginWindowMs = 15 * 60 * 1000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const staffRoles = new Set(['manager', 'teacher', 'counselor'])
const staffRoleLabels = {
  manager: 'مدير',
  teacher: 'أستاذ',
  counselor: 'موجّه',
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function adminCookie(token, request, clear = false) {
  const secure = Boolean(request.socket.encrypted) ||
    process.env.TRUST_PROXY === 'true' && request.headers['x-forwarded-proto'] === 'https'
  return `elite_admin_session=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=${clear ? 0 : sessionDurationMs / 1000}${secure ? '; Secure' : ''}`
}

function getCookie(request) {
  const cookie = (request.headers.cookie ?? '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('elite_admin_session='))
  if (!cookie) return ''
  try {
    return decodeURIComponent(cookie.slice('elite_admin_session='.length))
  } catch {
    return ''
  }
}

function validGradeCatalog(catalog) {
  const gradeIds = new Set()
  return catalog && typeof catalog === 'object' && !Array.isArray(catalog) &&
    Array.isArray(catalog.grades) && catalog.grades.length <= 20 &&
    catalog.grades.every((grade) => {
      if (!grade || typeof grade !== 'object' || Array.isArray(grade)) return false
      if (gradeIds.has(grade.id)) return false
      gradeIds.add(grade.id)
      const subjectIds = new Set()
      return (
        Number.isInteger(grade.id) && grade.id >= 1 && grade.id <= 20 &&
        typeof grade.name === 'string' && grade.name.trim().length > 0 && grade.name.trim().length <= 100 &&
        typeof grade.title === 'string' && grade.title.trim().length > 0 && grade.title.trim().length <= 100 &&
        typeof grade.stage === 'string' && grade.stage.trim().length > 0 && grade.stage.trim().length <= 100 &&
        Array.isArray(grade.subjects) && grade.subjects.length <= 100 &&
        grade.subjects.every((subject) => {
          if (!subject || typeof subject !== 'object' || Array.isArray(subject)) return false
          if (subjectIds.has(subject.id)) return false
          subjectIds.add(subject.id)
          return (
            typeof subject.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(subject.id) &&
            typeof subject.name === 'string' && subject.name.trim().length > 0 && subject.name.trim().length <= 100 &&
            Number.isFinite(Number(subject.price)) && Number(subject.price) >= 0 &&
            typeof subject.currency === 'string' && subject.currency.length <= 8 &&
            Array.isArray(subject.teachers) && subject.teachers.every((teacher) => typeof teacher === 'string' && teacher.length <= 100)
          )
        })
      )
    }) &&
    (!catalog.news || Array.isArray(catalog.news) && catalog.news.length <= 500 && catalog.news.every((item) =>
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id) &&
      typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 150 &&
      typeof (item.description ?? item.summary) === 'string' && (item.description ?? item.summary).length <= 1000 &&
      typeof (item.link ?? '') === 'string' && (item.link ?? '').length <= 500 &&
      (!item.link || (() => {
        try { return ['http:', 'https:'].includes(new URL(item.link).protocol) } catch { return false }
      })())
    )) &&
    catalog.settings && typeof catalog.settings === 'object' && !Array.isArray(catalog.settings)
}

function subscriptionSummary(entry) {
  const { code: _code, codeHash: _codeHash, codeSalt: _codeSalt, ...safeEntry } = entry
  return safeEntry
}

function normalizedEnrollmentLabel(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar')
}

function isEnrolledForMark(subscription, requests, grade, subject) {
  const registration = requests.find((item) => item.id === subscription.requestId)
  const storedGradeId = subscription.gradeId ?? registration?.gradeId
  const gradeId = Number(storedGradeId)
  const gradeLabels = [grade.name, grade.title].map(normalizedEnrollmentLabel)
  const subscriptionGrade = normalizedEnrollmentLabel(subscription.grade)
  const registrationGrade = normalizedEnrollmentLabel(registration?.gradeTitle)
  const hasGradeId = storedGradeId !== undefined && storedGradeId !== null && Number.isInteger(gradeId)
  const matchesGrade = hasGradeId
    ? gradeId === grade.id
    : gradeLabels.includes(subscriptionGrade) || gradeLabels.includes(registrationGrade)
  if (!matchesGrade) return false

  const subjectIds = [
    ...(Array.isArray(subscription.subjectIds) ? subscription.subjectIds : []),
    ...(Array.isArray(registration?.subjectIds) ? registration.subjectIds : []),
  ]
  const subjectNames = [
    ...(Array.isArray(subscription.subjectNames) ? subscription.subjectNames : []),
    ...(Array.isArray(registration?.subjectNames) ? registration.subjectNames : []),
  ].map(normalizedEnrollmentLabel)
  if (!subjectIds.length && !subjectNames.length) return true
  return subjectIds.includes(subject.id) || subjectNames.includes(normalizedEnrollmentLabel(subject.name))
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function createAdminApi({
  readJsonBody,
  jsonResponse,
  readCatalog,
  saveCatalog,
  readRegistrationRequests,
  saveRegistrationRequests,
  readSubscriptions,
  saveSubscriptions,
  readStaffAccounts,
  saveStaffAccounts,
  hashAccessCode,
  matchesAccessCode,
  generateAccessCode,
  revokeStudentSessions,
  readTeacherProfiles,
  saveTeacherProfiles,
  revokeTeacherSessions,
  unlinkFirebaseStudent,
  communityStore,
  inspectMarksWorkbook,
}) {
  const sessions = new Map()
  const staffSessions = new Map()
  const loginAttempts = new Map()
  const staffLoginAttempts = new Map()
  const previews = new Map()

  function authenticated(request) {
    const token = getCookie(request)
    if (!token) return false
    const id = tokenHash(token)
    const expiresAt = sessions.get(id)
    if (!expiresAt || expiresAt <= Date.now()) {
      sessions.delete(id)
      return false
    }
    return id
  }

  function csrfIsValid(request, allowedOrigins) {
    const origin = request.headers.origin
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === request.headers.host
    } catch {}
    return request.headers['x-elite-csrf'] === '1' &&
      Boolean(origin) && (allowedOrigins.has(origin) || sameOrigin)
  }

  async function getDashboardData() {
    const [catalog, requests, subscriptions, staff, community, teachers] = await Promise.all([
      readCatalog(),
      readRegistrationRequests(),
      readSubscriptions(),
      readStaffAccounts(),
      communityStore.read(),
      readTeacherProfiles(),
    ])
    return {
      catalog: { ...catalog, digitalCourses: undefined },
      requests: requests.map((item) => Object.fromEntries(
        Object.entries(item).filter(([key]) => !key.startsWith('telegram')),
      )),
      subscriptions: subscriptions.codes.map(subscriptionSummary),
      staff: staff.accounts.map(staffSummary),
      teachers: Object.values(teachers).map((teacher) => ({
        uid: teacher.uid,
        email: teacher.email,
        displayName: teacher.displayName,
        specialty: teacher.specialty ?? '',
        title: teacher.title ?? '',
        subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [],
        active: teacher.active === true,
        createdAt: teacher.createdAt,
        approvedAt: teacher.approvedAt ?? null,
      })).sort((left, right) => left.displayName.localeCompare(right.displayName, 'ar')),
      announcements: community.announcements,
      reports: community.reports,
      posts: community.posts,
      marks: community.marks,
      imports: community.imports,
    }
  }

  function staffSummary(account) {
    const { codeHash: _codeHash, codeSalt: _codeSalt, ...safeAccount } = account
    return { ...safeAccount, roleLabel: staffRoleLabels[account.role] }
  }

  async function getStaffSession(token) {
    if (!token) return null
    const id = tokenHash(token)
    const session = staffSessions.get(id)
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      staffSessions.delete(id)
      return null
    }
    const { accounts } = await readStaffAccounts()
    const account = accounts.find((item) => item.id === session.accountId && item.active !== false)
    if (!account) {
      staffSessions.delete(id)
      return null
    }
    return staffSummary(account)
  }

  function revokeStaffSessions(accountId) {
    for (const [id, session] of staffSessions) {
      if (session.accountId === accountId) staffSessions.delete(id)
    }
  }

  async function handle(request, response, requestUrl, allowedOrigins) {
    const { pathname } = requestUrl
    if (!pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/staff/')) return false

    if (request.method === 'POST' && pathname === '/api/staff/login') {
      try {
        const ip = request.socket.remoteAddress ?? 'unknown'
        const now = Date.now()
        const attempts = (staffLoginAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < adminLoginWindowMs)
        if (attempts.length >= maxAdminLoginAttempts) return jsonResponse(response, 429, { error: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.' })
        attempts.push(now)
        staffLoginAttempts.set(ip, attempts)
        const payload = await readJsonBody(request, 2000)
        const email = String(payload?.email ?? '').trim().toLowerCase()
        const password = typeof payload?.password === 'string' ? payload.password : ''
        if (!emailPattern.test(email) || password.length < 8 || password.length > 200) {
          return jsonResponse(response, 401, { error: 'بيانات دخول الموظف غير صحيحة.' })
        }
        const { accounts } = await readStaffAccounts()
        const account = accounts.find((item) => item.email === email && item.active !== false)
        if (!account || !(await matchesAccessCode(password, account))) {
          return jsonResponse(response, 401, { error: 'بيانات دخول الموظف غير صحيحة.' })
        }
        staffLoginAttempts.delete(ip)
        const token = randomBytes(32).toString('base64url')
        staffSessions.set(tokenHash(token), { accountId: account.id, expiresAt: now + sessionDurationMs })
        return jsonResponse(response, 200, { sessionToken: token, staff: staffSummary(account) })
      } catch (error) {
        const invalid = error instanceof SyntaxError || error.message.includes('حجم الطلب')
        if (!invalid) console.error('Staff login failed:', error.message)
        return jsonResponse(response, invalid ? 400 : 500, {
          error: invalid ? 'صيغة الطلب غير صحيحة.' : 'تعذر تسجيل دخول الموظف.',
        })
      }
    }

    if (pathname === '/api/staff/session' && request.method === 'GET') {
      const token = (request.headers.authorization ?? '').match(/^Bearer\s+(\S+)$/i)?.[1]
      const staff = await getStaffSession(token)
      return staff
        ? jsonResponse(response, 200, { staff })
        : jsonResponse(response, 401, { error: 'سجّل الدخول بحساب الموظف.' })
    }

    if (pathname === '/api/staff/logout' && request.method === 'POST') {
      const token = (request.headers.authorization ?? '').match(/^Bearer\s+(\S+)$/i)?.[1]
      if (token) staffSessions.delete(tokenHash(token))
      return jsonResponse(response, 200, { ok: true })
    }

    if (request.method === 'POST' && pathname === '/api/admin/login') {
      try {
        const configuredCode = process.env.ADMIN_ACCESS_CODE
        if (!configuredCode) return jsonResponse(response, 503, { error: 'رمز دخول الإدارة غير مضبوط على الخادم.' })
        const ip = request.socket.remoteAddress ?? 'unknown'
        const now = Date.now()
        const attempts = (loginAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < adminLoginWindowMs)
        if (attempts.length >= maxAdminLoginAttempts) return jsonResponse(response, 429, { error: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.' })
        attempts.push(now)
        loginAttempts.set(ip, attempts)
        const payload = await readJsonBody(request, 1000)
        const submitted = typeof payload?.code === 'string' ? payload.code : ''
        const expectedHash = createHash('sha256').update(configuredCode).digest()
        const submittedHash = createHash('sha256').update(submitted).digest()
        if (!timingSafeEqual(expectedHash, submittedHash)) return jsonResponse(response, 401, { error: 'رمز الدخول غير صحيح.' })
        loginAttempts.delete(ip)
        const token = randomBytes(32).toString('base64url')
        sessions.set(tokenHash(token), now + sessionDurationMs)
        response.setHeader('set-cookie', adminCookie(token, request))
        return jsonResponse(response, 200, { ok: true })
      } catch (error) {
        return jsonResponse(response, error.message.includes('حجم الطلب') || error instanceof SyntaxError ? 400 : 500, {
          error: error.message.includes('حجم الطلب') || error instanceof SyntaxError ? 'صيغة الطلب غير صحيحة.' : 'تعذر تسجيل الدخول إلى لوحة الإدارة.',
        })
      }
    }

    if (request.method === 'GET' && pathname === '/api/admin/session') {
      return authenticated(request)
        ? jsonResponse(response, 200, { authenticated: true })
        : jsonResponse(response, 401, { authenticated: false, error: 'سجّل الدخول إلى لوحة الإدارة.' })
    }

    const sessionId = authenticated(request)
    if (!sessionId) return jsonResponse(response, 401, { error: 'سجّل الدخول إلى لوحة الإدارة.' })
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !csrfIsValid(request, allowedOrigins)) {
      return jsonResponse(response, 403, { error: 'تعذر التحقق من مصدر الطلب.' })
    }

    if (request.method === 'POST' && pathname === '/api/admin/logout') {
      sessions.delete(sessionId)
      response.setHeader('set-cookie', adminCookie('', request, true))
      return jsonResponse(response, 200, { ok: true })
    }
    if (request.method === 'GET' && pathname === '/api/admin/data') {
      try {
        return jsonResponse(response, 200, await getDashboardData())
      } catch (error) {
        console.error('Admin dashboard data could not be loaded:', error.message)
        return jsonResponse(response, 500, { error: 'تعذر تحميل بيانات لوحة الإدارة.' })
      }
    }

    try {
      const teacherMatch = pathname.match(/^\/api\/admin\/teachers\/([^/]+)$/)
      let teacherUid = ''
      if (teacherMatch) {
        try {
          teacherUid = decodeURIComponent(teacherMatch[1])
        } catch {
          teacherUid = ''
        }
      }
      if (teacherMatch && request.method === 'PATCH' &&
          /^[A-Za-z0-9_.:-]{1,128}$/.test(teacherUid)) {
        const payload = await readJsonBody(request)
        const teachers = await readTeacherProfiles()
        const teacher = teachers[teacherUid]
        if (!teacher) return jsonResponse(response, 404, { error: 'حساب الأستاذ غير موجود.' })

        if (payload?.displayName !== undefined) {
          if (typeof payload.displayName !== 'string' || payload.displayName.trim().length < 2 || payload.displayName.trim().length > 100) {
            return jsonResponse(response, 400, { error: 'اسم الأستاذ يجب أن يكون بين حرفين و100 حرف.' })
          }
          teacher.displayName = payload.displayName.trim()
        }
        if (payload?.specialty !== undefined) {
          if (typeof payload.specialty !== 'string' || payload.specialty.trim().length > 100) {
            return jsonResponse(response, 400, { error: 'التخصص غير صالح.' })
          }
          teacher.specialty = payload.specialty.trim()
        }
        if (payload?.title !== undefined) {
          if (typeof payload.title !== 'string' || payload.title.trim().length > 100) {
            return jsonResponse(response, 400, { error: 'المسمى الوظيفي غير صالح.' })
          }
          teacher.title = payload.title.trim()
        }
        if (payload?.subjects !== undefined) {
          if (!Array.isArray(payload.subjects) || payload.subjects.length > 12 ||
              payload.subjects.some((subject) => typeof subject !== 'string' || !subject.trim() || subject.trim().length > 100)) {
            return jsonResponse(response, 400, { error: 'قائمة المواد غير صالحة.' })
          }
          teacher.subjects = [...new Set(payload.subjects.map((subject) => subject.trim()))]
        }
        if (payload?.active !== undefined) {
          if (typeof payload.active !== 'boolean') return jsonResponse(response, 400, { error: 'حالة الاعتماد غير صالحة.' })
          teacher.active = payload.active
          teacher.approvedAt = payload.active ? teacher.approvedAt ?? new Date().toISOString() : null
        }
        await saveTeacherProfiles(teachers)
        if (teacher.active !== true) await revokeTeacherSessions(teacher.uid)
        return jsonResponse(response, 200, {
          uid: teacher.uid,
          email: teacher.email,
          displayName: teacher.displayName,
          specialty: teacher.specialty ?? '',
          title: teacher.title ?? '',
          subjects: teacher.subjects ?? [],
          active: teacher.active === true,
          createdAt: teacher.createdAt,
          approvedAt: teacher.approvedAt ?? null,
        })
      }

      if (request.method === 'PUT' && pathname === '/api/admin/catalog') {
        const catalog = await readJsonBody(request, 1_000_000)
        if (!validGradeCatalog(catalog)) return jsonResponse(response, 400, { error: 'بيانات الكتالوج غير صالحة.' })
        const existingCatalog = await readCatalog()
        catalog.digitalCourses = existingCatalog.digitalCourses
        await saveCatalog(catalog)
        return jsonResponse(response, 200, { ok: true })
      }

      if (request.method === 'POST' && pathname === '/api/admin/requests') {
        const payload = await readJsonBody(request)
        if (!['approved', 'rejected'].includes(payload?.status) || typeof payload.id !== 'string') {
          return jsonResponse(response, 400, { error: 'إجراء الطلب غير صالح.' })
        }
        const requests = await readRegistrationRequests()
        const target = requests.find((item) => item.id === payload.id)
        if (!target) return jsonResponse(response, 404, { error: 'الطلب غير موجود.' })
        if (target.status !== 'pending') return jsonResponse(response, 409, { error: 'تمت معالجة هذا الطلب مسبقاً.' })
        const subscriptions = await readSubscriptions()
        let issuedCode = ''
        let subscription = subscriptions.codes.find((item) => item.requestId === target.id)
        if (payload.status === 'approved') {
          if (!emailPattern.test(String(target.email ?? ''))) return jsonResponse(response, 400, { error: 'لا يمكن قبول الطلب قبل إضافة بريد إلكتروني صحيح.' })
          issuedCode = generateAccessCode()
          const codeHash = await hashAccessCode(issuedCode)
          if (subscription) {
            Object.assign(subscription, codeHash)
            subscription.active = true
            await revokeStudentSessions(subscription.id)
            await unlinkFirebaseStudent(subscription.id)
          } else {
            subscription = {
              id: randomUUID(),
              ...codeHash,
              email: target.email.toLowerCase(),
              studentName: target.name,
              phone: target.phone,
              gradeId: target.gradeId,
              grade: target.gradeTitle,
              programType: target.programType ?? 'center',
              subjectIds: target.subjectIds ?? [],
              subjectNames: target.subjectNames ?? [],
              requestId: target.id,
              active: true,
              createdAt: new Date().toISOString(),
            }
            subscriptions.codes.unshift(subscription)
          }
          await saveSubscriptions(subscriptions)
        } else if (subscription) {
          subscription.active = false
          await revokeStudentSessions(subscription.id)
          await saveSubscriptions(subscriptions)
        }
        target.status = payload.status
        target.codeDeliveryStatus = payload.status === 'approved' ? 'manual' : 'not_applicable'
        await saveRegistrationRequests(requests)
        return jsonResponse(response, 200, { ok: true, request: target, ...(issuedCode ? { code: issuedCode } : {}) })
      }

      const requestMatch = pathname.match(/^\/api\/admin\/requests\/([\da-f-]{36})$/i)
      if (requestMatch && request.method === 'DELETE') {
        const requests = await readRegistrationRequests()
        const index = requests.findIndex((item) => item.id === requestMatch[1])
        if (index < 0) return jsonResponse(response, 404, { error: 'الطلب غير موجود.' })
        requests.splice(index, 1)
        await saveRegistrationRequests(requests)
        return jsonResponse(response, 200, { ok: true })
      }

      if (request.method === 'POST' && pathname === '/api/admin/codes') {
        const payload = await readJsonBody(request)
        const email = String(payload?.email ?? '').trim().toLowerCase()
        const studentName = String(payload?.studentName ?? '').trim()
        const grade = String(payload?.grade ?? '').trim()
        if (!emailPattern.test(email) || !studentName || studentName.length > 100 || !grade || grade.length > 100) {
          return jsonResponse(response, 400, { error: 'أدخل بريداً صحيحاً واسم الطالب والمرحلة.' })
        }
        const subscriptions = await readSubscriptions()
        if (subscriptions.codes.some((item) => String(item.email ?? '').toLowerCase() === email && item.active !== false)) {
          return jsonResponse(response, 409, { error: 'يوجد اشتراك نشط لهذا البريد.' })
        }
        const code = generateAccessCode()
        const entry = {
          id: randomUUID(),
          ...await hashAccessCode(code),
          email,
          studentName,
          grade,
          active: true,
          createdAt: new Date().toISOString(),
        }
        subscriptions.codes.unshift(entry)
        await saveSubscriptions(subscriptions)
        return jsonResponse(response, 201, { item: subscriptionSummary(entry), code })
      }

      const codeMatch = pathname.match(/^\/api\/admin\/codes\/([\da-f-]{36})$/i)
      if (codeMatch) {
        const subscriptions = await readSubscriptions()
        const item = subscriptions.codes.find((entry) => entry.id === codeMatch[1])
        if (!item) return jsonResponse(response, 404, { error: 'الاشتراك غير موجود.' })
        if (request.method === 'DELETE') {
          await revokeStudentSessions(item.id)
          await unlinkFirebaseStudent(item.id)
          subscriptions.codes.splice(subscriptions.codes.indexOf(item), 1)
          await saveSubscriptions(subscriptions)
          return jsonResponse(response, 200, { ok: true })
        }
        if (request.method === 'PATCH') {
          const payload = await readJsonBody(request)
          if (payload?.action === 'toggle') {
            item.active = item.active === false
            if (!item.active) await revokeStudentSessions(item.id)
            await saveSubscriptions(subscriptions)
            return jsonResponse(response, 200, { item: subscriptionSummary(item) })
          }
          if (payload?.action === 'reissue') {
            const code = generateAccessCode()
            Object.assign(item, await hashAccessCode(code))
            item.active = true
            item.updatedAt = new Date().toISOString()
            await revokeStudentSessions(item.id)
            await unlinkFirebaseStudent(item.id)
            await saveSubscriptions(subscriptions)
            return jsonResponse(response, 200, { item: subscriptionSummary(item), code })
          }
          const email = String(payload?.email ?? item.email ?? '').trim().toLowerCase()
          const studentName = String(payload?.studentName ?? item.studentName ?? '').trim()
          const grade = String(payload?.grade ?? item.grade ?? '').trim()
          if (!emailPattern.test(email) || !studentName || studentName.length > 100 || !grade || grade.length > 100) {
            return jsonResponse(response, 400, { error: 'بيانات الاشتراك غير صالحة.' })
          }
          if (email !== String(item.email ?? '').toLowerCase()) await revokeStudentSessions(item.id)
          Object.assign(item, { email, studentName, grade })
          await saveSubscriptions(subscriptions)
          return jsonResponse(response, 200, { item: subscriptionSummary(item) })
        }
      }

      if (request.method === 'POST' && pathname === '/api/admin/announcements') {
        const payload = await readJsonBody(request)
        const action = payload?.action
        if (action === 'publish') {
          const text = typeof payload.text === 'string' ? payload.text.trim() : ''
          if (!text || text.length > 2000) return jsonResponse(response, 400, { error: 'اكتب إعلاناً من 1 إلى 2000 حرف.' })
          const subscriptions = (await readSubscriptions()).codes.filter((item) => item.active !== false)
          const id = randomUUID()
          const createdAt = new Date().toISOString()
          await communityStore.update((store) => {
            store.announcements.unshift({ id, text, createdAt, publishedByAdminId: 'web-admin', archivedAt: null })
            for (const subscription of subscriptions) {
              store.notifications.push({
                id: randomUUID(), subscriptionId: subscription.id, type: 'announcement', referenceId: id,
                text: `إعلان إداري جديد: ${text.slice(0, 150)}`, createdAt, readAt: null,
              })
            }
          })
          return jsonResponse(response, 201, { id })
        }
        if (action === 'archive' && typeof payload.id === 'string') {
          const archived = await communityStore.update((store) => {
            const item = store.announcements.find((entry) => entry.id === payload.id)
            if (!item || item.archivedAt) return false
            item.archivedAt = new Date().toISOString()
            return true
          })
          return archived ? jsonResponse(response, 200, { ok: true }) : jsonResponse(response, 404, { error: 'الإعلان غير موجود أو مؤرشف.' })
        }
        return jsonResponse(response, 400, { error: 'إجراء الإعلان غير صالح.' })
      }

      const reportMatch = pathname.match(/^\/api\/admin\/reports\/([\da-f-]{36})$/i)
      if (reportMatch && request.method === 'POST') {
        const payload = await readJsonBody(request)
        if (!['hide', 'resolve'].includes(payload?.action)) return jsonResponse(response, 400, { error: 'إجراء الإشراف غير صالح.' })
        const changed = await communityStore.update((store) => {
          const report = store.reports.find((item) => item.id === reportMatch[1])
          if (!report || report.resolvedAt) return false
          report.resolvedAt = new Date().toISOString()
          if (payload.action === 'hide') {
            const post = store.posts.find((item) => item.id === report.postId)
            if (post) post.hiddenAt = report.resolvedAt
          }
          return true
        })
        return changed ? jsonResponse(response, 200, { ok: true }) : jsonResponse(response, 404, { error: 'البلاغ غير موجود أو عولج مسبقاً.' })
      }

      const postMatch = pathname.match(/^\/api\/admin\/posts\/([\da-f-]{36})$/i)
      if (postMatch && request.method === 'POST') {
        const changed = await communityStore.update((store) => {
          const post = store.posts.find((item) => item.id === postMatch[1])
          if (!post || post.hiddenAt) return false
          post.hiddenAt = new Date().toISOString()
          store.bookmarks = store.bookmarks.filter((item) => item.postId !== post.id)
          return true
        })
        return changed ? jsonResponse(response, 200, { ok: true }) : jsonResponse(response, 404, { error: 'المنشور غير موجود أو مخفي.' })
      }

      if (request.method === 'GET' && pathname === '/api/admin/student-ids') {
        const subscriptions = await readSubscriptions()
        const items = subscriptions.codes.filter((item) => item.active !== false)
          .map(({ id, studentName, grade }) => ({ id, studentName: studentName ?? '', grade: grade ?? '' }))
        return jsonResponse(response, 200, { items })
      }

      if (request.method === 'GET' && pathname === '/api/admin/marks/roster') {
        const gradeId = Number(requestUrl.searchParams.get('gradeId'))
        const subjectId = requestUrl.searchParams.get('subjectId') ?? ''
        if (!Number.isInteger(gradeId) || gradeId < 1 || !/^[A-Za-z0-9_-]{1,24}$/.test(subjectId)) {
          return jsonResponse(response, 400, { error: 'اختر صفاً ومادة صالحين.' })
        }
        const catalog = await readCatalog()
        const grade = catalog.grades.find((item) => item.id === gradeId)
        const subject = grade?.subjects.find((item) => item.id === subjectId)
        if (!grade || !subject) return jsonResponse(response, 404, { error: 'الصف أو المادة غير موجودين.' })
        const [subscriptions, requests] = await Promise.all([
          readSubscriptions(),
          readRegistrationRequests(),
        ])
        const items = subscriptions.codes
          .filter((item) =>
            item.active !== false &&
            typeof item.id === 'string' &&
            item.id.length > 0 &&
            isEnrolledForMark(item, requests, grade, subject))
          .map((item) => ({
            id: item.id,
            studentName: String(item.studentName ?? 'طالب').slice(0, 100),
            grade: String(item.grade ?? grade.title).slice(0, 100),
          }))
          .sort((left, right) => left.studentName.localeCompare(right.studentName, 'ar'))
        return jsonResponse(response, 200, { items })
      }

      if (request.method === 'POST' && pathname === '/api/admin/marks/entry') {
        const payload = await readJsonBody(request, 1_000_000)
        const gradeId = Number(payload?.gradeId)
        const subjectId = typeof payload?.subjectId === 'string' ? payload.subjectId : ''
        const exam = typeof payload?.exam === 'string' ? payload.exam.trim() : ''
        const term = typeof payload?.term === 'string' ? payload.term.trim() : ''
        const date = payload?.date
        const maxScore = Number(payload?.maxScore)
        if (!Number.isInteger(gradeId) || gradeId < 1 ||
            !/^[A-Za-z0-9_-]{1,24}$/.test(subjectId) ||
            !exam || exam.length > 120 || !term || term.length > 120 ||
            !isValidDate(date) || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100000 ||
            !Array.isArray(payload?.entries) || payload.entries.length < 1 || payload.entries.length > 5000) {
          return jsonResponse(response, 400, { error: 'تحقق من الصف والمادة والاختبار والفصل والتاريخ والدرجات المدخلة.' })
        }

        const catalog = await readCatalog()
        const grade = catalog.grades.find((item) => item.id === gradeId)
        const subject = grade?.subjects.find((item) => item.id === subjectId)
        if (!grade || !subject) return jsonResponse(response, 404, { error: 'الصف أو المادة غير موجودين.' })
        const [subscriptions, requests] = await Promise.all([
          readSubscriptions(),
          readRegistrationRequests(),
        ])
        const activeSubscriptions = subscriptions.codes.filter((item) => item.active !== false)
        const subscriptionsById = new Map(activeSubscriptions.map((item) => [item.id, item]))
        const seenStudents = new Set()
        const entries = []
        for (const entry of payload.entries) {
          const subscriptionId = typeof entry?.subscriptionId === 'string' ? entry.subscriptionId : ''
          const scoreValue = entry?.score
          const hasScore = typeof scoreValue === 'number' ||
            typeof scoreValue === 'string' && scoreValue.trim() !== ''
          const score = hasScore ? Number(scoreValue) : Number.NaN
          const subscription = subscriptionsById.get(subscriptionId)
          if (!subscriptionId || seenStudents.has(subscriptionId) ||
              !Number.isFinite(score) || score < 0 || score > maxScore ||
              !subscription || !isEnrolledForMark(subscription, requests, grade, subject)) {
            return jsonResponse(response, 400, { error: 'إحدى العلامات غير صالحة أو أن الطالب غير مسجل في هذه المادة.' })
          }
          seenStudents.add(subscriptionId)
          entries.push({ subscriptionId, score })
        }

        const batchId = randomUUID()
        const result = await communityStore.update((store) => {
          const importedAt = new Date().toISOString()
          let replacedCount = 0
          for (const entry of entries) {
            const record = {
              id: randomUUID(),
              subscriptionId: entry.subscriptionId,
              subject: subject.name,
              exam,
              term,
              score: entry.score,
              maxScore,
              date,
              batchId,
              createdAt: importedAt,
            }
            const key = [record.subscriptionId, record.subject, record.exam, record.term].join('\u0000')
            const index = store.marks.findIndex((item) =>
              [item.subscriptionId, item.subject, item.exam, item.term].join('\u0000') === key)
            if (index < 0) store.marks.push(record)
            else {
              store.marks[index] = { ...store.marks[index], ...record }
              replacedCount += 1
            }
            store.notifications.push({
              id: randomUUID(),
              subscriptionId: entry.subscriptionId,
              type: 'marks',
              referenceId: batchId,
              text: 'نُشرت علامات جديدة في ملفك الدراسي.',
              createdAt: importedAt,
              readAt: null,
            })
          }
          store.imports.push({
            id: randomUUID(),
            source: 'manual',
            batchId,
            gradeId,
            gradeTitle: grade.title,
            subjectId,
            subject: subject.name,
            exam,
            term,
            rowCount: entries.length,
            replacedCount,
            importedByAdminId: 'web-admin',
            importedAt,
          })
          return { count: entries.length, replacedCount, batchId }
        })
        return jsonResponse(response, 200, result)
      }

      if (request.method === 'POST' && pathname === '/api/admin/marks/preview') {
        const payload = await readJsonBody(request, 7_000_000)
        if (typeof payload?.file !== 'string' || payload.file.length > 7_000_000) {
          return jsonResponse(response, 400, { error: 'ملف العلامات غير صالح أو أكبر من الحد المسموح.' })
        }
        const buffer = Buffer.from(payload.file, 'base64')
        const subscriptions = (await readSubscriptions()).codes.filter((item) => item.active !== false)
        const preview = await inspectMarksWorkbook(buffer, subscriptions)
        const community = await communityStore.read()
        const existingKeys = new Set(community.marks.map((item) => [item.subscriptionId, item.subject, item.exam, item.term].join('\u0000')))
        const overwriteCount = preview.records.filter((row) => row.valid && existingKeys.has([row.studentId, row.subject, row.exam, row.term].join('\u0000'))).length
        previews.set(preview.previewId, { preview, overwriteCount, sessionId, expiresAt: Date.now() + marksPreviewDurationMs })
        return jsonResponse(response, 200, {
          previewId: preview.previewId,
          fileHash: preview.fileHash,
          rowCount: preview.rowCount,
          validCount: preview.validCount,
          blockingCount: preview.blockingCount,
          overwriteCount,
          rows: preview.rows,
        })
      }

      const markConfirm = pathname.match(/^\/api\/admin\/marks\/preview\/([\da-f-]{36})\/confirm$/i)
      if (markConfirm && request.method === 'POST') {
        const pending = previews.get(markConfirm[1])
        if (!pending || pending.sessionId !== sessionId || pending.expiresAt <= Date.now()) {
          previews.delete(markConfirm[1])
          return jsonResponse(response, 410, { error: 'انتهت صلاحية المعاينة؛ ارفع الملف مجدداً.' })
        }
        if (pending.preview.blockingCount) return jsonResponse(response, 400, { error: 'لا يمكن استيراد ملف يحتوي على أخطاء.' })
        const result = await communityStore.update((store) => {
          if (store.imports.some((item) => item.fileHash === pending.preview.fileHash)) return { duplicate: true, count: 0 }
          const batchId = pending.preview.fileHash
          const records = pending.preview.records.map((row) => ({
            id: randomUUID(), subscriptionId: row.studentId, subject: row.subject, exam: row.exam,
            term: row.term, score: row.score, maxScore: row.maxScore, date: row.date,
            batchId, createdAt: new Date().toISOString(),
          }))
          const affected = new Set()
          for (const record of records) {
            const key = [record.subscriptionId, record.subject, record.exam, record.term].join('\u0000')
            const index = store.marks.findIndex((item) => [item.subscriptionId, item.subject, item.exam, item.term].join('\u0000') === key)
            if (index < 0) store.marks.push(record)
            else store.marks[index] = { ...store.marks[index], ...record }
            affected.add(record.subscriptionId)
          }
          const importedAt = new Date().toISOString()
          store.imports.push({
            id: randomUUID(), fileHash: batchId, rowCount: records.length,
            replacedCount: pending.overwriteCount, importedByAdminId: 'web-admin', importedAt,
          })
          for (const subscriptionId of affected) {
            store.notifications.push({
              id: randomUUID(), subscriptionId, type: 'marks', referenceId: batchId,
              text: 'نُشرت علامات جديدة في ملفك الدراسي.', createdAt: importedAt, readAt: null,
            })
          }
          return { duplicate: false, count: records.length }
        })
        previews.delete(markConfirm[1])
        return jsonResponse(response, 200, result)
      }

      return jsonResponse(response, 404, { error: 'المسار الإداري غير موجود.' })
    } catch (error) {
      const invalid = error instanceof SyntaxError || error.message.includes('حجم الطلب')
      if (!invalid) console.error('Admin API request failed:', error.message)
      return jsonResponse(response, invalid ? 400 : 500, {
        error: invalid ? 'صيغة الطلب أو حجمه غير صالح.' : error.message.match(/[\u0600-\u06FF]/) ? error.message : 'تعذر إتمام العملية الإدارية.',
      })
    }
  }

  return { handle }
}
