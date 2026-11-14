import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import usePageTitle from '../../hooks/usePageTitle.js'
import { getStudentProfile, hasStudentAccess } from '../../services/database.js'
import NavigationIcon from '../../components/NavigationIcon.jsx'
import StudentPostGrid from '../../components/StudentPostGrid.jsx'
import { useLocale } from '../../contexts/LocaleContext.jsx'

const profileLinks = [
  { to: '/dashboard/feed', icon: 'news', label: 'موجز الطلاب', detail: 'شارك وتابع مجتمع الطلاب' },
  { to: '/dashboard/gallery', icon: 'gallery', label: 'معرض منشوراتي', detail: 'منشوراتك وتفاعلاتها' },
  { to: '/dashboard/announcements', icon: 'gallery', label: 'إعلانات الإدارة', detail: 'آخر تنبيهات المركز' },
  { to: '/dashboard/marks', icon: 'courses', label: 'علاماتي', detail: 'نتائجك الدراسية' },
  { to: '/dashboard/requests', icon: 'requests', label: 'طلباتي', detail: 'تابع طلبات التسجيل' },
  { to: '/dashboard/settings', icon: 'settings', label: 'الإعدادات', detail: 'إدارة تفضيلات الحساب والإشعارات.' },
]

export default function Profile() {
  const { t } = useLocale()
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  usePageTitle('الملف الشخصي')
  useEffect(() => {
    getStudentProfile().then(setProfile).catch((error) => setMessage(error.message)).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <section className="dashboard-page"><p role="status">{t('جارٍ تحميل ملفك الشخصي...')}</p></section>
  if (!profile) return <section className="dashboard-page"><p className="form-message" role="alert">{t(message || 'تعذر تحميل الملف الشخصي.')}</p>{hasStudentAccess() ? <button className="button button-dark" type="button" onClick={() => { setIsLoading(true); setMessage(''); getStudentProfile().then(setProfile).catch((error) => setMessage(error.message)).finally(() => setIsLoading(false)) }}>{t('إعادة المحاولة')}</button> : <Link className="button button-dark" to="/login">{t('تسجيل الدخول')}</Link>}</section>

  return (
    <section className="dashboard-page profile-page">
      <div className="profile-page-heading">
        <div><span className="eyebrow">{t('مساحة الطالب')}</span><h1 className="page-title">{t('ملفي الشخصي')}</h1></div>
          <Link className="profile-home-link" to="/"><NavigationIcon name="home" /><span>{t('العودة إلى الرئيسية')}</span></Link>
      </div>
      <section className="profile-shortcuts" aria-labelledby="profile-posts-title">
        <div className="profile-section-heading"><div><span className="eyebrow">{t('نشاطك الاجتماعي')}</span><h2 id="profile-posts-title">{t('منشوراتي')}</h2></div><Link className="text-link" to="/dashboard/gallery">{t('عرض المعرض')}</Link></div>
        <StudentPostGrid compact />
      </section>
      <section className="profile-shortcuts" aria-labelledby="profile-shortcuts-title">
        <div className="profile-section-heading"><div><span className="eyebrow">{t('مساحتك الدراسية')}</span><h2 id="profile-shortcuts-title">{t('اختصارات الطالب')}</h2></div></div>
        <div className="profile-shortcut-grid">
          {profileLinks.map((item) => <Link className="profile-shortcut" key={item.to} to={item.to}>
            <span className="profile-shortcut-icon"><NavigationIcon name={item.icon} /></span>
            <span className="profile-shortcut-copy"><strong>{t(item.label)}</strong><small>{t(item.detail)}</small></span>
            <span className="profile-shortcut-arrow" aria-hidden="true">←</span>
          </Link>)}
        </div>
      </section>
    </section>
  )
}