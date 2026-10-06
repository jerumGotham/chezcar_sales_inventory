import "server-only";

/**
 * The developer's own accounts. They alone see the System console, even over
 * the owner Admin, and they are kept out of the audit trail (audit-exempt.ts).
 * Matched on the sign-in email, lowercased.
 */
export const DEVELOPER_EMAILS: ReadonlySet<string> = new Set(["jerum@gmail.com"]);

export function isDeveloperEmail(email: string | null | undefined) {
  return Boolean(email) && DEVELOPER_EMAILS.has(email!.trim().toLowerCase());
}

/**
 * Roles made for the developer's own accounts: the full-access developer role
 * and the read-only support role. They are provisioned by script or SQL only,
 * and hidden from everyone in Role Maintenance and User Management -- listed,
 * offered, opened, edited and deleted by no one -- together with the users
 * that hold them.
 */
export const DEVELOPER_ROLE_IDS: ReadonlySet<string> = new Set(["role-developer-full", "role-support-readonly"]);

export function isHiddenRole(roleId: string) {
  return DEVELOPER_ROLE_IDS.has(roleId);
}
