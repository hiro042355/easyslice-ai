export type CameraMovementType =
  | "PAN"
  | "TILT"
  | "ZOOM"
  | "TRACKING"
  | "CRANE_SIMULATION";

export type CameraEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type CameraApprovalStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "REJECTED"
  | "APPLIED";

export type Position2D = Readonly<{
  x: number; // Normalized horizontal crop shift [-1.0, 1.0], 0 is center
  y: number; // Normalized vertical crop shift [-1.0, 1.0], 0 is center
}>;

export type CameraMovement = Readonly<{
  id: string;
  clipId?: string;
  movementType: CameraMovementType;
  startTime: number; // Seconds relative to clip start
  endTime: number; // Seconds relative to clip start
  startPosition: Position2D;
  endPosition: Position2D;
  startZoom: number; // 1.0 to 3.0
  endZoom: number; // 1.0 to 3.0
  easing: CameraEasing;
  trackingTargetId?: string;
  source: "manual" | "ai_recommendation";
  approvalStatus: CameraApprovalStatus;
}>;

export type CameraRecommendation = Readonly<{
  recommendationId: string;
  clipId?: string;
  movementType: CameraMovementType;
  startTime: number;
  endTime: number;
  confidence: number; // 0 to 100
  reason: string;
  target?: string;
  parameters: Partial<CameraMovement>;
  analysisSource: string;
  approvalStatus: CameraApprovalStatus;
}>;

export type CameraTransformState = Readonly<{
  zoom: number;
  x: number;
  y: number;
}>;

export type CameraValidationResult = Readonly<{
  valid: boolean;
  errors: readonly string[];
}>;
