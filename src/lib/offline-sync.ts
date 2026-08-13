import { offlineDb } from "@/lib/offline-db";

/**
 * Write path for anything that must keep working through a data/power cut
 * (PRD 5.5). Tries the real request first; if it fails because there's no
 * network at all (not because the server rejected it), the request is
 * queued in IndexedDB and retried automatically once the browser fires an
 * "online" event.
 *
 * Server-side conflicts (e.g. the slot got taken by another device that
 * synced first) are NOT queued for retry — they come back as a normal
 * completed response with an error body, surfaced to the caller
 * immediately. That's the "first synced wins, second write gets a visible
 * error" behavior the PRD calls for on offline conflicts (section 11).
 */
export async function submitOrQueue(params: {
  url: string;
  method: "POST" | "PATCH";
  body: unknown;
  description: string;
}): Promise<{ queued: boolean; response?: Response }> {
  try {
    const response = await fetch(params.url, {
      method: params.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.body),
    });
    return { queued: false, response };
  } catch {
    // fetch() only throws for network-level failures (offline, DNS, etc.) —
    // an HTTP 4xx/5xx from a reachable server resolves normally above and
    // is NOT queued here, since that's a real rejection, not a connectivity gap.
    if (offlineDb) {
      await offlineDb.outbox.add({
        url: params.url,
        method: params.method,
        body: JSON.stringify(params.body),
        createdAt: Date.now(),
        description: params.description,
      });
    }
    return { queued: true };
  }
}

export async function flushOutbox(): Promise<{ succeeded: number; failed: number }> {
  if (!offlineDb) return { succeeded: 0, failed: 0 };

  const pending = await offlineDb.outbox.orderBy("createdAt").toArray();
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (res.ok) {
        await offlineDb.outbox.delete(item.id!);
        succeeded++;
      } else {
        // Server reached and rejected it (e.g. 409 double-booking) — a real
        // conflict, not a connectivity problem. Move it to "failed" instead
        // of retrying forever, and let the UI surface it to the user.
        const data = await res.json().catch(() => ({ error: "Sync failed" }));
        await offlineDb.failed.add({ ...item, error: data.error ?? "Sync failed", failedAt: Date.now() });
        await offlineDb.outbox.delete(item.id!);
        failed++;
      }
    } catch {
      // Still offline — stop here and let the rest retry next time "online" fires.
      break;
    }
  }

  return { succeeded, failed };
}

let listenerRegistered = false;

export function registerAutoFlush() {
  if (typeof window === "undefined" || listenerRegistered) return;
  listenerRegistered = true;
  window.addEventListener("online", () => {
    flushOutbox();
  });
}
