import type { AuthenticatedContext } from "@/lib/server/productionIdentity/types";
import type { WorkflowApiCommand, WorkflowApiPrincipal } from "@/lib/workflowApi/types";
import { validatePrincipal } from "@/lib/workflowApi/workflowApiUtils";
import type {
  ProductionWorkflowPrincipalPolicy,
  ProductionWorkflowPrincipalProjectionResult,
} from "./productionWorkflowApiBoundaryTypes";

function validAuthenticatedContext(value: AuthenticatedContext): boolean {
  const identity = value?.identity;
  return value?.contextVersion === "1.0"
    && typeof value.requestId === "string"
    && value.requestId.length > 0
    && identity?.identityVersion === "1.0"
    && typeof identity.userId === "string"
    && identity.userId.length > 0
    && typeof identity.providerSubject === "string"
    && identity.providerSubject.length > 0
    && typeof identity.sessionId === "string"
    && identity.sessionId.length > 0
    && Number.isSafeInteger(identity.issuedAt)
    && Number.isSafeInteger(identity.expiresAt)
    && identity.expiresAt > identity.issuedAt;
}

export async function projectProductionWorkflowApiPrincipal(
  context: AuthenticatedContext,
  command: WorkflowApiCommand,
  policy: ProductionWorkflowPrincipalPolicy,
): Promise<ProductionWorkflowPrincipalProjectionResult> {
  if (!validAuthenticatedContext(context)) return Object.freeze({ status: "unauthorized" });
  try {
    const [tenant, region, permissions] = await Promise.all([
      policy.resolveTenant(context),
      policy.resolveRegion(context),
      policy.resolvePermissions(context, command),
    ]);
    if (tenant.status !== "resolved" || region.status !== "resolved" || permissions.status !== "resolved") {
      return Object.freeze({ status: "unauthorized" });
    }
    const principal: WorkflowApiPrincipal = {
      principalVersion: "1.0",
      actorType: "user",
      subjectRef: context.identity.userId,
      tenantRef: tenant.value,
      region: region.value,
      permissions: Object.freeze([...permissions.value]),
    };
    const validated = validatePrincipal(principal);
    if (validated.status !== "valid" || !validated.value.permissions.includes(`workflow:${command}`)) {
      return Object.freeze({ status: "unauthorized" });
    }
    return Object.freeze({ status: "projected", principal: Object.freeze({ ...validated.value, permissions: Object.freeze([...validated.value.permissions]) }) });
  } catch {
    return Object.freeze({ status: "unauthorized" });
  }
}
