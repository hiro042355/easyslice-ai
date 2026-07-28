export type MultiCutReplayResolvedIdentity = Readonly<{
  identityVersion: "1.0";
  keyIdentity: string;
  requestFingerprintIdentity: string;
}>;

export type MultiCutReplayResultReference = Readonly<{
  referenceVersion: "1.0";
  resultReferenceIdentity: string;
}>;

export type MultiCutReplayReservationIdentity = Readonly<{
  reservationVersion: "1.0";
  reservationIdentity: string;
}>;

export type MultiCutReplayExpectedRevision = Readonly<{
  revisionVersion: "1.0";
  expectedRevision: string;
}>;

export type MultiCutReplayFencingToken = Readonly<{
  fencingVersion: "1.0";
  fencingToken: string;
}>;

export type MultiCutReplayLeaseIdentity = Readonly<{
  leaseVersion: "1.0";
  leaseIdentity: string;
}>;

export type MultiCutReplayProtectedTenantIdentity = Readonly<{
  identityVersion: "1.0";
  protectedTenantIdentity: string;
}>;

export type MultiCutReplayProtectedScope = Readonly<{
  scopeVersion: "1.0";
  replayNamespace: string;
  tenant: MultiCutReplayProtectedTenantIdentity;
  operationIdentity: string;
}>;

export type MultiCutReplayReservationEvidence = Readonly<{
  evidenceVersion: "1.0";
  reservation: MultiCutReplayReservationIdentity;
  expectedRevision: MultiCutReplayExpectedRevision;
  fencing: MultiCutReplayFencingToken;
  lease: MultiCutReplayLeaseIdentity;
  leaseExpiresAt: string;
  reservationAttempt: number;
}>;
