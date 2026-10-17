import type { CameraMovement } from "../camera/cameraTypes";
import { parseCameraMovements, applyEasing } from "../camera/cameraEngine";

/**
 * Generates an FFmpeg complex filter expression for camera movements (pan/tilt/zoom/crane).
 * All numeric variables are strictly validated and formatted as fixed numbers to prevent filter injection.
 */
export const buildCameraFfmpegFilter = (
  movements: readonly CameraMovement[],
  clipDuration: number
): string | null => {
  const valid = parseCameraMovements(movements, clipDuration);
  if (valid.length === 0) return null;

  // For a clean dynamic crop in FFmpeg:
  // We construct expressions for zoom_expr, x_expr, y_expr as piecewise functions of t (time in seconds)
  // Default values when t is outside configured movements: zoom = 1.0, x_shift = 0, y_shift = 0.

  let zoomExpr = "1.0";
  let xShiftExpr = "0";
  let yShiftExpr = "0";

  valid.forEach((m) => {
    const tStart = m.startTime.toFixed(3);
    const tEnd = m.endTime.toFixed(3);
    const dur = Math.max(0.001, m.endTime - m.startTime).toFixed(3);

    const startZ = m.startZoom.toFixed(3);
    const endZ = m.endZoom.toFixed(3);

    const startX = m.startPosition.x.toFixed(3);
    const endX = m.endPosition.x.toFixed(3);

    const startY = m.startPosition.y.toFixed(3);
    const endY = m.endPosition.y.toFixed(3);

    // Normalized progress p in [0, 1] for current segment
    const p = `((t-${tStart})/${dur})`;

    // Piecewise segment zoom & shifts
    const segZoom = `(${startZ}+(${endZ}-${startZ})*${p})`;
    const segX = `(${startX}+(${endX}-${startX})*${p})`;
    const segY = `(${startY}+(${endY}-${startY})*${p})`;

    const inRange = `between(t,${tStart},${tEnd})`;

    zoomExpr = `if(${inRange},${segZoom},${zoomExpr})`;
    xShiftExpr = `if(${inRange},${segX},${xShiftExpr})`;
    yShiftExpr = `if(${inRange},${segY},${yShiftExpr})`;
  });

  // Crop dimensions: w = iw / zoom, h = ih / zoom
  // Crop origin: x = (iw - w)/2 + xShift * iw, y = (ih - h)/2 + yShift * ih
  const wExpr = `iw/(${zoomExpr})`;
  const hExpr = `ih/(${zoomExpr})`;
  const xExpr = `(iw-w)/2+(${xShiftExpr})*iw`;
  const yExpr = `(ih-h)/2+(${yShiftExpr})*ih`;

  // FFmpeg filter chain: crop dynamic area, then scale back to original input dimensions
  return `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=iw:ih`;
};
