"use client";

import { useMemo, useState, useTransition } from "react";
import type { Role } from "@/db/schema";
import { viewAs } from "./actions";

type Person = {
  id: string;
  username: string;
  displayName: string;
  roles: Role[];
  lastSignInAt: string | null;
  createdAt: string;
  teamName: string | null;
  testsTaken: number;
  practiceRuns: number;
};

const ROLE_ORDER: Role[] = ["admin", "teacher", "ta", "student"];

function when(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return iso.slice(0, 10);
}

export function AdminRoster({
  people,
  meId,
  viewingId,
}: {
  people: Person[];
  meId: string;
  viewingId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (role !== "all" && !p.roles.includes(role)) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        (p.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [people, query, role]);

  return (
    <>
      <div className="teacher-toolbar">
        <input
          className="answer-input admin-search"
          type="search"
          value={query}
          placeholder="Search by name, username or team"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search accounts"
        />
        <div className="row-actions">
          <button
            type="button"
            className={`btn compact ${role === "all" ? "primary" : "secondary"}`}
            onClick={() => setRole("all")}
          >
            All ({people.length})
          </button>
          {ROLE_ORDER.map((r) => {
            const n = people.filter((p) => p.roles.includes(r)).length;
            if (n === 0) return null;
            return (
              <button
                key={r}
                type="button"
                className={`btn compact ${role === r ? "primary" : "secondary"}`}
                onClick={() => setRole(r)}
              >
                {r} ({n})
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="small">Nobody matches that.</p>
      ) : (
        <ul className="admin-list">
          {shown.map((p) => {
            const isMe = p.id === meId;
            const isViewing = p.id === viewingId;
            return (
              <li
                key={p.id}
                className={`admin-row ${isViewing ? "is-viewing" : ""}`}
              >
                <div className="admin-identity">
                  <strong>{p.displayName}</strong>
                  <span className="pill-stack">
                    {p.roles.map((r) => (
                      <span key={r} className={`pill pill-${r}`}>
                        {r}
                      </span>
                    ))}
                  </span>
                  <span className="small">
                    {p.username}
                    {p.teamName ? ` · ${p.teamName}` : ""}
                  </span>
                </div>

                <div className="small admin-facts">
                  last seen {when(p.lastSignInAt)} · {p.testsTaken} test
                  {p.testsTaken === 1 ? "" : "s"} · {p.practiceRuns} practice run
                  {p.practiceRuns === 1 ? "" : "s"}
                </div>

                <div className="row-actions">
                  {isMe ? (
                    <span className="small">This is you.</span>
                  ) : (
                    <button
                      type="button"
                      className={`btn compact ${isViewing ? "secondary" : "primary"}`}
                      disabled={busy === p.id}
                      onClick={() => {
                        setBusy(p.id);
                        startTransition(async () => {
                          await viewAs(p.id);
                          setBusy(null);
                        });
                      }}
                    >
                      {busy === p.id
                        ? "Opening…"
                        : isViewing
                          ? "Currently viewing"
                          : "View as"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
