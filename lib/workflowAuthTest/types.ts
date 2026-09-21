import type { Sensitive } from "@/lib/assets/types";
import type { WorkflowApiCommand, WorkflowApiPrincipal } from "@/lib/workflowApi/types";

export type ReferenceWorkflowAuthEnvironment="test"|"development"|"production";
export type ReferenceWorkflowAuthReason="authentication-succeeded"|"authentication-missing"|"authentication-malformed"|"authentication-expired"|"authentication-revoked"|"authentication-unavailable"|"csrf-valid"|"csrf-missing"|"csrf-invalid"|"csrf-expired"|"csrf-revoked"|"csrf-conflict"|"reference-auth-disabled"|"reference-auth-production-denied";
export type ReferenceWorkflowAuthCapability={capabilityVersion:"1.0";enabled:true;mode:"reference-test-only";productionReady:false};
export type ReferenceWorkflowTestPrincipal=WorkflowApiPrincipal&{actorType:"user"};
export type ReferenceWorkflowBrowserAuthFixture=Sensitive<{fixtureVersion:"1.0";cookieHeader:string;csrfToken:string}>;
export type ReferenceWorkflowAuthDescriptor={descriptorVersion:"1.0";id:string;mode:"reference-test-only";productionReady:false;authenticationStrength:"fixture";csrfStrength:"fixture";supportedEnvironments:readonly ("test"|"development")[];availability:"available"|"disabled"};
export type ReferenceWorkflowAuthRegistry={list():readonly ReferenceWorkflowAuthDescriptor[];get(id:string):ReferenceWorkflowAuthDescriptor|undefined};
export type ReferenceWorkflowCsrfValidationInput={command:WorkflowApiCommand;baselineTime:string;csrfHeader?:string};
