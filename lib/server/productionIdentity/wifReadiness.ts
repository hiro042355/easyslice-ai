import { randomUUID } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createVercelWifCredential, readVercelWifConfiguration } from "./vercelWifCredential";

export type WifReadinessStage =
  | "vercel-oidc"
  | "federated-credential"
  | "firebase-admin";

export type WifReadinessResult =
  | Readonly<{
      status: "ready";
      stages: Readonly<{
        vercelOidc: "pass";
        stsExchange: "pass";
        serviceAccountImpersonation: "pass";
        firebaseAdmin: "pass";
      }>;
    }>
  | Readonly<{ status: "not-ready"; stage: WifReadinessStage }>;

export type WifReadinessOperations = Readonly<{
  verifyVercelOidc(): Promise<void>;
  verifyFederatedCredential(): Promise<void>;
  verifyFirebaseAdmin(): Promise<void>;
}>;

export const executeWifReadiness = async (
  operations: WifReadinessOperations,
): Promise<WifReadinessResult> => {
  for (const [stage, operation] of [
    ["vercel-oidc", operations.verifyVercelOidc],
    ["federated-credential", operations.verifyFederatedCredential],
    ["firebase-admin", operations.verifyFirebaseAdmin],
  ] as const) {
    try {
      await operation();
    } catch {
      return Object.freeze({ status: "not-ready", stage });
    }
  }
  return Object.freeze({
    status: "ready",
    stages: Object.freeze({
      vercelOidc: "pass",
      stsExchange: "pass",
      serviceAccountImpersonation: "pass",
      firebaseAdmin: "pass",
    }),
  });
};

export const createProductionWifReadinessOperations = (): WifReadinessOperations => {
  const configuration = readVercelWifConfiguration();
  let oidcToken: string | undefined;
  const credential = createVercelWifCredential(configuration, {
    getOidcToken: async () => oidcToken ?? "",
  });

  return Object.freeze({
    async verifyVercelOidc() {
      oidcToken = await getVercelOidcToken();
      if (!oidcToken) throw new Error("oidc-unavailable");
    },
    async verifyFederatedCredential() {
      await credential.getAccessToken();
    },
    async verifyFirebaseAdmin() {
      const app = initializeApp(
        { credential, projectId: configuration.projectId },
        `nexcut-wif-readiness-${randomUUID()}`,
      );
      try {
        await getAuth(app).getUser("nexcut-wif-readiness-nonexistent");
      } catch (error) {
        if ((error as { code?: unknown }).code !== "auth/user-not-found") throw error;
      } finally {
        await deleteApp(app);
      }
    },
  });
};
