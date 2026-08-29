"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Salon = {
  tier: "FREE" | "PAID" | "STARTER" | "GROWTH" | "MULTI_BRANCH";
  trialEndsAt: string | null;
  subscriptionRenewsAt: string | null;
};

const PRICE_NAIRA = 15_000;

function daysRemaining(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60_000)));
}

export default function BillingPage() {
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    fetch("/api/salon")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not load billing info");
        setSalon(data.salon);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe() {
    setError(null);
    setSubscribing(true);
    try {
      const res = await fetch("/api/billing/subscribe", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not start subscription payment");
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubscribing(false);
    }
  }

  const isPaid = salon?.tier === "PAID";
  const trialDaysLeft = salon ? daysRemaining(salon.trialEndsAt) : 0;
  const onTrial = !isPaid && trialDaysLeft > 0;

  return (
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>Billing</h1>

      {loading ? (
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      ) : (
        <div className="card" style={{ maxWidth: 420 }}>
          {isPaid ? (
            <>
              <span className="pill pill-success" style={{ marginBottom: "var(--space-2)" }}>
                Paid plan
              </span>
              <p style={{ marginBottom: 0 }}>
                ₦{PRICE_NAIRA.toLocaleString()}/month
                {salon?.subscriptionRenewsAt && (
                  <> — renews {new Date(salon.subscriptionRenewsAt).toLocaleDateString()}</>
                )}
                .
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
                Need to cancel? There&rsquo;s no self-serve cancel yet — contact support.
              </p>
            </>
          ) : onTrial ? (
            <>
              <span className="pill pill-warning" style={{ marginBottom: "var(--space-2)" }}>
                Free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
              </span>
              <p>
                Full access during your trial. Subscribe any time to keep it going afterward — otherwise you&rsquo;ll
                drop to the Free plan (limited to 2 staff members, no deposit-hold bookings).
              </p>
              <button onClick={handleSubscribe} disabled={subscribing} className="btn btn-primary" style={{ width: "100%" }}>
                {subscribing ? "Starting payment…" : `Subscribe — ₦${PRICE_NAIRA.toLocaleString()}/month`}
              </button>
            </>
          ) : (
            <>
              <span className="pill pill-neutral" style={{ marginBottom: "var(--space-2)" }}>
                Free plan
              </span>
              <p>
                Limited to 2 staff members and no deposit-hold bookings. Subscribe to unlock everything for ₦
                {PRICE_NAIRA.toLocaleString()}/month.
              </p>
              <button onClick={handleSubscribe} disabled={subscribing} className="btn btn-primary" style={{ width: "100%" }}>
                {subscribing ? "Starting payment…" : `Subscribe — ₦${PRICE_NAIRA.toLocaleString()}/month`}
              </button>
            </>
          )}

          {error && <p className="error-text" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
        </div>
      )}
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 640, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};
