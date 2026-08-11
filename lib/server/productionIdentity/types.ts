export type UserId = string & { readonly __brand: "UserId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type JobId = string & { readonly __brand: "JobId" };
export type MediaId = string & { readonly __brand: "MediaId" };
export type ExportId = string & { readonly __brand: "ExportId" };

export type VerifiedIdentity = Readonly<{
  identityVersion: "1.0";
  userId: UserId;
  providerSubject: string;
  sessionId: SessionId;
  issuedAt: number;
  expiresAt: number;
}>;

export type AuthenticatedContext = Readonly<{
  contextVersion: "1.0";
  requestId: string;
  identity: VerifiedIdentity;
}>;

export type OwnedResource = Readonly<{
  ownershipVersion: "1.0";
  userId: UserId;
  jobId: JobId;
  mediaId?: MediaId;
  exportId?: ExportId;
}>;

export interface OwnershipAuthority {
  authorize(input: Readonly<{ userId: UserId; resource: OwnedResource }>): Promise<boolean>;
}

export const ownsResource = (userId: UserId, resource: OwnedResource): boolean =>
  resource.ownershipVersion === "1.0" && resource.userId === userId;
