# hangukeo

Korean vocabulary and grammar tracker for one classroom. Words and grammar are
assigned from a merged TOPIK corpus on a weekly schedule, students drill them,
and a weekly test measures what stuck.

## Local development

Requires Docker (for the Supabase stack) and Node.

```bash
cp .env.example .env.local
npm install
npm run db:start       # local Supabase: Postgres :54322, Studio :54323
npm run db:migrate
npm run db:seed        # corpus, 15 students in 3 teams, full semester plan
npm run db:seed:auth   # sign-in accounts, one shared dev password (local only)
npm run dev
```

Useful checks:

```bash
npm run db:check          # semester plan, teams, and today's bank
npm run db:check:schema   # tables and row counts (prints the host first)
npm run check:quiz        # 22 assertions over the drill logic
npm run check:auth        # sign-in, role gates, accounts (dev server up)
npm run check:practice    # practice save path
```

## The corpus

`npm run build:corpus` merges the source material from the sibling `korean`
repository into `src/corpus/data/`, which is committed so the app never reads
that repo at runtime.

| Source | Contributes |
| --- | --- |
| `topik-vocab-2000.js` | 2,000 TOPIK I words with study-day slots |
| `shared-vocab.json` | 1,841 words with lesson mapping (levels 1-2 kept) |
| `tutoring-topik-i-grammar.html` | 32 TOPIK I grammar points |
| `tutoring-topik-ii-level-3-grammar.html` | 20 level-3 grammar points |

Result: **2,947 vocabulary entries and 52 grammar points**, no romanization —
this site is strictly Korean/English.

Merging rules worth knowing:

- Two glosses for the same headword that share a content word are the **same
  word**; both glosses become accepted answers and the shorter one displays.
- Glosses sharing nothing are **homographs** and stay separate, so 저 exists
  once as a pronoun ("I") and once as a determiner ("that over there").
- 13 part-of-speech disagreements between sources are flagged by the build for
  a one-time review.

## The semester plan

`npm run db:seed` lays the corpus out across the term: **13 weeks, 125 words and
4 grammar points per week**, 1,625 words and all 52 patterns in total.

Ordering is **level first, then the curated day sequence**. This matters: the
TOPIK 2000 list interleaves levels inside its own day ordering, so following it
directly opens week 1 with 갈등 (conflict) and 경제 (economy) while 물 and 먹다
wait until December. Sorting by level gives weeks 1-7 at level 1 and weeks 8-13
at level 2.

Assignment is uniform across the cohort, so a plan is class-level and a
student's bank is every plan up to the current week. Per-student divergence
would mean adding `student_id` to `week_plans`; nothing else would change.

## How progress is measured

Two vocabulary numbers, deliberately separate:

- **Studied** — the student got the word right first time in self-directed
  practice at least once. This is what the 1,500-word goal is measured against.
- **Verified** — correct on two distinct tests, most recent answer correct.
  Proctored, and much smaller.

The split exists because a weekly test can only ask about ~20 words while 125
are assigned. Certifying every word by test would need a 125-question sitting
twice over; measuring the goal by test alone puts it out of reach by roughly
ten times. So practice tracks coverage, tests verify a sample, and **retention**
(accuracy on words that appeared on an earlier test) is what says whether the
studied number is real.

`MASTERY_CORRECT_TESTS` in `src/lib/mastery.ts` sets the verified threshold.
Practice writes per-word rows to `practice_responses`; those feed studied only,
never verified.

## Auth

Username and password, issued by the teacher. **No email anywhere** — not for
sign-in, not for resets, not for verification. That removes the dependency on
a mail provider and a purchased sending domain entirely.

Supabase Auth still does the work (hashing, sessions, rate limiting), so each
person gets a synthetic address on `hangukeo.invalid` — a domain reserved by
RFC 2606 precisely so it can never resolve, making an accidental send
impossible rather than merely unlikely. Students never see it; they type a
username, which is resolved to the address server-side.

**Passwords are generated, not chosen.** `src/lib/password.ts` emits
passphrases like `amber-tiger-quiet-47`: four words from a 128-word list plus
two digits, ~34.5 bits. That is weak against an offline attack on a stolen
hash and strong against guessing at a login form, which is the only threat
here. The shape matters as much as the entropy — these get read off a screen
and typed on a phone, and `xK7#mQ2$vL` does not survive that trip.

The password is shown **once**, when the account is created or reset. Supabase
stores only a hash, so there is nowhere to read it back from; the UI says so
rather than implying it can be recovered. Lost passwords are replaced from the
roster, not recovered.

**Where authorization actually happens.** Drizzle connects as `postgres`,
which has `BYPASSRLS`, so database policies never constrain our queries. Every
real check lives in `src/lib/session.ts` (`requireSession`, `requireStaff`,
`requireTeacher`) and is called from the server component or server action
that touches the data. `src/proxy.ts` — Next 16's renamed Middleware; a
`middleware.ts` here would never run — only refreshes the session cookie and
bounces signed-out visitors, which is the optimistic check the Next.js docs
allow and nothing more.

RLS is enabled on all 16 tables with no policies (`0003_rls_lockout.sql`).
That is not our authorization layer; it locks the tables out of Supabase's
auto-generated REST API, which is exposed on the anon key and would otherwise
serve every student's results if anyone ever granted table privileges.

`src/lib/accounts.ts` holds the service key and can do anything, so it checks
nothing itself — the teacher-only server actions establish the caller first,
then delegate. Creating an account rolls back the auth user if the roster row
fails, so nobody can sign in to a session the app cannot resolve.

## Schema ownership

Drizzle owns the schema. `src/db/schema.ts` is the source of truth,
`npm run db:generate` writes a migration, `npm run db:migrate` applies it.
Supabase supplies Postgres, Auth, and Studio — `supabase db push` is unused.

The cloud target is separate on purpose: `.env.cloud.local` is read only by
`npm run db:migrate:cloud`, and there is deliberately no `db:seed:cloud`,
because the seed opens with `TRUNCATE ... CASCADE`.

## Not built yet

The weekly test, the student dashboard, and the weekly report. Teacher invite,
promote/demote and team moves are wired; the cloud database still has the
pre-rework schema.
