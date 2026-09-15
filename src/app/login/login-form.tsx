"use client";

import { useState, useTransition } from "react";
import { signIn, type LoginResult } from "./actions";

export function LoginForm() {
  const [result, setResult] = useState<LoginResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // A successful sign-in redirects, so anything returned is a failure.
    startTransition(async () => setResult(await signIn(fd)));
  }

  return (
    <section className="panel login-panel">
      <div className="panel-head">
        <h2>Sign in</h2>
      </div>
      <form className="panel-body" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Username</span>
          <input
            className="answer-input"
            name="username"
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="yuna"
          />
        </label>
        <label className="field" style={{ marginTop: 14 }}>
          <span className="field-label">Password</span>
          <input
            className="answer-input"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="amber-tiger-quiet-47"
          />
        </label>
        <div style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>

      {result && (
        <p
          className="feedback bad"
          role="status"
          style={{ margin: 0, borderRadius: 0 }}
        >
          {result.error}
        </p>
      )}
    </section>
  );
}
