"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "checking" | "success" | "error";

export default function PaystackCallbackPage() {
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
    <main style={{ padding: "2.5rem", maxWidth: 420 }}>
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
      <p>
        <a href="/dashboard/calendar">Back to calendar</a>
      </p>
    </main>
  );
}
