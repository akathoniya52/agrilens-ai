"use client";

import { useEffect, useEffectEvent, useState } from "react";

type Outcome = { key: string; attempt: number; ok: boolean };

interface Options {
  /** Wait until this is true (e.g. the session is authenticated). */
  enabled?: boolean;
  /** Reloads whenever this changes (e.g. a selected farm id). */
  key?: string;
}

/**
 * Runs `load` when enabled and exposes its data, an error flag and `retry`, so pages can show an
 * error with a Retry button instead of an endless skeleton. `data` keeps the last successful result.
 */
export function useRetryableLoad<T>(load: () => Promise<T>, { enabled = true, key = "" }: Options = {}) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [data, setData] = useState<T | null>(null);
  const runLoad = useEffectEvent(load);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    runLoad().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setOutcome({ key, attempt, ok: true });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.warn("[load] failed", error instanceof Error ? error.message : error);
        setOutcome({ key, attempt, ok: false });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, key, attempt]);

  const current = outcome && outcome.key === key && outcome.attempt === attempt ? outcome : null;
  return {
    data,
    error: current?.ok === false,
    loading: enabled && !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
