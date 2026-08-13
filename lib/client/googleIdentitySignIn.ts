export const GOOGLE_IDENTITY_POPUP_TIMEOUT_MS = 90_000;

export type GoogleIdentitySignInFailure =
  | "popup-blocked"
  | "popup-closed"
  | "popup-timeout"
  | "session-rejected"
  | "unexpected";

export type GoogleIdentitySignInResult =
  | Readonly<{ status: "authenticated" }>
  | Readonly<{ status: "failed"; reason: GoogleIdentitySignInFailure }>;

type PopupCredential = Readonly<{
  user: Readonly<{ getIdToken(forceRefresh: boolean): Promise<string> }>;
}>;

export type GoogleIdentitySignInDependencies = Readonly<{
  openPopup(): Promise<PopupCredential>;
  createSession(idToken: string): Promise<Readonly<{ ok: boolean }>>;
  popupTimeoutMs?: number;
}>;

type SingleFlightResult<T> =
  | Readonly<{ status: "started"; value: T }>
  | Readonly<{ status: "already-running" }>;

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
};

const classifyPopupFailure = (error: unknown): GoogleIdentitySignInFailure => {
  if (error instanceof PopupTimeoutError) return "popup-timeout";
  switch (errorCode(error)) {
    case "auth/popup-blocked":
      return "popup-blocked";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "popup-closed";
    default:
      return "unexpected";
  }
};

class PopupTimeoutError extends Error {}

const awaitPopup = async (
  popup: Promise<PopupCredential>,
  timeoutMs: number,
): Promise<PopupCredential> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      popup,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PopupTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export async function establishGoogleIdentitySession(
  dependencies: GoogleIdentitySignInDependencies,
): Promise<GoogleIdentitySignInResult> {
  let credential: PopupCredential;
  try {
    credential = await awaitPopup(
      dependencies.openPopup(),
      dependencies.popupTimeoutMs ?? GOOGLE_IDENTITY_POPUP_TIMEOUT_MS,
    );
  } catch (error) {
    return Object.freeze({ status: "failed", reason: classifyPopupFailure(error) });
  }

  try {
    const idToken = await credential.user.getIdToken(true);
    const response = await dependencies.createSession(idToken);
    if (!response.ok) return Object.freeze({ status: "failed", reason: "session-rejected" });
    return Object.freeze({ status: "authenticated" });
  } catch {
    return Object.freeze({ status: "failed", reason: "unexpected" });
  }
}

export function createSingleFlight<T>(operation: () => Promise<T>) {
  let running = false;
  return async (): Promise<SingleFlightResult<T>> => {
    if (running) return Object.freeze({ status: "already-running" });
    running = true;
    try {
      return Object.freeze({ status: "started", value: await operation() });
    } finally {
      running = false;
    }
  };
}
