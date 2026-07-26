import { createWorkflowEntryTrustedContextAdapter } from "./trustedContextAdapter";
import type { WorkflowEntryTrustedContextAdapter } from "./adapterTypes";

export const createDeterministicWorkflowEntryTrustedContextAdapterFixture =
  (): WorkflowEntryTrustedContextAdapter =>
    createWorkflowEntryTrustedContextAdapter();
