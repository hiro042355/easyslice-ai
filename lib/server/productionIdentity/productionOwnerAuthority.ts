import type { UserId } from "./types";

const FIREBASE_UID_MAX_CODE_POINTS = 128;

export const parseProductionOwnerUid = (configuredUid: string | undefined): UserId | undefined => {
  if (configuredUid === undefined || configuredUid.length === 0 || configuredUid !== configuredUid.trim()) return undefined;
  if (configuredUid.includes(",") || Array.from(configuredUid).length > FIREBASE_UID_MAX_CODE_POINTS) return undefined;
  return configuredUid as UserId;
};

export const isProductionOwner = (userId: UserId, configuredUid: string | undefined): boolean =>
  parseProductionOwnerUid(configuredUid) === userId;
