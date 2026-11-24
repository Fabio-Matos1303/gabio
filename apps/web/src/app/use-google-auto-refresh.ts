import { useEffect } from "react";

export const GOOGLE_READ_INTERVAL_MS = 15 * 60 * 1000;
export const GOOGLE_READ_COOLDOWN_MS = 65 * 1000;

export function useGoogleAutoRefresh({
  enabled,
  invalidated,
  retryAfterRateLimit = false,
  loading,
  lastAttempt,
  refresh,
}: {
  enabled: boolean;
  invalidated: boolean;
  retryAfterRateLimit?: boolean;
  loading: boolean;
  lastAttempt: { readonly current: number };
  refresh: () => void;
}) {
  useEffect(() => {
    if (!enabled || loading) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const remaining =
        lastAttempt.current +
        (invalidated || retryAfterRateLimit
          ? GOOGLE_READ_COOLDOWN_MS
          : GOOGLE_READ_INTERVAL_MS) -
        Date.now();
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        if (remaining <= 0) {
          refresh();
          return;
        }
        timer = setTimeout(check, remaining);
      }
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [
    enabled,
    invalidated,
    retryAfterRateLimit,
    loading,
    lastAttempt,
    refresh,
  ]);
}
