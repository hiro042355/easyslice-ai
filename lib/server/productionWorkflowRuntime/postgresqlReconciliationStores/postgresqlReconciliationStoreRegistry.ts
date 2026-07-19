export const POSTGRESQL_RECONCILIATION_STORE_DESCRIPTOR=Object.freeze({descriptorVersion:"1.0" as const,id:"postgresql-reconciliation-store-adapter-v1" as const,serverOnly:true as const,durable:true as const,runtimeComposable:false as const,productionReady:false as const,providerSubmitPermitted:false as const});
export const getPostgreSQLReconciliationStoreDescriptor=(id:string)=>id===POSTGRESQL_RECONCILIATION_STORE_DESCRIPTOR.id?Object.freeze({...POSTGRESQL_RECONCILIATION_STORE_DESCRIPTOR}):undefined;
export const listPostgreSQLReconciliationStoreDescriptors=()=>Object.freeze([getPostgreSQLReconciliationStoreDescriptor(POSTGRESQL_RECONCILIATION_STORE_DESCRIPTOR.id)!]);
export type PostgreSQLReconciliationCapabilityDescriptor=Readonly<{id:string;capabilityVersion:string;parentPreconditionGuard?:boolean;terminalParentGuard?:boolean;ownerGuard?:boolean;fenceGuard?:boolean;sourceStateGuard?:boolean;terminalPreservation?:boolean;productionReady:false;runtimeComposable:false}>;
export const POSTGRESQL_RECONCILIATION_CAPABILITY_DESCRIPTORS:readonly PostgreSQLReconciliationCapabilityDescriptor[]=Object.freeze([
  Object.freeze({id:"reconciliation-resolution-v1",capabilityVersion:"1.0",parentPreconditionGuard:false,terminalParentGuard:false,productionReady:false,runtimeComposable:false}),
  Object.freeze({id:"reconciliation-resolution-v2",capabilityVersion:"2.0",parentPreconditionGuard:true,terminalParentGuard:true,productionReady:false,runtimeComposable:false}),
  Object.freeze({id:"reconciliation-outbox-transition-v1",capabilityVersion:"1.0",ownerGuard:false,fenceGuard:true,sourceStateGuard:false,terminalPreservation:false,productionReady:false,runtimeComposable:false}),
  Object.freeze({id:"reconciliation-outbox-transition-v2",capabilityVersion:"2.0",ownerGuard:true,fenceGuard:true,sourceStateGuard:true,terminalPreservation:true,productionReady:false,runtimeComposable:false}),
]);
export const getPostgreSQLReconciliationCapabilityDescriptor=(id:string)=>{const descriptor=POSTGRESQL_RECONCILIATION_CAPABILITY_DESCRIPTORS.find(value=>value.id===id);return descriptor?Object.freeze({...descriptor}):undefined;};
export const listPostgreSQLReconciliationCapabilityDescriptors=()=>Object.freeze(POSTGRESQL_RECONCILIATION_CAPABILITY_DESCRIPTORS.map(value=>Object.freeze({...value})));
