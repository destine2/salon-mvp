"use client";

import { useEffect, useState } from "react";
import { registerAutoFlush, flushOutbox } from "@/lib/offline-sync";
import { offlineDb } from "@/lib/offline-db";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

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
    <div>
      {(!isOnline || pending > 0) && (
        <div
          style={{
            background: isOnline ? "#fff3cd" : "#f8d7da",
            padding: "8px 16px",
            fontSize: 14,
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
