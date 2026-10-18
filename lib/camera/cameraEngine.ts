import type {
  CameraEasing,
  CameraMovement,
  CameraMovementType,
  CameraTransformState,
  CameraValidationResult,
  Position2D,
} from "./cameraTypes";

export const ALLOWED_MOVEMENT_TYPES: readonly CameraMovementType[] = [
  "PAN",
  "TILT",
  "ZOOM",
  "TRACKING",
  "CRANE_SIMULATION",
];

export const ALLOWED_EASINGS: readonly CameraEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
];

export const MIN_ZOOM = 1.0;
export const MAX_ZOOM = 3.0;
export const MIN_POSITION = -1.0;
export const MAX_POSITION = 1.0;

export const createDefaultCameraMovement = (
  clipId = "default-clip",
  type: CameraMovementType = "PAN"
): CameraMovement => {
  const defaults: Record<CameraMovementType, Partial<CameraMovement>> = {
    PAN: {
      startPosition: { x: -0.2, y: 0 },
      endPosition: { x: 0.2, y: 0 },
      startZoom: 1.2,
      endZoom: 1.2,
    },
    TILT: {
      startPosition: { x: 0, y: -0.2 },
      endPosition: { x: 0, y: 0.2 },
      startZoom: 1.2,
      endZoom: 1.2,
    },
    ZOOM: {
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 0, y: 0 },
      startZoom: 1.0,
      endZoom: 1.4,
    },
    TRACKING: {
      startPosition: { x: -0.15, y: -0.1 },
      endPosition: { x: 0.15, y: 0.1 },
      startZoom: 1.25,
      endZoom: 1.25,
      trackingTargetId: "subject-1",
    },
    CRANE_SIMULATION: {
      startPosition: { x: 0, y: 0.25 },
      endPosition: { x: 0, y: -0.25 },
      startZoom: 1.1,
      endZoom: 1.35,
    },
  };

  const selected = defaults[type] ?? defaults.PAN;

  return Object.freeze({
    id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clipId,
    movementType: type,
    startTime: 0,
    endTime: 5,
    startPosition: selected.startPosition ?? { x: 0, y: 0 },
    endPosition: selected.endPosition ?? { x: 0, y: 0 },
    startZoom: selected.startZoom ?? 1.2,
    endZoom: selected.endZoom ?? 1.2,
    easing: "ease-in-out",
    trackingTargetId: selected.trackingTargetId,
    source: "manual",
    approvalStatus: "APPLIED",
  });
};

export const validateCameraMovement = (
  movement: unknown,
  clipDuration?: number
): CameraValidationResult => {
  const errors: string[] = [];

  if (!movement || typeof movement !== "object") {
    return Object.freeze({ valid: false, errors: ["Movement object is required"] });
  }

  const m = movement as Partial<CameraMovement>;

  if (!m.id || typeof m.id !== "string") {
    errors.push("Invalid or missing ID");
  }

  if (!m.movementType || !ALLOWED_MOVEMENT_TYPES.includes(m.movementType as CameraMovementType)) {
    errors.push(`Invalid movementType. Must be one of: ${ALLOWED_MOVEMENT_TYPES.join(", ")}`);
  }

  if (
    typeof m.startTime !== "number" ||
    !Number.isFinite(m.startTime) ||
    m.startTime < 0
  ) {
    errors.push("startTime must be a finite non-negative number");
  }

  if (
    typeof m.endTime !== "number" ||
    !Number.isFinite(m.endTime) ||
    (typeof m.startTime === "number" && m.endTime <= m.startTime)
  ) {
    errors.push("endTime must be a finite number strictly greater than startTime");
  }

  if (
    typeof clipDuration === "number" &&
    Number.isFinite(clipDuration) &&
    clipDuration > 0
  ) {
    if (typeof m.endTime === "number" && m.endTime > clipDuration) {
      errors.push(`endTime (${m.endTime}s) exceeds clip duration (${clipDuration}s)`);
    }
  }

  const validatePosition = (pos: unknown, name: string) => {
    if (!pos || typeof pos !== "object") {
      errors.push(`${name} position object is missing`);
      return;
    }
    const p = pos as Position2D;
    if (typeof p.x !== "number" || !Number.isFinite(p.x) || p.x < MIN_POSITION || p.x > MAX_POSITION) {
      errors.push(`${name}.x must be a finite number between ${MIN_POSITION} and ${MAX_POSITION}`);
    }
    if (typeof p.y !== "number" || !Number.isFinite(p.y) || p.y < MIN_POSITION || p.y > MAX_POSITION) {
      errors.push(`${name}.y must be a finite number between ${MIN_POSITION} and ${MAX_POSITION}`);
    }
  };

  validatePosition(m.startPosition, "startPosition");
  validatePosition(m.endPosition, "endPosition");

  const validateZoom = (zoom: unknown, name: string) => {
    if (
      typeof zoom !== "number" ||
      !Number.isFinite(zoom) ||
      zoom < MIN_ZOOM ||
      zoom > MAX_ZOOM
    ) {
      errors.push(`${name} must be a finite number between ${MIN_ZOOM} and ${MAX_ZOOM}`);
    }
  };

  validateZoom(m.startZoom, "startZoom");
  validateZoom(m.endZoom, "endZoom");

  if (!m.easing || !ALLOWED_EASINGS.includes(m.easing as CameraEasing)) {
    errors.push(`Invalid easing. Must be one of: ${ALLOWED_EASINGS.join(", ")}`);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
};

export const validateCameraMovementArray = (
  movements: unknown,
  clipDuration?: number
): CameraValidationResult => {
  if (!Array.isArray(movements)) {
    return Object.freeze({ valid: false, errors: ["Movements must be an array"] });
  }

  const allErrors: string[] = [];
  movements.forEach((item, index) => {
    const res = validateCameraMovement(item, clipDuration);
    if (!res.valid) {
      res.errors.forEach((err) => allErrors.push(`[Index ${index}] ${err}`));
    }
  });

  return Object.freeze({
    valid: allErrors.length === 0,
    errors: Object.freeze(allErrors),
  });
};

export const applyEasing = (t: number, easing: CameraEasing): number => {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return clamped * (2 - clamped);
    case "ease-in-out":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : -1 + (4 - 2 * clamped) * clamped;
    case "linear":
    default:
      return clamped;
  }
};

export const interpolateCameraTransform = (
  movements: readonly CameraMovement[],
  currentTime: number
): CameraTransformState => {
  const defaultState: CameraTransformState = Object.freeze({
    zoom: 1.0,
    x: 0,
    y: 0,
  });

  if (!movements || movements.length === 0 || !Number.isFinite(currentTime)) {
    return defaultState;
  }

  // Find active movement covering currentTime
  const active = movements.find(
    (m) => currentTime >= m.startTime && currentTime <= m.endTime
  );

  if (!active) {
    return defaultState;
  }

  const duration = active.endTime - active.startTime;
  if (duration <= 0) {
    return defaultState;
  }

  const rawProgress = (currentTime - active.startTime) / duration;
  const progress = applyEasing(rawProgress, active.easing);

  const rawZoom =
    active.startZoom + (active.endZoom - active.startZoom) * progress;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));

  const rawX =
    active.startPosition.x +
    (active.endPosition.x - active.startPosition.x) * progress;
  const rawY =
    active.startPosition.y +
    (active.endPosition.y - active.startPosition.y) * progress;

  // Clamp crop shift relative to zoom level so crop never exceeds frame
  // At zoom 1.0, max shift is 0. At zoom 2.0, max shift is 0.25 (50% of available margin)
  const maxShift = Math.max(0, (1 - 1 / zoom) / 2);
  const clampedX = Math.max(-maxShift, Math.min(maxShift, rawX));
  const clampedY = Math.max(-maxShift, Math.min(maxShift, rawY));

  return Object.freeze({
    zoom,
    x: clampedX,
    y: clampedY,
  });
};

export const parseCameraMovements = (
  data: unknown,
  clipDuration?: number
): readonly CameraMovement[] => {
  if (!Array.isArray(data)) return [];

  const validMovements: CameraMovement[] = [];
  data.forEach((item) => {
    const check = validateCameraMovement(item, clipDuration);
    if (check.valid) {
      validMovements.push(Object.freeze(item as CameraMovement));
    }
  });

  return Object.freeze(validMovements);
};
