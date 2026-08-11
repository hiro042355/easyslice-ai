import {
  createProductionKmsReadinessGateV1,
  projectProductionKmsReadinessHttpResponseV1,
} from "../../../../lib/server/creatorPublicationIdentity/productionKmsReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gate = createProductionKmsReadinessGateV1(process.env);

export async function GET(): Promise<Response> {
  return projectProductionKmsReadinessHttpResponseV1(await gate.check());
}
