import { useEffect, useState } from 'react'
import usePageTitle from '../../hooks/usePageTitle.js'
import { getAnnouncements, getNotifications, markNotificationRead } from '../../services/database.js'
import { useLocale } from '../../contexts/LocaleContext.jsx'
import { ErrorBanner, ShimmerLoadingList } from '../../components/FeedbackStates.jsx'

export default function Announcements() {
  const { language, t } = useLocale()
  const [announcements, setAnnouncements] = useState([])
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadVersion, setLoadVersion] = useState(0)
  usePageTitle('إعلانات الإدارة')
  useEffect(() => {
    let isCurrent = true
    Promise.all([getAnnouncements(), getNotifications()]).then(([announcementResult, notificationResult]) => {
      if (!isCurrent) return
      setAnnouncements(announcementResult.items)
      setNotifications(notificationResult.items)
    }).catch((loadError) => {
      if (!isCurrent) return
      setError(loadError.message)
    }).finally(() => {
      if (isCurrent) setIsLoading(false)
    })
    return () => { isCurrent = false }
  }, [loadVersion])

  function retryAnnouncements() {
    setIsLoading(true)
    setError('')
    setLoadVersion((version) => version + 1)
  }

  async function markRead(notificationId) {
    try {
      await markNotificationRead(notificationId)
      setAnnouncements((current) => current.map((announcement) => notificationId === announcement.notificationId ? { ...announcement, isRead: true } : announcement))
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item))
    } catch (markError) {
      setError(markError.message)
    }
  }

  const announcementNotifications = new Map(notifications.filter((item) => item.type === 'announcement').map((item) => [item.referenceId, item]))
  return (
    <section className="dashboard-page">
      <span className="eyebrow">{t('إشعارات مساحة الطالب')}</span>
      <h1 className="page-title">{t('إعلانات الإدارة')}</h1>
      <p className="page-intro">{t('الإعلانات الرسمية منفصلة عن أخبار الموقع، وتصل تلقائياً لكل طالب نشط.')}</p>
      {error && <ErrorBanner message={t(error)} onRetry={retryAnnouncements} onDismiss={() => setError('')} retryLabel={t('إعادة المحاولة')} dismissLabel={t('إغلاق')} />}
      {isLoading ? <ShimmerLoadingList label={t('جارٍ تحميل الإعلانات...')} /> : announcements.length ? <div className="announcement-list">
        {announcements.map((item) => {
          const notification = announcementNotifications.get(item.id)
          return <article className={`admin-announcement${item.isRead ? '' : ' unread'}`} key={item.id}>
            <div className="announcement-status">{t(item.isRead ? 'مقروء' : 'جديد')}</div>
            <p>{t(item.text)}</p>
            <small>{new Date(item.createdAt).toLocaleString(language)}</small>
            {!item.isRead && notification && <button className="text-link" type="button" onClick={() => markRead(notification.id)}>{t('تحديد كمقروء')}</button>}
          </article>
        })}
      </div> : <div className="empty-state"><h2>{t('لا توجد إعلانات حالياً')}</h2><p>{t('ستظهر هنا إعلانات إدارة المركز عند نشرها.')}</p></div>}
      {!isLoading && notifications.some((item) => item.type !== 'announcement') && <section className="student-notification-list">
        <h2>{t('إشعارات أخرى')}</h2>
        {notifications.filter((item) => item.type !== 'announcement').map((item) => <article key={item.id} className={item.isRead ? '' : 'unread'}>
          <p>{t(item.text)}</p><small>{new Date(item.createdAt).toLocaleString(language)}</small>
          {!item.isRead && <button className="text-link" type="button" onClick={() => markRead(item.id)}>{t('تحديد كمقروء')}</button>}
        </article>)}
      </section>}
    </section>
  )
}
