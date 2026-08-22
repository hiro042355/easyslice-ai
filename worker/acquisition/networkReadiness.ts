import { isIP } from "node:net";
import type { WorkerNetworkReadiness } from "./httpService";

const FIXED_IP_ECHO_URL = "https://api.ipify.org?format=json";
const REQUEST_TIMEOUT_MS = 10_000;

type Fetch = typeof fetch;

const safeFailure = (configured: boolean): WorkerNetworkReadiness => Object.freeze({
  staticEgressAuthorityConfigured: configured,
  observedEgressMatchesReservedAuthority: false,
  youtubeAttemptCount: 0,
});

export const probeControlledEgress = async (
  expectedIp: string | undefined,
  signal?: AbortSignal,
  fetchImplementation: Fetch = fetch,
): Promise<WorkerNetworkReadiness> => {
  const configured = typeof expectedIp === "string" && isIP(expectedIp) === 4;
  if (!configured) return safeFailure(false);
  try {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetchImplementation(FIXED_IP_ECHO_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return safeFailure(true);
    }
    const body: unknown = await response.json();
    const observedIp = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Readonly<{ ip?: unknown }>).ip
      : undefined;
    return Object.freeze({
      staticEgressAuthorityConfigured: true,
      observedEgressMatchesReservedAuthority: typeof observedIp === "string" && observedIp === expectedIp,
      youtubeAttemptCount: 0,
    });
  } catch {
    return safeFailure(true);
  }
};

export const CONTROLLED_EGRESS_DIAGNOSTIC_DESTINATION = FIXED_IP_ECHO_URL;
