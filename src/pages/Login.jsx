import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'
import { hasStudentAccess, verifyAccessCode, verifyStudentSession } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'

export default function Login() {
  const { t } = useLocale()
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(!hasStudentAccess())
  const navigate = useNavigate()
  usePageTitle('بوابة الطالب')
  useEffect(() => {
    if (hasStudentAccess()) return
    let isCurrent = true
    verifyStudentSession().then((session) => {
      if (isCurrent && session) navigate('/dashboard/profile', { replace: true })
    }).catch((error) => {
      if (isCurrent) setMessage(error.message)
    }).finally(() => {
      if (isCurrent) setIsCheckingSession(false)
    })
    return () => { isCurrent = false }
  }, [navigate])
  if (hasStudentAccess()) return <Navigate to="/dashboard/profile" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const code = String(data.get('code') ?? '').trim()
    if (!email || !code) {
      setMessage(t('أدخل البريد الإلكتروني ورمز الدخول المرسل من إدارة المعهد.'))
      setIsSubmitting(false)
      return
    }
    try {
      await verifyAccessCode(email, code)
      navigate('/dashboard/profile', { replace: true })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }
  if (isCheckingSession) return <main className="dashboard-access-state"><p role="status">{t('جارٍ التحقق من جلسة الطالب...')}</p></main>
  return (
    <section className="login-page login-modern-page">
      <div className="login-modern-card">
        <aside className="login-welcome-panel">
          <div className="login-welcome-brand">
            <img src="/elite-logo.webp" alt={t('مركز النخبة')} />
          </div>
          <span className="login-panel-kicker">{t('مساحة الطالب')}</span>
          <h1>{t('أهلاً بعودتك.')}</h1>
          <p>{t('استخدم البريد الإلكتروني والكود اللذين أرسلتهما لك إدارة المعهد.')}</p>
          <div className="login-panel-divider" aria-hidden="true"><span>✦</span></div>
          <div className="login-panel-footer">
            <span>{t('طالب جديد؟')}</span>
            <Link to="/register">{t('إرسال طلب تسجيل')} <span aria-hidden="true">←</span></Link>
          </div>
        </aside>
        <div className="login-content">
          <span className="login-form-kicker">{t('تسجيل الدخول')}</span>
          <h2>{t('دخول مساحة الطالب')}</h2>
          <p className="login-content-intro">{t('استخدم البريد الإلكتروني والكود اللذين أرسلتهما لك إدارة المعهد.')}</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              {t('البريد الإلكتروني')}
              <input name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
            </label>
            <label>
              {t('كود الدخول')}
              <input name="code" autoComplete="one-time-code" required placeholder="ELITE-XXXXXXXXXX" />
            </label>
            {message && <p className="form-message" role="alert">{message}</p>}
            <button className="button button-dark" type="submit" disabled={isSubmitting}>
              {t(isSubmitting ? 'جارٍ التحقق...' : 'دخول الطالب')} <span aria-hidden="true">←</span>
            </button>
            <p className="form-note">{t('الكود مرتبط بالبريد المسجّل وصالح لمدة محدودة.')}</p>
            <Link className="login-home-link" to="/">{t('العودة إلى الصفوف ←')}</Link>
          </form>
        </div>
      </div>
    </section>
  )
}