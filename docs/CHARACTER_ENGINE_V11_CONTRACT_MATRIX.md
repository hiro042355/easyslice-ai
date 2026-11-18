# Character Engine V11 contract matrix

## Authority and scope

Archive: `nexcut-character-engine-0-nexcut-engine-development-eb546ed2.zip`.
SHA256: `4948cfb9a91f53935e174ff81fafcf24a335cff74e5aa8ae21ee65ce898cff87`.
Fixed upstream commit: `6aa8474495820df64093935e8e82feb27d92c029`;
tree: `b451bed221aa179d2ccc32d7580f6c232268d135`.
V9 provenance evidence verified all 142 archive blobs against that tree and the signed commit. V11 rechecks archive bytes/CRC; ZIP metadata is not used as provenance.

Sources below are paths **inside that fixed archive**, not files in this repository.
OpenAPI `docs/integration/openapi.json` declares OpenAPI 3.0.3 / API 1.0.0, with server base `/api/v1`. The six numbered Markdown contracts do not independently declare semantic versions.

OpenAPI lacks security/securitySchemes and almost all request/response body schemas. Consequently HTTP paths do not constitute a complete production authority contract. Envelopes below come from `src/domain/character/api-router.ts`, not invented OpenAPI schemas.

## Shared authentication, authorization and errors

- HTTP contract: `docs/integration/API_CONTRACT.md`, Authentication & Authorization; Bearer or API key, CREATOR/VIEWER/ADMIN.
- Implementation: `src/domain/character/api-router.ts:61-69` authenticates; `auth.ts:179-229` evaluates roles and only evaluates owner/project boundaries when resource details are supplied.
- `auth.ts:38,72-109,119-147` contains a development default secret and always-populated local fixture registries. This is not verified production credential custody. No fixture credential is copied or used by NEXCUT.
- `api-router.ts:47-48,466-468`: errors are `{ok:false,error,details?}`, usually 400; unauthenticated401, forbidden403, missing resource404. Raw exception messages can become HTTP error text upstream. NEXCUT projects bounded error categories instead.
- No live security certification is inferred. Production NEXCUT Character calls remain rejected before transport in `lib/server/characterEngine/clientCore.ts`; development Casting cannot be constructed in production.

## Operation matrix

Each row includes contract version, request/response, auth, revision semantics, adapter behavior, mismatch, security impact, remediation and status.

| Operation | Contract / implementation | Request → response | Authentication / authorization / identity revision | Current adapter / mismatch / security impact | Remediation / status |
|---|---|---|---|---|---|
| Character creation | Contract1 `CHARACTER_ID_CONTRACT.md`; HTTP1.0.0 `POST /characters`; router84-103 | `{name,description,visualStyleId}` →201 `{ok:true,character}`; OpenAPI supplies only request schema | Shared auth; CHARACTER_CREATE role; owner is principal.userId; revision created by domain | No NEXCUT mutation method. No production credential/project authority established | D: unsupported by adapter; C: production authority unresolved. Keep disabled. BLOCKED |
| Character retrieval | Contract1; `GET /characters/{id}`; router105-115 | opaque character id →200 `{ok:true,character}`; response body schema absent in OpenAPI | Shared auth; CHARACTER_READ with actual owner; lock snapshot revision checked by NEXCUT | `createCharacterReadClient.lockedIdentity` only, fixed HTTPS origin, timeout/size limits; validates character, owner field, lock/revision/Bible consistency. Not a project authorization service | Read-only compatibility in development, production transport denied. C. BLOCKED |
| Character update | Contract1 describes revision lifecycle; no generic character PUT/PATCH route in router or OpenAPI | General name/description update HTTP request/response NOT IMPLEMENTED; Bible update is separate below | No general HTTP authority contract; do not infer from CHARACTER_UPDATE enum | No NEXCUT method. Inventing a URL would fabricate support | D; unsupported. BLOCKED |
| Character deletion | `auth.ts` has CHARACTER_DELETE enum but no HTTP DELETE character route in router/OpenAPI | NOT IMPLEMENTED HTTP contract | No canonical delete/revision/reference/casting cleanup policy established | No NEXCUT method; auth enum is not an endpoint | D/C; unsupported and cleanup semantics unresolved. BLOCKED |
| Character Bible | Contract2 `CHARACTER_BIBLE_CONTRACT.md`; GET/PUT `/characters/{id}/bible`; router156-181 | GET→`{ok:true,bible}`; PUT `{bible:Partial<CharacterBible>}`→`{ok:true,revision}`;14 fields including movementStyle/referenceAssetIds | Shared auth; CHARACTER_READ/UPDATE with owner. Locked edits create new draft under domain lifecycle; reference IDs must belong to character | NEXCUT validates Bible only inside a locked snapshot; no mutation endpoint exposed | D for adapter mutations; C for production revision/reference authority. BLOCKED |
| Identity Lock | Contract3 `IDENTITY_LOCK_CONTRACT.md`; GET/POST `/characters/{id}/lock`; router186-211 | GET→`{ok:true,identityLock:null|IdentityLock}`; POST `{revisionId}`→`{ok:true,character}` | Shared auth; READ/IDENTITY_LOCK with owner. Only APPROVED→LOCKED, immutable revision snapshot | NEXCUT checks lockedRevision.id/character/status/Bible and exactly one matching revision, but does not mutate lock | No client badges treated as authority; production denied. C/D. BLOCKED |
| Identity revision | Contract1; GET/POST `/characters/{id}/revisions`; router117-151 | GET→`{ok:true,revisions}`; POST `{revisionId,status:READY_FOR_REVIEW|APPROVED}`→`{ok:true,revision}` | Shared auth; READ, REVISION_CREATE/APPROVE with owner. DRAFT→READY_FOR_REVIEW→APPROVED→LOCKED; revision owned by one character | Read client checks requested opaque revision and frozen lock; no HTTP transition adapter | Production revision/governance authority unresolved; mutations disabled. C/D. BLOCKED |
| Casting | Contract5 `CASTING_CONTRACT.md` vs HTTP API contract; router321-395 | POST `{characterId,mvProjectId,role?,variantId?}`→`{ok:true,castingAssignment}`; GET projectId→assignments; PUT/DELETE detail routes exist in implementation/Markdown, absent OpenAPI | POST checks character owner+project; GET checks project; PUT/DELETE supply owner but no project to authorizer. Domain contract requires identityRevisionId/status/productionProjectId, unlike HTTP assignment | NEXCUT development-only CastingRecord has revision/status/project, confirm rechecks lock, duplicate prevention; cannot map legacy HTTP assignment into confirmed record without inventing revision/status | C: incompatible authorities, D: production adapter absent. Keep development store isolated; do not synthesize CONFIRMED or revision. BLOCKED |
| Scene Assignment | Contract5 SceneAssignmentRecord; no Scene HTTP endpoint in router/OpenAPI | Domain appearance schema: expression/pose/outfit/cameraFraming/sceneAction/emotionalState/artStyleConstraints; no HTTP schema/path | Contract requires same project and confirmed Casting/locked revision. Development adapter checks project/scene/character owner/revision before write | Local process-memory store only; scene endpoint must not be invented. No production composition | D/C; no production route. Keep disabled; tests assert production construction rejects before authority calls. BLOCKED |
| Reference management | Contract4 `REFERENCE_ASSET_CONTRACT.md`; router216-316; approval/content detail routes absent OpenAPI | GET→referenceAssets; POST kind/uri/optional imageBase64,mimeType,role,label→201 referenceAsset; PUT approval status/reason; GET content→binary | Shared auth; owner supplied to ASSET_READ/REFERENCE_UPLOAD/REFERENCE_APPROVE. Contract requires same-character/revision APPROVED references, one PRIMARY, supported images≤10MB | No NEXCUT reference upload/download adapter. Content route303-306 checks character owner then reads supplied assetId; explicit asset→character membership proof is not present there. Do not infer production cross-character safety | C/D: resolve reference/revision/rights and membership authority upstream; keep production adapter absent. BLOCKED |

## Decisions

- No official contract is modified. No Character endpoint, revision, role or rights policy is fabricated.
- No production mutation surface is added to NEXCUT. Only the existing read-only compatibility client exists, and it is production-forbidden regardless of enabled configuration.
- Existing independent AI MV, Camera and development-only Casting behavior remain available.
- Upstream security concerns above are source-level findings on the fixed package, not claims about a running external deployment or an executed exploit.
- Required upstream closure: complete authenticated OpenAPI schemas; production credential custody without fixture fallback; owner/project/reference membership authority; versioned Casting↔Scene/revision binding; durable rights/governance semantics.
