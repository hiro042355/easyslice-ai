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
- Converts movements into FFmpeg `zoompan` expressions with the same four easing functions and first-match priority as the preview.
- Only validated finite numeric values enter expressions; output dimensions, frame rate, duration and movement count are bounded. The route rejects malformed camera payloads instead of silently exporting without the requested effect.
- Applied server-side via packaged FFmpeg execution.

## AI Camera Director Foundation
- Provides local rule-assisted camera movement recommendations based on clip timing (e.g. hook punch-in zoom, context pan).
- Recommends movements with approval statuses (`PROPOSED`, `ACCEPTED`, `REJECTED`, `APPLIED`).
- Operates zero external API calls or paid inference; users retain full manual control.

## Verification scope (integration V4)
- Ten synthetic FFmpeg cases measure crop/zoom at seven frames and nine coordinates per frame against `interpolateCameraTransform`, within five RGB ramp levels (including chroma/crop rounding).
- Three synthetic MP4 exports are encoded and decoded locally. These do not prove the authenticated storage/export route in Production.
- Preview uses the same crop-centre direction, without an extra CSS easing transition. The fixed 16:9 preview stretches source imagery like the default 1280x720 export; alternative output aspect ratios and browser pixel-level parity remain unverified.
- Continuous preview timing is sampled at discrete export frame times. Overlaps use the first matching movement, including shared inclusive endpoints.
- Recommendation acceptance and application are separate explicit actions, covered by a DOM test. Rule scores are heuristics, not model confidence or scene understanding.
- TRACKING is manual keyframe motion only: no computer vision tracking. CRANE_SIMULATION is 2D only.
