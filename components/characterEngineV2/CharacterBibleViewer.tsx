"use client";

import React from "react";
import type { CharacterBible, DimensionMode } from "@/lib/characterEngineV2/types";

interface CharacterBibleViewerProps {
  character: CharacterBible;
  selectedRevisionId: string;
  onSelectRevision: (revisionId: string) => void;
}

export const CharacterBibleViewer: React.FC<CharacterBibleViewerProps> = ({
  character,
  selectedRevisionId,
  onSelectRevision,
}) => {
  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800 mt-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-base font-bold">{character.name} - Character Bible</h3>
          <p className="text-xs text-slate-400">{character.description}</p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded font-semibold border ${
            character.identityLockEnforced
              ? "bg-emerald-950 text-emerald-300 border-emerald-700"
              : "bg-amber-950 text-amber-300 border-amber-700"
          }`}
        >
          {character.identityLockEnforced ? "🔒 Identity Lock Active" : "🔓 Unlocked"}
        </span>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Revisions & Artwork Models</h4>
        <div className="space-y-2">
          {character.revisions.map((rev) => {
            const isSelected = rev.revisionId === selectedRevisionId;
            return (
              <div
                key={rev.revisionId}
                onClick={() => onSelectRevision(rev.revisionId)}
                className={`p-3 rounded-md cursor-pointer border transition-all text-xs ${
                  isSelected ? "border-indigo-500 bg-slate-800" : "border-slate-800 bg-slate-950 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-200">
                    Rev #{rev.revisionNumber}: {rev.summary}
                  </span>
                  <span className="text-slate-400">{new Date(rev.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-slate-400">Artwork References ({rev.artworkRefs.length}):</span>
                  <div className="flex gap-1 overflow-x-auto">
                    {rev.artworkRefs.map((art) => (
                      <span
                        key={art.artworkId}
                        className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]"
                      >
                        {art.dimensionMode} {art.mimeType.split("/")[1]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
