export type DimensionMode = "2D" | "3D" | "hybrid";

export type IdentityLockState = "locked" | "unlocked" | "verifying" | "failed";

export type ArtworkReference = {
  artworkId: string;
  url: string;
  mimeType: string;
  dimensionMode: DimensionMode;
  isUserUploaded?: boolean;
  uploadedAt: string;
};

export type CharacterRevision = {
  revisionId: string;
  revisionNumber: number;
  summary: string;
  identityLockState: IdentityLockState;
  identityLockHash?: string;
  artworkRefs: ArtworkReference[];
  createdAt: string;
};

export type CharacterBible = {
  characterId: string;
  name: string;
  safeLabel: string;
  description: string;
  role: "protagonist" | "supporting" | "antagonistic-force" | "performer";
  defaultDimensionMode: DimensionMode;
  currentRevisionId: string;
  revisions: CharacterRevision[];
  identityLockEnforced: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CharacterCasting = {
  characterId: string;
  selectedRevisionId: string;
  dimensionMode: DimensionMode;
  identityLockEnforced: boolean;
  customArtworkRefs?: ArtworkReference[];
};

export type SceneCharacterAssignment = {
  sceneId: string;
  characterId: string;
  roleInScene: "primary" | "secondary" | "background" | "performer";
  dimensionMode: DimensionMode;
  identityLockEnforced: boolean;
};

export type CharacterProjectState = {
  version: "2.0";
  characters: CharacterBible[];
  castings: CharacterCasting[];
  sceneAssignments: SceneCharacterAssignment[];
  updatedAt: string;
};

export type CharacterEngineApiConfig = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; errorCode: string; message: string };
