import "server-only";

import { createProductionIdTokenAuthority } from "./composition";
import {
  ENVIRONMENT_B_PROOF_DESTINATIONS,
  runEnvironmentBProof,
  type EnvironmentBProofResult,
} from "./environmentBProofContract";

const PROVIDER = "projects/566365202495/locations/global/workloadIdentityPools/nexcut-prod-vercel/providers/vercel-production";
const INVOKER = "nexcut-prod-acq-invoker@nexcut-prod-jp-2026.iam.gserviceaccount.com";
export const verifyProductionEnvironmentBProof = (): Promise<EnvironmentBProofResult> => runEnvironmentBProof({
  getIdToken: createProductionIdTokenAuthority({ providerResource: PROVIDER, invokerServiceAccount: INVOKER }),
  fetch,
});

export { ENVIRONMENT_B_PROOF_DESTINATIONS };
