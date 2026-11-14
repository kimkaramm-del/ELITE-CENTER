import usePageTitle from '../../hooks/usePageTitle.js'
import StudentPostGrid from '../../components/StudentPostGrid.jsx'
import { useLocale } from '../../contexts/LocaleContext.jsx'

export default function Gallery() {
  const { t } = useLocale()
  usePageTitle('المعرض')
  return (
    <section className="dashboard-page">
      <div className="requests-heading">
        <div><span className="eyebrow">{t('مساحة الطالب')}</span><h1 className="page-title">{t('معرض منشوراتي')}</h1><p className="page-intro">{t('منشوراتك المنشورة في موجز الطلاب وتفاعلاتها.')}</p></div>
      </div>
      <StudentPostGrid />
    </section>
  )
}