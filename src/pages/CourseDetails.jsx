import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'
import { getCourseById } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'
import { ErrorBanner, ShimmerLoadingList } from '../components/FeedbackStates.jsx'

export default function CourseDetails() {
  const { language, t } = useLocale()
  const { courseId } = useParams()
  const [courseResult, setCourseResult] = useState({ courseId: null, course: null, error: '' })
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    let isCurrent = true
    getCourseById(courseId).then((course) => {
      if (isCurrent) setCourseResult({ courseId, course, error: '' })
    }).catch((error) => {
      if (isCurrent) setCourseResult({ courseId, course: null, error: error.message })
    })
    return () => { isCurrent = false }
  }, [courseId, retryCount])
  const isLoading = courseResult.courseId !== courseId
  const loadError = isLoading ? '' : courseResult.error
  const course = isLoading ? null : courseResult.course
  usePageTitle(course?.title ?? 'تفاصيل المادة')

  if (isLoading) return <section className="detail-page"><ShimmerLoadingList label={t('جارٍ تحميل تفاصيل المادة...')} rows={2} /></section>
  if (loadError) return <section className="detail-page"><ErrorBanner message={t(loadError)} onRetry={() => { setCourseResult({ courseId: null, course: null, error: '' }); setRetryCount((count) => count + 1) }} retryLabel={t('إعادة المحاولة')} /><Link className="text-link" to="/courses">{t('العودة إلى المواد')} ←</Link></section>
  if (!course) return <section className="listing-page"><h1 className="page-title">{t('لم نعثر على هذه المادة.')}</h1><Link className="text-link" to="/courses">{t('العودة إلى المواد')} ←</Link></section>

  return (
    <section className="detail-page">
      <Link className="back-link" to={`/grades/${course.gradeId}`}>← {t('العودة إلى مواد')} {t(course.gradeTitle)}</Link>
      <span className="eyebrow">{t(course.gradeTitle)} · {t(course.level)}</span>
      <h1 className="page-title">{t(course.title)}</h1>
      <p className="page-intro">{t('تعليم متخصص بإشراف')} {t(course.teacher)}.</p>
      <div className="detail-facts">
        <div><span>{t('الصف الدراسي')}</span><strong>{t(course.gradeTitle)}</strong></div>
        <div><span>{t('المدرسون')}</span><strong>{t(course.teacher)}</strong></div>
        <div><span>{t('سعر المادة')}</span><strong>{new Intl.NumberFormat(language).format(course.price)} {course.currency}</strong></div>
      </div>
      <Link className="button button-dark" to={`/register?grade=${course.gradeId}&subject=${encodeURIComponent(course.subjectId)}`}>{t('إرسال طلب تسجيل')} <span aria-hidden="true">←</span></Link>
    </section>
  )
}
