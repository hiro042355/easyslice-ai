/** Trusted server composition only; body/environment flags cannot supply a function. */
export type ServerRuntimeExecution=Readonly<{mode:"SERVER_GATED";authorize(operation:"AUTHENTICATION"|"READ"|"DML"):Promise<void>}>;
export type RuntimeExecution="LOCAL_TEST"|ServerRuntimeExecution;
export function validateRuntimeExecution(value:RuntimeExecution):void{if(value!=="LOCAL_TEST"&&(!value||typeof value!=="object"||value.mode!=="SERVER_GATED"||typeof value.authorize!=="function"))throw new Error("PRODUCTION_DISABLED");}
export async function authorizeRuntime(value:RuntimeExecution,operation:"AUTHENTICATION"|"READ"|"DML"){validateRuntimeExecution(value);if(value!=="LOCAL_TEST")try{await value.authorize(operation);}catch{throw new Error("RUNTIME_AUTHORIZATION_REQUIRED");}}
export function sameRuntimeExecution(a:RuntimeExecution,b:RuntimeExecution){return a===b||(a!=="LOCAL_TEST"&&b!=="LOCAL_TEST"&&a.authorize===b.authorize);}
