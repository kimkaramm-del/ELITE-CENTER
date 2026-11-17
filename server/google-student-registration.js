function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function googleStudentRegistrationState(identity, requests, subscriptions) {
  const identityEmail = normalizedEmail(identity.email)
  const registration = requests.find((request) =>
    request.firebaseUid === identity.uid &&
    normalizedEmail(request.email) === identityEmail &&
    request.status === 'approved' &&
    !request.googleLinkedAt)

  if (registration) {
    const subscription = subscriptions.find((item) =>
      item.requestId === registration.id &&
      normalizedEmail(item.email) === identityEmail)
    if (subscription) {
      return {
        type: subscription.active === false ? 'inactive' : 'approved',
        registration,
        subscription,
      }
    }
  }

  const emailSubscriptions = subscriptions.filter((item) =>
    normalizedEmail(item.email) === identityEmail)
  if (emailSubscriptions.length > 0) {
    const activeSubscription = emailSubscriptions.find((item) => item.active !== false)
    return activeSubscription
      ? { type: 'needsInstituteCode', subscription: activeSubscription }
      : { type: 'inactive' }
  }

  const pendingRegistration = requests.find((request) =>
    request.firebaseUid === identity.uid &&
    normalizedEmail(request.email) === identityEmail &&
    request.status === 'pending')
  return pendingRegistration
    ? { type: 'pendingApproval', registration: pendingRegistration }
    : { type: 'needsRegistration' }
}
