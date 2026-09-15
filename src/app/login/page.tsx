import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · hangukeo" };

export default async function LoginPage() {
  if (await currentSession()) redirect("/");

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">한국어</span>
        <h1>Sign in</h1>
        <p>
          Use the username and password your teacher gave you. If you have lost
          the password, your teacher can issue a new one.
        </p>
      </section>
      <div className="section-body">
        <LoginForm />
      </div>
    </main>
  );
}
