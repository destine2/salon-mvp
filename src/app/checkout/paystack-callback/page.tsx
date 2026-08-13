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
    fetch(`/api/transactions/paystack/verify?reference=${reference}`)
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

  return (
    <>
      {status === "checking" && <p>Confirming your payment...</p>}
      {status === "success" && (
        <>
          <h1>Payment confirmed</h1>
          <p>The appointment has been marked as paid.</p>
        </>
      )}
      {status === "error" && (
        <>
          <h1>Something went wrong</h1>
          <p style={{ color: "crimson" }}>{message}</p>
        </>
      )}
    </>
  );
}

/**
 * useSearchParams() opts a route into client-side rendering, and Next's App
 * Router requires it to sit inside a Suspense boundary — without one, the
 * production build fails to prerender this page and `next build` errors out,
 * which blocks deployment entirely.
 *
 * That matters more here than on most pages: this is where Paystack returns
 * the customer after payment, so a build that cannot ship it means card
 * payments have nowhere to land.
 */
export default function PaystackCallbackPage() {
  return (
    <main style={{ padding: "2.5rem", maxWidth: 420 }}>
      <Suspense fallback={<p>Confirming your payment...</p>}>
        <CallbackStatus />
      </Suspense>
      <p>
        <a href="/dashboard/calendar">Back to calendar</a>
      </p>
    </main>
  );
}
