import {requireAuthenticatedRequest} from '@/lib/server/productionIdentity/routeGuard';
import {createLegacyVideoRoute} from '@/lib/server/legacyVideoRouteCore';

// Compatibility entry only; all bytes are served by owner-scoped durable routes.
export const GET=createLegacyVideoRoute(requireAuthenticatedRequest);
