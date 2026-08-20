"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "../lib/supabaseBrowser";

interface LicenseRow {
  license_key: string;
  plan: string;
  status: string;
  expires_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

interface AccountResponse {
  email: string;
  downloadUrl: string | null;
  licenses: LicenseRow[];
}

export function AccountPortal() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Sign in with the same email used at checkout.");
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
        <p>Use your checkout email to recover downloads, view license keys, and manage subscription billing.</p>

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
              <h2>Licenses</h2>
              {account.licenses.length ? (
                <div className="license-list">
                  {account.licenses.map((license) => (
                    <article className="license-card" key={license.license_key}>
                      <div>
                        <strong>{license.plan}</strong>
                        <span>{license.status}</span>
                      </div>
                      <code>{license.license_key}</code>
                      <small>
                        {license.expires_at ? `Renews/checks through ${new Date(license.expires_at).toLocaleDateString()}` : "Lifetime access"}
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
                <a className="button primary" href={account.downloadUrl}>Download Windows app</a>
              ) : (
                <p>The Windows app download will appear here as soon as the launch build is published.</p>
              )}
              <button className="button quiet" type="button" onClick={openBillingPortal} disabled={loading}>
                Manage billing
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
