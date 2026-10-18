import {requireAuthenticatedRequest} from '@/lib/server/productionIdentity/routeGuard';
import {createSubtitleTranslationRoute} from '@/lib/server/subtitleTranslationCore';
export const POST=createSubtitleTranslationRoute({authenticate:requireAuthenticatedRequest,readKey:()=>process.env.GEMINI_API_KEY,fetchImpl:fetch});
