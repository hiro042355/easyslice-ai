import type { CameraMovement } from "../camera/cameraTypes";
import { parseCameraMovements } from "../camera/cameraEngine";

/**
 * Generates an FFmpeg complex filter expression for camera movements (pan/tilt/zoom/crane).
 * Uses FFmpeg's `zoompan` filter for frame-by-frame 2D camera transform interpolation.
 * All numeric variables are strictly formatted as fixed-decimal tokens to prevent injection.
 */
export const buildCameraFfmpegFilter = (
  movements: readonly CameraMovement[],
  clipDuration: number,
  width = 1280,
  height = 720,
  fps = 30
): string | null => {
  const valid = parseCameraMovements(movements, clipDuration);
  if (valid.length === 0) return null;

  const outWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 1280;
  const outHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 720;
  const outFps = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30;

  let zoomExpr = "1.0";
  let xShiftExpr = "0";
  let yShiftExpr = "0";

  valid.forEach((m) => {
    const fStart = Math.round(m.startTime * outFps);
    const fEnd = Math.round(m.endTime * outFps);
    const fDur = Math.max(1, fEnd - fStart);

    const startZ = m.startZoom.toFixed(3);
    const endZ = m.endZoom.toFixed(3);

    const startX = m.startPosition.x.toFixed(3);
    const endX = m.endPosition.x.toFixed(3);

    const startY = m.startPosition.y.toFixed(3);
    const endY = m.endPosition.y.toFixed(3);

    // Progress p in [0, 1] relative to frame number 'on'
    const p = `((on-${fStart})/${fDur})`;

    const segZ = `(${startZ}+(${endZ}-${startZ})*${p})`;
    const segX = `(${startX}+(${endX}-${startX})*${p})`;
    const segY = `(${startY}+(${endY}-${startY})*${p})`;

    const inRange = `between(on,${fStart},${fEnd})`;

    zoomExpr = `if(${inRange},${segZ},${zoomExpr})`;
    xShiftExpr = `if(${inRange},${segX},${xShiftExpr})`;
    yShiftExpr = `if(${inRange},${segY},${yShiftExpr})`;
  });

  // Calculate pixel offsets for zoompan:
  // x_pos = (iw - iw/zoom)/2 + x_shift * iw
  // y_pos = (ih - ih/zoom)/2 + y_shift * ih
  const xPosExpr = `(iw-iw/zoom)/2+(${xShiftExpr})*iw`;
  const yPosExpr = `(ih-ih/zoom)/2+(${yShiftExpr})*ih`;

  return `zoompan=z='${zoomExpr}':x='${xPosExpr}':y='${yPosExpr}':d=1:s=${outWidth}x${outHeight}:fps=${outFps}`;
};
