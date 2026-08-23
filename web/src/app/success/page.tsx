import Link from "next/link";

export default function SuccessPage() {
  return (
    <main className="portal-page">
      <section className="portal-card">
        <p className="eyebrow">Payment complete</p>
        <h1>Welcome to GPT Mathematical.</h1>
        <p>
          Your checkout is complete. Return to the GPT Mathematical desktop app; the Account tab will
          refresh automatically and unlock unlimited exports after Stripe confirms the payment.
        </p>
        <div className="hero-actions">
          <Link className="button primary" href="/api/download">Download Windows app</Link>
          <Link className="button secondary" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
