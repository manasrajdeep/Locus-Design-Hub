/**
 * Retry queue for portal side-effects (uploads, messages, realtime reconnects).
 *
 * Anything that can fail is wrapped in `runWithRetry`. It retries once with a
 * short backoff; if it still fails the task is parked in a queue that the
 * portal shows as a banner, so the client can hit "Retry" for that one action
 * instead of reloading the whole page. Runners live in memory only — a hard
 * reload clears the queue by design.
 */
import { useEffect, useState } from "react";

export type FailedTask = {
  id: string;
  label: string;
  kind: "upload" | "message" | "realtime" | "sync";
  error: string;
  failedAt: string;
  retrying?: boolean;
};

const runners = new Map<string, () => Promise<unknown>>();
let tasks: FailedTask[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  tasks = [...tasks];
  listeners.forEach((l) => l());
};

export function useFailedTasks(): FailedTask[] {
  const [snap, setSnap] = useState<FailedTask[]>(tasks);
  useEffect(() => {
    const sync = () => setSnap(tasks);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return snap;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e ?? "Unknown error"));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RetryOptions = {
  kind?: FailedTask["kind"];
  /** Total attempts before the task is parked in the queue. */
  attempts?: number;
  onSuccess?: () => void;
  onFail?: (error: string) => void;
};

/** Run `fn`, auto-retry with backoff, and park it for manual retry if it keeps failing. */
export async function runWithRetry<T>(
  label: string,
  fn: () => Promise<T> | T,
  { kind = "sync", attempts = 2, onSuccess, onFail }: RetryOptions = {},
): Promise<T | null> {
  let lastError: unknown;
  for (let i = 0; i < Math.max(1, attempts); i++) {
    try {
      const out = await fn();
      onSuccess?.();
      return out;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await wait(400 * (i + 1));
    }
  }

  const id = crypto.randomUUID();
  runners.set(id, async () => fn());
  tasks = [
    { id, label, kind, error: message(lastError), failedAt: new Date().toISOString() },
    ...tasks,
  ];
  emit();
  onFail?.(message(lastError));
  return null;
}

/** Re-run one parked task. Resolves true when it finally succeeded. */
export async function retryTask(id: string): Promise<boolean> {
  const run = runners.get(id);
  if (!run) return false;
  tasks = tasks.map((t) => (t.id === id ? { ...t, retrying: true } : t));
  emit();
  try {
    await run();
    runners.delete(id);
    tasks = tasks.filter((t) => t.id !== id);
    emit();
    return true;
  } catch (e) {
    tasks = tasks.map((t) =>
      t.id === id
        ? { ...t, retrying: false, error: message(e), failedAt: new Date().toISOString() }
        : t,
    );
    emit();
    return false;
  }
}

/** Retry everything in the queue, oldest first. Returns how many succeeded. */
export async function retryAllTasks(): Promise<number> {
  const ids = [...tasks].reverse().map((t) => t.id);
  let ok = 0;
  for (const id of ids) if (await retryTask(id)) ok++;
  return ok;
}

export function dismissTask(id: string) {
  runners.delete(id);
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}

export function clearFailedTasks() {
  runners.clear();
  tasks = [];
  emit();
}
