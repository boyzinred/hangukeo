import Link from "next/link";
import { requireAccountAdmin } from "@/lib/session";
import { roster, teamList } from "@/lib/roster";
import { InviteForm } from "./invite-form";
import { RosterTable } from "./roster-table";

export const metadata = { title: "People · hangukeo" };

export default async function TeacherPeople() {
  const me = await requireAccountAdmin();
  const [people, teams] = await Promise.all([roster(), teamList()]);

  const students = people.filter((p) => p.roles.includes("student"));
  const tas = people.filter((p) => p.roles.includes("ta"));
  const neverSignedIn = people.filter((p) => !p.lastSignInAt).length;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">{me.displayName}</span>
        <h1>People</h1>
        <p>
          {students.length} students and {tas.length} TAs across {teams.length}{" "}
          teams. Accounts are created here and signed into with a username and
          password — there is no email anywhere in the flow.
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">
            Promoting a student to TA keeps their bank; they stop receiving new
            weekly assignments.
          </span>
          {/* An admin is turned away from the class screens — they reach
              those by viewing as a teacher — so pointing them at one would be
              a link that only ever bounces. */}
          <Link
            className="btn secondary"
            href={me.isTeacher ? "/teacher/home" : "/admin"}
          >
            {me.isTeacher ? "Class progress" : "All accounts"}
          </Link>
        </div>

        <div className="stat-row">
          <Stat label="Students" value={students.length} />
          <Stat label="TAs" value={tas.length} />
          <Stat label="Teams" value={teams.length} />
          <Stat label="Never signed in" value={neverSignedIn} />
        </div>

        <InviteForm teams={teams} />

        <h2 className="section-heading">Roster</h2>
        <RosterTable people={people} teams={teams} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
