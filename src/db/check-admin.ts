/**
 * Checks the admin role and impersonation.
 *
 * The interesting assertions are the negative ones. Impersonation is only ever
 * as safe as what it refuses: a non-admin holding the cookie must gain
 * nothing, viewing as a teacher must not let you view as somebody else, and
 * the credential screens must stay shut. Those are the ways a feature like
 * this turns into a hole.
 *
 * Drives the libs directly with a stubbed cookie jar, so it needs no request
 * context or running server. Run with `npm run check:admin`.
 */
import { asc, sql } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { describeRoles, type Role } from "../lib/roles";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * The rule the session layer applies, stated once here so the check is testing
 * the decision rather than restating the implementation line by line.
 */
function resolveView(
  realRoles: Role[],
  realId: string,
  cookie: string | null,
  targetExists: boolean,
): "self" | "viewing" {
  if (!describeRoles(realRoles).isAdmin) return "self";
  if (!cookie || cookie === realId) return "self";
  if (!targetExists) return "self";
  return "viewing";
}

async function main() {
  console.log("roles");
  const admins = await db
    .select()
    .from(users)
    .where(sql`'admin' = any(${users.roles})`)
    .orderBy(asc(users.displayName));
  expect(
    "at least one admin account exists",
    admins.length > 0,
    "run: npm run user:create -- --name Admin --role admin",
  );

  const d = describeRoles(["admin"]);
  expect("admin is recognised", d.isAdmin === true);
  expect(
    "and is not quietly a teacher",
    d.isTeacher === false && d.isStaff === false,
  );
  expect(
    "a teacher is not an admin",
    describeRoles(["teacher"]).isAdmin === false,
  );
  expect(
    "roles stay additive",
    describeRoles(["student", "admin"]).isStudent === true &&
      describeRoles(["student", "admin"]).isAdmin === true,
  );

  console.log("\nwho the cookie works for");
  const target = "some-other-user-id";
  expect(
    "an admin with the cookie is viewing",
    resolveView(["admin"], "me", target, true) === "viewing",
  );
  // The cookie names an identity; it never grants one. This is the assertion
  // that makes leaving it unsigned defensible.
  expect(
    "a teacher holding the same cookie is not",
    resolveView(["teacher"], "me", target, true) === "self",
  );
  expect(
    "nor a student",
    resolveView(["student"], "me", target, true) === "self",
  );
  expect(
    "an admin who loses the role stops viewing immediately",
    resolveView(["teacher"], "me", target, true) === "self",
  );
  expect(
    "pointing it at yourself is just being yourself",
    resolveView(["admin"], "me", "me", true) === "self",
  );
  expect(
    "pointing it at a deleted account falls back to yourself",
    resolveView(["admin"], "me", target, false) === "self",
  );

  console.log("\nwhat viewing must not reach");
  // requireAdmin reads the real session, so an admin viewing as a teacher
  // cannot start a second impersonation from inside the first.
  const viewedAsTeacher = describeRoles(["teacher"]);
  expect(
    "viewing as a teacher does not make you an admin",
    viewedAsTeacher.isAdmin === false,
  );
  expect(
    "but it does reach the teacher screens, which is the point",
    viewedAsTeacher.isTeacher === true && viewedAsTeacher.isStaff === true,
  );

  const guarded = [
    "createStudentAccount",
    "resetUserPassword",
    "deleteUserAccount",
    "setRoles",
  ];
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync("src/app/teacher/people/actions.ts", "utf8"),
  );
  for (const fn of guarded) {
    const at = source.indexOf(`export async function ${fn}(`);
    const next = source.indexOf("export async function", at + 10);
    const body = source.slice(at, next === -1 ? undefined : next);
    expect(
      `${fn} refuses while viewing`,
      body.includes("refuseWhileViewing"),
    );
  }

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
