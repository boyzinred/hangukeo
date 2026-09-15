"use client";

import { useState } from "react";
import type { TeamRow } from "@/lib/roster";

type Role = "student" | "ta" | "teacher";

/**
 * UI only. Nothing is sent and nothing is written — submitting shows exactly
 * what the wired-up version would do, so the shape can be reviewed without
 * pretending an email went out.
 */
export function InviteForm({ teams }: { teams: TeamRow[] }) {
  const [email, setEmail] = useState("jetskiiiiiii22@gmail.com");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [preview, setPreview] = useState<string | null>(null);

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "no team";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setPreview(
      `Would add ${email.trim() || "(no email)"} to the allowlist as ${
        name.trim() ? `${name.trim()}, ` : ""
      }${role === "ta" ? "a TA" : role === "teacher" ? "a teacher" : "a student"}` +
        `${role === "student" ? ` on ${teamName}` : ""}, then send a magic link.`,
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Invite someone</h2>
        <span className="small">
          Adds the address to the allowlist and emails a sign-in link
        </span>
      </div>

      <form className="panel-body invite-grid" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="answer-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">Display name (optional)</span>
          <input
            className="answer-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Left blank, they set it on first sign-in"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">Role</span>
          <select
            className="answer-input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="student">Student</option>
            <option value="ta">TA</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Team</span>
          <select
            className="answer-input"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={role !== "student"}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.memberCount} students
                {t.taName ? ` · TA ${t.taName}` : ""}
              </option>
            ))}
          </select>
          {role !== "student" && (
            <span className="field-note small">
              Only students are assigned to a team.
            </span>
          )}
        </label>

        <div className="field field-wide">
          <button className="btn primary" type="submit">
            Send magic link
          </button>
        </div>
      </form>

      {preview && (
        <p className="feedback neutral" role="status">
          <strong>Not wired up yet.</strong> {preview}
        </p>
      )}
    </section>
  );
}
