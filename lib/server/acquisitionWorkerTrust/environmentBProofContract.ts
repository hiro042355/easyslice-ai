const ENVIRONMENT_B_URL = "https://nexcut-prod-acquisition-worker-egress-b-bfqspeoqrq-an.a.run.app";
const WRONG_AUDIENCE = "https://invalid-audience.nexcut.invalid";

export type EnvironmentBProofEvidence = Readonly<{
  environmentBReady: boolean;
  correctAudienceAccepted: boolean;
  wrongAudienceRejected: boolean;
  staticEgressAuthorityConfigured: boolean;
  observedEgressMatchesReservedAuthority: boolean;
  youtubeAttemptCount: 0;
}>;

export type EnvironmentBProofResult = Readonly<{
  success: boolean;
  evidence: EnvironmentBProofEvidence;
}>;

export type EnvironmentBProofDependencies = Readonly<{
  getIdToken(audience: string): Promise<string>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
}>;

const request = (url: string, token: string, fetchImplementation: EnvironmentBProofDependencies["fetch"]) =>
  fetchImplementation(url, {
    method: "GET",
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

export const runEnvironmentBProof = async (
  dependencies: EnvironmentBProofDependencies,
): Promise<EnvironmentBProofResult> => {
  const correctToken = await dependencies.getIdToken(ENVIRONMENT_B_URL);
  const readyResponse = await request(`${ENVIRONMENT_B_URL}/readyz`, correctToken, dependencies.fetch);
  const readiness: unknown = readyResponse.ok ? await readyResponse.json() : undefined;
  const environmentBReady = Boolean(readiness && typeof readiness === "object"
    && !Array.isArray(readiness) && (readiness as Readonly<{ ready?: unknown }>).ready === true);

  const wrongToken = await dependencies.getIdToken(WRONG_AUDIENCE);
  const wrongResponse = await request(`${ENVIRONMENT_B_URL}/readyz`, wrongToken, dependencies.fetch);
  const wrongAudienceRejected = [401, 403, 404].includes(wrongResponse.status);

  const networkResponse = await request(
    `${ENVIRONMENT_B_URL}/internal/network-readiness`,
    correctToken,
    dependencies.fetch,
  );
  const network: unknown = networkResponse.ok ? await networkResponse.json() : undefined;
  const staticEgressAuthorityConfigured = Boolean(network && typeof network === "object" && !Array.isArray(network)
    && (network as Readonly<{ staticEgressAuthorityConfigured?: unknown }>).staticEgressAuthorityConfigured === true);
  const observedEgressMatchesReservedAuthority = Boolean(network && typeof network === "object" && !Array.isArray(network)
    && (network as Readonly<{ observedEgressMatchesReservedAuthority?: unknown }>).observedEgressMatchesReservedAuthority === true);
  const evidence = Object.freeze({
    environmentBReady,
    correctAudienceAccepted: readyResponse.status === 200 && environmentBReady,
    wrongAudienceRejected,
    staticEgressAuthorityConfigured,
    observedEgressMatchesReservedAuthority,
    youtubeAttemptCount: 0 as const,
  });
  return Object.freeze({ success: Object.values(evidence).every((value) => value === true || value === 0), evidence });
};

export const ENVIRONMENT_B_PROOF_DESTINATIONS = Object.freeze({
  worker: ENVIRONMENT_B_URL,
  wrongAudience: WRONG_AUDIENCE,
});
