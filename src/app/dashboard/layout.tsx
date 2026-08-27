"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerAutoFlush, flushOutbox } from "@/lib/offline-sync";
import { offlineDb } from "@/lib/offline-db";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  useEffect(() => {
    registerAutoFlush();
    setIsOnline(navigator.onLine);

    async function updateCount() {
      if (!offlineDb) return;
      setPending(await offlineDb.outbox.count());
    }
    updateCount();
    const interval = setInterval(updateCount, 5000);

    function handleOnline() {
      setIsOnline(true);
      flushOutbox().then(updateCount);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-surface-sunken)" }}>
      <header className="app-header">
        <Link href="/dashboard" className="app-wordmark">
          Salon<span className="app-wordmark-accent">MVP</span>
        </Link>
        <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ color: "var(--color-cream)" }}>
          Log out
        </button>
      </header>

      {(!isOnline || pending > 0) && (
        <div
          style={{
            background: isOnline ? "var(--color-warning-bg)" : "var(--color-danger-bg)",
            color: isOnline ? "var(--color-warning)" : "var(--color-danger)",
            padding: "var(--space-2) var(--space-5)",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {!isOnline && "You're offline — walk-ins and cash checkouts still save, and will sync once you're back online. "}
          {pending > 0 && `${pending} change${pending === 1 ? "" : "s"} waiting to sync.`}
        </div>
      )}

      {children}
    </div>
  );
}
