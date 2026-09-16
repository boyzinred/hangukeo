import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { requireAdmin, viewingAs } from "@/lib/session";
import { AdminRoster } from "./admin-roster";

export const metadata = { title: "Admin · hangukeo" };

/**
 * Every account on the site, and a way into each one.
 *
 * The roster screen at /teacher/people is about running a class — creating
 * accounts, issuing passwords, assigning teams. This is about support: who
 * exists, whether they have ever signed in, and what the site looks like from
 * where they sit.
 */
export default async function AdminPage() {
  const me = await requireAdmin();
  const viewing = await viewingAs();

  const people = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      roles: users.roles,
      lastSignInAt: users.lastSignInAt,
      createdAt: users.createdAt,
      teamName: teams.name,
      testsTaken: sql<number>`(select count(*) from attempts a where a.student_id = ${users.id} and a.state = 'submitted')::int`,
      practiceRuns: sql<number>`(select count(*) from practice_runs p where p.student_id = ${users.id})::int`,
    })
    .from(users)
    .leftJoin(teamMembers, sql`${teamMembers.studentId} = ${users.id}`)
    .leftJoin(teams, sql`${teams.id} = ${teamMembers.teamId}`)
    .orderBy(asc(users.displayName));

  const neverSignedIn = people.filter((p) => !p.lastSignInAt).length;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">Admin · {me.displayName}</span>
        <h1>All accounts</h1>
        <p>
          {people.length} account{people.length === 1 ? "" : "s"}
          {neverSignedIn > 0 && `, ${neverSignedIn} never signed in`}. Open one
          to browse the site exactly as they see it — you stay signed in as
          yourself, and everything you do is still yours.
        </p>
      </section>

      <div className="section-body">
        <AdminRoster
          people={people.map((p) => ({
            ...p,
            lastSignInAt: p.lastSignInAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
          }))}
          meId={me.userId}
          viewingId={viewing?.as.userId ?? null}
        />
      </div>
    </main>
  );
}
