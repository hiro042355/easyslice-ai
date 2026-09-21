import type { ReferenceWorkflowContext } from "./types";
export const deepCopy=<T>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
export const deepFreeze=<T>(v:T):T=>{if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v as object))deepFreeze(x)}return v};
export const validOpaque=(v:unknown,max=128)=>typeof v==="string"&&v.length>0&&v.length<=max&&!/[\r\n]/.test(v)&&!/^https?:\/\//i.test(v);
const scenarios:readonly ReferenceWorkflowContext["scenario"][]=["success"];
const validUtcMillis=(v:unknown)=>{if(typeof v!=="string")return false;const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.000Z$/.exec(v);if(!m)return false;const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];return month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<=23&&minute<=59&&second<=59};
export const validContext=(v:unknown):v is ReferenceWorkflowContext=>{if(!v||typeof v!=="object"||Array.isArray(v))return false;const x=v as ReferenceWorkflowContext;return x.contextVersion==="1.0"&&validOpaque(x.operationRef)&&validUtcMillis(x.baselineTime)&&Number.isSafeInteger(x.attempt)&&x.attempt>0&&scenarios.includes(x.scenario)&&validOpaque(x.idempotencyKeyRef??"default")};
export const uniqueReasons=(v:readonly string[])=>[...new Set(v)];
export const projectIdempotency=(key:string|undefined,operation:string,stage:"client"|"ingestion")=>`${key??"reference-workflow"}:${operation}:${stage}`;
