import type {
  ProductionWorkflowRuntimeCapabilities,
  ProductionWorkflowRuntimeCapability,
} from "./types";

export type ReferenceProductionRuntimeContractCompatibility =
  | Readonly<{
      status: "compatible-subset";
      adapterVersion: "1.0";
      productionUsable: false;
      capabilities: ProductionWorkflowRuntimeCapabilities;
    }>
  | Readonly<{ status: "incompatible" | "unsupported"; safeReasonCode: string }>;

function unavailable(
  capability: ProductionWorkflowRuntimeCapability,
  requirement: "required" | "optional",
) {
  return Object.freeze({
    capability,
    requirement,
    status: "unavailable" as const,
    acceptanceGate: `production-gate:${capability}`,
  });
}

export function describeReferenceProductionRuntimeContractAdapter(): ReferenceProductionRuntimeContractCompatibility {
  const capabilities: ProductionWorkflowRuntimeCapabilities = Object.freeze({
    "durable-persistence": unavailable("durable-persistence", "required"),
    "cross-instance-coordination": unavailable("cross-instance-coordination", "required"),
    "distributed-idempotency": unavailable("distributed-idempotency", "required"),
    "durable-jobs": unavailable("durable-jobs", "required"),
    "durable-references": unavailable("durable-references", "required"),
    "transactional-outbox": unavailable("transactional-outbox", "optional"),
    "production-authentication": unavailable("production-authentication", "required"),
    "production-credentials": unavailable("production-credentials", "optional"),
    "provider-job-lookup": unavailable("provider-job-lookup", "optional"),
    "graceful-drain": unavailable("graceful-drain", "required"),
  });
  return Object.freeze({
    status: "compatible-subset",
    adapterVersion: "1.0",
    productionUsable: false,
    capabilities,
  });
}

/** A failed future production factory must return a safe failure and must never return this adapter. */
export const PRODUCTION_RUNTIME_REFERENCE_FALLBACK_ALLOWED = false as const;
