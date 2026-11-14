import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getCatalogSnapshot, hasStudentAccess, verifyStudentSession } from '../services/database.js'
import NavigationIcon from './NavigationIcon.jsx'
import { useLocale } from '../contexts/LocaleContext.jsx'

const links = [
  { to: '/', label: 'الرئيسية', icon: 'home' },
  { to: '/courses', label: 'المواد', icon: 'courses' },
  { to: '/teachers', label: 'المعلمون', icon: 'teachers' },
  { to: '/#grades', label: 'الأخبار', icon: 'news' },
  { to: '/dashboard/feed', label: 'مساحة الطالب', icon: 'profile' },
]

function isCurrentLink(to, pathname, hash) {
  const [path, targetHash] = to.split('#')
  if (targetHash) {
    const routePath = path || '/'
    return pathname === routePath && hash === `#${targetHash}`
  }
  if (path.startsWith('/dashboard/')) return pathname.startsWith('/dashboard')
  if (path === '/') return pathname === '/' && hash === ''
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function Header() {
  const [settings, setSettings] = useState({})
  const [studentSession, setStudentSession] = useState(() => hasStudentAccess() ? 'active' : 'checking')
  const { pathname, hash } = useLocation()
  const { t } = useLocale()
  useEffect(() => { getCatalogSnapshot().then(({ catalog }) => setSettings(catalog.settings ?? {})) }, [])
  useEffect(() => {
    let isCurrent = true
    verifyStudentSession().then((student) => {
      if (isCurrent) setStudentSession(student ? 'active' : 'guest')
    }).catch(() => {
      if (isCurrent) setStudentSession((current) => current === 'active' ? current : 'guest')
    })
    return () => { isCurrent = false }
  }, [])
  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label={`${t(settings.centerName ?? 'مركز النخبة')}, ${t('الرئيسية')}`}>
        <img className="brand-image" src={settings.logoPath || '/elite-logo.webp'} alt="" />
        <span><strong>{t(settings.centerName ?? 'مركز النخبة')}</strong><small>{t(settings.tagline ?? 'للتعلّم والإبداع')}</small></span>
      </Link>
      <nav className="main-nav" aria-label={t('التنقل الرئيسي')}>
        {links.map((link) => {
          const active = isCurrentLink(link.to, pathname, hash)
          return (
            <Link key={link.to} to={link.to} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
              <NavigationIcon name={link.icon} />
              <span>{t(link.label)}</span>
            </Link>
          )
        })}
      </nav>
      <div className="header-auth">
        {studentSession === 'active'
          ? <Link className="button button-dark header-action" to="/dashboard/feed">{t('مساحة الطالب')}</Link>
          : studentSession === 'guest' && <><Link className="button button-light header-register" to="/register">{t('طلب تسجيل')}</Link><Link className="button button-dark header-action" to="/login">{t('دخول الطالب')}</Link></>}
      </div>
    </header>
  )
}