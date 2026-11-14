import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '../contexts/LocaleContext.jsx'
import '../styles/admin.css'

const sections = [
  ['overview', 'الرئيسية', '⌂'],
  ['catalog', 'الصفوف والمواد والأسعار', '▤'],
  ['news', 'الأخبار العامة', '✦'],
  ['requests', 'طلبات التسجيل', '◷'],
  ['codes', 'أكواد الاشتراك', '⌑'],
  ['announcements', 'إعلانات الإدارة', '▣'],
  ['moderation', 'الإشراف على الموجز', '◉'],
  ['marks', 'إدخال العلامات', '▥'],
  ['settings', 'إعدادات المركز', '⚙'],
]

async function adminFetch(path, options = {}) {
  const method = options.method ?? 'GET'
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const response = await fetch(`${apiBase}/api/admin${path}`, {
    ...options,
    method,
    credentials: 'include',
    headers: {
      ...(method !== 'GET' ? { 'X-Elite-CSRF': '1' } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'تعذر تنفيذ الطلب.')
  return payload
}

function dateLabel(value, language) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(language === 'ar' ? 'ar' : 'en')
}

function dateInputValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function translateAdminMessage(message, t) {
  const codeMessages = [
    [/^تمت الموافقة\. رمز الدخول الذي يظهر مرة واحدة للنسخ: (.+)$/, 'تمت الموافقة. رمز الدخول الذي يظهر مرة واحدة للنسخ:'],
    [/^تم إنشاء الاشتراك\. رمز الدخول الذي يظهر مرة واحدة للنسخ: (.+)$/, 'تم إنشاء الاشتراك. رمز الدخول الذي يظهر مرة واحدة للنسخ:'],
    [/^تم إصدار رمز جديد وإبطال الجلسات السابقة\. الرمز لمرة واحدة: (.+)$/, 'تم إصدار رمز جديد وإبطال الجلسات السابقة. الرمز لمرة واحدة:'],
  ]
  for (const [pattern, prefix] of codeMessages) {
    const match = message.match(pattern)
    if (match) return `${t(prefix)} ${match[1]}`
  }

  const scoreError = message.match(/^تحقق من علامة (.+)؛ يجب أن تكون بين 0 و(.+)\.$/)
  if (scoreError) return `${t('تحقق من علامة')} ${scoreError[1]}. ${t('يجب أن تكون بين')} 0 ${t('و')} ${scoreError[2]}.`

  const savedScores = message.match(/^تم حفظ علامات (\d+) طالب وإشعارهم\.(?: تم تحديث (\d+) علامة سابقة\.)?$/)
  if (savedScores) {
    const saved = new Intl.NumberFormat('en').format(Number(savedScores[1]))
    const updated = savedScores[2] ? ` ${t('تم تحديث')} ${new Intl.NumberFormat('en').format(Number(savedScores[2]))} ${t('علامة سابقة.')}` : ''
    return `${t('تم حفظ علامات')} ${saved} ${t('طالب وإشعارهم.')}${updated}`
  }

  return t(message)
}

function Field({ label, ...props }) {
  const { t } = useLocale()
  return <label className="admin-field">{t(label)}<input {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} /></label>
}

function TextArea({ label, ...props }) {
  const { t } = useLocale()
  return <label className="admin-field">{t(label)}<textarea {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} /></label>
}

function AdminDashboard() {
  const { language, t } = useLocale()
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [code, setCode] = useState('')
  const [data, setData] = useState(null)
  const [section, setSection] = useState('overview')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [selectedGradeId, setSelectedGradeId] = useState('')
  const [newGrade, setNewGrade] = useState({ name: '', title: '', stage: '' })
  const [newSubject, setNewSubject] = useState({ id: '', name: '', price: '', currency: '$', teachers: '' })
  const [newNews, setNewNews] = useState({ title: '', summary: '', link: '' })
  const [newCode, setNewCode] = useState({ email: '', studentName: '', grade: '' })
  const [codeDraft, setCodeDraft] = useState('')
  const [announcementText, setAnnouncementText] = useState('')
  const [markForm, setMarkForm] = useState({
    gradeId: '',
    subjectId: '',
    exam: '',
    term: '',
    maxScore: '100',
    date: dateInputValue(),
  })
  const [markRoster, setMarkRoster] = useState([])
  const [markScores, setMarkScores] = useState({})
  const [markRosterLoading, setMarkRosterLoading] = useState(false)
  const [markRosterError, setMarkRosterError] = useState('')
  const [markEntryError, setMarkEntryError] = useState('')
  const [markStudentQuery, setMarkStudentQuery] = useState('')
  const [markStudentFilter, setMarkStudentFilter] = useState('all')
  const markScoreRefs = useRef(new Map())
  const markSaveRef = useRef(null)

  const activeSection = sections.find(([id]) => id === section) ?? sections[0]
  const selectedGrade = useMemo(
    () => data?.catalog.grades.find((grade) => String(grade.id) === String(selectedGradeId)) ?? data?.catalog.grades[0],
    [data, selectedGradeId],
  )

  const loadData = useCallback(async () => {
    const result = await adminFetch('/data')
    setData(result)
    if (result.catalog.grades[0]) setSelectedGradeId((current) => current || String(result.catalog.grades[0].id))
    return result
  }, [])

  useEffect(() => {
    document.title = `${t('لوحة الإدارة')} | ${t('مركز النخبة')}`
  }, [t])

  useEffect(() => {
    adminFetch('/session').then(async () => {
      setAuthenticated(true)
      await loadData()
    }).catch((error) => {
      if (error.message !== 'سجّل الدخول إلى لوحة الإدارة.') setNotice({ type: 'error', text: error.message })
    }).finally(() => setChecking(false))
  }, [loadData])

  useEffect(() => {
    if (!markForm.gradeId || !markForm.subjectId) return

    const controller = new AbortController()
    const query = new URLSearchParams({
      gradeId: markForm.gradeId,
      subjectId: markForm.subjectId,
    })
    adminFetch(`/marks/roster?${query}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setMarkRoster(result.items)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMarkRosterError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarkRosterLoading(false)
      })
    return () => controller.abort()
  }, [markForm.gradeId, markForm.subjectId])

  async function perform(action, successMessage) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await action()
      if (successMessage) setNotice({ type: 'success', text: successMessage })
      if (authenticated) await loadData()
      return result
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function login(event) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await adminFetch('/login', { method: 'POST', body: JSON.stringify({ code }) })
      setAuthenticated(true)
      setCode('')
      await loadData()
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    try {
      await adminFetch('/logout', { method: 'POST' })
      setAuthenticated(false)
      setData(null)
      setNotice({ type: 'success', text: 'تم تسجيل الخروج.' })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  function updateCatalog(mutator) {
    setData((current) => {
      const catalog = structuredClone(current.catalog)
      mutator(catalog)
      return { ...current, catalog }
    })
  }

  function updateMarkForm(field, value) {
    setMarkForm((current) => ({ ...current, [field]: value }))
    setMarkEntryError('')
  }

  async function saveCatalog(message = 'تم حفظ التغييرات.') {
    await perform(() => adminFetch('/catalog', {
      method: 'PUT',
      body: JSON.stringify(data.catalog),
    }), message)
  }

  function renderOverview() {
    const pending = data.requests.filter((item) => item.status === 'pending').length
    const activeCodes = data.subscriptions.filter((item) => item.active !== false).length
    const unreviewedReports = data.reports.filter((item) => !item.resolvedAt).length
    return <>
      <div className="admin-welcome">
        <div><span className="admin-eyebrow">{t('مركز النخبة · لوحة الإدارة')}</span><h2>{t('أهلاً بك في إدارة المركز')}</h2><p>{t('تحكم بالكتالوج والطلاب والإعلانات من مكان واحد.')}</p></div>
        <div className="admin-live"><i /> {t('النظام يعمل')}</div>
      </div>
      <div className="admin-stat-grid">
        <article><span>{t('الصفوف الدراسية')}</span><strong>{new Intl.NumberFormat(language).format(data.catalog.grades.length)}</strong><small>{t('صفوف ومواد وأسعار')}</small></article>
        <article><span>{t('طلبات تنتظر المراجعة')}</span><strong>{new Intl.NumberFormat(language).format(pending)}</strong><small>{t('طلبات تسجيل جديدة')}</small></article>
        <article><span>{t('الاشتراكات النشطة')}</span><strong>{new Intl.NumberFormat(language).format(activeCodes)}</strong><small>{t('أكواد دخول فعالة')}</small></article>
        <article><span>{t('بلاغات مفتوحة')}</span><strong>{new Intl.NumberFormat(language).format(unreviewedReports)}</strong><small>{t('تحتاج إلى مراجعة')}</small></article>
      </div>
      <div className="admin-card admin-shortcuts"><div className="admin-card-heading"><div><h3>{t('إدارة سريعة')}</h3><p>{t('انتقل مباشرة إلى القسم المطلوب')}</p></div></div><div className="admin-shortcut-grid">
        {sections.slice(1).map(([id, label, icon]) => <button key={id} type="button" onClick={() => setSection(id)}><span>{icon}</span>{t(label)}<b>←</b></button>)}
      </div></div>
    </>
  }

  function renderCatalog() {
    const grade = selectedGrade
    return <>
      <section className="admin-card">
        <div className="admin-card-heading"><div><h3>{t('الصفوف والمواد والأسعار')}</h3><p>{t('تعديل الصفوف والمواد والمدرسين والأسعار الظاهرة على الموقع.')}</p></div><button className="admin-button primary" disabled={busy} onClick={() => saveCatalog()}>{t('حفظ التغييرات')}</button></div>
        <div className="admin-grade-tabs">{data.catalog.grades.map((item) => <button key={item.id} className={grade?.id === item.id ? 'active' : ''} onClick={() => setSelectedGradeId(String(item.id))}>{item.title}</button>)}</div>
        {grade && <div className="admin-grade-editor">
          <div className="admin-form-grid">
            {['name', 'title', 'stage'].map((key) => <Field key={key} label={{ name: 'الاسم المختصر', title: 'عنوان الصف', stage: 'المرحلة' }[key]} value={grade[key] ?? ''} onChange={(event) => updateCatalog((catalog) => { const item = catalog.grades.find((entry) => entry.id === grade.id); item[key] = event.target.value })} />)}
            <Field label="رقم الصف" type="number" value={grade.id} onChange={(event) => updateCatalog((catalog) => { const item = catalog.grades.find((entry) => entry.id === grade.id); item.id = Number(event.target.value) })} />
          </div>
          <div className="admin-subject-list">{grade.subjects.map((subject) => <div className="admin-subject-row" key={subject.id}>
            <div className="admin-subject-meta"><strong>{subject.name}</strong><small>{t('المعرّف')}: {subject.id}</small></div>
            <Field label="اسم المادة" value={subject.name} onChange={(event) => updateCatalog((catalog) => { const current = catalog.grades.find((entry) => entry.id === grade.id).subjects.find((entry) => entry.id === subject.id); current.name = event.target.value })} />
            <Field label="السعر" type="number" min="0" value={subject.price ?? 0} onChange={(event) => updateCatalog((catalog) => { const current = catalog.grades.find((entry) => entry.id === grade.id).subjects.find((entry) => entry.id === subject.id); current.price = Number(event.target.value) })} />
            <Field label="العملة" value={subject.currency ?? ''} onChange={(event) => updateCatalog((catalog) => { const current = catalog.grades.find((entry) => entry.id === grade.id).subjects.find((entry) => entry.id === subject.id); current.currency = event.target.value })} />
            <Field label="المدرسون (افصل بفاصلة)" value={(subject.teachers ?? []).join(language === 'en' ? ', ' : '، ')} onChange={(event) => updateCatalog((catalog) => { const current = catalog.grades.find((entry) => entry.id === grade.id).subjects.find((entry) => entry.id === subject.id); current.teachers = event.target.value.split(/[،,]/).map((name) => name.trim()).filter(Boolean) })} />
            <button className="admin-button danger small" onClick={() => { if (window.confirm(`${t('حذف مادة')} ${subject.name}?`)) { updateCatalog((catalog) => { const item = catalog.grades.find((entry) => entry.id === grade.id); item.subjects = item.subjects.filter((entry) => entry.id !== subject.id) }) } }}>{t('حذف')}</button>
          </div>)}</div>
          <form className="admin-inline-form" onSubmit={(event) => {
            event.preventDefault()
            const subject = { ...newSubject, price: Number(newSubject.price), teachers: newSubject.teachers.split(/[،,]/).map((teacher) => teacher.trim()).filter(Boolean) }
            updateCatalog((catalog) => { catalog.grades.find((item) => item.id === grade.id).subjects.push(subject) })
            setNewSubject({ id: '', name: '', price: '', currency: '$', teachers: '' })
          }}>
            <h4>{t('إضافة مادة جديدة')}</h4>
            <div className="admin-form-grid">{[['id', 'المعرّف اللاتيني'], ['name', 'اسم المادة'], ['price', 'السعر'], ['currency', 'العملة'], ['teachers', 'المدرسون']].map(([key, label]) => <Field key={key} label={label} required value={newSubject[key]} onChange={(event) => setNewSubject({ ...newSubject, [key]: event.target.value })} />)}</div>
            <button className="admin-button secondary" type="submit">{t('إضافة مادة')}</button>
          </form>
          <div className="admin-divider" />
          <form className="admin-inline-form" onSubmit={(event) => {
            event.preventDefault()
            const id = Math.max(0, ...data.catalog.grades.map((item) => item.id)) + 1
            updateCatalog((catalog) => { catalog.grades.push({ id, ...newGrade, subjects: [] }) })
            setSelectedGradeId(String(id))
            setNewGrade({ name: '', title: '', stage: '' })
          }}>
            <h4>{t('إضافة صف دراسي')}</h4>
            <div className="admin-form-grid">{[['name', 'الاسم المختصر'], ['title', 'عنوان الصف'], ['stage', 'المرحلة']].map(([key, label]) => <Field key={key} label={label} required value={newGrade[key]} onChange={(event) => setNewGrade({ ...newGrade, [key]: event.target.value })} />)}</div>
            <button className="admin-button secondary" type="submit">{t('إضافة صف')}</button>
          </form>
          <button className="admin-button danger" onClick={() => { if (window.confirm(`${t('حذف الصف')} ${grade.title} ${t('وجميع مواده؟')}`)) { updateCatalog((catalog) => { catalog.grades = catalog.grades.filter((item) => item.id !== grade.id) }); setSelectedGradeId('') } }}>{t('حذف الصف المحدد')}</button>
        </div>}
      </section>
    </>
  }

  function renderNews() {
    return <>
      <section className="admin-card">
        <div className="admin-card-heading"><div><h3>{t('الأخبار العامة')}</h3><p>{t('الأخبار المنشورة للزوار على الموقع.')}</p></div></div>
        <form className="admin-form-stack" onSubmit={(event) => {
          event.preventDefault()
          const item = { id: crypto.randomUUID(), ...newNews, description: newNews.summary, publishedAt: new Date().toISOString() }
          updateCatalog((catalog) => { catalog.news = [item, ...(catalog.news ?? [])] })
          setNewNews({ title: '', summary: '', link: '' })
        }}>
          <div className="admin-form-grid"><Field label="عنوان الخبر" required value={newNews.title} onChange={(event) => setNewNews({ ...newNews, title: event.target.value })} /><Field label="رابط (اختياري)" type="url" value={newNews.link} onChange={(event) => setNewNews({ ...newNews, link: event.target.value })} /></div>
          <TextArea label="وصف الخبر" required value={newNews.summary} onChange={(event) => setNewNews({ ...newNews, summary: event.target.value })} />
          <button className="admin-button secondary" type="submit">{t('إضافة خبر')}</button>
        </form>
        <div className="admin-record-list">{(data.catalog.news ?? []).map((item) => <article className="admin-record" key={item.id}>
          <div className="admin-form-grid"><Field label="العنوان" value={item.title ?? ''} onChange={(event) => updateCatalog((catalog) => { const current = catalog.news.find((entry) => entry.id === item.id); current.title = event.target.value })} /><Field label="الرابط" value={item.link ?? ''} onChange={(event) => updateCatalog((catalog) => { const current = catalog.news.find((entry) => entry.id === item.id); current.link = event.target.value })} /></div>
          <TextArea label="الوصف" value={item.description ?? item.summary ?? ''} onChange={(event) => updateCatalog((catalog) => { const current = catalog.news.find((entry) => entry.id === item.id); current.description = event.target.value; current.summary = event.target.value })} />
          <button className="admin-button danger small" onClick={() => { if (window.confirm(`${t('حذف الخبر')} “${item.title}”?`)) updateCatalog((catalog) => { catalog.news = catalog.news.filter((entry) => entry.id !== item.id) }) }}>{t('حذف الخبر')}</button>
        </article>)}</div>
        <button className="admin-button primary" disabled={busy} onClick={() => saveCatalog('تم حفظ الأخبار.')}>{t('حفظ الأخبار')}</button>
      </section>
    </>
  }

  function renderRequests() {
    return <section className="admin-card"><div className="admin-card-heading"><div><h3>{t('طلبات التسجيل')}</h3><p>{t('مراجعة الطلبات وإصدار رمز دخول جديد عند الموافقة.')}</p></div></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('الطالب')}</th><th>{t('التواصل')}</th><th>{t('الصف والمواد')}</th><th>{t('الحالة')}</th><th>{t('تاريخ الطلب')}</th><th>{t('الإجراء')}</th></tr></thead><tbody>
        {data.requests.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.id.slice(0, 8)}</small></td><td dir="ltr">{item.email}<small>{item.phone}</small></td><td>{item.gradeTitle}<small>{(item.subjectNames ?? []).join(language === 'en' ? ', ' : '، ')}</small></td><td><span className={`admin-status ${item.status}`}>{t(({ pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض' })[item.status] ?? item.status)}</span></td><td>{dateLabel(item.createdAt, language)}</td><td className="admin-actions">
          {item.status === 'pending' && <><button className="admin-button primary small" disabled={busy} onClick={() => perform(async () => { const result = await adminFetch('/requests', { method: 'POST', body: JSON.stringify({ id: item.id, status: 'approved' }) }); setNotice(result.code ? { type: 'code', text: `تمت الموافقة. رمز الدخول الذي يظهر مرة واحدة للنسخ: ${result.code}` } : { type: 'success', text: 'تمت الموافقة وإنشاء الاشتراك.' }); return result })}>{t('موافقة')}</button><button className="admin-button danger small" disabled={busy} onClick={() => perform(() => adminFetch('/requests', { method: 'POST', body: JSON.stringify({ id: item.id, status: 'rejected' }) }), 'تم رفض الطلب.')}>{t('رفض')}</button></>}
          <button className="admin-button ghost small" disabled={busy} onClick={() => { if (window.confirm(t('حذف طلب التسجيل نهائياً؟'))) perform(() => adminFetch(`/requests/${item.id}`, { method: 'DELETE' }), 'تم حذف الطلب.') }}>{t('حذف')}</button>
        </td></tr>)}
      </tbody></table>{!data.requests.length && <p className="admin-empty">{t('لا توجد طلبات تسجيل حالياً.')}</p>}</div>
    </section>
  }

  function renderCodes() {
    return <section className="admin-card"><div className="admin-card-heading"><div><h3>{t('أكواد الاشتراك')}</h3><p>{t('الأكواد مخزنة بتجزئة آمنة ولا يمكن استعادتها؛ إعادة الإصدار تظهر الرمز مرة واحدة.')}</p></div></div>
      <form className="admin-inline-form" onSubmit={(event) => {
        event.preventDefault()
        perform(async () => {
          const result = await adminFetch('/codes', { method: 'POST', body: JSON.stringify(newCode) })
          setNotice({ type: 'code', text: `تم إنشاء الاشتراك. رمز الدخول الذي يظهر مرة واحدة للنسخ: ${result.code}` })
          setNewCode({ email: '', studentName: '', grade: '' })
          return result
        })
      }}><h4>{t('إنشاء اشتراك وكود جديد')}</h4><div className="admin-form-grid"><Field label="البريد الإلكتروني" type="email" required dir="ltr" value={newCode.email} onChange={(event) => setNewCode({ ...newCode, email: event.target.value })} /><Field label="اسم الطالب" required value={newCode.studentName} onChange={(event) => setNewCode({ ...newCode, studentName: event.target.value })} /><Field label="الصف / المرحلة" required value={newCode.grade} onChange={(event) => setNewCode({ ...newCode, grade: event.target.value })} /></div><button className="admin-button secondary" disabled={busy}>{t('إنشاء كود')}</button></form>
      <div className="admin-record-list">{data.subscriptions.map((item) => <article className="admin-record" key={item.id}>
        <div className="admin-record-heading"><div><strong>{item.studentName || t('طالب بلا اسم')}</strong><small dir="ltr">{item.email || t('لا يوجد بريد')} · {item.grade || '—'}</small></div><span className={`admin-status ${item.active === false ? 'rejected' : 'approved'}`}>{item.active === false ? t('متوقف') : t('فعال')}</span></div>
        {codeDraft === item.id && <div className="admin-form-grid"><Field label="اسم الطالب" value={item.studentName ?? ''} onChange={(event) => setData((current) => ({ ...current, subscriptions: current.subscriptions.map((entry) => entry.id === item.id ? { ...entry, studentName: event.target.value } : entry) }))} /><Field label="البريد" dir="ltr" value={item.email ?? ''} onChange={(event) => setData((current) => ({ ...current, subscriptions: current.subscriptions.map((entry) => entry.id === item.id ? { ...entry, email: event.target.value } : entry) }))} /><Field label="الصف" value={item.grade ?? ''} onChange={(event) => setData((current) => ({ ...current, subscriptions: current.subscriptions.map((entry) => entry.id === item.id ? { ...entry, grade: event.target.value } : entry) }))} /><button className="admin-button secondary" onClick={() => perform(() => adminFetch(`/codes/${item.id}`, { method: 'PATCH', body: JSON.stringify(item) }), 'تم تحديث بيانات الاشتراك.')}>{t('حفظ البيانات')}</button></div>}
        <div className="admin-actions"><button className="admin-button ghost small" onClick={() => setCodeDraft(codeDraft === item.id ? '' : item.id)}>{t('تعديل البيانات')}</button><button className="admin-button secondary small" disabled={busy} onClick={() => perform(() => adminFetch(`/codes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'toggle' }) }), item.active === false ? 'تم تفعيل الاشتراك.' : 'تم إيقاف الاشتراك وإبطال جلساته.')}>{item.active === false ? t('تفعيل') : t('إيقاف')}</button><button className="admin-button secondary small" disabled={busy} onClick={() => perform(async () => { const result = await adminFetch(`/codes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'reissue' }) }); setNotice({ type: 'code', text: `تم إصدار رمز جديد وإبطال الجلسات السابقة. الرمز لمرة واحدة: ${result.code}` }); return result })}>{t('إعادة إصدار الرمز')}</button><button className="admin-button danger small" onClick={() => { if (window.confirm(t('حذف الاشتراك وإبطال الجلسات؟'))) perform(() => adminFetch(`/codes/${item.id}`, { method: 'DELETE' }), 'تم حذف الاشتراك.') }}>{t('حذف')}</button></div>
      </article>)}</div>{!data.subscriptions.length && <p className="admin-empty">{t('لا توجد اشتراكات حتى الآن.')}</p>}
    </section>
  }

  function renderAnnouncements() {
    return <section className="admin-card"><div className="admin-card-heading"><div><h3>{t('إعلانات الإدارة')}</h3><p>{t('إعلانات خاصة بمساحة الطلاب وتُرسل معها إشعارات للاشتراكات النشطة.')}</p></div></div>
      <form className="admin-form-stack" onSubmit={async (event) => { event.preventDefault(); if (!window.confirm(t('نشر الإعلان وإشعار جميع الطلاب النشطين؟'))) return; const result = await perform(() => adminFetch('/announcements', { method: 'POST', body: JSON.stringify({ action: 'publish', text: announcementText }) }), 'تم نشر الإعلان وإشعار الطلاب.'); if (result) setAnnouncementText('') }}><TextArea label="نص الإعلان" maxLength={2000} required value={announcementText} onChange={(event) => setAnnouncementText(event.target.value)} /><small className="admin-count">{announcementText.length}/2000</small><button className="admin-button primary" disabled={busy}>{t('معاينة وتأكيد النشر')}</button></form>
      <div className="admin-record-list">{data.announcements.map((item) => <article className="admin-record" key={item.id}><div className="admin-record-heading"><strong>{dateLabel(item.createdAt, language)}</strong><span className={`admin-status ${item.archivedAt ? 'rejected' : 'approved'}`}>{item.archivedAt ? t('مؤرشف') : t('منشور')}</span></div><p className="admin-record-text">{item.text}</p>{!item.archivedAt && <button className="admin-button danger small" onClick={() => perform(() => adminFetch('/announcements', { method: 'POST', body: JSON.stringify({ action: 'archive', id: item.id }) }), 'تمت أرشفة الإعلان.')}>{t('أرشفة الإعلان')}</button>}</article>)}</div>
    </section>
  }

  function renderModeration() {
    return <div className="admin-two-column"><section className="admin-card"><div className="admin-card-heading"><div><h3>{t('البلاغات')}</h3><p>{t('راجع سبب البلاغ والمنشور قبل اتخاذ الإجراء.')}</p></div></div>
      {data.reports.map((report) => { const post = data.posts.find((item) => item.id === report.postId); return <article className="admin-record" key={report.id}><div className="admin-record-heading"><strong>{report.reason || t('بلاغ بدون سبب')}</strong><span className={`admin-status ${report.resolvedAt ? 'approved' : 'pending'}`}>{report.resolvedAt ? t('مغلق') : t('مفتوح')}</span></div><p className="admin-record-text">{post?.text ?? t('المنشور غير متاح')}</p><small>{post?.author?.studentName} · {dateLabel(report.createdAt, language)}</small>{!report.resolvedAt && <div className="admin-actions"><button className="admin-button danger small" onClick={() => perform(() => adminFetch(`/reports/${report.id}`, { method: 'POST', body: JSON.stringify({ action: 'hide' }) }), 'تم إخفاء المنشور وإغلاق البلاغ.')}>{t('إخفاء المنشور وإغلاق البلاغ')}</button><button className="admin-button secondary small" onClick={() => perform(() => adminFetch(`/reports/${report.id}`, { method: 'POST', body: JSON.stringify({ action: 'resolve' }) }), 'أُغلق البلاغ دون إخفاء المنشور.')}>{t('إغلاق فقط')}</button></div>}</article> })}{!data.reports.length && <p className="admin-empty">{t('لا توجد بلاغات.')}</p>}
    </section><section className="admin-card"><div className="admin-card-heading"><div><h3>{t('منشورات الطلاب')}</h3><p>{t('إخفاء المنشورات غير المناسبة من موجز الطلاب.')}</p></div></div>
      {data.posts.map((post) => <article className="admin-record" key={post.id}><div className="admin-record-heading"><strong>{post.author?.studentName || t('طالب')} · {post.author?.grade}</strong><small>{dateLabel(post.createdAt, language)}</small></div><p className="admin-record-text">{post.text}</p><small>{post.likes?.length ?? 0} {t('إعجاب')} · {post.comments?.length ?? 0} {t('تعليق')} · {post.hiddenAt ? t('مخفي') : t('ظاهر')}</small>{!post.hiddenAt && <button className="admin-button danger small" onClick={() => { if (window.confirm(t('إخفاء هذا المنشور؟'))) perform(() => adminFetch(`/posts/${post.id}`, { method: 'POST', body: '{}' }), 'تم إخفاء المنشور.') }}>{t('إخفاء المنشور')}</button>}</article>)}{!data.posts.length && <p className="admin-empty">{t('لا توجد منشورات.')}</p>}
    </section></div>
  }

  async function saveMarks(event) {
    event.preventDefault()
    const exam = markForm.exam.trim()
    const term = markForm.term.trim()
    if (!exam || !term) {
      setMarkEntryError('أدخل اسم الاختبار والفصل.')
      return
    }

    const maxScore = Number(markForm.maxScore)
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100000) {
      setMarkEntryError('أدخل علامة عظمى بين 0 و100000.')
      return
    }

    const entries = []
    for (const student of markRoster) {
      const rawScore = markScores[student.id] ?? ''
      if (!rawScore.trim()) continue
      const score = Number(rawScore)
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        setMarkEntryError(`تحقق من علامة ${student.studentName}؛ يجب أن تكون بين 0 و${maxScore}.`)
        return
      }
      entries.push({ subscriptionId: student.id, score })
    }
    if (!entries.length) {
      setMarkEntryError('أدخل علامة طالب واحد على الأقل قبل الحفظ.')
      return
    }

    const grade = data.catalog.grades.find((item) => item.id === Number(markForm.gradeId))
    const subject = grade?.subjects.find((item) => item.id === markForm.subjectId)
    if (!grade || !subject) {
      setMarkEntryError('الصف أو المادة المحددان لم يعودا متاحين.')
      return
    }
    const existingStudentIds = new Set((data.marks ?? [])
      .filter((mark) => mark.subject === subject.name && mark.exam === exam && mark.term === term)
      .map((mark) => mark.subscriptionId))
    const replacedCount = entries.filter((entry) => existingStudentIds.has(entry.subscriptionId)).length
    const confirmation = `${t('سيتم نشر علامات')} ${new Intl.NumberFormat(language).format(entries.length)} ${t('طالب في')} ${grade.title} · ${subject.name} · ${exam} · ${term}.${replacedCount ? ` ${t('سيتم تحديث')} ${new Intl.NumberFormat(language).format(replacedCount)} ${t('علامة موجودة.')}` : ''}\n${t('هل تريد المتابعة؟')}`
    if (!window.confirm(confirmation)) return

    setMarkEntryError('')
    const result = await perform(() => adminFetch('/marks/entry', {
      method: 'POST',
      body: JSON.stringify({
        gradeId: Number(markForm.gradeId),
        subjectId: markForm.subjectId,
        exam,
        term,
        maxScore,
        date: markForm.date,
        entries,
      }),
    }), `تم حفظ علامات ${entries.length} طالب وإشعارهم.${replacedCount ? ` تم تحديث ${replacedCount} علامة سابقة.` : ''}`)
    if (result) {
      setMarkScores({})
      setMarkEntryError('')
    }
  }

  function renderMarks() {
    const grade = data.catalog.grades.find((item) => String(item.id) === markForm.gradeId)
    const subjects = grade?.subjects ?? []
    const subject = subjects.find((item) => item.id === markForm.subjectId)
    const existingStudentIds = new Set((data.marks ?? [])
      .filter((mark) => mark.subject === subject?.name && mark.exam === markForm.exam.trim() && mark.term === markForm.term.trim())
      .map((mark) => mark.subscriptionId))
    const pendingReplacementCount = markRoster.filter((student) =>
      (markScores[student.id] ?? '').trim() !== '' && existingStudentIds.has(student.id)).length
    const enteredCount = markRoster.filter((student) => (markScores[student.id] ?? '').trim() !== '').length
    const validScores = markRoster.flatMap((student) => {
      const rawScore = markScores[student.id] ?? ''
      if (!rawScore.trim()) return []
      const score = Number(rawScore)
      return Number.isFinite(score) && score >= 0 && score <= Number(markForm.maxScore)
        ? [score]
        : []
    })
    const scoreAverage = validScores.length
      ? new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
          validScores.reduce((total, score) => total + score, 0) / validScores.length,
        )
      : '—'
    const searchTerm = markStudentQuery.trim().toLocaleLowerCase(language)
    const visibleRoster = markRoster.filter((student) => {
      const score = markScores[student.id] ?? ''
      const hasScore = score.trim() !== ''
      const matchesName = !searchTerm || student.studentName.toLocaleLowerCase(language).includes(searchTerm)
      const matchesFilter = markStudentFilter === 'all' ||
        markStudentFilter === 'entered' && hasScore ||
        markStudentFilter === 'missing' && !hasScore
      return matchesName && matchesFilter
    })
    return <section className="admin-card">
      <div className="admin-card-heading"><div><h3>{t('إدخال العلامات')}</h3><p>{t('اختر الصف والمادة لعرض الطلاب المسجلين، ثم أدخل النتائج مباشرة دون ملفات.')}</p></div></div>
      <form className="admin-form-stack" onSubmit={saveMarks}>
        <div className="admin-form-grid">
          <label className="admin-field">{t('الصف')}
            <select value={markForm.gradeId} required onChange={(event) => {
              setMarkRoster([])
              setMarkScores({})
              setMarkRosterError('')
              setMarkEntryError('')
              setMarkStudentQuery('')
              setMarkStudentFilter('all')
              setMarkRosterLoading(false)
              setMarkForm((current) => ({ ...current, gradeId: event.target.value, subjectId: '' }))
            }}>
              <option value="">{t('اختر الصف')}</option>
              {data.catalog.grades.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="admin-field">{t('المادة')}
            <select value={markForm.subjectId} required disabled={!grade} onChange={(event) => {
              const subjectId = event.target.value
              setMarkRoster([])
              setMarkScores({})
              setMarkRosterError('')
              setMarkEntryError('')
              setMarkStudentQuery('')
              setMarkStudentFilter('all')
              setMarkRosterLoading(Boolean(markForm.gradeId && subjectId))
              setMarkForm((current) => ({ ...current, subjectId }))
            }}>
              <option value="">{t('اختر المادة')}</option>
              {subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <Field label="الاختبار" value={markForm.exam} maxLength={120} required placeholder="مثال: الاختبار الأول" onChange={(event) => updateMarkForm('exam', event.target.value)} />
          <Field label="الفصل / الدورة" value={markForm.term} maxLength={120} required placeholder="مثال: الفصل الأول" onChange={(event) => updateMarkForm('term', event.target.value)} />
          <Field label="العلامة العظمى" type="number" min="0.01" max="100000" step="any" dir="ltr" value={markForm.maxScore} required onChange={(event) => updateMarkForm('maxScore', event.target.value)} />
          <Field label="تاريخ الاختبار" type="date" value={markForm.date} required onChange={(event) => updateMarkForm('date', event.target.value)} />
        </div>
        {markRosterError && <p className="admin-notice error" role="alert">{translateAdminMessage(markRosterError, t)}</p>}
        {markEntryError && <p className="admin-notice error" role="alert">{translateAdminMessage(markEntryError, t)}</p>}
        {!markForm.subjectId && <p className="admin-empty">{t('اختر الصف والمادة لعرض الطلاب المسجلين.')}</p>}
        {markRosterLoading && <p role="status">{t('جارٍ تحميل الطلاب المسجلين...')}</p>}
        {markForm.subjectId && !markRosterLoading && !markRosterError && markRoster.length === 0 && <p className="admin-empty">{t('لا يوجد طلاب مسجلون في هذه المادة لهذا الصف.')}</p>}
        {markRoster.length > 0 && <>
          <div className="admin-mark-stats">
            <article><span>{t('طلاب المادة')}</span><strong>{new Intl.NumberFormat(language).format(markRoster.length)}</strong></article>
            <article><span>{t('علامات مدخلة')}</span><strong>{new Intl.NumberFormat(language).format(enteredCount)} / {new Intl.NumberFormat(language).format(markRoster.length)}</strong></article>
            <article><span>{t('متوسط العلامات')}</span><strong>{scoreAverage} / {markForm.maxScore || '—'}</strong></article>
            <article><span>{t('بلا علامة')}</span><strong>{new Intl.NumberFormat(language).format(markRoster.length - enteredCount)}</strong></article>
          </div>
          {enteredCount > validScores.length && <p className="admin-notice error" role="alert">{t('راجع العلامات التي تتجاوز الحد الأعلى أو لا تمثل أرقاماً صحيحة.')}</p>}
          <div className="admin-record-heading">
            <strong>{t('الطلاب المسجلون')}: {new Intl.NumberFormat(language).format(markRoster.length)}</strong>
            <small>{pendingReplacementCount ? `${t('سيتم تحديث')} ${new Intl.NumberFormat(language).format(pendingReplacementCount)} ${t('علامة سابقة.')}` : t('اترك خانة العلامة فارغة لتجاوز الطالب في هذه الدفعة.')}</small>
          </div>
          <div className="admin-mark-tools">
            <Field label="بحث عن طالب" type="search" value={markStudentQuery} placeholder="اكتب اسم الطالب" onChange={(event) => setMarkStudentQuery(event.target.value)} />
            <div className="admin-mark-filters" role="group" aria-label={t('تصفية الطلاب')}>
              {[
                ['all', 'الكل'],
                ['missing', 'بلا علامة'],
                ['entered', 'أُدخلت علامته'],
              ].map(([filter, label]) => <button key={filter} type="button" className={markStudentFilter === filter ? 'active' : ''} aria-pressed={markStudentFilter === filter} onClick={() => setMarkStudentFilter(filter)}>{t(label)}</button>)}
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-mark-table">
              <thead><tr><th>{t('الطالب')}</th><th>{t('الصف')}</th><th>{t('العلامة')} / {markForm.maxScore || '—'}</th></tr></thead>
              <tbody>{visibleRoster.map((student, index) => <tr key={student.id}>
                <td><strong>{student.studentName}</strong></td>
                <td>{student.grade}</td>
                <td><input
                  className="admin-mark-score"
                  type="number"
                  min="0"
                  max={markForm.maxScore}
                  step="any"
                  dir="ltr"
                  aria-label={`${t('علامة')} ${student.studentName}`}
                  ref={(element) => {
                    if (element) markScoreRefs.current.set(student.id, element)
                    else markScoreRefs.current.delete(student.id)
                  }}
                  value={markScores[student.id] ?? ''}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    const nextStudent = visibleRoster[index + 1]
                    if (nextStudent) markScoreRefs.current.get(nextStudent.id)?.focus()
                    else markSaveRef.current?.focus()
                  }}
                  onChange={(event) => {
                    setMarkScores((current) => ({ ...current, [student.id]: event.target.value }))
                    setMarkEntryError('')
                  }}
                /></td>
              </tr>)}</tbody>
            </table>
          </div>
          {!visibleRoster.length && <p className="admin-empty">{t('لا يوجد طلاب يطابقون البحث أو التصفية.')}</p>}
          <div className="admin-actions">
            <button ref={markSaveRef} className="admin-button primary" type="submit" disabled={busy || markRosterLoading}>{t('حفظ العلامات وإشعار الطلاب')}</button>
            <small>{t('سيتم حفظ العلامات المدخلة فقط')} ({new Intl.NumberFormat(language).format(enteredCount)} {t('من')} {new Intl.NumberFormat(language).format(markRoster.length)}). {t('اضغط Enter للانتقال إلى الطالب التالي.')}</small>
          </div>
        </>}
      </form>
      <div className="admin-record-list">
        <h4>{t('سجل إدخال العلامات')}</h4>
        {[...data.imports].reverse().map((item) => <article className="admin-record-heading" key={item.id}>
          <div><strong>{item.source === 'manual' ? `${new Intl.NumberFormat(language).format(item.rowCount)} ${t('طالب')} · ${item.gradeTitle} · ${item.subject}` : `${new Intl.NumberFormat(language).format(item.rowCount)} ${t('نتيجة')} · ${new Intl.NumberFormat(language).format(item.replacedCount ?? 0)} ${t('استبدال')}`}</strong>{item.source === 'manual' && <small>{item.exam} · {item.term}</small>}</div>
          <small>{dateLabel(item.importedAt, language)}</small>
        </article>)}
        {!data.imports.length && <p className="admin-empty">{t('لا توجد دفعات محفوظة بعد.')}</p>}
      </div>
    </section>
  }

  function renderSettings() {
    const settings = data.catalog.settings ?? {}
    const labels = {
      centerName: 'اسم المركز', tagline: 'الشعار النصي', homeTitle: 'عنوان الصفحة الرئيسية',
      homeSubtitle: 'وصف الصفحة الرئيسية', contactText: 'نص التواصل', contactPhone: 'رقم الهاتف',
      contactTelegram: 'رابط تيليغرام', logoPath: 'مسار الشعار', announcement: 'الإعلان الظاهر',
    }
    return <section className="admin-card"><div className="admin-card-heading"><div><h3>{t('إعدادات المركز')}</h3><p>{t('تحديث البيانات العامة وفتح التسجيل أو إيقافه.')}</p></div><button className="admin-button primary" disabled={busy} onClick={() => saveCatalog('تم حفظ إعدادات المركز.')}>{t('حفظ الإعدادات')}</button></div><div className="admin-form-grid">
      {Object.entries(labels).map(([key, label]) => <Field key={key} label={label} value={settings[key] ?? ''} onChange={(event) => updateCatalog((catalog) => { catalog.settings[key] = event.target.value })} />)}
    </div><label className="admin-toggle"><input type="checkbox" checked={settings.registrationOpen !== false} onChange={(event) => updateCatalog((catalog) => { catalog.settings.registrationOpen = event.target.checked })} /><span><strong>{t('التسجيل مفتوح')}</strong><small>{t('عند إيقافه لن يتمكن الطلاب من إرسال طلب تسجيل جديد.')}</small></span></label></section>
  }

  if (checking) return <main className="admin-loading"><span className="admin-spinner" />{t('جارٍ التحقق من لوحة الإدارة...')}</main>
  if (!authenticated) return <main className="admin-login-page" dir={language === 'ar' ? 'rtl' : 'ltr'}><form className="admin-login-card" onSubmit={login}>
    <img className="admin-brand-mark" src="/elite-logo.webp" alt={t('شعار مركز النخبة')} /><span className="admin-eyebrow">{t('مركز النخبة')}</span><h1>{t('لوحة الإدارة')}</h1><p>{t('أدخل رمز الدخول للمتابعة إلى لوحة التحكم.')}</p>
    <label className="admin-field">{t('رمز الدخول')}<input autoFocus type="password" autoComplete="current-password" value={code} onChange={(event) => setCode(event.target.value)} required /></label>
    {notice && <div className={`admin-notice ${notice.type}`} role="alert">{translateAdminMessage(notice.text, t)}</div>}
    <button className="admin-button primary full" disabled={busy}>{busy ? t('جارٍ التحقق...') : t('دخول آمن')}<span>←</span></button>
  </form></main>

  return <main className="admin-app" dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <section className="admin-main">
      <header className="admin-topbar">
        <div className="admin-topbar-brand"><img className="admin-brand-mark" src="/elite-logo.webp" alt={t('شعار مركز النخبة')} /><span><strong>{t('مركز النخبة')}</strong><small>{t('متصل بالخادم')}</small></span></div>
        <div className="admin-topbar-actions">
          <label className="admin-section-picker"><span className="admin-sr-only">{t('أقسام الإدارة')}</span><select aria-label={t('أقسام الإدارة')} value={section} onChange={(event) => { setSection(event.target.value); setNotice(null) }}>
            {sections.map(([id, label, icon]) => {
              const pendingCount = id === 'requests' ? (data?.requests ?? []).filter((item) => item.status === 'pending').length : 0
              return <option key={id} value={id}>{icon} {t(label)}{pendingCount > 0 ? ` (${new Intl.NumberFormat(language).format(pendingCount)})` : ''}</option>
            })}
          </select></label>
          <button className="admin-refresh" disabled={busy} onClick={() => perform(loadData, 'تم تحديث البيانات.')}>{t('تحديث البيانات')} ↻</button>
          <button className="admin-button ghost admin-logout" onClick={logout}>{t('تسجيل الخروج')}</button>
        </div>
      </header>
      <div className="admin-content"><div className="admin-page-heading"><div><span className="admin-eyebrow">{t('مركز النخبة · إدارة المنصة')}</span><h1>{t(activeSection[1])}</h1></div><span className="admin-date">{t('إدارة آمنة · اتصال مشفّر')}</span></div>
        {notice && <div className={`admin-notice ${notice.type}`} role="status">{translateAdminMessage(notice.text, t)}<button aria-label={t('إغلاق')} onClick={() => setNotice(null)}>×</button></div>}
        {!data ? <div className="admin-card admin-empty"><p>{translateAdminMessage(notice?.text ?? 'جارٍ تحميل بيانات لوحة الإدارة...', t)}</p><button className="admin-button secondary" disabled={busy} onClick={() => perform(loadData, 'تم تحميل بيانات لوحة الإدارة.')}>{t('إعادة تحميل البيانات')}</button></div> : section === 'overview' ? renderOverview() : section === 'catalog' ? renderCatalog() : section === 'news' ? renderNews() : section === 'requests' ? renderRequests() : section === 'codes' ? renderCodes() : section === 'announcements' ? renderAnnouncements() : section === 'moderation' ? renderModeration() : section === 'marks' ? renderMarks() : renderSettings()}
        {busy && <span className="admin-working" role="status"><span className="admin-spinner" /> {t('جارٍ حفظ التغييرات...')}</span>}
      </div>
    </section>
  </main>
}

export default AdminDashboard
