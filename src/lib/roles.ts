import type { Role } from "@/db/schema";

export type { Role };

/**
 * What each role grants, as a plain function of the roles themselves.
 *
 * Separate from `session.ts` because that module reaches for cookies and
 * `redirect`, which drags in the whole Next request runtime — this needs to be
 * callable from a check script, and the rule it encodes is worth testing on
 * its own.
 *
 * Roles are additive: a strong student acting as TA keeps their own weekly
 * assignment and their team while also reviewing others. Admin is the
 * exception in spirit — it is support access rather than a classroom role, and
 * deliberately does not imply teacher. An admin reaches the teacher screens by
 * viewing as a teacher, which leaves the act visible.
 */
export type RoleFlags = {
  roles: Role[];
  isStudent: boolean;
  isTa: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  /** Teacher or TA — the roles that can see other people's results. */
  isStaff: boolean;
};

export function describeRoles(roles: Role[]): RoleFlags {
  return {
    roles,
    isStudent: roles.includes("student"),
    isTa: roles.includes("ta"),
    isTeacher: roles.includes("teacher"),
    isAdmin: roles.includes("admin"),
    isStaff: roles.includes("ta") || roles.includes("teacher"),
  };
}
