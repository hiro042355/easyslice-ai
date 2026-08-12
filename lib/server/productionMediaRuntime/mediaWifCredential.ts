import { IdentityPoolClient, type SubjectTokenSupplier } from "google-auth-library";

const SUBJECT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type ProductionMediaWifConfiguration = Readonly<{
  projectId: "nexcut-prod-jp-2026";
  providerResource: string;
  serviceAccountEmail: "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com";
}>;

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing Production media configuration: ${name}`);
  return value;
};

export const readProductionMediaWifConfiguration = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProductionMediaWifConfiguration => {
  const projectId = required("GCP_PROJECT_ID", environment.GCP_PROJECT_ID);
  const providerResource = required("GCP_WIF_PROVIDER_RESOURCE", environment.GCP_WIF_PROVIDER_RESOURCE);
  const serviceAccountEmail = required("GCP_MEDIA_WIF_SERVICE_ACCOUNT", environment.GCP_MEDIA_WIF_SERVICE_ACCOUNT);
  if (projectId !== "nexcut-prod-jp-2026") throw new Error("Invalid Production media project authority");
  if (!/^projects\/[1-9][0-9]*\/locations\/global\/workloadIdentityPools\/nexcut-prod-vercel\/providers\/vercel-production$/.test(providerResource)) {
    throw new Error("Invalid Production media WIF provider authority");
  }
  if (serviceAccountEmail !== "nexcut-prod-media-runtime@nexcut-prod-jp-2026.iam.gserviceaccount.com") {
    throw new Error("Invalid Production media service-account authority");
  }
  return Object.freeze({ projectId, providerResource, serviceAccountEmail });
};

export const createProductionMediaWifClient = (
  configuration: ProductionMediaWifConfiguration,
  getOidcToken: () => Promise<string>,
): IdentityPoolClient => {
  const supplier: SubjectTokenSupplier = {
    async getSubjectToken() {
      const token = await getOidcToken();
      if (!token) throw new Error("Production media OIDC authority is unavailable");
      return token;
    },
  };
  return new IdentityPoolClient({
    audience: `//iam.googleapis.com/${configuration.providerResource}`,
    subject_token_type: SUBJECT_TOKEN_TYPE,
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(configuration.serviceAccountEmail)}:generateAccessToken`,
    scopes: [CLOUD_PLATFORM_SCOPE],
    subject_token_supplier: supplier,
  });
};
