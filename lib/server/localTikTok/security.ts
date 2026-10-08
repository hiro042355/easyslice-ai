import { createAuthenticatedRouteGuard } from "../productionIdentity/routeGuardCore";
import { requireBetaAuthorization } from "../productionIdentity/betaAuthorization";
import type { FirebaseCredentialVerifier } from "../productionIdentity/firebaseIdentityAdapter";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const LOCAL_ORIGIN="http://127.0.0.1:8765";
export const LOCAL_REDIRECT=`${LOCAL_ORIGIN}/api/tiktok/oauth/callback`;
export const LOCAL_APP="synthetic-app";
export const SCOPES=Object.freeze(["user.info.basic","video.publish"]);
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export class LocalFailure extends Error { constructor(readonly code:string){super(code);} }
export function reject(code:string):never {throw new LocalFailure(code);}
export function localOnly(target:string):void {if(target!=="LOCAL_TEST") reject("PRODUCTION_DISABLED");}
export type Session = Readonly<{kind:"VERIFIED_LOCAL_SESSION"}>;
export type Identity=Readonly<{uid:string;sessionId:string;expiresAt:number}>;
const sessions=new WeakMap<object,Identity>();
export function identity(session:Session):Identity {const v=sessions.get(session);if(!v || v.expiresAt<=Date.now()) reject("SESSION_REQUIRED");return v;}
export class SyntheticFirebaseVerifier {
  readonly #key=randomBytes(32);
  fixtureCookie(uid:string,expiresAt=Date.now()+3_600_000):string {
    if(!uid.startsWith("synthetic:") || uid.length>100 || !Number.isSafeInteger(expiresAt)) reject("FIXTURE_IDENTITY_INVALID");
    const payload=Buffer.from(JSON.stringify({uid,expiresAt,nonce:randomBytes(16).toString("hex")})).toString("base64url");
    return `${payload}.${createHmac("sha256",this.#key).update(payload).digest("base64url")}`;
  }
  verify(request:Request):Session {
    try {
      const cookie=(request.headers.get("cookie")??"").split(";").map(v=>v.trim()).find(v=>v.startsWith("nexcut_local_session="))?.slice(21);
      if(!cookie || cookie.length>1024) reject("SESSION_REQUIRED");
      const parts=cookie.split(".");if(parts.length!==2) reject("SESSION_REQUIRED");
      const expected=createHmac("sha256",this.#key).update(parts[0]).digest();const signature=Buffer.from(parts[1],"base64url");
      if(signature.length!==32 || !timingSafeEqual(expected,signature)) reject("SESSION_REQUIRED");
      const claim=JSON.parse(Buffer.from(parts[0],"base64url").toString());
      if(typeof claim.uid!=="string" || !claim.uid.startsWith("synthetic:") || !Number.isSafeInteger(claim.expiresAt) || claim.expiresAt<=Date.now()) reject("SESSION_REQUIRED");
      const handle=Object.freeze({kind:"VERIFIED_LOCAL_SESSION" as const});sessions.set(handle,Object.freeze({uid:claim.uid,sessionId:digest(cookie),expiresAt:claim.expiresAt}));return handle;
    } catch {reject("SESSION_REQUIRED");}
  }
  csrf(session:Session):string {return createHmac("sha256",this.#key).update(identity(session).sessionId).digest("hex");}
  verifyMutation(request:Request,session:Session):void {
    const url=new URL(request.url);if(url.origin!==LOCAL_ORIGIN || request.headers.get("origin")!==LOCAL_ORIGIN || url.search) reject("CSRF_REJECTED");
    const supplied=request.headers.get("x-nexcut-local-csrf")??"";const expected=this.csrf(session);
    if(!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) reject("CSRF_REJECTED");
  }
}
export function stateDigest(raw:string):string {if(!/^[A-Za-z0-9_-]{43}$/.test(raw) || Buffer.from(raw,"base64url").length!==32 || Buffer.from(raw,"base64url").toString("base64url")!==raw) reject("STATE_REJECTED");return digest(raw);}
Object.freeze(SyntheticFirebaseVerifier.prototype);

/** Uses the existing Firebase guard; no credentials or identities are accepted from JSON bodies. */
export class CanonicalFirebaseSessionVerifier {
  readonly #guard: ReturnType<typeof createAuthenticatedRouteGuard>;
  readonly #csrfKey = randomBytes(32);
  constructor(verifier: FirebaseCredentialVerifier, private readonly allowedUids: string) {
    this.#guard = createAuthenticatedRouteGuard(verifier);
  }
  async verify(request: Request): Promise<Session> {
    const result = requireBetaAuthorization(await this.#guard(request), this.allowedUids);
    if (!result.ok) reject("SESSION_REQUIRED");
    const verified = result.context.identity;
    if (typeof verified.userId !== "string" || !verified.userId || verified.userId.length > 128 ||
      verified.providerSubject !== verified.userId || !/^[a-f0-9]{64}$/.test(verified.sessionId) ||
      verified.issuedAt > Date.now() || verified.expiresAt <= Date.now()) reject("SESSION_REQUIRED");
    const handle = Object.freeze({kind: "VERIFIED_LOCAL_SESSION" as const});
    sessions.set(handle, Object.freeze({uid: verified.userId, sessionId: verified.sessionId, expiresAt: verified.expiresAt}));
    return handle;
  }
  csrf(session: Session): string {
    return createHmac("sha256", this.#csrfKey).update(identity(session).sessionId).digest("hex");
  }
  verifyMutation(request: Request, session: Session): void {
    const url = new URL(request.url);
    if (url.origin !== LOCAL_ORIGIN || request.headers.get("origin") !== LOCAL_ORIGIN || url.search) reject("CSRF_REJECTED");
    const supplied = request.headers.get("x-nexcut-local-csrf") ?? "";
    const expected = this.csrf(session);
    if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) reject("CSRF_REJECTED");
  }
}
export interface RequestSessionVerifier {
  verify(request: Request): Session | Promise<Session>;
  verifyMutation(request: Request, session: Session): void;
}
Object.freeze(CanonicalFirebaseSessionVerifier.prototype);