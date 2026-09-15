import Link from "next/link";
import { currentTeacher } from "@/lib/auth";
import { pendingInvites, roster, teamList } from "@/lib/roster";
import { InviteForm } from "./invite-form";
import { RosterTable } from "./roster-table";

export const metadata = { title: "People · hangukeo" };

export default async function TeacherPeople() {
  const me = await currentTeacher();
  const [people, teams, invites] = await Promise.all([
    roster(),
    teamList(),
    pendingInvites(),
  ]);

  const students = people.filter((p) => p.role === "student");
  const tas = people.filter((p) => p.role === "ta");

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">{me.displayName}</span>
        <h1>People &amp; invites</h1>
        <p>
          {students.length} students and {tas.length} TAs across {teams.length}{" "}
          teams. Invite someone by sending a magic link — only addresses on the
          allowlist can sign in.
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">
            Promoting a student to TA keeps their bank; they stop receiving new
            weekly assignments.
          </span>
          <Link className="btn secondary" href="/teacher/home">
            Class progress
          </Link>
        </div>

        <div className="stat-row">
          <Stat label="Students" value={students.length} />
          <Stat label="TAs" value={tas.length} />
          <Stat label="Teams" value={teams.length} />
          <Stat label="Pending invites" value={invites.length} />
        </div>

        <InviteForm teams={teams} />

        <h2 className="section-heading">Pending invites</h2>
        {invites.length === 0 ? (
          <p className="small">
            No unclaimed invites. Everyone on the allowlist has signed in.
          </p>
        ) : (
          <ul className="review-list">
            {invites.map((i) => (
              <li key={i.email}>
                <strong>{i.displayName ?? i.email}</strong>
                <span className="small">{i.email}</span>
                <span className="small">
                  invited {i.invitedAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}

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
