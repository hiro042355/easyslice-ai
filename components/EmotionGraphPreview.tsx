import type { EmotionGraph } from "@/lib/emotionEngine";

type EmotionGraphPreviewProps = {
  graph: EmotionGraph;
};

export default function EmotionGraphPreview({ graph }: EmotionGraphPreviewProps) {
  return (
    <details className="rounded-md border border-white/10 bg-slate-900/70">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-200">
        Advanced: Emotion Graph Preview
      </summary>
      <div className="border-t border-white/10 p-4">
        <div className="mb-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
          <p>Primary: <span className="text-cyan-200">{graph.primaryEmotion}</span></p>
          <p>Peak: <span className="text-cyan-200">{graph.mainPeakSection}</span></p>
          <p>Afterglow: <span className="text-cyan-200">{graph.afterglow}</span></p>
        </div>
        <p className="mb-4 text-xs text-slate-400">{graph.overallArc}</p>
        <div className="space-y-3">
          {graph.sections.map((section) => (
            <div key={`${section.section}-${section.startRatio}`} className="rounded border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-white">
                  {section.section}{section.mainPeak ? " · MAIN PEAK" : ""}
                </span>
                <span className="text-slate-400">
                  {Math.round(section.startRatio * 100)}–{Math.round(section.endRatio * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-xs">
                <span className="text-slate-400">Emotion</span>
                <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${section.emotionScore}%` }} /></div>
                <span>{section.emotionScore}</span>
                <span className="text-slate-400">Energy</span>
                <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${section.energyScore}%` }} /></div>
                <span>{section.energyScore}</span>
                <span className="text-slate-400">Peak</span>
                <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400" style={{ width: `${section.peakLevel}%` }} /></div>
                <span>{section.peakLevel}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{section.primaryEmotion} — {section.directionNote}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
