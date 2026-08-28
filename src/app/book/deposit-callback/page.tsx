"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "checking" | "success" | "error";

function CallbackStatus() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");

  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) {
      setStatus("error");
      setMessage("No payment reference found in the URL.");
      return;
    }
    fetch(`/api/public/book/deposit/verify?reference=${reference}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not verify payment");
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Something went wrong");
      });
  }, [reference]);

  if (status === "checking") {
    return <p style={{ color: "var(--color-ink-faint)" }}>Confirming your payment…</p>;
  }

  if (status === "success") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={checkCircle}>✓</div>
        <h1 style={{ marginTop: "var(--space-3)" }}>Deposit paid</h1>
        <p>Your slot is confirmed. See you then.</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h1>Something went wrong</h1>
      <p className="error-text">{message}</p>
    </div>
  );
}

/**
 * useSearchParams() opts a route into client-side rendering, and Next's App
 * Router requires it to sit inside a Suspense boundary — without one, the
 * production build fails to prerender this page (see the identical note on
 * src/app/checkout/paystack-callback/page.tsx, where this was caught by a
 * live `next build`, not tsc).
 */
export default function DepositCallbackPage() {
  return (
    <main style={page}>
      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <Suspense fallback={<p style={{ color: "var(--color-ink-faint)" }}>Confirming your payment…</p>}>
          <CallbackStatus />
        </Suspense>
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-4)",
  background: "var(--color-cream)",
};

const checkCircle: React.CSSProperties = {
  width: 56,
  height: 56,
  margin: "0 auto",
  borderRadius: "50%",
  background: "var(--color-success-bg)",
  color: "var(--color-success)",
  fontSize: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
