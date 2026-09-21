import { validatePrincipal } from "@/lib/workflowApi/workflowApiUtils";
import type { ReferenceWorkflowTestPrincipal } from "@/lib/workflowAuthTest/types";
export const REFERENCE_COOKIE_NAME="__Host-nexcut_reference_test_workflow_session";
export const SESSION_TTL_MS=3600000,CSRF_TTL_MS=1800000;
export const copyFixture=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export function fixtureDigest(value:string):string{let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(36).padStart(7,"0")}
export const validFixtureToken=(value:unknown)=>typeof value==="string"&&value.length>=16&&value.length<=128&&/^[A-Za-z0-9._~-]+$/.test(value)&&!value.includes("://");
export function millis(value:string):number|undefined{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value))return undefined;const n=new Date(value).getTime();return Number.isFinite(n)?n:undefined}
export function validPrincipal(value:unknown):value is ReferenceWorkflowTestPrincipal{const checked=validatePrincipal(value);return checked.status==="valid"&&checked.value.actorType==="user"}
export function validTtl(baseline:string,expires:string,ttl:number){const a=millis(baseline),b=millis(expires);return a!==undefined&&b!==undefined&&b-a===ttl}
