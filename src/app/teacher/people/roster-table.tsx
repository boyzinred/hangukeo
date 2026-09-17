"use client";

import { useState, useTransition } from "react";
import type { RosterRow, TeamRow } from "@/lib/roster";
import {
  deleteUserAccount,
  fetchAccountImpact,
  resetUserPassword,
  setRoles,
  type AccountImpact,
  type ActionResult,
  type Role,
} from "./actions";

const ROLE_LABEL: Record<Role, string> = {
  teacher: "Teacher",
  ta: "TA",
  student: "Student",
  admin: "Admin",
};
// Admin is absent on purpose: it is support access to every account, not a
// classroom role, so it is granted from the command line rather than from a
// dropdown on the roster.
const ALL_ROLES: Role[] = ["student", "ta", "teacher"];

type Panel =
  | { kind: "credential"; username: string; password: string; note: string }
  | { kind: "delete"; impact: AccountImpact | null; error?: string }
  | { kind: "roles"; error?: string }
  | { kind: "error"; message: string };

/**
 * Roster with per-row panels. Results and confirmations appear directly under
 * the person they concern rather than in a banner at the top — with 19 rows,
 * a message up there is too far from the button that caused it to be trusted.
 *
 * One panel is open at a time. Every panel closes the same three ways: the X,
 * Escape, or clicking the button that opened it.
 */
export function RosterTable({
  people,
  teams,
}: {
  people: RosterRow[];
  teams: TeamRow[];
}) {
  const [filter, setFilter] = useState<"all" | Role>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [banner, setBanner] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const rows = people.filter(
    (p) => filter === "all" || p.roles.includes(filter),
  );

  function close() {
    setOpenId(null);
    setPanel(null);
  }

  /** Clicking the button that opened a panel closes it again. */
  function toggle(id: string, next: Panel, after?: () => void) {
    setBanner(null);
    if (openId === id && panel?.kind === next.kind) {
      close();
      return;
    }
    setOpenId(id);
    setPanel(next);
    after?.();
  }

  function runReset(p: RosterRow) {
    if (openId === p.id && panel?.kind === "credential") {
      close();
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", p.id);
      const res = await resetUserPassword(fd);
      setOpenId(p.id);
      setPanel(
        res.ok && res.credential
          ? {
              kind: "credential",
              username: res.credential.username,
              password: res.credential.password,
              note: `New password for ${p.displayName}`,
            }
          : { kind: "error", message: res.ok ? res.message : res.error },
      );
    });
  }

  function openDelete(p: RosterRow) {
    toggle(p.id, { kind: "delete", impact: null }, () => {
      startTransition(async () => {
        setPanel({ kind: "delete", impact: await fetchAccountImpact(p.id) });
      });
    });
  }

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
              : `${ROLE_LABEL[f]}s (${people.filter((p) => p.roles.includes(f)).length})`}
          </button>
        ))}
      </div>

      {banner && (
        <p className={`feedback ${banner.ok ? "good" : "bad"}`} role="status">
          {banner.ok ? banner.message : banner.error}
        </p>
      )}

      <div className="table-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Roles</th>
              <th>Team</th>
              <th>Signed in</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <RosterRowView
                key={p.id}
                p={p}
                teams={teams}
                isPending={isPending}
                open={openId === p.id}
                panel={openId === p.id ? panel : null}
                onReset={() => runReset(p)}
                onRoles={() => toggle(p.id, { kind: "roles" })}
                onDelete={() => openDelete(p)}
                onClose={close}
                onResult={setBanner}
                setPanel={setPanel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RosterRowView({
  p,
  teams,
  isPending,
  open,
  panel,
  onReset,
  onRoles,
  onDelete,
  onClose,
  onResult,
  setPanel,
}: {
  p: RosterRow;
  teams: TeamRow[];
  isPending: boolean;
  open: boolean;
  panel: Panel | null;
  onReset: () => void;
  onRoles: () => void;
  onDelete: () => void;
  onClose: () => void;
  onResult: (r: ActionResult) => void;
  setPanel: (p: Panel | null) => void;
}) {
  const isOpen = (kind: Panel["kind"]) => open && panel?.kind === kind;

  return (
    <>
      <tr className={open ? "row-open" : undefined}>
        <td>{p.displayName}</td>
        <td className="small">{p.username}</td>
        <td>
          <span className="pill-stack">
            {p.roles.map((r) => (
              <span key={r} className={`pill pill-${r}`}>
                {ROLE_LABEL[r]}
              </span>
            ))}
          </span>
        </td>
        <td className="small">{p.teamName ?? "—"}</td>
        <td className="small">
          {p.lastSignInAt ? (
            p.lastSignInAt.toISOString().slice(0, 10)
          ) : (
            <span className="never">never</span>
          )}
        </td>
        <td className="row-actions">
          <button
            type="button"
            className="btn secondary compact"
            disabled={isPending}
            aria-expanded={isOpen("roles")}
            onClick={onRoles}
          >
            Roles &amp; team
          </button>
          <button
            type="button"
            className="btn secondary compact"
            disabled={isPending}
            aria-expanded={isOpen("credential")}
            onClick={onReset}
          >
            {p.lastSignInAt ? "Reset password" : "Issue password"}
          </button>
          <button
            type="button"
            className="btn danger compact"
            disabled={isPending}
            aria-expanded={isOpen("delete")}
            onClick={onDelete}
          >
            Delete
          </button>
        </td>
      </tr>

      {open && panel && (
        <tr className="panel-row">
          <td colSpan={6}>
            {panel.kind === "credential" && (
              <CredentialPanel panel={panel} onClose={onClose} />
            )}
            {panel.kind === "roles" && (
              <RolesPanel
                p={p}
                teams={teams}
                error={panel.error}
                isPending={isPending}
                onClose={onClose}
                onResult={onResult}
                setPanel={setPanel}
              />
            )}
            {panel.kind === "delete" && (
              <DeletePanel
                p={p}
                impact={panel.impact}
                error={panel.error}
                isPending={isPending}
                onClose={onClose}
                setPanel={setPanel}
              />
            )}
            {panel.kind === "error" && (
              <PanelShell tone="bad" title="Could not do that" onClose={onClose}>
                <p>{panel.message}</p>
              </PanelShell>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Every panel gets the same dismiss control in the same place, so closing one
 * never means hunting for a different button.
 */
function PanelShell({
  tone,
  title,
  onClose,
  children,
}: {
  tone: "neutral" | "good" | "bad";
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`inline-panel tone-${tone}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="inline-panel-bar">
        <p className="inline-panel-head">{title}</p>
        <button
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label={`Close: ${title}`}
          title="Close"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

function CredentialPanel({
  panel,
  onClose,
}: {
  panel: Extract<Panel, { kind: "credential" }>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <PanelShell tone="good" title={panel.note} onClose={onClose}>
      <p>Copy this now — it cannot be shown again, only replaced.</p>
      <dl className="credential-grid">
        <dt>Username</dt>
        <dd>{panel.username}</dd>
        <dt>Password</dt>
        <dd className="credential-password">{panel.password}</dd>
      </dl>
      <div className="row-actions">
        <button
          type="button"
          className="btn secondary compact"
          onClick={() => {
            void navigator.clipboard
              .writeText(`${panel.username} / ${panel.password}`)
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy username and password"}
        </button>
        <button type="button" className="btn secondary compact" onClick={onClose}>
          Done
        </button>
      </div>
    </PanelShell>
  );
}

function RolesPanel({
  p,
  teams,
  error,
  isPending,
  onClose,
  onResult,
  setPanel,
}: {
  p: RosterRow;
  teams: TeamRow[];
  error?: string;
  isPending: boolean;
  onClose: () => void;
  onResult: (r: ActionResult) => void;
  setPanel: (panel: Panel | null) => void;
}) {
  const [picked, setPicked] = useState<Role[]>(p.roles);
  const [teamId, setTeamId] = useState(p.teamId ?? teams[0]?.id ?? "");
  const isStudent = picked.includes("student");

  const rolesChanged =
    picked.length !== p.roles.length ||
    picked.some((r) => !p.roles.includes(r));
  const teamChanged = isStudent && teamId !== (p.teamId ?? "");
  const changed = rolesChanged || teamChanged;

  return (
    <PanelShell
      tone="neutral"
      title={`Roles & team — ${p.displayName}`}
      onClose={onClose}
    >
      <p className="small">
        Roles add up. Someone who is both a student and a TA keeps their weekly
        assignment and their team, and also sees the class screens.
      </p>

      <div className="check-row" style={{ marginTop: 10 }}>
        {ALL_ROLES.map((r) => (
          <label key={r} className="check">
            <input
              type="checkbox"
              checked={picked.includes(r)}
              onChange={() =>
                setPicked((prev) =>
                  prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
                )
              }
            />
            {ROLE_LABEL[r]}
          </label>
        ))}
      </div>

      <label className="field" style={{ maxWidth: 340, marginTop: 14 }}>
        <span className="field-label">Team</span>
        <select
          className="answer-input"
          value={teamId}
          disabled={!isStudent}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.memberCount} students
              {t.taName ? ` · TA ${t.taName}` : ""}
            </option>
          ))}
        </select>
      </label>

      {!isStudent && p.roles.includes("student") && (
        <p className="small" style={{ marginTop: 8 }}>
          Removing the student role also removes them from{" "}
          {p.teamName ?? "their team"}.
        </p>
      )}
      {!isStudent && !p.roles.includes("student") && (
        <p className="small" style={{ marginTop: 8 }}>
          Only students belong to a team.
        </p>
      )}

      {error && (
        <p className="feedback bad" role="status">
          {error}
        </p>
      )}

      <div className="row-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn primary compact"
          disabled={!changed || picked.length === 0 || isPending}
          onClick={() => {
            const fd = new FormData();
            fd.set("userId", p.id);
            picked.forEach((r) => fd.append("roles", r));
            if (isStudent) fd.set("teamId", teamId);
            void setRoles(fd).then((res) => {
              if (res.ok) {
                setPanel(null);
                onResult(res);
              } else {
                setPanel({ kind: "roles", error: res.error });
              }
            });
          }}
        >
          Save
        </button>
        <button type="button" className="btn secondary compact" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PanelShell>
  );
}

function DeletePanel({
  p,
  impact,
  error,
  isPending,
  onClose,
  setPanel,
}: {
  p: RosterRow;
  impact: AccountImpact | null;
  error?: string;
  isPending: boolean;
  onClose: () => void;
  setPanel: (panel: Panel | null) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim().toLowerCase() === p.username.toLowerCase();

  const losses = impact
    ? (
        [
          [impact.testAttempts, "test attempt"],
          [impact.testAnswers, "test answer"],
          [impact.practiceRuns, "practice run"],
          [impact.practiceAnswers, "practice answer"],
          [impact.weeklyReports, "weekly report"],
        ] as [number, string][]
      ).filter(([n]) => n > 0)
    : [];

  return (
    <PanelShell
      tone="bad"
      title={`Delete ${p.displayName} permanently?`}
      onClose={onClose}
    >
      {impact === null ? (
        <p className="small">Checking what this would remove…</p>
      ) : (
        <>
          <p>
            This deletes their sign-in account and{" "}
            {losses.length === 0 ? (
              <strong>no results — they have none yet</strong>
            ) : (
              <strong>
                {losses
                  .map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`)
                  .join(", ")}
              </strong>
            )}
            . There is no undo and no backup.
          </p>
          {impact.teamsLedAsTa > 0 && (
            <p>
              They are the TA for {impact.teamsLedAsTa} team
              {impact.teamsLedAsTa === 1 ? "" : "s"}, which will be left without
              one. The students stay.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="feedback bad" role="status">
          {error}
        </p>
      )}

      <label className="field" style={{ maxWidth: 320, marginTop: 12 }}>
        <span className="field-label">
          Type <code>{p.username}</code> to confirm
        </span>
        <input
          className="answer-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={p.username}
        />
      </label>

      <div className="row-actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn danger"
          disabled={!matches || isPending || impact === null}
          onClick={() => {
            const fd = new FormData();
            fd.set("userId", p.id);
            fd.set("confirm", confirm);
            void deleteUserAccount(fd).then((res) => {
              if (res.ok) setPanel(null);
              else setPanel({ kind: "delete", impact, error: res.error });
            });
          }}
        >
          Delete permanently
        </button>
        <button type="button" className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PanelShell>
  );
}
