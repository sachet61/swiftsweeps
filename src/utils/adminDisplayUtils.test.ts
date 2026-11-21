import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminDisplayEmail,
  getAdminDisplayName,
  isProtectedSuperAdminAccount,
  SUPER_ADMIN_DISPLAY_NAME,
  SUPER_ADMIN_LOGIN_EMAIL,
  SUPER_ADMIN_PUBLIC_EMAIL,
} from './adminDisplayUtils.ts';

describe('getAdminDisplayEmail', () => {
  it('displays superadmin@swiftsweeps.net for the protected Super Admin account without altering non-display auth fields', () => {
    assert.equal(
      getAdminDisplayEmail({ email: SUPER_ADMIN_LOGIN_EMAIL, role: 'admin' }),
      SUPER_ADMIN_PUBLIC_EMAIL
    );
    assert.equal(
      getAdminDisplayEmail({ email: '  Sachet61@Gmail.com ', role: 'admin' }),
      SUPER_ADMIN_PUBLIC_EMAIL
    );
  });

  it('preserves actual email for other admins, agents, and customers', () => {
    assert.equal(
      getAdminDisplayEmail({ email: 'otheradmin@swiftsweeps.net', role: 'admin' }),
      'otheradmin@swiftsweeps.net'
    );
    assert.equal(
      getAdminDisplayEmail({ email: 'haudemaxe@gmail.com', role: 'agent' }),
      'haudemaxe@gmail.com'
    );
    assert.equal(
      getAdminDisplayEmail({ email: 'player@example.com', role: 'customer' }),
      'player@example.com'
    );
    assert.equal(
      getAdminDisplayEmail({ email: SUPER_ADMIN_LOGIN_EMAIL, role: 'customer' }),
      SUPER_ADMIN_LOGIN_EMAIL
    );
  });

  it('handles empty or nullish inputs safely', () => {
    assert.equal(getAdminDisplayEmail(null), '');
    assert.equal(getAdminDisplayEmail(undefined), '');
    assert.equal(getAdminDisplayEmail({ email: '', role: 'admin' }), '');
  });
});

describe('getAdminDisplayName & isProtectedSuperAdminAccount', () => {
  it('displays Super Admin for the protected Super Admin account regardless of stale profile name', () => {
    assert.equal(
      isProtectedSuperAdminAccount({ email: SUPER_ADMIN_LOGIN_EMAIL, role: 'admin' }),
      true
    );
    assert.equal(
      getAdminDisplayName({
        email: SUPER_ADMIN_LOGIN_EMAIL,
        role: 'admin',
        displayName: 'Sachet Basukala',
      }),
      SUPER_ADMIN_DISPLAY_NAME
    );
  });

  it('preserves displayName for other admins, agents, and customers', () => {
    assert.equal(
      getAdminDisplayName({
        email: 'blithesweeps@gmail.com',
        role: 'agent',
        displayName: 'Blithe Sweeps',
      }),
      'Blithe Sweeps'
    );
    assert.equal(
      getAdminDisplayName({
        email: 'rashilbasukala@gmail.com',
        role: 'customer',
        displayName: 'Rashil Basukala',
      }),
      'Rashil Basukala'
    );
    assert.equal(getAdminDisplayName({ email: 'x@y.com', role: 'customer', displayName: '' }), 'User');
  });
});
