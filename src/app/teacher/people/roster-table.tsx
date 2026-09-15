"use client";

import { useState } from "react";
import type { RosterRow, TeamRow } from "@/lib/roster";

const ROLE_LABEL: Record<RosterRow["role"], string> = {
  teacher: "Teacher",
  ta: "TA",
  student: "Student",
};

/**
 * UI only — promote/demote and team moves show what would happen rather than
 * writing anything.
 */
export function RosterTable({
  people,
  teams,
}: {
  people: RosterRow[];
  teams: TeamRow[];
}) {
  const [filter, setFilter] = useState<"all" | RosterRow["role"]>("all");
  const [note, setNote] = useState<string | null>(null);

  const rows = people.filter((p) => filter === "all" || p.role === filter);

  return (
    <>
      <div className="mode-row">
        <span className="mode-label">Show</span>
        {(["all", "student", "ta", "teacher"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`mode-btn ${filter === f ? "active" : ""}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? `Everyone (${people.length})`
              : `${ROLE_LABEL[f]}s (${people.filter((p) => p.role === f).length})`}
          </button>
        ))}
      </div>

      {note && (
        <p className="feedback neutral" role="status">
          <strong>Not wired up yet.</strong> {note}
        </p>
      )}

      <div className="table-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.displayName}</td>
                <td className="small">{p.email}</td>
                <td>
                  <span className={`pill pill-${p.role}`}>
                    {ROLE_LABEL[p.role]}
                  </span>
                </td>
                <td className="small">{p.teamName ?? "—"}</td>
                <td className="row-actions">
                  {p.role === "student" && (
                    <button
                      type="button"
                      className="btn secondary compact"
                      onClick={() =>
                        setNote(`Would promote ${p.displayName} to TA.`)
                      }
                    >
                      Promote to TA
                    </button>
                  )}
                  {p.role === "ta" && (
                    <button
                      type="button"
                      className="btn secondary compact"
                      onClick={() =>
                        setNote(`Would demote ${p.displayName} to student.`)
                      }
                    >
                      Demote
                    </button>
                  )}
                  {p.role === "student" && (
                    <select
                      className="answer-input compact-select"
                      value={p.teamId ?? ""}
                      onChange={(e) => {
                        const t = teams.find((x) => x.id === e.target.value);
                        setNote(
                          `Would move ${p.displayName} to ${t?.name ?? "no team"}.`,
                        );
                      }}
                      aria-label={`Team for ${p.displayName}`}
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
