import type {KeyConfiguration} from "./managedVault";
/** Pure server configuration parser; no process.env read, credential loader or provisioning. */
export function readManagedKeyConfiguration(environment:Readonly<Record<string,string|undefined>>,execution:KeyConfiguration["execution"]):KeyConfiguration {
 if(environment.NEXCUT_TIKTOK_TOKEN_KEY_PROVIDER!=="gcp-kms-envelope")throw new Error("KEY_CONFIGURATION_REJECTED");
 const activeVersion=environment.NEXCUT_TIKTOK_TOKEN_KEY_ID,raw=environment.NEXCUT_TIKTOK_TOKEN_READABLE_VERSIONS;
 if(!activeVersion||!raw)throw new Error("KEY_CONFIGURATION_REJECTED");
 const readableVersions=raw.split(",");if(readableVersions.some(v=>!v)||!readableVersions.includes(activeVersion))throw new Error("KEY_CONFIGURATION_REJECTED");
 return Object.freeze({execution,activeVersion,readableVersions:Object.freeze(readableVersions)});
}
