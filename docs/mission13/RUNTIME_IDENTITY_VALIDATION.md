# Required separated identities
No identities/IAM/secrets created/modified/read. ExistingIDs metadata and source-reference status in RESOURCE_INVENTORY.json;actualeffectivepermissions unknown.

| Boundary | Existing / missing identity | Minimum requiredauthority | Rotation/isolation/revocation |
|---|---|---|---|
| WEB_RUNTIME | nexcut-stg-runtime@nexcut-staging.iam.gserviceaccount.com existsenabled;nonproduction Firebasefederationmissing proof | VerifyexactFirebaseissuer/audience/revocation/owner-session;DBneededDML;approvedwrappingonly;noDDL/keyadmin | Dedicatedapp/env trust/scopedbindings;revokecredentials/drainpool;neverProductionWIF |
| WORKER_RUNTIME | ExistingMockTikTokWorker local only;no realworkeridentityqualified | None forfirst OAuth,flagfalse;futurecreator-onlyoperation gate separately | No OAuthcode/cookie/tokenqueued,ownership/currentgenerationchecked,boundedshutdown |
| DATABASE_MIGRATOR | No dedicatedmigrator found amongthreeprojectSAs;otheridentitypossibilitiesUNKNOWN | Approvednonprod appliedhistory/version/schema/DDL/grants;notruntimeorProduction authority | Independentoperator credential,no runtimeinheritance,rotation/revokeunderapproval |
| SECRET_MANAGER / wrappingoperator | nexcut-stg-kms-rotator existsenabled butMACversionroleonly;no scopedsoftwarebindingoperatorproved | ManageapprovedKEK/bindingversion/recovery;runtime onlyuse,notadmin;separatemetadatawhereapplicable | Retainolddecryptversionsuntilciphertext/backupretired;no plaintextfile/material |
| DEPLOYER | nexcut-stg-deployer existsenabled,effectivehostingauthorityUNKNOWN | Exactisolatedapp/artifact/bindingreference,notProductionalias/DBowner/keyadmin | Approvednonproddeploymenttoken/workloadtrust;currentno deploy/credentialread |

CurrentFirebaseAdmin requestsVercelOIDC/ProductionlockedGCPWIF. No unverifiedstagingreuse/impersonation. Render-specific short-lived federation availability UNKNOWN;do not assume nativeGCPidentity. If reviewedlong-livednonprodcredential needed, secureencryptedinjection/leastprivilege/rotation/adminaudit and ownerapproval required;none provisioned. FirebaseSpark publicoffer not actualprojectplan proof;stagingFirebaseAPIoff means no currentFirebase inventory.
