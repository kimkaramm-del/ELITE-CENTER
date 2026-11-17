import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

export class FirebaseConfigurationError extends Error {}

export class FirebaseIdentityError extends Error {}

let firebaseAuth

function getConfiguredAuth() {
  if (firebaseAuth) return firebaseAuth

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    throw new FirebaseConfigurationError('Firebase Admin is not configured.')
  }

  let serviceAccount
  try {
    serviceAccount = JSON.parse(serviceAccountJson)
  } catch {
    throw new FirebaseConfigurationError('Firebase service-account JSON is invalid.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new FirebaseConfigurationError('Firebase service-account JSON is incomplete.')
  }
  if (process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PROJECT_ID !== serviceAccount.project_id) {
    throw new FirebaseConfigurationError('Firebase project IDs do not match.')
  }

  try {
    const app = getApps().find((item) => item.name === 'elite-center-auth') ??
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      }, 'elite-center-auth')
    firebaseAuth = getAuth(app)
    return firebaseAuth
  } catch {
    throw new FirebaseConfigurationError('Firebase Admin credentials are invalid.')
  }
}

export function createGoogleIdentityTokenVerifier(getAuth = getConfiguredAuth) {
  return async function verifyGoogleIdentityToken(idToken) {
    if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 10_000) {
      throw new FirebaseIdentityError('Google sign-in token is invalid.')
    }

    const auth = getAuth()
    let decoded
    try {
      decoded = await auth.verifyIdToken(idToken, true)
    } catch {
      throw new FirebaseIdentityError('Google sign-in token is invalid or expired.')
    }

    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : ''
    const uid = typeof decoded.uid === 'string' ? decoded.uid : ''
    if (decoded.firebase?.sign_in_provider !== 'google.com' ||
        decoded.email_verified !== true ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[A-Za-z0-9_.:-]{1,128}$/.test(uid) ||
        ['__proto__', 'constructor', 'prototype'].includes(uid)) {
      throw new FirebaseIdentityError('Use a verified Google account to continue.')
    }

    return {
      uid,
      email,
      displayName: typeof decoded.name === 'string' ? decoded.name.trim().slice(0, 100) : '',
    }
  }
}

export const verifyGoogleIdentityToken = createGoogleIdentityTokenVerifier()
