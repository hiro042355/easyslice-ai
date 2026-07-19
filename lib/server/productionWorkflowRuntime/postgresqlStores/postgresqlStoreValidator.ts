import type { PostgreSQLFinalResultStoreV2,PostgreSQLOutboxStoreV2,PostgreSQLResultReferenceVaultV2 } from "./types";
type Bundle=Readonly<{finalResults:PostgreSQLFinalResultStoreV2;references:PostgreSQLResultReferenceVaultV2;outbox:PostgreSQLOutboxStoreV2}>;
export function validatePostgreSQLSliceAStores(value:unknown):Readonly<{status:"valid"}>|Readonly<{status:"invalid";issues:readonly string[]}>{
  if(typeof value!=="object"||value===null)return{status:"invalid",issues:Object.freeze(["not-an-object"])};const record=value as Record<string,unknown>;const issues:string[]=[];
  for(const [name,methods] of [["finalResults",["commitIfAbsent","read","readInTransaction","compareAndSet"]],["references",["issueIfAbsent","resolve","resolveInTransaction","compareAndSet","revoke","expire","delete"]],["outbox",["append","claimBatch","renew","release","markReconciliationRequired","markDelivered"]]] as const){const store=record[name];if(typeof store!=="object"||store===null||methods.some((method)=>typeof (store as Record<string,unknown>)[method]!=="function"))issues.push(`${name}-invalid`);}
  return issues.length?{status:"invalid",issues:Object.freeze(issues)}:{status:"valid"};
}
export function isPostgreSQLSliceAStoreBundle(value:unknown):value is Bundle{return validatePostgreSQLSliceAStores(value).status==="valid";}
