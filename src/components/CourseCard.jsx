import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isCourseFavorite, toggleCourseFavorite } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'

export default function CourseCard({ course }) {
  const { language, t } = useLocale()
  const [favorite, setFavorite] = useState(false)
  useEffect(() => { isCourseFavorite(course.id).then(setFavorite) }, [course.id])
  async function toggleFavorite() {
    const isFavorite = await toggleCourseFavorite(course.id)
    setFavorite(isFavorite)
    window.dispatchEvent(new CustomEvent('elite-center:favorites-changed', { detail: { courseId: course.id, isFavorite } }))
  }
  return <article className={`course-card tone-${course.color}`}><div className="course-card-top"><span className="eyebrow">{t(course.gradeTitle ?? course.category)}</span><button className="favorite-toggle" type="button" aria-label={t(favorite ? 'إزالة المادة من المفضلة' : 'إضافة المادة إلى المفضلة')} aria-pressed={favorite} onClick={toggleFavorite}>{favorite ? '★' : '☆'}</button></div><h3>{t(course.title)}</h3><p>{t(course.teacher)}</p><div className="course-card-bottom"><strong>{course.price != null ? `${new Intl.NumberFormat(language).format(course.price)} ${course.currency}` : t(course.level)}</strong><Link to={`/courses/${course.id}`} aria-label={`${t('التفاصيل')} ${t(course.title)}`}>{t('التفاصيل')} <span aria-hidden="true">←</span></Link></div></article>
}