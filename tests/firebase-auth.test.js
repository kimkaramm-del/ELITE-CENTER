import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGoogleIdentityTokenVerifier,
  FirebaseConfigurationError,
  FirebaseIdentityError,
} from '../server/firebase-auth.js'

function verifierFor(decoded) {
  let checkRevoked
  const verify = createGoogleIdentityTokenVerifier(() => ({
    verifyIdToken: async (_token, check) => {
      checkRevoked = check
      return decoded
    },
  }))
  return { verify, getCheckRevoked: () => checkRevoked }
}

test('verifies Google Firebase identities and normalizes their email', async () => {
  const { verify, getCheckRevoked } = verifierFor({
    uid: 'google.com:123456',
    email: 'Student@Example.test',
    email_verified: true,
    name: 'Student',
    firebase: { sign_in_provider: 'google.com' },
  })

  assert.deepEqual(await verify('valid-firebase-id-token-value'), {
    uid: 'google.com:123456',
    email: 'student@example.test',
    displayName: 'Student',
  })
  assert.equal(getCheckRevoked(), true)
})

test('rejects unverified and non-Google Firebase identities', async () => {
  for (const decoded of [
    { uid: 'uid-1', email: 'student@example.test', email_verified: false, firebase: { sign_in_provider: 'google.com' } },
    { uid: 'uid-1', email: 'student@example.test', email_verified: true, firebase: { sign_in_provider: 'password' } },
  ]) {
    const { verify } = verifierFor(decoded)
    await assert.rejects(verify('valid-firebase-id-token-value'), FirebaseIdentityError)
  }
})

test('rejects invalid tokens before Firebase access and preserves configuration errors', async () => {
  let authRequested = false
  const verifyWithoutAuth = createGoogleIdentityTokenVerifier(() => {
    authRequested = true
    throw new Error('should not be called')
  })
  await assert.rejects(verifyWithoutAuth('short'), FirebaseIdentityError)
  assert.equal(authRequested, false)

  const verifyWithoutConfiguration = createGoogleIdentityTokenVerifier(() => {
    throw new FirebaseConfigurationError('missing configuration')
  })
  await assert.rejects(
    verifyWithoutConfiguration('valid-firebase-id-token-value'),
    FirebaseConfigurationError,
  )
})

test('rejects Firebase token verification failures', async () => {
  const verify = createGoogleIdentityTokenVerifier(() => ({
    verifyIdToken: async () => {
      throw new Error('invalid token')
    },
  }))
  await assert.rejects(verify('valid-firebase-id-token-value'), FirebaseIdentityError)
})
