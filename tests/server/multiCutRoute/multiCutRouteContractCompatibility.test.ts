import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  MultiCutRouteRequest,
  MultiCutRouteResponseProjection,
} from "../../../lib/server/multiCutRoute/multiCutRouteContractTypes";

test("public types accept the observed legacy payload and response shapes", () => {
  const request: MultiCutRouteRequest = {
    requestVersion: "1.0",
    jobId: "11111111-1111-4111-8111-111111111111",
    mediaId: "22222222-2222-4222-8222-222222222222",
    clips: [{ start: "1", end: 2, title: "clip" }],
    outputFormat: "normal",
    creatorStyleConfig: null,
  };
  const response: MultiCutRouteResponseProjection = {
    responseProjectionVersion: "1.0",
    kind: "json-error",
    status: 404,
    errorCode: "source-not-found",
    message: "The source media was not found.",
    details: { success: false },
  };

  assert.equal(request.outputFormat, "normal");
  assert.equal(response.status, 404);
});

test("workflow and production execution retain zero reverse dependency", () => {
  const paths = [
    "../../../lib/server/workflowEntry/workflowMaterializationEntryContractTypes.ts",
    "../../../lib/server/workflowEntry/workflowMaterializationEntryContract.ts",
    "../../../lib/server/workflowEntry/productionWorkflowMaterializationEntryExecution.ts",
    "../../../lib/server/workflowEntry/productionWorkflowMaterializationEntryComposition.ts",
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /multiCutRoute/);
  }
});
