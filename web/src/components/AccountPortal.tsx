"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "../lib/supabaseBrowser";

interface LicenseRow {
  id: string;
  plan: string;
  status: string;
  expires_at: string | null;
  stripe_subscription_id: string | null;
  billing_plan: string;
  created_at: string;
}

interface AccountResponse {
  email: string;
  plan: "free" | "plus_subscription" | "lifetime";
  status: string;
  quota: {
    limit: number | null;
    used: number;
    remaining: number | null;
    periodEnd: string | null;
  };
  downloadUrl: string | null;
  billingPortalAvailable: boolean;
  licenses: LicenseRow[];
}

export function AccountPortal() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Sign in here only for billing support. Start and upgrade your account inside the desktop app.");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token || null;
      setAccessToken(token);
      if (data.session?.user.email) {
        setEmail(data.session.user.email);
      }
      if (token) {
        void loadAccount(token);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token || null;
      setAccessToken(token);
      if (session?.user.email) {
        setEmail(session.user.email);
      }
      if (token) {
        void loadAccount(token);
      } else {
        setAccount(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  async function sendMagicLink() {
    setLoading(true);
    setMessage("Sending sign-in link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/account`
      }
    });
    setLoading(false);
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  async function loadAccount(token = accessToken) {
    if (!token) {
      return;
    }

    setLoading(true);
    const response = await fetch("/api/account", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json() as AccountResponse | { error: string };
    setLoading(false);
    if (!response.ok) {
      setMessage("error" in result ? result.error : "Could not load account.");
      return;
    }
    setAccount(result as AccountResponse);
    setMessage("Account loaded.");
  }

  async function openBillingPortal() {
    if (!accessToken) {
      setMessage("Sign in before opening billing.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/billing-portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = await response.json() as { url?: string; error?: string };
    setLoading(false);
    if (!response.ok || !result.url) {
      setMessage(result.error || "Could not open billing portal.");
      return;
    }
    window.location.href = result.url;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAccount(null);
    setAccessToken(null);
    setMessage("Signed out.");
  }

  return (
    <main className="portal-page">
      <section className="portal-card">
        <p className="eyebrow">Account portal</p>
        <h1>Your GPT Mathematical account</h1>
        <p>Download the app directly. Start the free plan and upgrade from the desktop app; this page is only for billing support and account status.</p>
        <a className="button primary" href="/api/download">Download free Windows app</a>

        <div className="portal-form">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <div className="portal-actions">
            <button className="button primary" type="button" onClick={sendMagicLink} disabled={loading || !email}>
              Send sign-in link
            </button>
            {accessToken ? (
              <button className="button quiet" type="button" onClick={signOut}>Sign out</button>
            ) : null}
          </div>
          <span className="inline-status">{message}</span>
        </div>

        {account ? (
          <div className="account-grid">
            <div className="account-panel">
              <h2>Current plan</h2>
              <div className="license-card primary-license">
                <div>
                  <strong>{planLabel(account.plan)}</strong>
                  <span>{account.status}</span>
                </div>
                {account.quota.limit === null ? (
                  <small>Unlimited Word and PDF exports.</small>
                ) : (
                  <small>
                    {account.quota.used} / {account.quota.limit} exports used this month
                    {account.quota.periodEnd ? `, resets ${new Date(account.quota.periodEnd).toLocaleDateString()}` : ""}.
                  </small>
                )}
              </div>
              {account.licenses.length ? (
                <div className="license-list">
                  {account.licenses.map((license) => (
                    <article className="license-card" key={license.id}>
                      <div>
                        <strong>{license.plan}</strong>
                        <span>{license.status}</span>
                      </div>
                      <small>
                        {license.expires_at
                          ? `Renews/checks through ${new Date(license.expires_at).toLocaleDateString()}`
                          : license.billing_plan === "free"
                            ? "Free desktop account with 15 exports/month."
                            : "Unlimited access"}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No paid licenses were found for {account.email}. Use the same email from Stripe Checkout.</p>
              )}
            </div>
            <div className="account-panel">
              <h2>Downloads and billing</h2>
              {account.downloadUrl ? (
                <a className="button primary" href="/api/download">Download free Windows app</a>
              ) : (
                <p>The Windows app download will appear here as soon as the launch build is published.</p>
              )}
              <p>Upgrade options are managed from the desktop app Account tab.</p>
              {account.billingPortalAvailable ? (
                <button className="button quiet" type="button" onClick={openBillingPortal} disabled={loading}>
                  Manage billing
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function planLabel(plan: AccountResponse["plan"]): string {
  if (plan === "plus_subscription") {
    return "Plus";
  }
  if (plan === "lifetime") {
    return "Lifetime";
  }
  return "Free";
}
