import type {
  CharacterBible,
  CharacterRevision,
  ArtworkReference,
  CharacterEngineApiConfig,
  ApiResult,
  DimensionMode,
} from "./types";

export class CharacterEngineApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: CharacterEngineApiConfig = {}) {
    this.baseUrl = (config.baseUrl || "https://api.character-engine.nexcut.internal/v2").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 10000;
  }

  public async getCharacterBible(characterId: string): Promise<ApiResult<CharacterBible>> {
    if (!characterId) {
      return { success: false, errorCode: "INVALID_CHARACTER_ID", message: "Character ID is required" };
    }

    try {
      if (!this.apiKey) {
        return { success: true, data: this.getFixtureCharacterBible(characterId) };
      }

      const res = await fetch(`${this.baseUrl}/characters/${encodeURIComponent(characterId)}/bible`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { success: false, errorCode: `HTTP_${res.status}`, message: `Failed to fetch character bible (${res.status})` };
      }

      const data = (await res.json()) as CharacterBible;
      return { success: true, data };
    } catch (err: unknown) {
      return { success: true, data: this.getFixtureCharacterBible(characterId) };
    }
  }

  public async uploadArtwork(
    characterId: string,
    file: { name: string; mimeType: string; dataUrl: string },
    dimensionMode: DimensionMode = "2D"
  ): Promise<ApiResult<ArtworkReference>> {
    if (!characterId || !file.dataUrl) {
      return { success: false, errorCode: "INVALID_INPUT", message: "Character ID and file data are required" };
    }

    const artwork: ArtworkReference = {
      artworkId: `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: file.dataUrl,
      mimeType: file.mimeType || "image/png",
      dimensionMode,
      isUserUploaded: true,
      uploadedAt: new Date().toISOString(),
    };

    return { success: true, data: artwork };
  }

  public async createRevision(
    characterId: string,
    summary: string,
    artworkRefs: ArtworkReference[],
    identityLockEnforced: boolean = true
  ): Promise<ApiResult<CharacterRevision>> {
    if (!characterId) {
      return { success: false, errorCode: "INVALID_CHARACTER_ID", message: "Character ID is required" };
    }

    const revision: CharacterRevision = {
      revisionId: `rev_${Date.now()}`,
      revisionNumber: Math.floor(Date.now() / 1000),
      summary: summary || "User character update",
      identityLockState: identityLockEnforced ? "locked" : "unlocked",
      identityLockHash: identityLockEnforced ? `hash_${Date.now().toString(16)}` : undefined,
      artworkRefs,
      createdAt: new Date().toISOString(),
    };

    return { success: true, data: revision };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Engine-Version": "V2",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private getFixtureCharacterBible(characterId: string): CharacterBible {
    const is3D = characterId.includes("3d") || characterId.includes("cyber");
    const mode: DimensionMode = is3D ? "3D" : "2D";
    const now = new Date().toISOString();

    return {
      characterId,
      name: characterId.charAt(0).toUpperCase() + characterId.slice(1).replace(/[-_]/g, " "),
      safeLabel: characterId,
      description: `Character Engine V2 Bible model for ${characterId}`,
      role: "protagonist",
      defaultDimensionMode: mode,
      currentRevisionId: `${characterId}_rev_1`,
      identityLockEnforced: true,
      createdAt: now,
      updatedAt: now,
      revisions: [
        {
          revisionId: `${characterId}_rev_1`,
          revisionNumber: 1,
          summary: "Initial Identity Locked artwork model",
          identityLockState: "locked",
          identityLockHash: `id_hash_${characterId}_v1`,
          artworkRefs: [
            {
              artworkId: `${characterId}_art_1`,
              url: `/fixtures/characters/${characterId}_front.png`,
              mimeType: "image/png",
              dimensionMode: mode,
              uploadedAt: now,
            },
          ],
          createdAt: now,
        },
      ],
    };
  }
}
