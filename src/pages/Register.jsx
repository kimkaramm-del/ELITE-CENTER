import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'
import { isValidEmail } from '../utils/formValidation.js'
import { getCatalogSnapshot, submitRegistrationRequest } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'

export default function Register() {
  const { t } = useLocale()
  const [searchParams] = useSearchParams()
  const [grades, setGrades] = useState([])
  const [gradeId, setGradeId] = useState('')
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [requestId, setRequestId] = useState('')
  usePageTitle('طلب تسجيل')
  useEffect(() => {
    getCatalogSnapshot().then(({ catalog }) => {
      setGrades(catalog.grades)
      const requestedGrade = catalog.grades.find((grade) => grade.id === Number(searchParams.get('grade')))
      setGradeId(String(requestedGrade?.id ?? catalog.grades[0]?.id ?? ''))
      setIsRegistrationOpen(catalog.settings?.registrationOpen !== false && catalog.settings?.registrationOpen !== 'false')
      setIsLoading(false)
    }).catch((error) => {
      setMessage(error.message)
      setIsLoading(false)
    })
  }, [searchParams])

  const selectedGrade = grades.find((grade) => grade.id === Number(gradeId))

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!isRegistrationOpen) return setMessage('التسجيل مغلق حالياً. تواصل مع إدارة المركز.')
    if (!selectedSubjects.length) return setMessage('اختر مادة واحدة على الأقل.')
    setIsSubmitting(true)
    setMessage('')
    setRequestId('')
    const data = new FormData(form)
    const email = String(data.get('email') ?? '')
    const name = String(data.get('name') ?? '').trim()
    const phone = String(data.get('phone') ?? '').trim()
    if (!isValidEmail(email)) {
      setMessage('تحقق من البريد الإلكتروني.')
      setIsSubmitting(false)
      return
    }
    try {
      const result = await submitRegistrationRequest({
        name,
        phone,
        email,
        gradeId: Number(gradeId),
        programType: 'center',
        subjectIds: selectedSubjects,
      })
      setRequestId(result.id)
      setMessage('وصل طلبك إلى إدارة المركز. ستراجع الإدارة الطلب وتشاركك كود الدخول يدوياً عند الموافقة.')
      form.reset()
      setSelectedSubjects([])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-page login-modern-page register-page">
      <div className="login-modern-card register-modern-card">
        <aside className="login-welcome-panel">
          <div className="login-welcome-brand">
            <img src="/elite-logo.webp" alt={t('مركز النخبة')} />
          </div>
          <span className="login-panel-kicker">{t('طلب تسجيل طالب')}</span>
          <h1>{t('ابدأ رحلتك معنا.')}</h1>
          <p>{t('أرسل بياناتك واختياراتك للمراجعة من إدارة المعهد.')}</p>
          <div className="login-panel-divider" aria-hidden="true"><span>✦</span></div>
          <div className="login-panel-footer">
            <span>{t('لديك كود دخول؟')}</span>
            <Link to="/login">{t('تسجيل الدخول')} <span aria-hidden="true">←</span></Link>
          </div>
        </aside>
        <div className="login-content">
          <span className="login-form-kicker">{t('طلب تسجيل طالب')}</span>
          <h2>{t('أرسل طلب التسجيل')}</h2>
          <p className="login-content-intro">{t('أدخل بياناتك واختر الصف والمواد المطلوبة لإرسال طلبك إلى إدارة المركز.')}</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>{t('اسم الطالب')}<input name="name" autoComplete="name" required placeholder={t('الاسم الكامل')} /></label>
            <label>{t('رقم الهاتف')}<input name="phone" type="tel" autoComplete="tel" required placeholder="09xxxxxxxx" /></label>
            <label>{t('البريد الإلكتروني')}<input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
            <label>{t('الصف الدراسي')}<select value={gradeId} onChange={(event) => { setGradeId(event.target.value); setSelectedSubjects([]) }} required disabled={isLoading || !grades.length}>{grades.map((grade) => <option key={grade.id} value={grade.id}>{t(grade.title)}</option>)}</select></label>
            <fieldset className="request-subjects" disabled={isLoading || !isRegistrationOpen || !selectedGrade}>
              <legend>{t('المواد المطلوبة')}</legend>
              <div>{selectedGrade?.subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={selectedSubjects.includes(subject.id)} onChange={(event) => setSelectedSubjects((current) => event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id))} /><span>{t(subject.name)}</span><small>{subject.price} {subject.currency}</small></label>)}</div>
            </fieldset>
            {!isRegistrationOpen && <p className="form-message" role="status">{t('التسجيل مغلق حالياً من إدارة المركز.')}</p>}
            {message && <p className="form-message" role="status">{t(message)}</p>}
            {requestId && <p className="request-reference">{t('رقم الطلب:')} <strong>{requestId}</strong><br />{t('احتفظ به. بعد موافقة الإدارة وتسجيل الدخول ستتمكن من متابعة الطلب.')}</p>}
            <button className="button button-dark" type="submit" disabled={isSubmitting || isLoading || !isRegistrationOpen}>{t(isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب التسجيل')} <span aria-hidden="true">←</span></button>
            <p className="form-note">{t('هذا طلب تسجيل، وليس حساباً مفعّلاً بعد. عند الموافقة سترسل لك الإدارة كود دخول مرتبطاً ببريدك الإلكتروني.')}</p>
            <Link className="login-home-link" to="/">{t('العودة إلى الصفوف ←')}</Link>
          </form>
        </div>
      </div>
    </section>
  )
}