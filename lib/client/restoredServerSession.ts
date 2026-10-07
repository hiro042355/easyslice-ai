export type SessionCheck = Readonly<{ ok: boolean; status: number }>;
export type RestoredSessionResult = "authenticated" | "unauthenticated" | "forbidden" | "unavailable";
export type RestoredSessionDependencies = Readonly<{
  checkSession(): Promise<SessionCheck>;
  restoredUser(): Promise<Readonly<{ getIdToken(forceRefresh: boolean): Promise<string> }> | null>;
  createSession(idToken: string): Promise<SessionCheck>;
}>;

const classify = (response: SessionCheck): RestoredSessionResult =>
  response.ok ? "authenticated" : response.status === 403 ? "forbidden" : response.status === 401 ? "unauthenticated" : "unavailable";

/** Recovery is bounded to one exchange, and success requires a subsequent server check. */
export async function restoreServerSession(dependencies: RestoredSessionDependencies): Promise<RestoredSessionResult> {
  try {
    const initial = await dependencies.checkSession();
    if (initial.ok || initial.status !== 401) return classify(initial);
    const user = await dependencies.restoredUser();
    if (!user) return "unauthenticated";
    const response = await dependencies.createSession(await user.getIdToken(true));
    if (!response.ok) return classify(response);
    return classify(await dependencies.checkSession());
  } catch {
    return "unavailable";
  }
}
