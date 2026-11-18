/** Read-only HTTP compatibility adapter for Character Engine package 6aa8474.
 * OpenAPI supplies paths; response projection is checked against model.ts.
 * No mutation endpoints are exposed: HTTP CastingAssignment does not carry
 * the revision/status of the separate domain CastingRecord contract.
 */
export type CharacterIdentity = Readonly<{characterId:string;revisionId:string;ownerUserId:string;locked:boolean}>;
export type CharacterClientError = 'DISABLED'|'CONFIGURATION'|'INVALID_ID'|'UNAVAILABLE'|'TIMEOUT'|'UNAUTHORIZED'|'MALFORMED_RESPONSE';
export type CharacterResult = {ok:true;identity:CharacterIdentity}|{ok:false;code:CharacterClientError};
export type CharacterTransport=(url:URL,init:RequestInit)=>Promise<Response>;
export type CharacterClientConfig=Readonly<{enabled:boolean;baseUrl?:string;allowedOrigin?:string;bearerToken?:string;timeoutMs?:number}>;
const record=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const stable=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/.test(v);
const bibleFields=['identityTraits','faceCharacteristics','hairCharacteristics','eyeCharacteristics','bodyCharacteristics','personality','clothing','accessories','colorPalette','expressionRules','identityConstraints','forbiddenChanges','referenceAssetIds'];
function identityProjection(raw:unknown,expectedId:string,revisionId:string):CharacterIdentity|undefined{
 const envelope=record(raw),c=record(envelope?.character),lock=record(c?.identityLock),rev=record(lock?.lockedRevision),identity=record(rev?.identity),bible=record(identity?.bible);
 if(envelope?.ok!==true||c?.id!==expectedId||!stable(c.ownerUserId)||lock?.status!=='LOCKED'||lock.characterId!==expectedId||lock.revisionId!==revisionId||rev?.id!==revisionId||rev.characterId!==expectedId||rev.status!=='LOCKED'||identity?.characterId!==expectedId||!bible||typeof bible.movementStyle!=='string'||!bible.movementStyle.trim())return;
 if(bibleFields.some(k=>!Array.isArray(bible[k])||(bible[k] as unknown[]).some(x=>typeof x!=='string'||!x.trim())))return;
 if(!Array.isArray(c.revisions)||c.revisions.filter(r=>record(r)?.id===revisionId).length!==1||!c.revisions.some(r=>{const x=record(r);return x?.id===revisionId&&x.characterId===expectedId&&x.status==='LOCKED';}))return;
 return Object.freeze({characterId:expectedId,revisionId,ownerUserId:c.ownerUserId,locked:true});
}
export function createCharacterReadClient(config:CharacterClientConfig,transport:CharacterTransport=fetch){
 // Snapshot server configuration; caller never controls the destination or token.
 const c={...config};
 return Object.freeze({async lockedIdentity(characterId:string,revisionId:string):Promise<CharacterResult>{
  // Upstream ownership/contracts are not production-certified. Direct callers
  // cannot activate this compatibility adapter via configuration alone.
  if(process.env.NODE_ENV==='production'||!c.enabled)return {ok:false,code:'DISABLED'};
  if(!stable(characterId)||!stable(revisionId))return {ok:false,code:'INVALID_ID'};
  let base:URL;
  try{base=new URL(c.baseUrl??'');const trusted=new URL(c.allowedOrigin??'');
   // Exact, operator-owned HTTPS origin. IP literals, localhost and alternate ports denied.
   if(base.protocol!=='https:'||base.origin!==trusted.origin||trusted.pathname!=='/'||base.username||base.password||base.search||base.hash||base.port||!base.hostname.includes('.')||/^[\d.]+$/.test(base.hostname)||base.hostname.includes(':')||/\.(localhost|local|internal)$/.test(base.hostname)||!/^\/api\/v1\/?$/.test(base.pathname)||!c.bearerToken||/[\r\n]/.test(c.bearerToken))throw Error();
  }catch{return {ok:false,code:'CONFIGURATION'};}
  const timeout=c.timeoutMs??5000;if(!Number.isInteger(timeout)||timeout<1||timeout>30000)return {ok:false,code:'CONFIGURATION'};
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=async():Promise<CharacterResult>=>{
    const url=new URL(`${base.pathname.replace(/\/$/,'')}/characters/${characterId}`,base.origin);
    const response=await transport(url,{method:'GET',headers:{authorization:`Bearer ${c.bearerToken}`,accept:'application/json'},redirect:'error',signal:controller.signal,cache:'no-store'});
    if(controller.signal.aborted){void response.body?.cancel().catch(()=>undefined);return {ok:false,code:'TIMEOUT'};}
    if(response.status===401||response.status===403)return {ok:false,code:'UNAUTHORIZED'};
    if(!response.ok)return {ok:false,code:'UNAVAILABLE'};
    if(!response.headers.get('content-type')?.includes('application/json'))return {ok:false,code:'MALFORMED_RESPONSE'};
    const reader=response.body?.getReader();if(!reader)return {ok:false,code:'MALFORMED_RESPONSE'};
    const abortBody=()=>{void reader.cancel().catch(()=>undefined);};
    controller.signal.addEventListener('abort',abortBody,{once:true});
    const chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>262144){await reader.cancel();return {ok:false,code:'MALFORMED_RESPONSE'};}chunks.push(part.value);}}finally{controller.signal.removeEventListener('abort',abortBody);reader.releaseLock();}
    const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    let raw:unknown;
    try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{return {ok:false,code:'MALFORMED_RESPONSE'};}
    const identity=identityProjection(raw,characterId,revisionId);
    return identity?{ok:true,identity}:{ok:false,code:'MALFORMED_RESPONSE'};
   };
   return await Promise.race([work(),new Promise<CharacterResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({ok:false,code:'TIMEOUT'});},timeout);})]);
  }catch{return {ok:false,code:controller.signal.aborted?'TIMEOUT':'UNAVAILABLE'};}
  finally{if(timer)clearTimeout(timer);}
 }});
}
