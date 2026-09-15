/**
 * Checks that roles are additive and that each role grants what it should.
 *
 * Creates a student who is also a TA, signs in as them, and asserts they reach
 * the class screens while keeping their own student bank. Cleans up after
 * itself. Run with `npm run check:roles` (dev server must be up).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { teamMembers, teams, users } from "./schema";
import {
  applyRolesAndTeam,
  createAccount,
  deleteAccount,
} from "../lib/accounts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(username: string, password: string) {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.username, username));
  if (!row) return { ok: false, cookies: "" };

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: row.email, password }),
    },
  );
  if (!res.ok) return { ok: false, cookies: "" };
  const session = await res.json();
  const value = Buffer.from(JSON.stringify(session)).toString("base64");
  return { ok: true, cookies: `sb-127-auth-token=base64-${value}` };
}

async function get(path: string, cookies: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookies ? { cookie: cookies } : {},
    redirect: "manual",
  });
  return res.status;
}

async function roleCount(role: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${role} = any(${users.roles})`);
  return n;
}

async function main() {
  const username = `rolecheck${Date.now().toString().slice(-5)}`;
  const [team] = await db.select().from(teams).limit(1);

  // Measured against a baseline rather than fixed totals: the roster changes
  // as accounts are created by hand, and a hardcoded count fails for that
  // rather than for anything real.
  const baseStudents = await roleCount("student");
  const baseTas = await roleCount("ta");

  console.log("student who is also a TA");
  const account = await createAccount({
    username,
    displayName: "Role Check",
    roles: ["student", "ta"],
    teamId: team.id,
  });

  const [row] = await db.select().from(users).where(eq(users.id, account.userId));
  expect("holds both roles", row.roles.length === 2 && row.roles.includes("student") && row.roles.includes("ta"), row.roles.join(","));

  const [member] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.studentId, account.userId));
  expect("keeps a team, unlike a TA-only account", member?.teamId === team.id);

  const s = await signIn(username, account.password);
  expect("can sign in", s.ok);
  expect("reaches /bank as a student", (await get("/bank", s.cookies)) === 200);
  expect("reaches /teacher/home as a TA", (await get("/teacher/home", s.cookies)) === 200);
  expect(
    "still blocked from /teacher/people",
    (await get("/teacher/people", s.cookies)) === 307,
  );

  // One person holding two roles is counted under both, not split between
  // them — which is what makes the teacher's totals add to more than the
  // roster size, deliberately.
  console.log("\ncounted under both roles");
  expect(
    "student count went up by one",
    (await roleCount("student")) === baseStudents + 1,
    `${await roleCount("student")} vs base ${baseStudents}`,
  );
  expect(
    "TA count went up by one as well",
    (await roleCount("ta")) === baseTas + 1,
    `${await roleCount("ta")} vs base ${baseTas}`,
  );

  // Roles and team are one action now, so the team is asserted through it
  // rather than through a separate move.
  console.log("\nteam moves with the roles action");
  const allTeams = await db.select().from(teams).orderBy(teams.name);
  const other = allTeams.find((t) => t.id !== team.id);
  if (other) {
    const res = await applyRolesAndTeam(
      account.userId,
      ["student", "ta"],
      other.id,
    );
    expect("move accepted", res.teamName === other.name, res.teamName ?? "none");

    const [moved] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.studentId, account.userId));
    expect("moved to the chosen team", moved?.teamId === other.id);
  }

  console.log("\ndropping the student role drops the team");
  // A team id is passed deliberately: it must be ignored, not applied.
  const dropped = await applyRolesAndTeam(account.userId, ["ta"], team.id);
  expect("team ignored for a non-student", dropped.teamName === null);

  const after = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.studentId, account.userId));
  expect("no longer on a team", after.length === 0);

  const [nowTaOnly] = await db
    .select()
    .from(users)
    .where(eq(users.id, account.userId));
  expect("roles reduced to TA", nowTaOnly.roles.length === 1 && nowTaOnly.roles[0] === "ta");

  await deleteAccount(account.userId);
  const gone = await db.select().from(users).where(eq(users.username, username));
  expect("cleaned up", gone.length === 0);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
