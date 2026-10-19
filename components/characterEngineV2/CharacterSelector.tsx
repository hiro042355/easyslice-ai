"use client";

import React from "react";
import type { CharacterBible, CharacterCasting, DimensionMode } from "@/lib/characterEngineV2/types";

interface CharacterSelectorProps {
  characters: CharacterBible[];
  castings: CharacterCasting[];
  selectedCharacterId?: string;
  onSelectCharacter: (characterId: string) => void;
  onCastCharacter: (characterId: string, revisionId: string, mode: DimensionMode, identityLock: boolean) => void;
  onToggleIdentityLock: (characterId: string, current: boolean) => void;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  characters,
  castings,
  selectedCharacterId,
  onSelectCharacter,
  onCastCharacter,
  onToggleIdentityLock,
}) => {
  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800">
      <h3 className="text-lg font-bold mb-3 flex items-center justify-between">
        <span>Character Engine V2 Casting</span>
        <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded uppercase font-semibold">2D/3D V2</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {characters.map((char) => {
          const casting = castings.find((c) => c.characterId === char.characterId);
          const isSelected = selectedCharacterId === char.characterId;
          const currentMode = casting?.dimensionMode || char.defaultDimensionMode;
          const isLocked = casting?.identityLockEnforced ?? char.identityLockEnforced;

          return (
            <div
              key={char.characterId}
              onClick={() => onSelectCharacter(char.characterId)}
              className={`p-3 rounded-md cursor-pointer border transition-all ${
                isSelected ? "border-indigo-500 bg-slate-800" : "border-slate-700 bg-slate-950 hover:border-slate-600"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-semibold text-sm">{char.name}</h4>
                  <span className="text-xs text-slate-400 capitalize">{char.role}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleIdentityLock(char.characterId, isLocked);
                  }}
                  className={`text-xs px-2 py-0.5 rounded font-medium border ${
                    isLocked
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-amber-950 text-amber-400 border-amber-800"
                  }`}
                >
                  {isLocked ? "🔒 Lock Active" : "🔓 Unlocked"}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3 text-xs">
                <span className="text-slate-400">Dimension:</span>
                <div className="flex gap-1">
                  {(["2D", "3D", "hybrid"] as DimensionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCastCharacter(char.characterId, char.currentRevisionId, mode, isLocked);
                      }}
                      className={`px-2 py-0.5 rounded ${
                        currentMode === mode ? "bg-indigo-600 text-white font-bold" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
