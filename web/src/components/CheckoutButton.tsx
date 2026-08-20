"use client";

import { useState } from "react";
import type { PaidPlanId } from "../lib/plans";

interface CheckoutButtonProps {
  plan: PaidPlanId;
  className: string;
  children: React.ReactNode;
  quantity?: number;
}

export function CheckoutButton({ plan, className, children, quantity = 1 }: CheckoutButtonProps) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, quantity })
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Could not start checkout.");
      }
      window.location.href = result.url;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <>
      <button className={className} type="button" onClick={startCheckout} disabled={loading}>
        {loading ? "Opening checkout..." : children}
      </button>
      {status ? <span className="inline-status error">{status}</span> : null}
    </>
  );
}
