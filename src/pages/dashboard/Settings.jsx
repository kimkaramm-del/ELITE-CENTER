import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import usePageTitle from '../../hooks/usePageTitle.js'
import { useLocale } from '../../contexts/LocaleContext.jsx'
import { Capacitor } from '@capacitor/core'
import { areAppNotificationsEnabled, getAppNotificationPermission, setAppNotificationsEnabled } from '../../services/appNotifications.js'
import { getStudentProfile, logoutStudent, saveStudentProfile } from '../../services/database.js'
import { ErrorBanner, ShimmerLoadingList } from '../../components/FeedbackStates.jsx'

export default function Settings() {
  const { language, changeLanguage, t } = useLocale()
  const navigate = useNavigate()
  const photoInputRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileRetry, setProfileRetry] = useState(0)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [photoMessage, setPhotoMessage] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [editingField, setEditingField] = useState('')
  const [draftValue, setDraftValue] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(areAppNotificationsEnabled)
  const [permission, setPermission] = useState('prompt')
  const [message, setMessage] = useState('')
  const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  usePageTitle('الإعدادات')

  useEffect(() => {
    let isCurrent = true
    setProfileLoading(true)
    setProfileError('')
    getStudentProfile().then((nextProfile) => {
      if (isCurrent) setProfile(nextProfile)
    }).catch((error) => {
      if (isCurrent) setProfileError(error.message)
    }).finally(() => {
      if (isCurrent) setProfileLoading(false)
    })
    return () => { isCurrent = false }
  }, [profileRetry])

  useEffect(() => {
    let isCurrent = true
    getAppNotificationPermission().then((nextPermission) => {
      if (isCurrent) setPermission(nextPermission)
    }).catch((error) => {
      if (isCurrent) setMessage(t(error.message))
    })
    return () => { isCurrent = false }
  }, [t])

  function startEditing(field, value) {
    setPhotoMessage('')
    setPhotoError('')
    setDraftValue(value ?? '')
    setEditingField(field)
  }

  async function saveProfileChanges(updates) {
    setIsSavingProfile(true)
    setPhotoMessage('')
    setPhotoError('')
    try {
      setProfile(await saveStudentProfile(updates))
      setPhotoMessage('تم حفظ بيانات الحساب.')
      return true
    } catch (error) {
      setPhotoError(error.message)
      return false
    } finally {
      setIsSavingProfile(false)
    }
  }

  function handlePhotoChange(event) {
    const input = event.currentTarget
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoMessage('')
    setPhotoError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1_500_000) {
      setPhotoError('اختر صورة PNG أو JPEG أو WebP بحجم لا يتجاوز 1.5 ميغابايت.')
      input.value = ''
      return
    }
    const reader = new FileReader()
    reader.onerror = () => {
      setPhotoError('تعذر قراءة الصورة. حاول اختيار ملف آخر.')
      input.value = ''
    }
    reader.onload = () => {
      void saveProfileChanges({ photoDataUrl: String(reader.result) }).finally(() => { input.value = '' })
    }
    reader.readAsDataURL(file)
  }

  async function handleFieldSave(event) {
    event.preventDefault()
    const value = draftValue.trim()
    if (editingField === 'displayName' && (value.length < 2 || value.length > 100)) {
      setPhotoError('أدخل اسماً من حرفين إلى 100 حرف.')
      return
    }
    const saved = await saveProfileChanges({ [editingField]: value })
    if (saved) {
      setEditingField('')
      setDraftValue('')
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true)
    setLogoutError('')
    try {
      await logoutStudent()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error.message)
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function enableNotifications() {
    setMessage('')
    try {
      const nextPermission = await setAppNotificationsEnabled(true)
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        setNotificationsEnabled(false)
        setMessage(t(nextPermission === 'denied'
          ? 'الإشعارات محظورة. غيّر الإذن من إعدادات Android للتطبيق.'
          : nextPermission === 'insecure-context'
            ? 'يتطلب إذن الإشعارات اتصالاً آمناً (HTTPS) أو localhost.'
            : nextPermission === 'unsupported'
              ? 'إشعارات التطبيق غير مدعومة على هذا الجهاز.'
              : 'لم يتم منح إذن الإشعارات.'))
        return
      }
      setNotificationsEnabled(true)
      setMessage(t('إشعارات التطبيق مفعّلة. ستصل التنبيهات أثناء استخدام التطبيق.'))
    } catch (error) {
      setMessage(t(error.message))
    }
  }

  async function disableNotifications() {
    setMessage('')
    try {
      await setAppNotificationsEnabled(false)
      setNotificationsEnabled(false)
    } catch (error) {
      setMessage(t(error.message))
    }
  }

  function handleLanguageChange(event) {
    setMessage('')
    try {
      changeLanguage(event.target.value)
    } catch (error) {
      setMessage(t(error.message))
    }
  }

  return (
    <section className="dashboard-page">
      <span className="eyebrow">{t('مساحة الطالب')}</span>
      <h1 className="page-title">{t('الإعدادات')}</h1>
      <p className="page-intro">{t('إدارة تفضيلات الحساب والإشعارات.')}</p>
      <section className="settings-account-card" aria-labelledby="settings-account-title">
        <div className="settings-account-heading">
          <div><span className="eyebrow">{t('مساحة الطالب')}</span><h2 id="settings-account-title">{t('بيانات الحساب')}</h2></div>
        </div>
        {profileLoading
          ? <ShimmerLoadingList label={t('جارٍ تحميل بيانات الحساب...')} rows={2} />
          : profileError
            ? <ErrorBanner
              message={t(profileError)}
              onRetry={() => setProfileRetry((revision) => revision + 1)}
              retryLabel={t('إعادة المحاولة')}
            />
            : profile && <>
              <div className="settings-account-identity">
                <div className="settings-account-avatar-wrap">
                  <button
                    className="settings-account-avatar"
                    type="button"
                    aria-label={t('تغيير الصورة')}
                    title={t('تغيير الصورة')}
                    disabled={isSavingProfile}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {profile.photoDataUrl ? <img src={profile.photoDataUrl} alt="" /> : <span aria-hidden="true">{profile.name?.trim().slice(0, 1) || 'ط'}</span>}
                    <span className="settings-account-avatar-edit" aria-hidden="true">✎</span>
                  </button>
                  <input
                    ref={photoInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePhotoChange}
                    aria-label={t('تغيير الصورة')}
                  />
                  {profile.photoDataUrl && <button className="settings-account-remove-photo" type="button" disabled={isSavingProfile} onClick={() => { void saveProfileChanges({ photoDataUrl: '' }) }} aria-label={t('إزالة الصورة')}>×</button>}
                </div>
                <div className="settings-account-identity-copy">
                  {editingField === 'displayName'
                    ? <form className="settings-inline-edit" onSubmit={handleFieldSave}>
                      <input autoFocus value={draftValue} onChange={(event) => setDraftValue(event.target.value)} maxLength={100} aria-label={t('الاسم الكامل')} />
                      <div>
                        <button className="settings-inline-save" type="submit" disabled={isSavingProfile} aria-label={t('حفظ')} title={t('حفظ')}>✓</button>
                        <button className="settings-inline-cancel" type="button" onClick={() => setEditingField('')} aria-label={t('إلغاء')} title={t('إلغاء')}>×</button>
                      </div>
                    </form>
                    : <button className="settings-account-edit-name" type="button" onClick={() => startEditing('displayName', profile.name)} disabled={isSavingProfile}>
                      <strong>{profile.name || t('الطالب')}</strong><span aria-hidden="true">✎</span>
                    </button>}
                  <span>{t(profile.grade || '—')}</span>
                </div>
              </div>
              {isSavingProfile && <p className="settings-account-feedback" role="status">{t('جارٍ الحفظ...')}</p>}
              {photoError && <p className="form-message" role="alert">{t(photoError)}</p>}
              {photoMessage && <p className="form-message success" role="status">{t(photoMessage)}</p>}
            </>}
      </section>
      <div className="settings-row">
        <div><strong>{t('اللغة')}</strong><span>{t('لغة واجهة العرض')}</span></div>
        <select value={language} onChange={handleLanguageChange} aria-label={t('لغة واجهة العرض')}>
          <option value="ar">{t('العربية')}</option>
          <option value="en">{t('English')}</option>
        </select>
      </div>
      <section className="settings-row settings-row-stack">
        <div><strong>{t('إشعارات التطبيق')}</strong><span>{t('تعمل الإشعارات أثناء فتح التطبيق. يتطلب الإرسال عند إغلاقه إعداد خدمة push خارجية.')}</span></div>
        <div className="settings-action">
          <span role="status">{t(permission === 'granted' ? 'إذن الإشعارات ممنوح.' : permission === 'denied' ? 'الإشعارات محظورة. غيّر الإذن من إعدادات Android للتطبيق.' : permission === 'unsupported' ? 'إشعارات التطبيق غير مدعومة على هذا الجهاز.' : 'لم يتم تفعيل إشعارات التطبيق.')}</span>
          {notificationsEnabled
            ? <button className="button button-light" type="button" onClick={disableNotifications}>{t('إيقاف الإشعارات')}</button>
            : <button className="button button-dark" type="button" onClick={enableNotifications}>{t('تفعيل إشعارات التطبيق')}</button>}
        </div>
      </section>
      {isAndroid && <div className="settings-row"><div><strong>{t('تثبيت تطبيق Android')}</strong><span>{t('نزّل ملف APK من صفحة التنزيل الرسمية لتثبيته على جهازك.')}</span></div></div>}
      <div className="settings-row">
        <div><strong>{t('إعلانات الإدارة')}</strong><span>{t('متابعة التنبيهات الرسمية وحالة قراءتها')}</span></div>
        <Link className="text-link" to="/dashboard/announcements">{t('عرض الإعلانات')}</Link>
      </div>
      <section className="settings-logout-section">
        <div><strong>{t('الجلسة')}</strong><span>{t('إنهاء تسجيل الدخول على هذا الجهاز.')}</span></div>
        <button className="button settings-logout-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>
          {t(isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج')}
        </button>
        {logoutError && <p className="form-message" role="alert">{t(logoutError)}</p>}
      </section>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  )
}
