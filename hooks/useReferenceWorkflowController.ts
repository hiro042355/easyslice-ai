"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { WorkflowUiControllerInput } from "@/lib/workflowUi/types";
import { copyWorkflowUi, hasWorkflowUiUnsafeStructure, isWorkflowUiPlainObject } from "@/lib/workflowUi/workflowUiUtils";
import type { ReferenceWorkflowControllerCommandResult } from "./referenceWorkflowControllerHolder";
import type { ReferenceWorkflowHookCommandResult, ReferenceWorkflowHookInput, ReferenceWorkflowHookResult, ReferenceWorkflowHookTimerHandle } from "./referenceWorkflowHookTypes";
import { createReferenceWorkflowSafeCommandFailure, createReferenceWorkflowTimerGeneration, mapReferenceWorkflowCommandResult } from "./referenceWorkflowHookUtils";

export function useReferenceWorkflowController<TInput, TRequest>(input: ReferenceWorkflowHookInput<TInput, TRequest>): ReferenceWorkflowHookResult<TInput> {
  const [configuration] = useState(() => input);
  if (configuration.operation !== input.operation || configuration.projector !== input.projector || configuration.dependencies !== input.dependencies) throw new Error("reference-workflow-hook-configuration-changed");

  const { autoRecover, dependencies, operation, projector } = configuration;
  const ownerToken = useId();
  const holder = dependencies.controllerHolder;
  const [timerGeneration] = useState(createReferenceWorkflowTimerGeneration);
  const timerHandleRef = useRef<ReferenceWorkflowHookTimerHandle>(undefined);
  const mountedRef = useRef(false);
  const autoRecoveredRef = useRef(false);
  const view = useSyncExternalStore(holder.subscribe, holder.getSnapshot, holder.getServerSnapshot);

  const currentView = useCallback(() => holder.getSnapshot(), [holder]);
  const mapHolderResult = useCallback((result: ReferenceWorkflowControllerCommandResult): ReferenceWorkflowHookCommandResult => {
    if (result.status === "rejected") return createReferenceWorkflowSafeCommandFailure("not-ready", currentView());
    return mapReferenceWorkflowCommandResult(result.result, currentView());
  }, [currentView]);
  const safe = useCallback(async (call: () => Promise<ReferenceWorkflowControllerCommandResult>): Promise<ReferenceWorkflowHookCommandResult> => {
    try { return mapHolderResult(await call()); }
    catch { return createReferenceWorkflowSafeCommandFailure("failed", currentView()); }
  }, [currentView, mapHolderResult]);

  const start = useCallback(async (value: TInput) => {
    let projectedResult: ReturnType<typeof projector.project>;
    try { if (hasWorkflowUiUnsafeStructure(value)) return createReferenceWorkflowSafeCommandFailure("invalid", currentView()); projectedResult = projector.project(copyWorkflowUi(value)); }
    catch { return createReferenceWorkflowSafeCommandFailure("invalid", currentView()); }
    if (projectedResult.status !== "projected") return createReferenceWorkflowSafeCommandFailure(projectedResult.status, currentView());
    if (!isWorkflowUiPlainObject(projectedResult.request) || hasWorkflowUiUnsafeStructure(projectedResult.request)) return createReferenceWorkflowSafeCommandFailure("invalid", currentView());
    let request: WorkflowUiControllerInput;
    try { request = copyWorkflowUi(projectedResult.request) as unknown as WorkflowUiControllerInput; }
    catch { return createReferenceWorkflowSafeCommandFailure("invalid", currentView()); }
    if (request.operation !== operation) return createReferenceWorkflowSafeCommandFailure("invalid", currentView());
    return safe(() => holder.start(ownerToken, request));
  }, [currentView, holder, operation, ownerToken, projector, safe]);

  const pollNow = useCallback(() => {
    timerGeneration.next();
    const result = holder.getPollingContext(ownerToken);
    if (result.status === "rejected") return Promise.resolve(createReferenceWorkflowSafeCommandFailure("not-ready", currentView()));
    if (result.context.kind === "pending-upload") return safe(() => holder.pollUpload(ownerToken));
    if (result.context.kind === "pending-generation") return safe(() => holder.pollGeneration(ownerToken));
    return Promise.resolve<ReferenceWorkflowHookCommandResult>({ resultVersion: "1.0", status: "conflict", messageKey: "workflow.commandConflict", state: currentView() });
  }, [currentView, holder, ownerToken, safe, timerGeneration]);
  const queryResult = useCallback(() => safe(() => holder.queryResult(ownerToken)), [holder, ownerToken, safe]);
  const cancel = useCallback(() => { timerGeneration.next(); return safe(() => holder.cancel(ownerToken)); }, [holder, ownerToken, safe, timerGeneration]);
  const recover = useCallback(() => safe(() => holder.recover(ownerToken)), [holder, ownerToken, safe]);
  const reset = useCallback(() => {
    timerGeneration.next();
    if (timerHandleRef.current !== undefined) dependencies.timer.cancel(timerHandleRef.current);
    timerHandleRef.current = undefined;
    return mapHolderResult(holder.reset(ownerToken));
  }, [dependencies.timer, holder, mapHolderResult, ownerToken, timerGeneration]);

  useEffect(() => {
    mountedRef.current = true;
    holder.acquire(ownerToken);
    return () => {
      mountedRef.current = false;
      timerGeneration.next();
      if (timerHandleRef.current !== undefined) dependencies.timer.cancel(timerHandleRef.current);
      timerHandleRef.current = undefined;
      holder.release(ownerToken);
    };
  }, [dependencies.timer, holder, ownerToken, timerGeneration]);

  useEffect(() => {
    timerGeneration.next();
    if (timerHandleRef.current !== undefined) dependencies.timer.cancel(timerHandleRef.current);
    timerHandleRef.current = undefined;
    const projected = holder.getPollingContext(ownerToken);
    if (projected.status === "rejected" || projected.context.kind === "none") return;
    const decision = dependencies.pollScheduler.schedule({ state: projected.context.poll, policy: dependencies.pollPolicy, advice: projected.context.retryAdvice, online: view.online, visible: view.visibility === "visible" });
    if (decision.decision !== "schedule") return;
    const token = timerGeneration.next();
    timerHandleRef.current = dependencies.timer.schedule(decision.delayMs, () => {
      timerHandleRef.current = undefined;
      if (mountedRef.current && timerGeneration.isCurrent(token)) void pollNow();
    });
    return () => {
      timerGeneration.next();
      if (timerHandleRef.current !== undefined) dependencies.timer.cancel(timerHandleRef.current);
      timerHandleRef.current = undefined;
    };
  }, [dependencies.pollPolicy, dependencies.pollScheduler, dependencies.timer, holder, ownerToken, pollNow, timerGeneration, view.activeCommand, view.activity, view.online, view.retryAdvice, view.serverStatus, view.visibility]);

  useEffect(() => {
    if (autoRecover === true && !autoRecoveredRef.current) { autoRecoveredRef.current = true; void recover(); }
  }, [autoRecover, recover]);

  return { state: view, assets: view.assets, messageKey: view.messageKey, progress: view.progress, retryAdvice: view.retryAdvice, accessibility: view.accessibility, canStart: view.canStart, canPoll: view.canPoll, canQueryResult: view.canQueryResult, canCancel: view.canCancel, canReset: view.canReset, isBusy: view.isBusy, isTerminal: view.isTerminal, isOffline: !view.online, isHidden: view.visibility === "hidden", isPollingPaused: view.isPollingPaused, start, pollNow, queryResult, cancel, recover, reset };
}
