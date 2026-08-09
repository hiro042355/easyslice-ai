import type { LegacyClipCandidateV1 } from "../clipCandidates";
import type { ClipPortfolioSelectionV1 } from "../clipRanking";
import { createClipEditPlanV1 } from "./clipEditingAuthority";
import type { ClipTimedTextV1 } from "./types";

export type ClipSubtitlePointV1 = Readonly<{ second: number; text: string }>;

const timedSubtitles = (points: readonly ClipSubtitlePointV1[], clipEnd: number): readonly ClipTimedTextV1[] =>
  points.map((point, index) => Object.freeze({
    start: point.second,
    end: Math.min(clipEnd, points[index + 1]?.second ?? point.second + 2),
    text: point.text,
  }));

export const projectEditedPortfolioToLegacyClipsV1 = (
  selection: ClipPortfolioSelectionV1,
  subtitles: readonly ClipSubtitlePointV1[]
): readonly LegacyClipCandidateV1[] => Object.freeze(selection.selected.map(({ candidate }) => {
  const plan = createClipEditPlanV1({
    start: candidate.start,
    end: candidate.end,
    subtitles: timedSubtitles(subtitles, candidate.end),
    storyReason: candidate.storyReason,
    contiguousOnly: true,
  });
  return Object.freeze({
    start: String(plan.hookDecision.editedStart),
    end: String(candidate.end),
    title: candidate.title ?? "",
    reason: candidate.reason ?? "",
    score: candidate.sourceScore ?? 0,
  });
}));
