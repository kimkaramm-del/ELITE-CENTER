const enabledKey = 'elite-center:app-notifications'
const seenKey = 'elite-center:seen-notifications'
const preferencesChangedEvent = 'elite-center:notification-preferences-changed'

function readSeenNotificationIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(seenKey) ?? '[]')
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeSeenNotificationIds(ids) {
  try {
    window.localStorage.setItem(seenKey, JSON.stringify(ids.slice(-100)))
  } catch {
    throw new Error('تعذر حفظ حالة الإشعارات على هذا الجهاز.')
  }
}

export function areAppNotificationsEnabled() {
  try {
    return window.localStorage.getItem(enabledKey) === 'true'
  } catch {
    return false
  }
}

export function notificationPreferencesChangedEventName() {
  return preferencesChangedEvent
}

export async function getAppNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function setAppNotificationsEnabled(enabled) {
  if (!enabled) {
    try {
      window.localStorage.setItem(enabledKey, 'false')
      window.dispatchEvent(new Event(preferencesChangedEvent))
      return 'granted'
    } catch {
      throw new Error('تعذر حفظ إعداد الإشعارات على هذا الجهاز.')
    }
  }

  let permission
  if (typeof Notification !== 'undefined' && window.isSecureContext) {
    permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  } else {
    permission = typeof Notification === 'undefined' ? 'unsupported' : 'insecure-context'
  }

  if (permission !== 'granted') return permission
  try {
    window.localStorage.setItem(enabledKey, 'true')
    window.dispatchEvent(new Event(preferencesChangedEvent))
    return permission
  } catch {
    throw new Error('تعذر حفظ إعداد الإشعارات على هذا الجهاز.')
  }
}

export async function notifyAboutNewStudentNotifications(items) {
  const knownIds = new Set(readSeenNotificationIds())
  const firstCheck = (() => {
    try {
      return window.localStorage.getItem(seenKey) === null
    } catch {
      return true
    }
  })()
  const unseen = items.filter((item) => !knownIds.has(item.id) && !item.isRead)
  writeSeenNotificationIds(items.map((item) => item.id))
  if (firstCheck || !areAppNotificationsEnabled()) return

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  for (const item of unseen.slice(0, 3)) {
    new Notification('مركز النخبة', { body: item.text, tag: `elite-notification-${item.id}` })
  }
}
