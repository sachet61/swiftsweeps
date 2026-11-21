export const SUPER_ADMIN_LOGIN_EMAIL = 'sachet61@gmail.com';
export const SUPER_ADMIN_PUBLIC_EMAIL = 'superadmin@swiftsweeps.net';
export const SUPER_ADMIN_DISPLAY_NAME = 'Super Admin';

export function isProtectedSuperAdminAccount(
  user?: { email?: string | null; role?: string | null } | null
): boolean {
  const rawEmail = (user?.email || '').trim().toLowerCase();
  return user?.role === 'admin' && rawEmail === SUPER_ADMIN_LOGIN_EMAIL;
}

export function getAdminDisplayEmail(
  user?: { email?: string | null; role?: string | null } | null
): string {
  const rawEmail = (user?.email || '').trim();
  if (!rawEmail) return '';
  if (isProtectedSuperAdminAccount(user)) {
    return SUPER_ADMIN_PUBLIC_EMAIL;
  }
  return rawEmail;
}

export function getAdminDisplayName(
  user?: { email?: string | null; role?: string | null; displayName?: string | null } | null
): string {
  if (isProtectedSuperAdminAccount(user)) {
    return SUPER_ADMIN_DISPLAY_NAME;
  }
  return (user?.displayName || '').trim() || 'User';
}
