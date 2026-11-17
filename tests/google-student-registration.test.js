import assert from 'node:assert/strict'
import { test } from 'node:test'

import { googleStudentRegistrationState } from '../server/google-student-registration.js'

const identity = { uid: 'google.com:student-1', email: 'student@example.test' }

test('new Google identities are directed to student registration', () => {
  assert.deepEqual(googleStudentRegistrationState(identity, [], []), {
    type: 'needsRegistration',
  })
})

test('a pending Google registration waits for approval', () => {
  const requests = [{
    id: 'request-1',
    firebaseUid: identity.uid,
    email: identity.email,
    status: 'pending',
  }]

  assert.equal(googleStudentRegistrationState(identity, requests, []).type, 'pendingApproval')
})

test('an approved Google registration resolves only its matching subscription', () => {
  const registration = {
    id: 'request-1',
    firebaseUid: identity.uid,
    email: identity.email,
    status: 'approved',
  }
  const subscription = {
    id: 'subscription-1',
    requestId: registration.id,
    email: identity.email,
    active: true,
  }

  assert.deepEqual(
    googleStudentRegistrationState(identity, [registration], [subscription]),
    { type: 'approved', registration, subscription },
  )
})

test('a previously linked registration cannot be silently linked again', () => {
  const registration = {
    id: 'request-1',
    firebaseUid: identity.uid,
    email: identity.email,
    status: 'approved',
    googleLinkedAt: '2025-01-01T00:00:00.000Z',
  }
  const subscription = {
    id: 'subscription-1',
    requestId: registration.id,
    email: identity.email,
    active: true,
  }

  assert.equal(
    googleStudentRegistrationState(identity, [registration], [subscription]).type,
    'needsInstituteCode',
  )
})

test('existing subscriptions without a Google registration still require an institute code', () => {
  const subscription = {
    id: 'subscription-1',
    email: identity.email,
    active: true,
  }

  assert.deepEqual(
    googleStudentRegistrationState(identity, [], [subscription]),
    { type: 'needsInstituteCode', subscription },
  )
})

test('inactive subscriptions cannot be bypassed by creating a new Google registration', () => {
  const subscription = {
    id: 'subscription-1',
    email: identity.email,
    active: false,
  }

  assert.deepEqual(
    googleStudentRegistrationState(identity, [], [subscription]),
    { type: 'inactive' },
  )
})
