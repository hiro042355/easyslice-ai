import { unavailableRoute } from "../../../../../lib/server/localTikTok/routes";
// Deployment default is inert: local services cannot be activated by flags or request input.
export function POST(){ return unavailableRoute(); }
