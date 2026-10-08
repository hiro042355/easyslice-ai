import {createStatusObserver} from "./status";
import { createTikTokRealProviderComposition } from "./artifact/tiktok/real/TikTokRealProviderComposition.js";
import { sanitizeCreatorView, createConsent, consentValid, buildExportRequest } from "./artifact/export/ExportConsent.js";
import type { PublisherB7Ports } from "../tiktokIntegration/publisher";
/** Narrow compiled package from accepted B7 only; current route composition remains disabled. */
export const acceptedPublisherB7:PublisherB7Ports=Object.freeze({compose:createTikTokRealProviderComposition,sanitizeCreatorView,createConsent,consentValid,buildExportRequest,createStatusObserver});
