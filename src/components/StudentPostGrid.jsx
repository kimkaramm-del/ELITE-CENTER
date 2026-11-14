import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteCommunityPost, getMyCommunityPosts } from '../services/database.js'
import { useLocale } from '../contexts/LocaleContext.jsx'

function applyPosts(result, setPosts) {
  setPosts(result.items)
}

export default function StudentPostGrid({ compact = false }) {
  const { language, t } = useLocale()
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [error, setError] = useState('')

  const loadPosts = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await getMyCommunityPosts()
      applyPosts(result, setPosts)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true
    getMyCommunityPosts().then((result) => {
      if (isCurrent) applyPosts(result, setPosts)
    }).catch((loadError) => {
      if (isCurrent) setError(loadError.message)
    }).finally(() => {
      if (isCurrent) setIsLoading(false)
    })
    return () => { isCurrent = false }
  }, [])

  async function removePost(postId) {
    setDeletingId(postId)
    setError('')
    try {
      await deleteCommunityPost(postId)
      setConfirmDeleteId('')
      await loadPosts()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className={`student-post-grid${compact ? ' compact' : ''}`}>
      {isLoading ? <p role="status">{t('جارٍ تحميل منشوراتك...')}</p> : null}
      {error && <p className="form-message" role="alert">{t(error)}<button className="text-link" type="button" onClick={loadPosts}>{t('إعادة المحاولة')}</button></p>}
      {!isLoading && !error && posts.length === 0 && <div className="empty-state"><h2>{t('لا توجد منشورات بعد')}</h2><p>{t('شارك أول منشور لك ليظهر هنا وفي موجز الطلاب.')}</p><Link className="button button-light" to="/dashboard/feed">{t('إنشاء منشور')}</Link></div>}
      {posts.map((post) => (
        <article className="student-post-tile" key={post.id}>
          <p>{post.text}</p>
          <div className="student-post-tile-meta">
            <span>{new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(post.createdAt))}</span>
            <span>♥ {new Intl.NumberFormat(language).format(post.reactionCount)} · {t('تعليق')} {new Intl.NumberFormat(language).format(post.commentCount)}</span>
          </div>
          <div className="student-post-tile-actions">
            <Link to="/dashboard/feed">{t('الموجز')}</Link>
            {confirmDeleteId === post.id ? <>
              <button type="button" disabled={deletingId === post.id} onClick={() => removePost(post.id)}>{t(deletingId === post.id ? 'جارٍ الحذف...' : 'تأكيد الحذف')}</button>
              <button type="button" disabled={deletingId === post.id} onClick={() => setConfirmDeleteId('')}>{t('إلغاء')}</button>
            </> : <button type="button" onClick={() => setConfirmDeleteId(post.id)} aria-label={`${t('حذف')} ${t('منشور بتاريخ')} ${new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(post.createdAt))}`}>{t('حذف')}</button>}
          </div>
        </article>
      ))}
    </div>
  )
}
