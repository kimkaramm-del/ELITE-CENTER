import { useLocale } from '../contexts/LocaleContext.jsx'

export default function Footer() {
  const { language } = useLocale()
  return <footer className="site-footer">{language === 'ar' ? 'تواصل مع المطور : ' : 'Contact the developer: '}alzober217@gmail.com</footer>
}