"use client";
import type { ReferenceWorkflowHookTimerAdapter } from "./referenceWorkflowHookTypes";
export const referenceWorkflowBrowserTimerAdapter: ReferenceWorkflowHookTimerAdapter = Object.freeze({ schedule(delayMs, callback) { return globalThis.setTimeout(callback, delayMs); }, cancel(handle) { globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>); } });
