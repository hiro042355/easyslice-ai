import type {ZeroCostEvidence} from "../../lib/server/tiktokQualification/zeroCostReadiness";
/** Non-secret observed blockers; never usable as runtime credentials or approval. */
export function unqualifiedSandboxFixture(): ZeroCostEvidence {
 return {version:"1",environment:"sandbox",origin:"https://www.nexcutai.com",redirectUri:"https://www.nexcutai.com/api/tiktok/oauth/callback",connectEnabled:false,workerEnabled:false,encryption:"HMAC",identity:"PRODUCTION_BOUND",components:{},checks:{database:{result:"BLOCKED",source:"STATIC_SOURCE"},encryption:{result:"BLOCKED",source:"STATIC_SOURCE"},runtimeIdentity:{result:"BLOCKED",source:"STATIC_SOURCE"},ownerAuthorization:{result:"BLOCKED",source:"STATIC_SOURCE"}}};
}
