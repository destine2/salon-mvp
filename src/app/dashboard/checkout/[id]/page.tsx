"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { submitOrQueue } from "@/lib/offline-sync";

type AppointmentDetail = {
  id: string;
  status: string;
  service: { name: string; priceNaira: string };
  customer: { name: string | null; phone: string };
  staff: { id: string; name: string; paystackSubaccountCode: string | null };
  transaction: { id: string } | null;
};

type Method = "CASH" | "BANK_TRANSFER" | "CARD_TRANSFER";

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<Method>("CASH");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ isFlagged: boolean } | null>(null);
  const [queuedForSync, setQueuedForSync] = useState(false);

  useEffect(() => {
    fetch(`/api/appointments/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Appointment not found");
        setAppointment(data.appointment);
        setAmount(data.appointment.service.priceNaira);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCashOrTransfer() {
    setError(null);
    setSubmitting(true);
    try {
      // Cash/transfer is the other case that has to survive a dropped
      // connection — Paystack card payments inherently can't (no network,
      // no charge), so only this branch goes through the offline queue.
      const { queued, response } = await submitOrQueue({
        url: "/api/transactions",
        method: "POST",
        body: { appointmentId: id, method, amountNaira: Number(amount) },
        description: `Checkout: ${appointment?.customer.name ?? appointment?.customer.phone}`,
      });

      if (queued) {
        setQueuedForSync(true);
      } else {
        const data = await response!.json();
        if (!data.ok) throw new Error(data.error ?? "Could not log payment");
        setResult({ isFlagged: data.isFlagged });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaystack() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not start Paystack payment");
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={page}>
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      </main>
    );
  }
  if (!appointment) {
    return (
      <main style={page}>
        <p className="error-text">{error ?? "Appointment not found"}</p>
      </main>
    );
  }

  if (queuedForSync) {
    return (
      <main style={page}>
        <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <div style={checkCircle}>⏳</div>
          <h1 style={{ marginTop: "var(--space-3)" }}>Saved — will sync shortly</h1>
          <p>No connection right now. This checkout is saved on this device and will sync automatically once you&rsquo;re back online.</p>
          <Link href="/dashboard/calendar" className="btn btn-secondary">
            Back to calendar
          </Link>
        </div>
      </main>
    );
  }

  if (appointment.transaction || result) {
    return (
      <main style={page}>
        <div className="card" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
          <div style={checkCircle}>✓</div>
          <h1 style={{ marginTop: "var(--space-3)" }}>Checked out</h1>
          {result?.isFlagged && (
            <p style={{ color: "var(--color-warning)" }}>
              Heads up: the amount logged was less than the service price (₦{Number(appointment.service.priceNaira).toLocaleString()}). This has
              been flagged on the daily reconciliation summary.
            </p>
          )}
          <Link href="/dashboard/calendar" className="btn btn-secondary">
            Back to calendar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 style={{ marginBottom: "var(--space-1)" }}>Checkout</h1>
        <p style={{ marginBottom: "var(--space-1)" }}>
          {appointment.service.name} — {appointment.customer.name || appointment.customer.phone} with {appointment.staff.name}
        </p>
        <p style={{ fontWeight: 700, color: "var(--color-ink)" }}>
          Service price: ₦{Number(appointment.service.priceNaira).toLocaleString()}
        </p>

        {error && <p className="error-text">{error}</p>}

        <label className="field">
          <span className="field-label">Payment method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input">
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer (logged manually)</option>
            <option value="CARD_TRANSFER">Card / Paystack (in-app charge)</option>
          </select>
        </label>

        {method === "CARD_TRANSFER" ? (
          <>
            {!appointment.staff.paystackSubaccountCode && (
              <p style={{ color: "var(--color-warning)", fontSize: "0.875rem" }}>
                {appointment.staff.name} doesn&rsquo;t have payouts set up yet — set that up on the Staff page first, or use Cash / Bank transfer
                for now.
              </p>
            )}
            <button onClick={handlePaystack} disabled={submitting || !appointment.staff.paystackSubaccountCode} className="btn btn-primary" style={{ width: "100%" }}>
              {submitting ? "Starting payment…" : "Pay with Paystack"}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Amount received (₦)</span>
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
            </label>
            <button onClick={handleCashOrTransfer} disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
              {submitting ? "Logging…" : "Log payment"}
            </button>
          </>
        )}

        <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ marginTop: "var(--space-3)" }}>
          ← Back
        </button>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5) var(--space-3)", maxWidth: 640, margin: "0 auto" };

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
