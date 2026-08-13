import Dexie, { type Table } from "dexie";

export type QueuedRequest = {
  id?: number;
  url: string;
  method: "POST" | "PATCH";
  body: string; // JSON.stringify'd — Dexie stores structured clones fine, but keeping it as a string keeps the replay logic identical to a normal fetch call
  createdAt: number;
  description: string; // human-readable, shown in the pending-sync indicator
};

export type FailedRequest = QueuedRequest & { error: string; failedAt: number };

class OfflineDB extends Dexie {
  outbox!: Table<QueuedRequest, number>;
  failed!: Table<FailedRequest, number>;

  constructor() {
    super("salon-mvp-offline");
    this.version(1).stores({
      outbox: "++id, createdAt",
      failed: "++id, failedAt",
    });
  }
}

// Dexie touches IndexedDB, which doesn't exist during server rendering —
// guard construction so importing this file server-side doesn't crash.
export const offlineDb: OfflineDB | null = typeof window !== "undefined" ? new OfflineDB() : null;
