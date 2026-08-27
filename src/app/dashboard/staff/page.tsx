"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

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
  const [password, setPassword] = useState("");
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

  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

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
          password,
          role,
          commissionType,
          commissionValue: Number(commissionValue),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not add staff member");
      setName("");
      setPhone("");
      setPassword("");
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

  async function handleResetPassword(e: FormEvent, staffId: string) {
    e.preventDefault();
    setError(null);
    setResetSubmitting(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not reset password");
      setResetPasswordFor(null);
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResetSubmitting(false);
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
    <main style={page}>
      <Link href="/dashboard" style={backLink}>
        ← Dashboard
      </Link>
      <h1>Staff</h1>
      <p>Add each stylist/apprentice and how they get paid — this drives the automatic commission split at checkout later.</p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p style={{ color: "var(--color-ink-faint)" }}>Loading…</p>
      ) : staff.length === 0 ? (
        <p style={{ color: "var(--color-ink-faint)" }}>No staff yet.</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: "var(--space-4)" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Commission</th>
                <th style={th}>Payouts</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <Fragment key={s.id}>
                  <tr style={{ ...tr, opacity: s.active ? 1 : 0.6 }}>
                    <td style={td}>{s.name}</td>
                    <td style={td}>{s.phone}</td>
                    <td style={td}>{s.role}</td>
                    <td style={td}>
                      <span className={`pill ${s.active ? "pill-success" : "pill-neutral"}`}>{s.active ? "Active" : "Inactive"}</span>
                    </td>
                    <td style={td}>
                      {s.commissionRule
                        ? s.commissionRule.type === "PERCENT"
                          ? `${Number(s.commissionRule.value)}%`
                          : `₦${Number(s.commissionRule.value).toLocaleString()} (${commissionLabel[s.commissionRule.type]})`
                        : "—"}{" "}
                      <button onClick={() => openEditForm(s)} className="btn btn-ghost btn-sm">
                        Edit
                      </button>
                    </td>
                    <td style={td}>
                      {s.paystackSubaccountCode ? (
                        <span className="pill pill-success">✓ Ready</span>
                      ) : (
                        <button onClick={() => setPayoutFormFor(payoutFormFor === s.id ? null : s.id)} className="btn btn-secondary btn-sm">
                          Set up payouts
                        </button>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
                        <button onClick={() => setResetPasswordFor(resetPasswordFor === s.id ? null : s.id)} className="btn btn-ghost btn-sm">
                          Reset password
                        </button>
                        {s.role !== "OWNER" &&
                          (s.active ? (
                            <button onClick={() => handleToggleActive(s.id, false)} className="btn btn-secondary btn-sm">
                              Deactivate
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleToggleActive(s.id, true)} className="btn btn-secondary btn-sm">
                                Reactivate
                              </button>
                              <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">
                                Remove
                              </button>
                            </>
                          ))}
                      </div>
                    </td>
                  </tr>
                  {resetPasswordFor === s.id && (
                    <tr style={tr}>
                      <td colSpan={7} style={inlineFormCell}>
                        <form onSubmit={(e) => handleResetPassword(e, s.id)} style={inlineForm}>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">New password</span>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              minLength={8}
                              required
                              className="input"
                            />
                          </label>
                          <button type="submit" disabled={resetSubmitting} className="btn btn-primary btn-sm">
                            {resetSubmitting ? "Saving…" : "Save"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                  {editFormFor === s.id && (
                    <tr style={tr}>
                      <td colSpan={7} style={inlineFormCell}>
                        <form onSubmit={(e) => handleEditCommission(e, s.id)} style={inlineForm}>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">Type</span>
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as CommissionRule["type"])}
                              className="input"
                            >
                              <option value="PERCENT">Percent</option>
                              <option value="FLAT">Flat</option>
                              <option value="CHAIR_RENTAL">Chair rental</option>
                            </select>
                          </label>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">Value</span>
                            <input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              required
                              className="input"
                              style={{ width: 120 }}
                            />
                          </label>
                          <button type="submit" disabled={editSubmitting} className="btn btn-primary btn-sm">
                            {editSubmitting ? "Saving…" : "Save"}
                          </button>
                          {s.paystackSubaccountCode && (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-warning)" }}>
                              Note: this won&rsquo;t update their existing Paystack payout split automatically.
                            </span>
                          )}
                        </form>
                      </td>
                    </tr>
                  )}
                  {payoutFormFor === s.id && (
                    <tr style={tr}>
                      <td colSpan={7} style={inlineFormCell}>
                        <form onSubmit={(e) => handleSetUpPayouts(e, s.id)} style={{ display: "grid", gap: "var(--space-2)", maxWidth: 320 }}>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">Account name</span>
                            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className="input" />
                          </label>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">Bank</span>
                            <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="input">
                              {NIGERIAN_BANKS.map((b) => (
                                <option key={b.code} value={b.code}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field" style={{ marginBottom: 0 }}>
                            <span className="field-label">Account number</span>
                            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required className="input" />
                          </label>
                          <button type="submit" disabled={payoutSubmitting} className="btn btn-primary btn-sm">
                            {payoutSubmitting ? "Saving…" : "Save payout details"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ maxWidth: 380 }}>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Add a staff member</h2>
        <form onSubmit={handleAdd}>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </label>
          <label className="field">
            <span className="field-label">Phone (their login username)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2348012345678" required className="input" />
          </label>
          <label className="field">
            <span className="field-label">Password (share this with them — they can log in right away)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="input"
            />
          </label>
          <label className="field">
            <span className="field-label">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffMember["role"])} className="input">
              <option value="STYLIST">Stylist</option>
              <option value="APPRENTICE">Apprentice</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Commission type</span>
            <select
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value as CommissionRule["type"])}
              className="input"
            >
              <option value="PERCENT">Percent of service</option>
              <option value="FLAT">Flat amount per service</option>
              <option value="CHAIR_RENTAL">Chair rental (fixed)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{commissionType === "PERCENT" ? "Percent (e.g. 40)" : "Amount (₦)"}</span>
            <input
              type="number"
              min="0"
              value={commissionValue}
              onChange={(e) => setCommissionValue(e.target.value)}
              required
              className="input"
            />
          </label>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
            {submitting ? "Adding…" : "Add staff member"}
          </button>
        </form>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { padding: "var(--space-5)", maxWidth: 900, margin: "0 auto" };

const backLink: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-ink-faint)",
  marginBottom: "var(--space-3)",
};

const table: React.CSSProperties = { width: "100%", minWidth: 780, borderCollapse: "collapse" };

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--color-ink-faint)",
  textTransform: "uppercase",
  padding: "var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-surface-sunken)",
};

const tr: React.CSSProperties = { borderBottom: "1px solid var(--color-border)" };

const td: React.CSSProperties = { padding: "var(--space-2) var(--space-3)", fontSize: "0.9375rem", verticalAlign: "middle" };

const inlineFormCell: React.CSSProperties = { padding: "var(--space-3)", background: "var(--color-surface-sunken)" };

const inlineForm: React.CSSProperties = { display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" };
