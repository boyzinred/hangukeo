import Link from "next/link";
import { stopViewing } from "@/app/admin/actions";
import { viewingAs } from "@/lib/session";

/**
 * The reminder that you are not who the page thinks you are.
 *
 * Above the header rather than inside it, and in a colour nothing else on the
 * site uses. The failure mode this exists to prevent is an admin forgetting —
 * reading a student's screen, drawing a conclusion, and reporting it as their
 * own view of the site. A subtle indicator would be worse than none, because
 * it would look like the question had been handled.
 */
export async function ViewingBanner() {
  const viewing = await viewingAs();
  if (!viewing) return null;

  return (
    <div className="viewing-banner" role="status">
      <span className="viewing-text">
        Viewing as <strong>{viewing.as.displayName}</strong>
        <span className="pill-stack">
          {viewing.as.roles.map((r) => (
            <span key={r} className={`pill pill-${r}`}>
              {r}
            </span>
          ))}
        </span>
        <span className="viewing-who">
          You are still signed in as {viewing.admin.displayName}.
        </span>
      </span>
      <span className="viewing-actions">
        <Link className="btn secondary compact" href="/admin">
          All accounts
        </Link>
        <form action={stopViewing}>
          <button className="btn primary compact" type="submit">
            Stop viewing
          </button>
        </form>
      </span>
    </div>
  );
}
