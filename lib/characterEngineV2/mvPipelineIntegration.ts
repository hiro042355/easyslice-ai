import type { CharacterAssetReference, MVScenePlannerAssets } from "@/lib/mvContracts";
import type { CharacterProjectState, CharacterCasting, CharacterBible } from "./types";

export function mapCharacterProjectStateToMVAssets(
  state: CharacterProjectState,
  baseAssets: MVScenePlannerAssets = {}
): MVScenePlannerAssets {
  const characterAssets: CharacterAssetReference[] = [];
  let performerAsset: CharacterAssetReference | undefined = undefined;

  for (const casting of state.castings) {
    const bible = state.characters.find((c) => c.characterId === casting.characterId);
    if (!bible) continue;

    const revision = bible.revisions.find((r) => r.revisionId === casting.selectedRevisionId) || bible.revisions[0];
    const artwork = revision?.artworkRefs[0] || casting.customArtworkRefs?.[0];

    const charAssetRef: CharacterAssetReference = {
      characterRef: casting.characterId,
      continuityRole: "identity-primary",
      asset: {
        assetId: artwork?.artworkId || `asset_${casting.characterId}`,
        kind: "character",
        mimeType: artwork?.mimeType || "image/png",
        checksum: revision?.identityLockHash,
      },
    };

    characterAssets.push(charAssetRef);

    if (bible.role === "performer" || (!performerAsset && bible.role === "protagonist")) {
      performerAsset = charAssetRef;
    }
  }

  return {
    ...baseAssets,
    characterAssets: characterAssets.length > 0 ? characterAssets : baseAssets.characterAssets,
    performerAsset: performerAsset || baseAssets.performerAsset,
  };
}

export function serializeCharacterProjectState(state: CharacterProjectState): string {
  return JSON.stringify(state);
}

export function deserializeCharacterProjectState(json: string): CharacterProjectState | null {
  try {
    const data = JSON.parse(json) as CharacterProjectState;
    if (data && data.version === "2.0" && Array.isArray(data.characters)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
