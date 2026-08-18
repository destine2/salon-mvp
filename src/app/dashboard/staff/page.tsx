"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";

type CommissionRule = {
  type: "PERCENT" | "FLAT" | "CHAIR_RENTAL";
  value: string; // Decimal fields arrive as strings over JSON
};

type StaffMember = {
  id: string;
  name: string;
  phone: string;
  role: "OWNER" | "STYLIST" | "APPRENTICE";
  active: boolean;
  commissionRule: CommissionRule | null;
  paystackSubaccountCode: string | null;
};

const commissionLabel: Record<CommissionRule["type"], string> = {
  PERCENT: "%",
  FLAT: "₦ flat per service",
  CHAIR_RENTAL: "₦ chair rental",
};

// A convenience shortlist, not the authoritative source — Paystack's own
// GET /bank endpoint is the real list and should replace this before
// scaling past a handful of pilot salons.
const NIGERIAN_BANKS: { name: string; code: string }[] = [
  { name: "Access Bank", code: "044" },
  { name: "GTBank", code: "058" },
  { name: "Zenith Bank", code: "057" },
  { name: "UBA", code: "033" },
  { name: "First Bank", code: "011" },
  { name: "Fidelity Bank", code: "070" },
  { name: "Union Bank", code: "032" },
  { name: "Sterling Bank", code: "232" },
  { name: "Wema Bank", code: "035" },
  { name: "Ecobank", code: "050" },
];

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffMember["role"]>("STYLIST");
  const [commissionType, setCommissionType] = useState<CommissionRule["type"]>("PERCENT");
  const [commissionValue, setCommissionValue] = useState("40");
  const [submitting, setSubmitting] = useState(false);

  const [payoutFormFor, setPayoutFormFor] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [bankCode, setBankCode] = useState(NIGERIAN_BANKS[0].code);
  const [accountNumber, setAccountNumber] = useState("");
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  const [editFormFor, setEditFormFor] = useState<string | null>(null);
  const [editType, setEditType] = useState<CommissionRule["type"]>("PERCENT");
  const [editValue, setEditValue] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await fetch("/api/staff");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not load staff");
      setStaff(data.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          role,
          commissionType,
          commissionValue: Number(commissionValue),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not add staff member");
      setName("");
      setPhone("");
      setRole("STYLIST");
      setCommissionType("PERCENT");
      setCommissionValue("40");
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not remove staff member");
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not update staff member");
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function openEditForm(s: StaffMember) {
    setEditFormFor(editFormFor === s.id ? null : s.id);
    setEditType(s.commissionRule?.type ?? "PERCENT");
    setEditValue(s.commissionRule ? String(Number(s.commissionRule.value)) : "");
  }

  async function handleEditCommission(e: FormEvent, staffId: string) {
    e.preventDefault();
    setError(null);
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionType: editType, commissionValue: Number(editValue) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not update commission rule");
      setEditFormFor(null);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSetUpPayouts(e: FormEvent, staffId: string) {
    e.preventDefault();
    setError(null);
    setPayoutSubmitting(true);
    try {
      const res = await fetch(`/api/staff/${staffId}/paystack-subaccount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, bankCode, accountNumber }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not set up payouts");
      setPayoutFormFor(null);
      setBusinessName("");
      setAccountNumber("");
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPayoutSubmitting(false);
    }
  }

  return (
    <main style={{ padding: "2.5rem", maxWidth: 680 }}>
      <h1>Staff</h1>
      <p>Add each stylist/apprentice and how they get paid — this drives the automatic commission split at checkout later.</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : staff.length === 0 ? (
        <p>No staff yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "1rem 0" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>Name</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th>Commission</th>
              <th>Payouts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <Fragment key={s.id}>
                <tr style={{ borderBottom: "1px solid #eee", opacity: s.active ? 1 : 0.6 }}>
                  <td>{s.name}</td>
                  <td>{s.phone}</td>
                  <td>{s.role}</td>
                  <td>{s.active ? "Active" : "Inactive"}</td>
                  <td>
                    {s.commissionRule
                      ? s.commissionRule.type === "PERCENT"
                        ? `${Number(s.commissionRule.value)}%`
                        : `₦${Number(s.commissionRule.value).toLocaleString()} (${commissionLabel[s.commissionRule.type]})`
                      : "—"}{" "}
                    <button onClick={() => openEditForm(s)} style={{ fontSize: 12 }}>
                      Edit
                    </button>
                  </td>
                  <td>
                    {s.paystackSubaccountCode ? (
                      "✓ ready"
                    ) : (
                      <button
                        onClick={() => setPayoutFormFor(payoutFormFor === s.id ? null : s.id)}
                      >
                        Set up payouts
                      </button>
                    )}
                  </td>
                  <td>
                    {s.role !== "OWNER" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {s.active ? (
                          <button onClick={() => handleToggleActive(s.id, false)}>Deactivate</button>
                        ) : (
                          <>
                            <button onClick={() => handleToggleActive(s.id, true)}>Reactivate</button>
                            <button onClick={() => handleDelete(s.id)}>Remove</button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {editFormFor === s.id && (
                  <tr>
                    <td colSpan={7}>
                      <form
                        onSubmit={(e) => handleEditCommission(e, s.id)}
                        style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 0" }}
                      >
                        <label>
                          Type
                          <select value={editType} onChange={(e) => setEditType(e.target.value as CommissionRule["type"])} style={{ display: "block", padding: 8 }}>
                            <option value="PERCENT">Percent</option>
                            <option value="FLAT">Flat</option>
                            <option value="CHAIR_RENTAL">Chair rental</option>
                          </select>
                        </label>
                        <label>
                          Value
                          <input
                            type="number"
                            min="0"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            required
                            style={{ display: "block", padding: 8, width: 120 }}
                          />
                        </label>
                        <button type="submit" disabled={editSubmitting}>
                          {editSubmitting ? "Saving..." : "Save"}
                        </button>
                        {s.paystackSubaccountCode && (
                          <span style={{ fontSize: 12, color: "#b8860b" }}>
                            Note: this won't update their existing Paystack payout split automatically.
                          </span>
                        )}
                      </form>
                    </td>
                  </tr>
                )}
                {payoutFormFor === s.id && (
                  <tr>
                    <td colSpan={7}>
                      <form
                        onSubmit={(e) => handleSetUpPayouts(e, s.id)}
                        style={{ display: "grid", gap: 8, maxWidth: 320, padding: "12px 0" }}
                      >
                        <label>
                          Account name
                          <input
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", padding: 8 }}
                          />
                        </label>
                        <label>
                          Bank
                          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }}>
                            {NIGERIAN_BANKS.map((b) => (
                              <option key={b.code} value={b.code}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Account number
                          <input
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", padding: 8 }}
                          />
                        </label>
                        <button type="submit" disabled={payoutSubmitting}>
                          {payoutSubmitting ? "Saving..." : "Save payout details"}
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add a staff member</h2>
      <form onSubmit={handleAdd} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        <label>
          Phone (for OTP login later)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="2348012345678"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as StaffMember["role"])} style={{ display: "block", width: "100%", padding: 8 }}>
            <option value="STYLIST">Stylist</option>
            <option value="APPRENTICE">Apprentice</option>
          </select>
        </label>
        <label>
          Commission type
          <select
            value={commissionType}
            onChange={(e) => setCommissionType(e.target.value as CommissionRule["type"])}
            style={{ display: "block", width: "100%", padding: 8 }}
          >
            <option value="PERCENT">Percent of service</option>
            <option value="FLAT">Flat amount per service</option>
            <option value="CHAIR_RENTAL">Chair rental (fixed)</option>
          </select>
        </label>
        <label>
          {commissionType === "PERCENT" ? "Percent (e.g. 40)" : "Amount (₦)"}
          <input
            type="number"
            min="0"
            value={commissionValue}
            onChange={(e) => setCommissionValue(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add staff member"}
        </button>
      </form>
    </main>
  );
}
