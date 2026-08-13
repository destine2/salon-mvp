"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

  if (loading) return <main style={{ padding: "2.5rem" }}>Loading...</main>;
  if (!appointment) return <main style={{ padding: "2.5rem" }}>{error ?? "Appointment not found"}</main>;

  if (queuedForSync) {
    return (
      <main style={{ padding: "2.5rem", maxWidth: 420 }}>
        <h1>Saved — will sync shortly</h1>
        <p>No connection right now. This checkout is saved on this device and will sync automatically once you're back online.</p>
        <p>
          <a href="/dashboard/calendar">Back to calendar</a>
        </p>
      </main>
    );
  }

  if (appointment.transaction || result) {
    return (
      <main style={{ padding: "2.5rem", maxWidth: 420 }}>
        <h1>Checked out</h1>
        {result?.isFlagged && (
          <p style={{ color: "#b8860b" }}>
            Heads up: the amount logged was less than the service price ({appointment.service.priceNaira}). This
            has been flagged on the daily reconciliation summary.
          </p>
        )}
        <p>
          <a href="/dashboard/calendar">Back to calendar</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2.5rem", maxWidth: 420 }}>
      <h1>Checkout</h1>
      <p>
        {appointment.service.name} — {appointment.customer.name || appointment.customer.phone} with {appointment.staff.name}
      </p>
      <p>Service price: ₦{Number(appointment.service.priceNaira).toLocaleString()}</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label>
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} style={{ display: "block", width: "100%", padding: 8 }}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer (logged manually)</option>
            <option value="CARD_TRANSFER">Card / Paystack (in-app charge)</option>
          </select>
        </label>

        {method === "CARD_TRANSFER" ? (
          <>
            {!appointment.staff.paystackSubaccountCode && (
              <p style={{ color: "#b8860b" }}>
                {appointment.staff.name} doesn't have payouts set up yet — set that up on the Staff page first,
                or use Cash / Bank transfer for now.
              </p>
            )}
            <button onClick={handlePaystack} disabled={submitting || !appointment.staff.paystackSubaccountCode}>
              {submitting ? "Starting payment..." : "Pay with Paystack"}
            </button>
          </>
        ) : (
          <>
            <label>
              Amount received (₦)
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            </label>
            <button onClick={handleCashOrTransfer} disabled={submitting}>
              {submitting ? "Logging..." : "Log payment"}
            </button>
          </>
        )}
      </div>

      <p style={{ marginTop: 16 }}>
        <button onClick={() => router.back()}>Back</button>
      </p>
    </main>
  );
}
