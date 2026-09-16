import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { currentSession } from "@/lib/session";

/**
 * Header identity, shown beside the brand. `currentSession` is memoised per
 * render, so this and UserNav below share one query.
 */
export async function UserIdentity() {
  const me = await currentSession();
  if (!me) return null;

  return (
    <span className="header-user" title={me.username}>
      <span className="header-user-name">{me.displayName}</span>
      <span className="pill-stack">
        {me.roles.map((r) => (
          <span key={r} className={`pill pill-${r}`}>
            {r}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Navigation, by role. Bank and Practice are a student's own screens, so a
 * teacher who is not also a student has no use for them and does not see them
 * — they are still reachable by URL for previewing what a student gets.
 */
export async function UserNav() {
  const me = await currentSession();

  if (!me) {
    return (
      <Link className="header-link" href="/login">
        Sign in
      </Link>
    );
  }

  return (
    <>
      {me.isStudent && (
        <>
          <Link className="header-link" href="/bank">
            Bank
          </Link>
          <Link className="header-link" href="/practice">
            Practice
          </Link>
          <Link className="header-link" href="/test">
            Test
          </Link>
        </>
      )}
      {me.isStaff && (
        <>
          <Link className="header-link" href="/teacher/home">
            Class
          </Link>
          <Link className="header-link" href="/teacher/tests">
            Tests
          </Link>
          <Link className="header-link" href="/teacher/review">
            Review
          </Link>
        </>
      )}
      {me.isTeacher && (
        <Link className="header-link" href="/teacher/people">
          People
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
