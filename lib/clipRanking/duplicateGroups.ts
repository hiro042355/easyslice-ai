import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import { scoreClipSimilarityV1 } from "./clipSimilarity";
import type {
  ClipDuplicateGroupV1,
  ClipQualityScoreV1,
} from "./types";

export const createClipDuplicateGroupsV1 = (
  candidates: readonly UnifiedClipCandidateV1[]
): readonly ClipDuplicateGroupV1[] => {
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index] ?? index);
    return parent[index] ?? index;
  };
  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (scoreClipSimilarityV1(candidates[left]!, candidates[right]!).classification === "duplicate") {
        unite(left, right);
      }
    }
  }
  const grouped = new Map<number, string[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), candidate.stableCandidateId]);
  });
  return Object.freeze(
    [...grouped.values()]
      .map((ids) => ids.sort())
      .sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""))
      .map((ids) => Object.freeze({
        duplicateGroupId: `duplicate-group:${ids[0]}`,
        candidateIds: Object.freeze(ids),
      }))
  );
};

const compareRepresentative = (
  left: UnifiedClipCandidateV1,
  right: UnifiedClipCandidateV1,
  qualities: ReadonlyMap<string, ClipQualityScoreV1>
) => {
  const leftQuality = qualities.get(left.stableCandidateId)!;
  const rightQuality = qualities.get(right.stableCandidateId)!;
  return (
    rightQuality.overall - leftQuality.overall ||
    rightQuality.dimensions.storyCompleteness - leftQuality.dimensions.storyCompleteness ||
    rightQuality.dimensions.standaloneValue - leftQuality.dimensions.standaloneValue ||
    rightQuality.dimensions.payoffStrength - leftQuality.dimensions.payoffStrength ||
    rightQuality.dimensions.boundaryQuality - leftQuality.dimensions.boundaryQuality ||
    left.start - right.start ||
    left.stableCandidateId.localeCompare(right.stableCandidateId)
  );
};

export const selectClipDuplicateRepresentativesV1 = (
  candidates: readonly UnifiedClipCandidateV1[],
  groups: readonly ClipDuplicateGroupV1[],
  qualities: ReadonlyMap<string, ClipQualityScoreV1>
) => groups.map((group) =>
  candidates
    .filter((candidate) => group.candidateIds.includes(candidate.stableCandidateId))
    .sort((left, right) => compareRepresentative(left, right, qualities))[0]!
);
