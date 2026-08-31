"use client";
import type { ReferenceWorkflowHookEnvironment, ReferenceWorkflowHookEnvironmentSnapshot } from "./referenceWorkflowHookTypes";
export function createReferenceWorkflowBrowserEnvironment(): ReferenceWorkflowHookEnvironment {
  const getSnapshot = (): ReferenceWorkflowHookEnvironmentSnapshot => ({ online: typeof navigator === "undefined" ? true : navigator.onLine, visibility: typeof document !== "undefined" && document.visibilityState === "hidden" ? "hidden" : "visible" });
  return Object.freeze({ getSnapshot, subscribe(listener) { if (typeof window === "undefined" || typeof document === "undefined") return () => {}; const notify = () => listener(); window.addEventListener("online", notify); window.addEventListener("offline", notify); document.addEventListener("visibilitychange", notify); return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); document.removeEventListener("visibilitychange", notify); }; } });
}
export function createReferenceWorkflowStaticEnvironment(initial: ReferenceWorkflowHookEnvironmentSnapshot): ReferenceWorkflowHookEnvironment & { setSnapshot(next: ReferenceWorkflowHookEnvironmentSnapshot): void } {
  let snapshot = { ...initial }; const listeners = new Set<() => void>();
  return Object.freeze({ getSnapshot: () => ({ ...snapshot }), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, setSnapshot(next) { snapshot = { ...next }; for (const listener of [...listeners]) listener(); } });
}
