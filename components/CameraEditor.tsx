"use client";

import React, { useState, useMemo } from "react";
import type {
  CameraEasing,
  CameraMovement,
  CameraMovementType,
  CameraRecommendation,
} from "@/lib/camera/cameraTypes";
import {
  ALLOWED_EASINGS,
  ALLOWED_MOVEMENT_TYPES,
  createDefaultCameraMovement,
  validateCameraMovement,
} from "@/lib/camera/cameraEngine";
import { Select } from "@/components/ui/Select";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { Modal } from "@/components/ui/Modal";

export type CameraEditorProps = {
  clipId?: string;
  clipDuration?: number;
  movements: readonly CameraMovement[];
  onChangeMovements: (movements: readonly CameraMovement[]) => void;
  className?: string;
};

export function CameraEditor({
  clipId = "primary-clip",
  clipDuration = 30,
  movements,
  onChangeMovements,
  className = "",
}: CameraEditorProps) {
  const selectedType: CameraMovementType = "PAN";
  const [editingMovement, setEditingMovement] = useState<CameraMovement | null>(null);
  const [validationError, setValidationError] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Local AI Recommendation generator (heuristic, zero network / cost)
  const recommendations: readonly CameraRecommendation[] = useMemo(() => {
    const recs: CameraRecommendation[] = [];

    // Rec 1: Zoom on Hook
    if (clipDuration >= 3) {
      recs.push({
        recommendationId: `rec-hook-${clipId}`,
        clipId,
        movementType: "ZOOM",
        startTime: 0,
        endTime: Math.min(3, clipDuration),
        confidence: 88,
        reason: "Emphasize opening hook with a subtle punchy zoom-in.",
        parameters: {
          startPosition: { x: 0, y: 0 },
          endPosition: { x: 0, y: 0 },
          startZoom: 1.0,
          endZoom: 1.3,
          easing: "ease-out",
        },
        analysisSource: "Rule Engine: Hook Moment",
        approvalStatus: "PROPOSED",
      });
    }

    // Rec 2: Horizontal Pan
    if (clipDuration >= 10) {
      recs.push({
        recommendationId: `rec-pan-${clipId}`,
        clipId,
        movementType: "PAN",
        startTime: Math.min(4, clipDuration - 5),
        endTime: Math.min(9, clipDuration),
        confidence: 82,
        reason: "Guide view across wide frame during context development.",
        parameters: {
          startPosition: { x: -0.2, y: 0 },
          endPosition: { x: 0.2, y: 0 },
          startZoom: 1.2,
          endZoom: 1.2,
          easing: "ease-in-out",
        },
        analysisSource: "Rule Engine: Subject Motion",
        approvalStatus: "PROPOSED",
      });
    }

    return Object.freeze(recs);
  }, [clipId, clipDuration]);

  const [recStates, setRecStates] = useState<Record<string, "PROPOSED" | "ACCEPTED" | "REJECTED" | "APPLIED">>({});

  const handleAddMovement = () => {
    const newMv = createDefaultCameraMovement(clipId, selectedType);
    setEditingMovement(newMv);
    setValidationError("");
    setIsModalOpen(true);
  };

  const handleEditMovement = (mv: CameraMovement) => {
    setEditingMovement({ ...mv });
    setValidationError("");
    setIsModalOpen(true);
  };

  const handleSaveMovement = () => {
    if (!editingMovement) return;
    const check = validateCameraMovement(editingMovement, clipDuration);
    if (!check.valid) {
      setValidationError(check.errors.join("; "));
      return;
    }

    const exists = movements.some((m) => m.id === editingMovement.id);
    let updated: CameraMovement[];
    if (exists) {
      updated = movements.map((m) =>
        m.id === editingMovement.id ? Object.freeze(editingMovement) : m
      );
    } else {
      updated = [...movements, Object.freeze(editingMovement)];
    }

    onChangeMovements(Object.freeze(updated));
    setIsModalOpen(false);
    setEditingMovement(null);
    setValidationError("");
  };

  const handleDeleteMovement = (id: string) => {
    const updated = movements.filter((m) => m.id !== id);
    onChangeMovements(Object.freeze(updated));
    setDeleteConfirmId(null);
  };

  const handleApplyRecommendation = (rec: CameraRecommendation) => {
    if (recStates[rec.recommendationId] !== "ACCEPTED") return;
    const newMv: CameraMovement = Object.freeze({
      id: `cam-${rec.recommendationId}`,
      clipId: rec.clipId ?? clipId,
      movementType: rec.movementType,
      startTime: rec.startTime,
      endTime: rec.endTime,
      startPosition: rec.parameters.startPosition ?? { x: 0, y: 0 },
      endPosition: rec.parameters.endPosition ?? { x: 0, y: 0 },
      startZoom: rec.parameters.startZoom ?? 1.2,
      endZoom: rec.parameters.endZoom ?? 1.2,
      easing: rec.parameters.easing ?? "ease-in-out",
      source: "ai_recommendation",
      approvalStatus: "APPLIED",
    });

    const check = validateCameraMovement(newMv, clipDuration);
    if (check.valid) {
      onChangeMovements(Object.freeze([...movements, newMv]));
      setRecStates((prev) => ({ ...prev, [rec.recommendationId]: "APPLIED" }));
    }
  };

  const handleRejectRecommendation = (recId: string) => {
    setRecStates((prev) => ({ ...prev, [recId]: "REJECTED" }));
  };

  return (
    <div className={`rounded-2xl border border-cyan-300/20 bg-zinc-950/80 p-5 shadow-xl text-white ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <span className="text-cyan-300">📹</span> Camera Direction
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            2D crop & scale movement configuration for clip editing.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddMovement}
          className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-zinc-950 hover:bg-cyan-200 transition focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          + Add Camera Movement
        </button>
      </div>

      {/* Active Camera Movements List */}
      <div className="mt-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
          Timeline Movements ({movements.length})
        </h3>

        {movements.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-gray-400 text-center">
            No camera movements configured. Click &quot;+ Add Camera Movement&quot; or apply an AI recommendation below.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {movements.map((mv) => (
              <div
                key={mv.id}
                className="rounded-xl border border-white/10 bg-zinc-900/90 p-3.5 flex flex-col justify-between gap-3 hover:border-cyan-300/30 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-200">
                      {mv.movementType}
                    </span>
                    <p className="mt-2 text-xs font-bold text-white">
                      {mv.startTime.toFixed(1)}s - {mv.endTime.toFixed(1)}s
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditMovement(mv)}
                      className="text-xs text-cyan-300 hover:text-cyan-200 p-1 rounded hover:bg-white/10"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(mv.id)}
                      className="text-xs text-red-400 hover:text-red-300 p-1 rounded hover:bg-white/10"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 border-t border-white/5 pt-2">
                  <div>
                    Zoom: <span className="text-white font-semibold">{mv.startZoom}x → {mv.endZoom}x</span>
                  </div>
                  <div>
                    Easing: <span className="text-white font-semibold">{mv.easing}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accordion: AI Camera Director Foundation (Phase 9) */}
      <Accordion className="mt-6">
        <AccordionItem
          title="🤖 AI Camera Director (Foundation Recommendations)"
          subtitle="Rule-assisted camera movement suggestions based on scene timing"
        >
          <div className="space-y-3">
            <p className="text-xs leading-5 text-gray-300">
              Review AI recommendations below. You retain 100% control: manual camera settings are never overwritten without explicit approval.
            </p>

            <div className="grid gap-3">
              {recommendations.map((rec) => {
                const status = recStates[rec.recommendationId] || rec.approvalStatus;
                const isApplied = status === "APPLIED";
                const isRejected = status === "REJECTED";

                return (
                  <div
                    key={rec.recommendationId}
                    className={`rounded-xl border p-3.5 transition ${
                      isApplied
                        ? "border-green-300/40 bg-green-300/10"
                        : isRejected
                        ? "border-gray-700 bg-black/40 opacity-60"
                        : "border-purple-300/30 bg-purple-300/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-purple-200">
                            {rec.movementType} ({rec.startTime}s - {rec.endTime}s)
                          </span>
                          <span className="rounded-full bg-purple-300/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                            Confidence: {rec.confidence}%
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-300">{rec.reason}</p>
                        <p className="mt-1 text-[10px] text-gray-500 font-mono">
                          Source: {rec.analysisSource}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isApplied ? (
                          <span className="text-xs font-bold text-green-300">✓ Applied</span>
                        ) : isRejected ? (
                          <span className="text-xs font-bold text-gray-500">Rejected</span>
                        ) : (
                          <>
                            <button
                              type="button"
                                onClick={() => status === "ACCEPTED"
                                  ? handleApplyRecommendation(rec)
                                  : setRecStates(prev => ({...prev, [rec.recommendationId]: "ACCEPTED"}))}
                              className="rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-cyan-200 transition"
                            >
                                {status === "ACCEPTED" ? "Apply" : "Accept"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectRecommendation(rec.recommendationId)}
                              className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AccordionItem>
      </Accordion>

      {/* Modal Dialog for Edit/Add Camera Movement */}
      {isModalOpen && editingMovement && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingMovement.id ? "Edit Camera Movement" : "Add Camera Movement"}
          confirmLabel="Save Configuration"
          onConfirm={handleSaveMovement}
        >
          <div className="space-y-4">
            {validationError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300">
                {validationError}
              </p>
            )}

            <Select<CameraMovementType>
              label="Movement Type"
              options={ALLOWED_MOVEMENT_TYPES.map((type) => ({
                value: type,
                label: type,
              }))}
              value={editingMovement.movementType}
              onChange={(type) => {
                const defaults = createDefaultCameraMovement(clipId, type);
                setEditingMovement((prev) =>
                  prev ? { ...prev, ...defaults, movementType: type, id: prev.id } : null
                );
              }}
            />

            {editingMovement.movementType === "TRACKING" && (
              <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-3 text-xs text-yellow-100">
                <p className="font-bold">Subject Tracking Note</p>
                <p className="mt-1 text-yellow-100/80">
                  Automated tracking metadata is currently unavailable. Utilizing manual target keyframe offsets.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  Start Time (seconds)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={clipDuration}
                  value={editingMovement.startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditingMovement((prev) => (prev ? { ...prev, startTime: val } : null));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-300"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  End Time (seconds)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={clipDuration}
                  value={editingMovement.endTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditingMovement((prev) => (prev ? { ...prev, endTime: val } : null));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  Start Zoom ({editingMovement.startZoom.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={editingMovement.startZoom}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setEditingMovement((prev) => (prev ? { ...prev, startZoom: val } : null));
                  }}
                  className="w-full accent-cyan-300"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  End Zoom ({editingMovement.endZoom.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={editingMovement.endZoom}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setEditingMovement((prev) => (prev ? { ...prev, endZoom: val } : null));
                  }}
                  className="w-full accent-cyan-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  Start Offset X ({editingMovement.startPosition.x.toFixed(2)})
                </label>
                <input
                  type="range"
                  min="-0.5"
                  max="0.5"
                  step="0.05"
                  value={editingMovement.startPosition.x}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setEditingMovement((prev) =>
                      prev
                        ? {
                            ...prev,
                            startPosition: { ...prev.startPosition, x: val },
                          }
                        : null
                    );
                  }}
                  className="w-full accent-cyan-300"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-cyan-300 block mb-1">
                  End Offset X ({editingMovement.endPosition.x.toFixed(2)})
                </label>
                <input
                  type="range"
                  min="-0.5"
                  max="0.5"
                  step="0.05"
                  value={editingMovement.endPosition.x}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setEditingMovement((prev) =>
                      prev
                        ? {
                            ...prev,
                            endPosition: { ...prev.endPosition, x: val },
                          }
                        : null
                    );
                  }}
                  className="w-full accent-cyan-300"
                />
              </div>
            </div>

            <Select<CameraEasing>
              label="Easing Curve"
              options={ALLOWED_EASINGS.map((e) => ({
                value: e,
                label: e,
              }))}
              value={editingMovement.easing}
              onChange={(easing) => {
                setEditingMovement((prev) => (prev ? { ...prev, easing } : null));
              }}
            />
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <Modal
          isOpen={Boolean(deleteConfirmId)}
          onClose={() => setDeleteConfirmId(null)}
          title="Delete Camera Movement"
          description="Are you sure you want to remove this camera movement from the clip?"
          confirmLabel="Delete"
          isDestructive
          onConfirm={() => handleDeleteMovement(deleteConfirmId)}
        />
      )}
    </div>
  );
}

export default CameraEditor;
