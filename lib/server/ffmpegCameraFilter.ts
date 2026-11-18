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
  if (!Number.isFinite(clipDuration) || clipDuration <= 0 || clipDuration > 86400) return null;
  if (!Array.isArray(movements) || movements.length > 128) return null;
  const valid = parseCameraMovements(movements, clipDuration);
  if (valid.length === 0) return null;

  if (![width, height].every(n => Number.isInteger(n) && n >= 16 && n <= 7680) ||
      !Number.isInteger(fps) || fps < 1 || fps > 120) return null;
  const outWidth = width;
  const outHeight = height;
  const outFps = fps;

  let zoomExpr = "1.0";
  let xShiftExpr = "0";
  let yShiftExpr = "0";

  // Reverse nesting preserves the preview's first matching movement priority.
  [...valid].reverse().forEach((m) => {
    const fStart = m.startTime * outFps;
    const fEnd = m.endTime * outFps;
    const fDur = fEnd - fStart;

    const startZ = String(m.startZoom);
    const endZ = String(m.endZoom);

    const startX = String(m.startPosition.x);
    const endX = String(m.endPosition.x);

    const startY = String(m.startPosition.y);
    const endY = String(m.endPosition.y);

    // Progress p in [0, 1] relative to frame number 'on'
    const t = `clip((on-${fStart})/${fDur},0,1)`;
    const p = m.easing === "ease-in" ? `(${t}*${t})`
      : m.easing === "ease-out" ? `(${t}*(2-${t}))`
      : m.easing === "ease-in-out" ? `if(lt(${t},0.5),2*${t}*${t},-1+(4-2*${t})*${t})` : t;

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
  const xPosExpr = `clip((iw-iw/zoom)/2+(${xShiftExpr})*iw,0,iw-iw/zoom)`;
  const yPosExpr = `clip((ih-ih/zoom)/2+(${yShiftExpr})*ih,0,ih-ih/zoom)`;

  return `zoompan=z='${zoomExpr}':x='${xPosExpr}':y='${yPosExpr}':d=1:s=${outWidth}x${outHeight}:fps=${outFps}`;
};
