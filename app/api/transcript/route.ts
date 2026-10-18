import {createClipTranscriptRoute} from '@/lib/server/clipTranscriptCore';
import {transcribeProductionOwnedClip} from '@/lib/server/clipTranscript';
import {requireAuthenticatedRequest} from '@/lib/server/productionIdentity/routeGuard';
export const runtime='nodejs';
export const POST=createClipTranscriptRoute({authenticate:requireAuthenticatedRequest,transcribe:transcribeProductionOwnedClip});
