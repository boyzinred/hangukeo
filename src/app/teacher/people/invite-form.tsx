"use client";

import { useState, useTransition } from "react";
import type { TeamRow } from "@/lib/roster";
import {
  createStudentAccount,
  proposeUsername,
  type ActionResult,
  type Role,
} from "./actions";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "student", label: "Student", hint: "Gets the weekly assignment" },
  { value: "ta", label: "TA", hint: "Sees the class progress screens" },
  { value: "teacher", label: "Teacher", hint: "Manages accounts and roles" },
];

/**
 * Creates a sign-in account. The generated password is shown once, here, and
 * is not recoverable afterwards — only replaceable. That is a consequence of
 * Supabase storing a hash: there is nowhere to read it back from, so the UI
 * has to make clear it must be copied now.
 */
export function InviteForm({ teams }: { teams: TeamRow[] }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [roles, setRoles] = useState<Role[]>(["student"]);
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isStudent = roles.includes("student");

  // The username is derived, never typed: it is what a student has to remember,
  // and letting it drift from the display name makes the roster harder to read.
  function onNameBlur() {
    if (!name.trim()) return;
    startTransition(async () => setUsername(await proposeUsername(name)));
  }

  function toggleRole(role: Role) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("displayName", name);
    fd.set("username", username);
    roles.forEach((r) => fd.append("roles", r));
    fd.set("teamId", isStudent ? teamId : "");
    setCopied(false);
    startTransition(async () => {
      const res = await createStudentAccount(fd);
      setResult(res);
      if (res.ok) {
        setName("");
        setUsername("");
        setRoles(["student"]);
      }
    });
  }

  const credential = result?.ok ? result.credential : undefined;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Create an account</h2>
        <span className="small">
          Generates a password to hand over — no email involved
        </span>
      </div>

      <form className="panel-body invite-grid" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Display name</span>
          <input
            className="answer-input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onNameBlur}
            placeholder="Yuna"
            autoComplete="off"
          />
        </label>

        <div className="field">
          <span className="field-label">Username</span>
          <output className="answer-input readonly-value">
            {username || <span className="placeholder">from the name</span>}
          </output>
          <span className="field-note small">
            What they type to sign in. Derived from the name.
          </span>
        </div>

        <fieldset className="field">
          <legend className="field-label">Roles</legend>
          <div className="check-row">
            {ROLE_OPTIONS.map((r) => (
              <label key={r.value} className="check" title={r.hint}>
                <input
                  type="checkbox"
                  checked={roles.includes(r.value)}
                  onChange={() => toggleRole(r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>
          <span className="field-note small">
            Roles add up — a student can also be a TA.
          </span>
        </fieldset>

        <label className="field">
          <span className="field-label">Team</span>
          <select
            className="answer-input"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={!isStudent}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.memberCount} students
                {t.taName ? ` · TA ${t.taName}` : ""}
              </option>
            ))}
          </select>
          {!isStudent && (
            <span className="field-note small">
              Only students are assigned to a team.
            </span>
          )}
        </label>

        <div className="field field-wide">
          <button
            className="btn primary"
            type="submit"
            disabled={isPending || roles.length === 0}
          >
            {isPending ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>

      {credential && (
        <div className="credential">
          <p className="credential-head">
            Copy this now — it cannot be shown again, only replaced.
          </p>
          <dl className="credential-grid">
            <dt>Username</dt>
            <dd>{credential.username}</dd>
            <dt>Password</dt>
            <dd className="credential-password">{credential.password}</dd>
          </dl>
          <button
            type="button"
            className="btn secondary compact"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${credential.username} / ${credential.password}`)
                .then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy username and password"}
          </button>
        </div>
      )}

      {result && !credential && (
        <p
          className={`feedback ${result.ok ? "good" : "bad"}`}
          role="status"
          style={{ margin: 0, borderRadius: 0 }}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}
    </section>
  );
}
