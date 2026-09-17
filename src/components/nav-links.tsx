"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { RoleFlags } from "@/lib/roles";

/**
 * The links, chosen by who is looking and where they are.
 *
 * A TA holds two jobs: they study the course a year ahead of the class, and
 * they help run it. Showing both sets at once is five links that belong to two
 * different activities, so the nav follows the section they are actually in —
 * the staff screens live under /teacher, and everything else is their own
 * work. Which mode they are in is read off the path rather than stored: a
 * remembered mode can disagree with the page in front of them, and this one
 * cannot.
 *
 * A teacher who is not a student never sees the student links, and a student
 * who is not staff never sees a mode at all.
 */
export function NavLinks({
  me,
  isAdmin,
}: {
  me: RoleFlags & { displayName: string };
  /** From the real session, so an admin viewing as somebody keeps the way back. */
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const inStaffMode = pathname.startsWith("/teacher");
  const bothJobs = me.isStaff && me.isStudent;

  return (
    <>
      {me.isStudent && !(bothJobs && inStaffMode) && (
        <>
          <Link className="header-link" href="/">
            Home
          </Link>
          <Link className="header-link" href="/bank">
            Bank
          </Link>
          <Link className="header-link" href="/test">
            Tests
          </Link>
        </>
      )}

      {me.isStaff && (!bothJobs || inStaffMode) && (
        <>
          <Link className="header-link" href="/teacher/home">
            Class
          </Link>
          <Link className="header-link" href="/teacher/tests">
            Tests
          </Link>
        </>
      )}

      {me.isTeacher && (
        <Link className="header-link" href="/teacher/people">
          People
        </Link>
      )}

      {isAdmin && (
        <Link className="header-link" href="/admin">
          Admin
        </Link>
      )}

      {bothJobs && inStaffMode && (
        <Link className="header-link mode-exit" href="/">
          Leave TA mode
        </Link>
      )}

      <form action={signOut}>
        <button className="header-link" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

/**
 * The reminder, beside the name. Only for someone who has another mode to be
 * in — a teacher is never anything else, so a badge would be noise.
 */
export function ModeBadge({ isBoth }: { isBoth: boolean }) {
  const pathname = usePathname();
  if (!isBoth || !pathname.startsWith("/teacher")) return null;
  return <span className="pill pill-ta mode-badge">TA mode</span>;
}
