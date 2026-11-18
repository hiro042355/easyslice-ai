"use client";

import React, { useState } from "react";
import type { CharacterBible, DimensionMode } from "@/lib/characterEngineV2/types";

interface ArtworkUploaderProps {
  character: CharacterBible;
  onUpload: (characterId: string, fileData: { name: string; mimeType: string; dataUrl: string }, mode: DimensionMode) => void;
}

export const ArtworkUploader: React.FC<ArtworkUploaderProps> = ({ character, onUpload }) => {
  const [selectedMode, setSelectedMode] = useState<DimensionMode>(character.defaultDimensionMode);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        onUpload(character.characterId, { name: file.name, mimeType: file.type, dataUrl }, selectedMode);
      }
      setUploading(false);
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800 mt-4">
      <h4 className="text-sm font-bold mb-2">Upload Artwork Reference for {character.name}</h4>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Target Mode:</span>
          {(["2D", "3D", "hybrid"] as DimensionMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSelectedMode(mode)}
              className={`px-2 py-1 rounded text-xs ${
                selectedMode === mode ? "bg-indigo-600 text-white font-bold" : "bg-slate-800 text-slate-300"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
        />
      </div>
      {uploading && <p className="text-xs text-indigo-400 mt-2">Processing artwork reference...</p>}
    </div>
  );
};
