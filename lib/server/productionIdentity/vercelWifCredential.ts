import type { Credential } from "firebase-admin/app";
import { IdentityPoolClient, type SubjectTokenSupplier } from "google-auth-library";

const SUBJECT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type VercelWifConfiguration = Readonly<{
  projectId: string;
  providerResource: string;
  serviceAccountEmail: string;
}>;

export type VercelWifDependencies = Readonly<{
  getOidcToken(): Promise<string>;
}>;

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Vercel WIF configuration: ${name}`);
  return value;
};

export const readVercelWifConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): VercelWifConfiguration => Object.freeze({
  projectId: required("GCP_PROJECT_ID", environment.GCP_PROJECT_ID),
  providerResource: required("GCP_WIF_PROVIDER_RESOURCE", environment.GCP_WIF_PROVIDER_RESOURCE),
  serviceAccountEmail: required("GCP_WIF_SERVICE_ACCOUNT", environment.GCP_WIF_SERVICE_ACCOUNT),
});

const validateConfiguration = (configuration: VercelWifConfiguration): void => {
  if (configuration.projectId !== "nexcut-prod-jp-2026") throw new Error("Invalid Production GCP project authority");
  if (!/^projects\/[1-9][0-9]*\/locations\/global\/workloadIdentityPools\/nexcut-prod-vercel\/providers\/vercel-production$/.test(configuration.providerResource)) {
    throw new Error("Invalid Production WIF provider authority");
  }
  if (configuration.serviceAccountEmail !== "nexcut-prod-web-auth@nexcut-prod-jp-2026.iam.gserviceaccount.com") {
    throw new Error("Invalid Production Firebase service account authority");
  }
};

export const createVercelWifCredential = (
  configuration: VercelWifConfiguration,
  dependencies: VercelWifDependencies,
): Credential => {
  validateConfiguration(configuration);
  const supplier: SubjectTokenSupplier = {
    async getSubjectToken() {
      const token = await dependencies.getOidcToken();
      if (!token) throw new Error("Vercel OIDC authority is unavailable");
      return token;
    },
  };
  const client = new IdentityPoolClient({
    audience: `//iam.googleapis.com/${configuration.providerResource}`,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(configuration.serviceAccountEmail)}:generateAccessToken`,
    scopes: [CLOUD_PLATFORM_SCOPE],
    subject_token_supplier: supplier,
  });

  return Object.freeze({
    async getAccessToken() {
      const response = await client.getAccessToken();
      if (!response.token) throw new Error("Federated Google access token is unavailable");
      const expiresAt = client.credentials.expiry_date;
      return {
        access_token: response.token,
        expires_in: expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0,
      };
    },
  });
};
