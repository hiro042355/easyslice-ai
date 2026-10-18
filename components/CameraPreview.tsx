"use client";

import React, { useRef, useEffect, useState } from "react";
import type { CameraMovement } from "@/lib/camera/cameraTypes";
import { interpolateCameraTransform } from "@/lib/camera/cameraEngine";

export type CameraPreviewProps = {
  src: string;
  movements: readonly CameraMovement[];
  clipStart?: number;
  clipEnd?: number;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
};

export function CameraPreview({
  src,
  movements,
  clipStart = 0,
  clipEnd,
  className = "",
  onTimeUpdate,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync animation frame for smooth transform calculation during video playback
  useEffect(() => {
    let animId: number;

    const updateFrame = () => {
      if (videoRef.current) {
        const absoluteTime = videoRef.current.currentTime;
        // Relative time within clip
        const relTime = Math.max(0, absoluteTime - clipStart);
        setCurrentTime(relTime);
        onTimeUpdate?.(relTime);
      }
      if (isPlaying) {
        animId = requestAnimationFrame(updateFrame);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(updateFrame);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, clipStart, onTimeUpdate]);

  // Compute camera transform for current time
  const transformState = interpolateCameraTransform(movements, currentTime);

  // Active camera movement label
  const activeMovement = movements.find(
    (m) => currentTime >= m.startTime && currentTime <= m.endTime
  );

  const handleTimeUpdate = () => {
    if (videoRef.current && clipEnd !== undefined && videoRef.current.currentTime >= clipEnd) {
      videoRef.current.pause();
      if (videoRef.current.currentTime > clipEnd) videoRef.current.currentTime = clipEnd;
    }
    if (videoRef.current && !isPlaying) {
      const relTime = Math.max(0, videoRef.current.currentTime - clipStart);
      setCurrentTime(relTime);
      onTimeUpdate?.(relTime);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black ${className}`}>
      {/* Video Container with Dynamic Camera 2D Transform */}
      <div className="relative w-full aspect-video overflow-hidden flex items-center justify-center bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = clipStart; }}
            onSeeking={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.currentTime < clipStart) video.currentTime = clipStart;
              if (clipEnd !== undefined && video.currentTime > clipEnd) video.currentTime = clipEnd;
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-fill origin-center"
            style={{
              transform: `scale(${transformState.zoom}) translate(${-transformState.x * 100}%, ${-transformState.y * 100}%)`,
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
            No Video Source
          </div>
        )}

        {/* Real-time Camera Overlay Badge */}
        {activeMovement && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-cyan-300/40 bg-zinc-950/80 px-3 py-1 text-[11px] font-bold text-cyan-200 backdrop-blur-md shadow-lg">
            <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
            <span>Camera: {activeMovement.movementType}</span>
            <span className="text-gray-400 font-normal">
              ({activeMovement.startZoom.toFixed(1)}x → {activeMovement.endZoom.toFixed(1)}x)
            </span>
          </div>
        )}
      </div>

      {/* Camera Timeline / Transform Info Bar */}
      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-950/90 px-4 py-2 text-[11px] font-mono text-gray-400">
        <div>
          Time: <span className="text-cyan-300 font-bold">{currentTime.toFixed(2)}s</span>
        </div>
        <div className="flex gap-3">
          <span>
            Zoom: <span className="text-white font-bold">{transformState.zoom.toFixed(2)}x</span>
          </span>
          <span>
            Shift: <span className="text-white font-bold">X:{transformState.x.toFixed(2)} Y:{transformState.y.toFixed(2)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default CameraPreview;
