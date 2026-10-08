import "server-only";
import type { KeyManagementServiceClient } from "@google-cloud/kms";
import { ManagedTokenVault, type EnvelopeKmsClient, type KeyConfiguration } from "./managedVault";
/** Explicit future server factory. Never called by current routes or test fixtures. No key creation API. */
export function createManagedTokenVault(configuration:KeyConfiguration,sdk:Pick<KeyManagementServiceClient,"getCryptoKeyVersion"|"encrypt"|"decrypt">){
 if(!sdk)throw new Error("KEY_CONFIGURATION_REJECTED");
 const client:EnvelopeKmsClient={
  async version(name){const [v]=await sdk.getCryptoKeyVersion({name},{timeout:3000,retry:null});const enabled=v.state==="ENABLED"||v.state===1;return {name:v.name??"",state:enabled?"ENABLED":"DISABLED",algorithm:v.algorithm==="GOOGLE_SYMMETRIC_ENCRYPTION"||v.algorithm===1?"GOOGLE_SYMMETRIC_ENCRYPTION":"UNSUPPORTED"};},
  async wrap(name,dek,aad){const [v]=await sdk.encrypt({name,plaintext:dek,additionalAuthenticatedData:aad},{timeout:3000,retry:null});if(!v.name||!v.ciphertext)throw new Error("KEY_CUSTODY_UNAVAILABLE");return {name:v.name,ciphertext:typeof v.ciphertext==="string"?Buffer.from(v.ciphertext,"base64"):Buffer.from(v.ciphertext)};},
  async unwrap(name,ciphertext,aad){const [v]=await sdk.decrypt({name:name.split("/cryptoKeyVersions/")[0],ciphertext,additionalAuthenticatedData:aad},{timeout:3000,retry:null});if(!v.plaintext)throw new Error("KEY_CUSTODY_UNAVAILABLE");return typeof v.plaintext==="string"?Buffer.from(v.plaintext,"base64"):Buffer.from(v.plaintext);}
 };return new ManagedTokenVault(configuration,client);
}
export { ManagedTokenVault };
export { readManagedKeyConfiguration } from "./configuration";
