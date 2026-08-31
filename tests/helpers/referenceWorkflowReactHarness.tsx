import React, { StrictMode, useEffect, type ReactNode } from "react";
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createRequire } from "node:module";
import { useReferenceWorkflowController } from "@/hooks/useReferenceWorkflowController";
import type { ReferenceWorkflowHookInput, ReferenceWorkflowHookResult } from "@/hooks/referenceWorkflowHookTypes";

const requireModule = createRequire(import.meta.url);
const { JSDOM } = requireModule("jsdom") as { JSDOM: new (html?: string, options?: Record<string, unknown>) => { window: Window & typeof globalThis } };
const domOwners: symbol[] = [];
const consoleOwners: symbol[] = [];

export type Observer<T> = { latest?: ReferenceWorkflowHookResult<T>; renders: number; failures: number };
export type ConsoleEvidence = { method: "error" | "warn"; classification: string; arguments: readonly unknown[] };

function recordObservation<T>(observer: Observer<T>, result: ReferenceWorkflowHookResult<T>) {
  try {
    observer.latest = result;
    observer.renders++;
  } catch {
    observer.failures++;
  }
}

export function Harness<T, R>({ input, observer }: { input: ReferenceWorkflowHookInput<T, R>; observer: Observer<T> }) {
  const result = useReferenceWorkflowController(input);
  useEffect(() => { recordObservation(observer, result); }, [observer, result]);
  return null;
}

export function element<T, R>(input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>) {
  return <StrictMode><Harness input={input} observer={observer} /></StrictMode>;
}

function combineFailures(primary: unknown, cleanup: unknown): Error {
  return new AggregateError([primary, cleanup], "Harness operation and cleanup both failed");
}

export function installDom(markup = "<div id=\"root\"></div>") {
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, { url: "http://localhost" });
  const owner = Symbol("reference-workflow-dom-owner");
  const globalObject = globalThis as Record<string, unknown>;
  const keys = ["window", "document", "navigator", "HTMLElement", "Event", "CustomEvent", "Node"] as const;
  const installed: string[] = [];
  const previous = new Map<string, PropertyDescriptor | undefined>();
  let restored = false;

  const restore = () => {
    if (restored) return;
    if (domOwners.at(-1) !== owner) throw new Error("reference-workflow-dom-ownership-order");
    restored = true;
    domOwners.pop();
    let failure: unknown;
    for (const key of [...installed].reverse()) {
      try {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalObject[key];
      } catch (error) {
        failure ??= error;
      }
    }
    try { dom.window.close(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  };

  domOwners.push(owner);
  try {
    for (const key of [...keys, "IS_REACT_ACT_ENVIRONMENT"]) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      const value = key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key as keyof Window];
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
      installed.push(key);
    }
    const container = dom.window.document.getElementById("root");
    if (!container) throw new Error("reference-workflow-root-missing");
    return { dom, container, restore };
  } catch (error) {
    try { restore(); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
}

async function teardown(root: Root | undefined, restore: () => void) {
  let failure: unknown;
  if (root) {
    try {
      await act(async () => { root.unmount(); await Promise.resolve(); });
    } catch (error) {
      failure = error;
    }
  }
  try { restore(); } catch (error) { failure = failure ? combineFailures(failure, error) : error; }
  if (failure) throw failure;
}

async function createMountedRoot(node: ReactNode, markup = "<div id=\"root\"></div>", hydration = false) {
  const host = installDom(markup);
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydration ? hydrateRoot(host.container, node) : createRoot(host.container);
      if (!hydration) root.render(node);
      await Promise.resolve();
    });
  } catch (error) {
    try { await teardown(root, host.restore); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
  if (!root) {
    await teardown(root, host.restore);
    throw new Error("reference-workflow-root-not-created");
  }
  let cleaned = false;
  return {
    ...host,
    root,
    async unmount() {
      if (cleaned) return;
      cleaned = true;
      await teardown(root, host.restore);
    },
  };
}

export async function mount<T, R>(input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>) {
  return createMountedRoot(element(input, observer));
}

export async function withMount<T, R, V>(input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>, callback: (host: Awaited<ReturnType<typeof mount<T, R>>>) => Promise<V> | V) {
  const host = await mount(input, observer);
  let result: V;
  try { result = await callback(host); }
  catch (error) {
    try { await host.unmount(); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
  await host.unmount();
  return result;
}

export function serverMarkup<T, R>(input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>) {
  return renderToString(element(input, observer));
}

export async function hydrate<T, R>(markup: string, input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>) {
  return createMountedRoot(element(input, observer), `<div id="root">${markup}</div>`, true);
}

export async function withHydration<T, R, V>(markup: string, input: ReferenceWorkflowHookInput<T, R>, observer: Observer<T>, callback: (host: Awaited<ReturnType<typeof hydrate<T, R>>>) => Promise<V> | V) {
  const host = await hydrate(markup, input, observer);
  let result: V;
  try { result = await callback(host); }
  catch (error) {
    try { await host.unmount(); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
  await host.unmount();
  return result;
}

export async function withReactElement<V>(node: ReactNode, callback: (host: Awaited<ReturnType<typeof createMountedRoot>>) => Promise<V> | V) {
  const host = await createMountedRoot(node);
  let result: V;
  try { result = await callback(host); }
  catch (error) {
    try { await host.unmount(); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
  await host.unmount();
  return result;
}

export function captureConsoleWarnings() {
  const owner = Symbol("reference-workflow-console-owner");
  const originalError = console.error;
  const originalWarn = console.warn;
  const classes = new Set<string>();
  const evidence: ConsoleEvidence[] = [];
  let restored = false;
  const classify = (method: "error" | "warn", args: unknown[]) => {
    const text = args.map(value => typeof value === "string" ? value : "").join(" ");
    const classification = /hydration/i.test(text) ? "hydration" : /act/i.test(text) ? "act" : /unmount/i.test(text) ? "unmount" : /hook/i.test(text) ? "hook" : "other";
    classes.add(classification);
    evidence.push({ method, classification, arguments: [...args] });
  };
  consoleOwners.push(owner);
  console.error = (...args: unknown[]) => classify("error", args);
  console.warn = (...args: unknown[]) => classify("warn", args);
  return {
    classes,
    evidence,
    restore() {
      if (restored) return;
      if (consoleOwners.at(-1) !== owner) throw new Error("reference-workflow-console-ownership-order");
      restored = true;
      consoleOwners.pop();
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

export async function withConsoleWarnings<V>(callback: (capture: ReturnType<typeof captureConsoleWarnings>) => Promise<V> | V) {
  const capture = captureConsoleWarnings();
  let result: V;
  try { result = await callback(capture); }
  catch (error) {
    try { capture.restore(); } catch (cleanup) { throw combineFailures(error, cleanup); }
    throw error;
  }
  capture.restore();
  return result;
}
