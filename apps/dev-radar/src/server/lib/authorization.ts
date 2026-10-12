/**
 * DevAuth authenticates. DevRadar authorizes.
 *
 * A valid DevAuth account proves who someone is; it does not grant a view of
 * the owner's repositories. GitHub App installations decide what DevRadar can
 * *read*; this allowlist, `DEVRADAR_ALLOWED_USERS`, decides who may *see* it,
 * checked on the server for every request. Not RBAC — one list.
 *
 * Entries are comma-separated. An entry containing `@` is compared with the
 * signed-in email (case-insensitive); anything else with the DevAuth user id
 * (the `sub` claim, exact). Prefer user ids in production: DevAuth does not
 * currently require email verification (its SIGNUP_ALLOWLIST is what keeps
 * strangers from registering an owner's address), whereas `sub` cannot be
 * chosen by whoever signs up. Empty or unset means nobody — this fails closed.
 */

export interface AccessPolicy {
  readonly userIds: ReadonlySet<string>;
  readonly emails: ReadonlySet<string>;
}

export interface Principal {
  id: string;
  email: string;
}

export function parseAllowedUsers(raw: string | undefined): AccessPolicy {
  const userIds = new Set<string>();
  const emails = new Set<string>();

  for (const entry of (raw ?? '').split(',')) {
    const value = entry.trim();
    if (!value) continue;
    if (value.includes('@')) emails.add(value.toLowerCase());
    else userIds.add(value);
  }

  return { userIds, emails };
}

export function isAllowed(policy: AccessPolicy, principal: Principal): boolean {
  if (policy.userIds.has(principal.id)) return true;
  const email = principal.email.trim().toLowerCase();
  return email !== '' && policy.emails.has(email);
}
