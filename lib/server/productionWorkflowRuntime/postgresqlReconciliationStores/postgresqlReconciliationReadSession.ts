import type { DurableWorkflowDatabaseCapability, DurableWorkflowDatabaseCommand } from "../durableTransaction";
import type { ReconciliationReadSession } from "./types";

export function createPostgreSQLReconciliationReadSession(database:DurableWorkflowDatabaseCapability,releaseDatabase:()=>void|Promise<void>){
  let active=true;
  const guarded=Object.freeze({capabilityVersion:"1.0" as const,execute:(command:DurableWorkflowDatabaseCommand)=>active?database.execute(command):Promise.resolve({status:"failure" as const,failure:"transaction-aborted" as const,retryable:false})});
  return Object.freeze({session:Object.freeze({sessionVersion:"1.0" as const,database:guarded}) satisfies ReconciliationReadSession,state:()=>active?"active" as const:"closed" as const,async release(){if(!active)return"already-released" as const;active=false;try{await releaseDatabase();return"released" as const;}catch{return"release-failed" as const;}}});
}
