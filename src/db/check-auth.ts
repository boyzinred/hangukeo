/**
 * End-to-end auth check against the running dev server.
 *
 * Signs in with real usernames and passwords through the app's own login
 * action, then asserts what each identity can reach. Stands in for a browser
 * click-through. Run with `npm run check:auth` (dev server must be up, and
 * `npm run db:seed:auth` must have created the accounts).
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { createAccount, deleteAccount } from "../lib/accounts";
import { generatePassword, isValidUsername } from "../lib/password";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DEV_PASSWORD = "hangukeo-dev-password-42";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Posts to the login page the way the browser does. Next server actions need
 * the action id, so this drives the underlying Supabase call through a page
 * request instead: sign in via the REST endpoint, then carry the cookies.
 */
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

  const session = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };

  // @supabase/ssr stores the session as a base64- prefixed JSON cookie.
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port
    ? "127"
    : new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const value = Buffer.from(JSON.stringify(session)).toString("base64");
  return { ok: true, cookies: `sb-${ref}-auth-token=base64-${value}` };
}

async function get(path: string, cookies: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookies ? { cookie: cookies } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

async function main() {
  console.log(`checking ${BASE}\n`);

  console.log("password generator");
  const a = generatePassword();
  const b = generatePassword();
  expect("generates distinct passwords", a !== b, `${a} / ${b}`);
  expect("word-and-digit shape", /^[a-z]+(-[a-z]+){3}-\d{2}$/.test(a), a);
  expect("rejects bad usernames", !isValidUsername("Yuna Kim"));
  expect("accepts good usernames", isValidUsername("yuna.kim-2"));

  console.log("\nsigned out");
  const anon = await get("/bank", "");
  expect("/bank redirects to /login", anon.location.includes("/login"), anon.location);
  expect("/login is reachable", (await get("/login", "")).status === 200);

  console.log("\nwrong password");
  const bad = await signIn("yuna", "not-the-password");
  expect("rejected", !bad.ok);

  console.log("\nteacher");
  const teacher = await signIn("seonsaengnim", DEV_PASSWORD);
  expect("signed in", teacher.ok);
  expect("/bank allowed", (await get("/bank", teacher.cookies)).status === 200);
  expect("/teacher/home allowed", (await get("/teacher/home", teacher.cookies)).status === 200);
  expect("/teacher/people allowed", (await get("/teacher/people", teacher.cookies)).status === 200);

  console.log("\nstudent");
  const student = await signIn("yuna", DEV_PASSWORD);
  expect("signed in", student.ok);
  expect("/bank allowed", (await get("/bank", student.cookies)).status === 200);
  const sHome = await get("/teacher/home", student.cookies);
  expect("/teacher/home blocked", sHome.status === 307 && !sHome.location.includes("/teacher"), `${sHome.status} -> ${sHome.location}`);
  const sPeople = await get("/teacher/people", student.cookies);
  expect("/teacher/people blocked", sPeople.status === 307, `${sPeople.status}`);

  console.log("\nTA");
  const ta = await signIn("eunji", DEV_PASSWORD);
  expect("/teacher/home allowed", (await get("/teacher/home", ta.cookies)).status === 200);
  expect("/teacher/people blocked (teacher only)", (await get("/teacher/people", ta.cookies)).status === 307);
  // A TA is a student further along the same course, so their own screens are
  // theirs as well — even on an account that carries only the ta role.
  expect("/bank allowed, without holding the student role", (await get("/bank", ta.cookies)).status === 200);
  expect("/test allowed", (await get("/test", ta.cookies)).status === 200);

  console.log("\naccount creation");
  const username = `checkuser${Date.now().toString().slice(-5)}`;
  const account = await createAccount({
    username,
    displayName: "Check User",
    roles: ["student"],
  });
  expect("password issued", /^[a-z-]+\d{2}$/.test(account.password), account.password);
  const created = await signIn(username, account.password);
  expect("new account can sign in", created.ok);
  expect("and reaches /bank", (await get("/bank", created.cookies)).status === 200);

  const dupe = await createAccount({
    username,
    displayName: "Duplicate",
    roles: ["student"],
  }).then(
    () => false,
    () => true,
  );
  expect("duplicate username rejected", dupe);

  const [row] = await db.select().from(users).where(eq(users.username, username));
  await deleteAccount(row.id);
  const gone = await db.select().from(users).where(eq(users.username, username));
  expect("account deleted cleanly", gone.length === 0);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
