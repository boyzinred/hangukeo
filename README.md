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
npm run dev
```

Useful checks:

```bash
npm run db:check          # semester plan, teams, and today's bank
npm run db:check:schema   # tables and row counts (prints the host first)
npm run check:quiz        # 22 assertions over the drill logic
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

## Schema ownership

Drizzle owns the schema. `src/db/schema.ts` is the source of truth,
`npm run db:generate` writes a migration, `npm run db:migrate` applies it.
Supabase supplies Postgres, Auth, and Studio — `supabase db push` is unused.

The cloud target is separate on purpose: `.env.cloud.local` is read only by
`npm run db:migrate:cloud`, and there is deliberately no `db:seed:cloud`,
because the seed opens with `TRUNCATE ... CASCADE`.

## Not built yet

Auth is a stub (`src/lib/auth.ts` resolves the first seeded student). Magic-link
signup against the allowlist, the weekly test, dashboards, and analytics are the
next phases.
