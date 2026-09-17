import { currentSession, realSession, viewingAs } from "@/lib/session";
import { ModeBadge, NavLinks } from "./nav-links";

/**
 * Header identity, shown beside the brand. `currentSession` is memoised per
 * render, so this and UserNav below share one query.
 */
export async function UserIdentity() {
  const me = await currentSession();
  if (!me) return null;
  const viewing = await viewingAs();

  return (
    <span
      className={`header-user ${viewing ? "is-viewing" : ""}`}
      title={
        viewing
          ? `${me.username} — viewed by ${viewing.admin.username}`
          : me.username
      }
    >
      <span className="header-user-name">{me.displayName}</span>
      <span className="pill-stack">
        {me.roles.map((r) => (
          <span key={r} className={`pill pill-${r}`}>
            {r}
          </span>
        ))}
        <ModeBadge isBoth={me.isStaff && me.isStudent} />
      </span>
    </span>
  );
}

/**
 * Navigation, by role. Home, Bank and Tests are a student's own screens,
 * so a teacher who is not also a student has no use for them and does not see
 * them — they are still reachable by URL for previewing what a student gets.
 *
 * Only the two places staff actually start from. People lives on Class and
 * reviewing lives on the test it belongs to, because both are things you go to
 * *about* something — a roster you are looking at, a test that has gone out —
 * rather than destinations in their own right. Five top-level links made the
 * two that matter harder to find.
 */
export async function UserNav() {
  const me = await currentSession();
  // The Admin link follows the real account, not the viewed one: an admin
  // reading a student's screen still needs the way back.
  const real = await realSession();

  if (!me) {
    return (
      <a className="header-link" href="/login">
        Sign in
      </a>
    );
  }

  return <NavLinks me={me} isAdmin={real?.isAdmin ?? false} />;
}
