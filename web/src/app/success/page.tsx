import Link from "next/link";

export default function SuccessPage() {
  return (
    <main className="portal-page">
      <section className="portal-card">
        <p className="eyebrow">Payment complete</p>
        <h1>Welcome to GPT Mathematical.</h1>
        <p>
          Your checkout is complete. Sign in with the same email you used at checkout to view your
          license key, manage billing, and download the Windows app.
        </p>
        <div className="hero-actions">
          <Link className="button primary" href="/account">Open account portal</Link>
          <Link className="button secondary" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
