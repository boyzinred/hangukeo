import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { currentSession } from "@/lib/session";

/**
 * Header identity and navigation. Rendered on every page including /login,
 * so it must tolerate having no session.
 */
export async function UserChip() {
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
      <Link className="header-link" href="/bank">
        Bank
      </Link>
      <Link className="header-link" href="/practice">
        Practice
      </Link>
      {me.isStaff && (
        <Link className="header-link" href="/teacher/home">
          Class
        </Link>
      )}
      {me.isTeacher && (
        <Link className="header-link" href="/teacher/people">
          People
        </Link>
      )}
      <span className="header-user" title={me.username}>
        {me.displayName}
        <span className="pill-stack">
          {me.roles.map((r) => (
            <span key={r} className={`pill pill-${r}`}>
              {r}
            </span>
          ))}
        </span>
      </span>
      <form action={signOut}>
        <button className="header-link" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}
