import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import usePageTitle from '../hooks/usePageTitle.js'
import { getGradeById } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'
import { ErrorBanner, ShimmerLoadingList } from '../components/FeedbackStates.jsx'

export default function GradeDetails() {
  const { language, t } = useLocale()
  const { gradeId } = useParams()
  const [result, setResult] = useState({ id: null, grade: null, error: '' })
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    let isCurrent = true
    getGradeById(gradeId).then((grade) => {
      if (isCurrent) setResult({ id: gradeId, grade, error: '' })
    }).catch((error) => {
      if (isCurrent) setResult({ id: gradeId, grade: null, error: error.message })
    })
    return () => { isCurrent = false }
  }, [gradeId, retryCount])

  const isLoading = result.id !== gradeId
  const grade = isLoading ? null : result.grade
  usePageTitle(grade?.title ?? 'مواد الصف')
  if (isLoading) return <section className="grade-detail-page"><ShimmerLoadingList label={t('جارٍ تحميل المواد...')} rows={4} /></section>
  if (result.error) return <section className="grade-detail-page"><ErrorBanner message={t(result.error)} onRetry={() => { setResult({ id: null, grade: null, error: '' }); setRetryCount((count) => count + 1) }} retryLabel={t('إعادة المحاولة')} /><Link className="back-link" to="/">{t('العودة إلى الصفوف')}</Link></section>
  if (!grade) return <section className="grade-detail-page"><h1>{t('لم نعثر على هذا الصف.')}</h1><Link className="back-link" to="/">{t('العودة إلى الصفوف')}</Link></section>

  return (
    <section className="grade-detail-page">
      <header className="grade-bar">
        <Link className="grade-bar-back" to="/" aria-label={t('العودة لاختيار الصف')}>{t('رجوع')} <span aria-hidden="true">←</span></Link>
        <div className="grade-bar-title"><h1>{t(grade.title)}</h1><p>{t(grade.stage)}</p></div>
        <Link className="grade-bar-register" to={`/register?grade=${grade.id}`}>{t('طلب تسجيل')}</Link>
      </header>
      <div className="grade-detail-heading"><span className="eyebrow">{t('اختر المادة المناسبة')}</span><p>{t('المدرسون والأسعار محدثة من إدارة المركز.')}</p></div>
      <div className="subject-grid">
        {grade.subjects.map((subject, index) => (
          <article className={`subject-card accent-${index % 6}`} key={subject.id}>
            <span className="subject-number">{String(index + 1).padStart(2, '0')}</span>
            <h2>{t(subject.name)}</h2>
            <div className="subject-teachers">
              <span>{t('المدرسون')}</span>
              <strong>{subject.teachers.map(t).join(', ') || t('سيعلن لاحقاً')}</strong>
            </div>
            <div className="subject-card-footer">
              <span>{t('سعر المادة')}</span>
              <strong>{new Intl.NumberFormat(language).format(subject.price)} {subject.currency}</strong>
              <Link to={`/courses/${grade.id}-${subject.id}`} aria-label={`${t('التفاصيل')} ${t(subject.name)}`}>{t('التفاصيل')} <span aria-hidden="true">←</span></Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}