# NEXCUT AI — Camera Direction Architecture & Implementation

## Overview
This document details the Camera Direction system implemented for NEXCUT AI. The camera direction feature provides manual movement configuration, real-time 2D preview transforms, dynamic FFmpeg filter rendering during video export, and an AI Camera Director recommendation foundation.

## Supported Camera Movement Types
1. **PAN**: Horizontal crop motion across the source frame.
2. **TILT**: Vertical crop motion up or down the frame.
3. **ZOOM**: Scale shift from starting zoom (1.0x - 3.0x) to ending zoom.
4. **TRACKING**: Follows a subject across keyframes. When automated tracking metadata is unavailable, manual coordinate target keyframes are used.
5. **CRANE_SIMULATION**: Controlled vertical motion combined with subtle zoom.

*Note: These operations apply 2D crop, translation, and scaling to existing source footage. They do not reconstruct 3D geometry or synthesize physical camera perspectives.*

## Data Model & Types (`lib/camera/cameraTypes.ts`)
```typescript
export type CameraMovementType = "PAN" | "TILT" | "ZOOM" | "TRACKING" | "CRANE_SIMULATION";
export type CameraEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type CameraApprovalStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "APPLIED";

export interface Position2D {
  x: number; // Normalized horizontal shift [-1.0, 1.0]
  y: number; // Normalized vertical shift [-1.0, 1.0]
}

export interface CameraMovement {
  id: string;
  clipId?: string;
  movementType: CameraMovementType;
  startTime: number; // Seconds relative to clip start
  endTime: number;   // Seconds relative to clip start
  startPosition: Position2D;
  endPosition: Position2D;
  startZoom: number; // 1.0 to 3.0
  endZoom: number;   // 1.0 to 3.0
  easing: CameraEasing;
  trackingTargetId?: string;
  source: "manual" | "ai_recommendation";
  approvalStatus: CameraApprovalStatus;
}
```

## Validation & Safety Rules (`lib/camera/cameraEngine.ts`)
- All numerical properties are strictly validated for finite values (rejecting `NaN` and `Infinity`).
- Time boundaries enforced: `0 <= startTime < endTime <= clipDuration`.
- Zoom limits enforced: `1.0 <= zoom <= 3.0`.
- Crop offset shifts bounded to prevent black borders: `maxShift = Math.max(0, (1 - 1 / zoom) / 2)`.
- Backward compatibility: Clips without camera movements default gracefully to unscaled full-frame video (`zoom = 1.0, x = 0, y = 0`).

## Video Preview (`components/CameraPreview.tsx`)
- Applies real-time 2D CSS transforms (`scale` & `translate`) synchronized with `<video>` element `currentTime` during playback and seeking.
- Clamps position shifts dynamically to avoid rendering black borders.

## Video Export (`lib/server/ffmpegCameraFilter.ts` & `app/api/cut/route.ts`)
- Converts active camera movements into dynamic FFmpeg `crop` and `scale` filtergraphs.
- Sanitizes all numeric parameters as fixed-decimal tokens to guarantee immunity against shell command or FFmpeg expression injection.
- Applied server-side via packaged FFmpeg execution.

## AI Camera Director Foundation
- Provides local rule-assisted camera movement recommendations based on clip timing (e.g. hook punch-in zoom, context pan).
- Recommends movements with approval statuses (`PROPOSED`, `ACCEPTED`, `REJECTED`, `APPLIED`).
- Operates zero external API calls or paid inference; users retain full manual control.

## Feature Status Matrix
- **PAN / TILT / ZOOM / CRANE_SIMULATION**: `IMPLEMENTED` & `VERIFIED`
- **MANUAL CAMERA DIRECTION UI**: `IMPLEMENTED` & `VERIFIED`
- **2D TIMELINE PREVIEW**: `IMPLEMENTED` & `VERIFIED`
- **FFMPEG VIDEO EXPORT**: `IMPLEMENTED` & `VERIFIED`
- **TRACKING SHOT**: `IMPLEMENTED` (Manual Keyframe Target Fallback)
- **AI CAMERA DIRECTOR FOUNDATION**: `IMPLEMENTED` (Local Rule-Assisted Foundation)
