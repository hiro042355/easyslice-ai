import type { DirectorDecision } from "@/lib/directorDecisionEngine";

type DirectorDecisionPreviewProps = {
  decision?: DirectorDecision | null;
};

export default function DirectorDecisionPreview({
  decision,
}: DirectorDecisionPreviewProps) {
  return (
    <details className="rounded-md border border-white/10 bg-slate-900/70">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-200">
        Advanced: Director Decision Preview
      </summary>
      <div className="border-t border-white/10 p-4">
        {!decision ? (
          <p className="text-xs text-slate-400">
            Director Decision is not available.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <p>
                Direction:{" "}
                <span className="text-cyan-200">
                  {decision.overallDirection.intensityCurve}
                </span>
              </p>
              <p>
                Main peak:{" "}
                <span className="text-amber-200">
                  {decision.overallDirection.mainPeakSection}
                </span>
              </p>
              <p>
                Afterglow:{" "}
                <span className="text-cyan-200">
                  {decision.overallDirection.afterglow.emotion} ·{" "}
                  {decision.overallDirection.afterglow.releaseStyle}
                </span>
              </p>
              <p>
                Input quality confidence:{" "}
                <span className="text-cyan-200">
                  {decision.overallDirection.confidence}
                </span>
              </p>
            </div>

            <div className="space-y-3">
              {decision.sectionDirections.map((section) => (
                <div
                  key={section.section}
                  className="rounded border border-white/10 p-3"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      {section.section}
                      {section.isMainPeak ? " · MAIN PEAK" : ""}
                    </span>
                    <span className="text-slate-400">
                      {section.purpose}
                    </span>
                  </div>
                  <div className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-2 text-xs">
                    {[
                      ["Vocal", section.vocalIntensity, "bg-fuchsia-400"],
                      ["Music", section.musicIntensity, "bg-cyan-400"],
                      ["MV", section.visualIntensity, "bg-amber-400"],
                    ].map(([label, value, color]) => (
                      <div className="contents" key={String(label)}>
                        <span className="text-slate-400">{label}</span>
                        <div className="h-1.5 rounded-full bg-white/10">
                          <div
                            className={"h-full rounded-full " + color}
                            style={{ width: String(value) + "%" }}
                          />
                        </div>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-300">
                Decision reasons
              </p>
              <ul className="space-y-1 text-xs text-slate-400">
                {decision.rationale.decisions.map((reason, index) => (
                  <li key={reason.code + "-" + index}>
                    <span className="text-slate-200">{reason.code}</span>
                    {reason.section ? " · " + reason.section : ""}
                  </li>
                ))}
              </ul>
            </div>

            {decision.validation.issueCodes.length > 0 && (
              <div className="rounded border border-amber-400/20 bg-amber-400/10 p-3">
                <p className="text-xs font-semibold text-amber-200">
                  Validation: {decision.validation.status}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {decision.validation.issueCodes.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
