import "server-only";
// Future authorized backend must supply actual authentication/ownership/currentness evidence.
// This module performs projection only, never authentication, DB access or network I/O.
export { projectVerifiedServerResponse } from "../tiktokConnection/viewCore";
export type { VerifiedServerContext } from "../tiktokConnection/viewCore";
