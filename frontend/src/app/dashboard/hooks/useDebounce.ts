/*
 * frontend/src/app/dashboard/hooks/useDebounce.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic debounce hook.
 *
 * Returns a value that lags behind the input by `delayMs` milliseconds.
 * Useful for delaying API calls triggered by rapid user input (e.g. search).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";

/**
 * Debounce a value by the given delay.
 *
 * @param value  - The rapidly-changing input value.
 * @param delayMs - Milliseconds to wait after the last change before updating.
 * @returns The debounced value.
 *
 * @example
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 300);
 * // debouncedSearch updates 300ms after the user stops typing
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
