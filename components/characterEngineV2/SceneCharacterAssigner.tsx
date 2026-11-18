"use client";

import React from "react";
import type { CharacterBible, SceneCharacterAssignment, DimensionMode } from "@/lib/characterEngineV2/types";

interface SceneCharacterAssignerProps {
  sceneId: string;
  characters: CharacterBible[];
  assignments: SceneCharacterAssignment[];
  onAssignCharacter: (
    sceneId: string,
    characterId: string,
    roleInScene: "primary" | "secondary" | "background" | "performer",
    mode?: DimensionMode
  ) => void;
  onRemoveAssignment: (sceneId: string, characterId: string) => void;
}

export const SceneCharacterAssigner: React.FC<SceneCharacterAssignerProps> = ({
  sceneId,
  characters,
  assignments,
  onAssignCharacter,
  onRemoveAssignment,
}) => {
  const currentAssignments = assignments.filter((a) => a.sceneId === sceneId);

  return (
    <div className="p-3 bg-slate-950 text-white rounded border border-slate-800 text-xs mt-2">
      <h5 className="font-bold mb-2 text-slate-300">Scene {sceneId} Character Assignments</h5>
      {currentAssignments.length === 0 ? (
        <p className="text-slate-500 italic mb-2">No characters assigned to this scene</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {currentAssignments.map((a) => {
            const char = characters.find((c) => c.characterId === a.characterId);
            return (
              <div key={a.characterId} className="flex items-center justify-between bg-slate-900 p-1.5 rounded">
                <div>
                  <span className="font-semibold text-indigo-300">{char?.name || a.characterId}</span>
                  <span className="text-slate-400 ml-2">({a.roleInScene} · {a.dimensionMode})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAssignment(sceneId, a.characterId)}
                  className="text-red-400 hover:text-red-300 px-1"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pt-1 border-t border-slate-800">
        <span className="text-slate-400 self-center mr-1">Assign:</span>
        {characters.map((char) => {
          const isAssigned = currentAssignments.some((a) => a.characterId === char.characterId);
          if (isAssigned) return null;

          return (
            <button
              key={char.characterId}
              type="button"
              onClick={() => onAssignCharacter(sceneId, char.characterId, "primary", char.defaultDimensionMode)}
              className="bg-indigo-950 text-indigo-200 border border-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-900"
            >
              + {char.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
