import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_READ_COOLDOWN_MS,
  GOOGLE_READ_INTERVAL_MS,
  useGoogleAutoRefresh,
} from "./use-google-auto-refresh.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("automatic Google reading", () => {
  it("waits for the cooldown after invalidation and cleans up on unmount", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const { unmount } = renderHook(() =>
      useGoogleAutoRefresh({
        enabled: true,
        invalidated: true,
        loading: false,
        lastAttempt: Date.now(),
        refresh,
      }),
    );
    act(() => vi.advanceTimersByTime(GOOGLE_READ_COOLDOWN_MS - 1));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("defers hidden-screen reads until visibility returns", () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    const refresh = vi.fn();
    renderHook(() =>
      useGoogleAutoRefresh({
        enabled: true,
        invalidated: false,
        loading: false,
        lastAttempt: Date.now(),
        refresh,
      }),
    );
    act(() => vi.advanceTimersByTime(GOOGLE_READ_INTERVAL_MS));
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    { enabled: false, loading: false },
    { enabled: true, loading: true },
  ])("does not read when disabled or already loading: %j", (state) => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    renderHook(() =>
      useGoogleAutoRefresh({
        ...state,
        invalidated: false,
        lastAttempt: Date.now(),
        refresh,
      }),
    );
    act(() => vi.advanceTimersByTime(GOOGLE_READ_INTERVAL_MS));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("waits for connectivity before retrying an overdue read", () => {
    vi.useFakeTimers();
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(false);
    const refresh = vi.fn();
    renderHook(() =>
      useGoogleAutoRefresh({
        enabled: true,
        invalidated: false,
        loading: false,
        lastAttempt: Date.now(),
        refresh,
      }),
    );
    act(() => vi.advanceTimersByTime(GOOGLE_READ_INTERVAL_MS));
    expect(refresh).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
