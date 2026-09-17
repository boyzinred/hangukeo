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
 *
 * A TA is a student. Not by the column — plenty of TA rows do not carry the
 * student role — but by what a TA is: someone further along the same course,
 * with their own bank to study and their own tests to sit. Reading it off the
 * column meant a TA-only account signed in to a site with nothing in it, and
 * fixing that by editing four rows would have left the next TA created from
 * the command line in the same hole.
 */
export type RoleFlags = {
  roles: Role[];
  /** Has their own bank and tests. True for a TA, whose course runs ahead. */
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
    isStudent: roles.includes("student") || roles.includes("ta"),
    isTa: roles.includes("ta"),
    isTeacher: roles.includes("teacher"),
    isAdmin: roles.includes("admin"),
    isStaff: roles.includes("ta") || roles.includes("teacher"),
  };
}
