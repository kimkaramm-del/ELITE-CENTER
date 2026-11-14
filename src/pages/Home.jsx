import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'
import { getCatalogSnapshot, getNews, hasStudentAccess, verifyStudentSession, toggleNewsReaction } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'

export default function Home() {
  const { language, t } = useLocale()
  const { hash } = useLocation()
  const [catalog, setCatalog] = useState({ grades: [], settings: {}, source: 'loading' })
  const [news, setNews] = useState([])
  const [reactionMessage, setReactionMessage] = useState('')
  const [studentSession, setStudentSession] = useState(() => hasStudentAccess() ? { status: 'active' } : { status: 'checking' })
  const settings = catalog.settings ?? {}
  usePageTitle(t(settings.homeTitle ?? 'اختر صفّك الدراسي'))
  useEffect(() => {
    Promise.all([getCatalogSnapshot(), getNews()]).then(([{ catalog: nextCatalog, source }, items]) => {
      setCatalog({ ...nextCatalog, source })
      setNews(items)
    }).catch(() => setNews([]))
  }, [])

  useEffect(() => {
    let isCurrent = true
    verifyStudentSession().then((student) => {
      if (isCurrent) setStudentSession(student ? { status: 'active', student } : { status: 'guest' })
    }).catch((error) => {
      if (isCurrent) setStudentSession((current) => current.status === 'active'
        ? current
        : { status: 'error', message: error.message })
    })
    return () => { isCurrent = false }
  }, [])

  useEffect(() => {
    if (hash !== '#grades') return
    document.getElementById('grades')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const teacherCount = new Set(catalog.grades.flatMap((grade) => grade.subjects.flatMap((subject) => subject.teachers))).size
  const subjectCount = catalog.grades.reduce((count, grade) => count + grade.subjects.length, 0)
  const isStudentSignedIn = studentSession.status === 'active'

  async function handleNewsReaction(newsId) {
    setReactionMessage('')
    try {
      const result = await toggleNewsReaction(newsId)
      setNews((current) => current.map((item) => item.id === newsId ? { ...item, isLiked: result.isLiked, reactionCount: result.reactionCount } : item))
    } catch (error) {
      setReactionMessage(error.message)
    }
  }

  return (
    <section className="grade-home">
      <section className="grade-home-intro">
        <img className="grade-center-logo" src={settings.logoPath || '/elite-logo.webp'} alt={t(settings.centerName ?? 'مركز النخبة')} />
        <h1>{t(settings.homeTitle ?? 'اختر صفّك الدراسي')}</h1>
        <div className="gold-divider" aria-hidden="true"><i />✦<i /></div>
        <p>{t(settings.homeSubtitle ?? 'مواد تعليمية ومدرسون متخصصون، بخيارات وأسعار واضحة.')}</p>
        <span className={`catalog-status ${catalog.source}`} role="status">
          <i aria-hidden="true" />
          {t(catalog.source === 'live' ? 'البيانات محدثة من إدارة المركز' : catalog.source === 'demo' ? 'بيانات العرض المحلية' : 'جارٍ تحميل بيانات المركز')}
        </span>
        {studentSession.status === 'checking' ? <span className="grade-session-status" role="status">{t('جارٍ التحقق من حسابك...')}</span> : studentSession.status === 'error'
          ? <div className="grade-session-status" role="status"><span>{t(studentSession.message)}</span><button className="grade-login-link" type="button" onClick={() => { setStudentSession({ status: 'checking' }); verifyStudentSession().then((student) => setStudentSession(student ? { status: 'active', student } : { status: 'guest' })).catch((error) => setStudentSession({ status: 'error', message: error.message })) }}>{t('إعادة المحاولة')}</button></div>
          : <nav className="grade-account-actions" aria-label={t('حساب الطالب')}>
            {isStudentSignedIn
              ? <Link className="grade-register-button" to="/dashboard/profile">{t('مساحة الطالب')}</Link>
              : <><Link className="grade-register-button" to="/register">{t('طلب تسجيل')}</Link><Link className="grade-login-link" to="/login">{t('تسجيل الدخول')}</Link></>}
          </nav>}
      </section>
      <section className="grade-picker" aria-label={t('الصفوف الدراسية')}>
        {catalog.grades.map((grade, index) => (
          <Link className="grade-tile" to={`/grades/${grade.id}`} key={grade.id} style={{ '--tile-order': index }}>
            <span className="grade-medallion"><span>{grade.id > 11 ? <svg className="grade-cap" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82ZM12 3 1 9l11 6 9-4.91V17h2V9L12 3Z" /></svg> : grade.id}</span></span>
            <strong>{t(grade.name)}</strong>
            <small>{t(grade.stage)}</small>
          </Link>
        ))}
      </section>
      <section className="catalog-summary" aria-label={t('ملخص المركز')}>
        <div><strong>{new Intl.NumberFormat(language).format(catalog.grades.length)}</strong><span>{t('صفوف دراسية')}</span></div>
        <div><strong>{new Intl.NumberFormat(language).format(subjectCount)}</strong><span>{t('مادة وخدمة')}</span></div>
        <div><strong>{new Intl.NumberFormat(language).format(teacherCount)}</strong><span>{t('مدرساً ومدرسة')}</span></div>
      </section>
      <section id="grades" className="catalog-news" aria-label={t('آخر الأخبار والإعلانات')}>
        <div className="section-heading"><div><span className="eyebrow">{t('آخر الأخبار والإعلانات')}</span><h2>{t('من المعهد مباشرة')}</h2></div></div>
        {news.length ? <div className="news-list">{news.map((item) => (
          <article className="news-item" key={item.id}>
            <h3>{t(item.title)}</h3><p>{t(item.summary ?? item.description)}</p>
            {item.link && <a href={item.link} target="_blank" rel="noreferrer">{t('المزيد')}</a>}
            <div className="news-reaction-row">
              <button className="news-reaction-button" type="button" aria-pressed={Boolean(item.isLiked)} onClick={() => handleNewsReaction(item.id)} disabled={!isStudentSignedIn} title={t(isStudentSignedIn ? 'تفاعل مع الخبر' : 'سجّل الدخول للتفاعل')}>
                <svg className="news-reaction-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
                    fill={item.isLiked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{new Intl.NumberFormat(language).format(item.reactionCount ?? 0)}</span>
              </button>
              {!isStudentSignedIn && studentSession.status !== 'checking' && <Link className="text-link" to="/login">{t('دخول للتفاعل')}</Link>}
            </div>
          </article>
        ))}</div> : <p className="catalog-empty-news">{t('لا توجد أخبار جديدة حالياً.')}</p>}
        {reactionMessage && <p className="form-message" role="status">{reactionMessage}</p>}
      </section>
      <section id="student-space" className="student-space-band">
        <div><span className="eyebrow">{t('مساحة الطالب')}</span><h2>{isStudentSignedIn ? `${t('أهلاً بعودتك')} ${studentSession.student?.studentName ?? ''}` : t('حسابك ودراستك في مكان واحد')}</h2><p>{t(isStudentSignedIn ? 'تابع موجزك وإعلاناتك وعلاماتك من مساحة الطالب.' : 'تابع طلباتك، بيانات اشتراكك، والمواد التي اخترتها.')}</p></div>
        <Link className="button button-dark" to={isStudentSignedIn ? '/dashboard/feed' : '/login'}>{t(isStudentSignedIn ? 'دخول مساحة الطالب' : 'تسجيل الدخول')} <span aria-hidden="true">←</span></Link>
      </section>
      {(settings.contactText || settings.contactPhone || settings.contactTelegram) && <section className="catalog-contact-section">
        {settings.contactText && <p>{t(settings.contactText)}</p>}
        <nav className="catalog-contacts" aria-label={t('التواصل مع المركز')}>
          {settings.contactPhone && <a href={`tel:${settings.contactPhone}`}>{t('اتصال:')} {settings.contactPhone}</a>}
          {settings.contactTelegram && <a href={settings.contactTelegram} target="_blank" rel="noreferrer">{t('تيليغرام المركز')}</a>}
        </nav>
      </section>}
    </section>
  )
}