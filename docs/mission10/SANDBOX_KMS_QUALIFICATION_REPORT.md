# Sandbox KMS qualification — Mission10

Fresh authorized readonly metadata: nexcut-staging/asia1 keyring nexcut-stg-identity; only listed key protected-identity-mac,purposeMAC. Numeric versions1,2,3 ENABLED with HMAC_SHA256. These cannot serve token-envelope encryption. No encrypt/decrypt/sign/secret read/key creation/rotation occurred. Other locations/keys outside inspected scope UNKNOWN; do not conclude no suitable key anywhere. Exact identifiers/state in OBSERVED_METADATA.json.

Observed key-level bindings: runtime -> Cloud KMS signer + nexcutStgKmsMetadataReader; rotator -> nexcutStgKmsVersionRotator. Fresh custom-role definitions: metadataReader has cryptoKeys.get/cryptoKeyVersions.get; rotator adds versions.create/list. These roles provide no observed token useToEncrypt/useToDecrypt grant on this MAC key. Inherited/effective permissions and another key's bindings UNKNOWN. IAM unchanged.

Accepted design: AES-256-GCM random32-byte DEK per envelope,12-byte nonce/16-byte tag,managed wrappedDEK,numeric active/readable versions,AAD binds owner/app/environment/openID/generation/scopes/expiry/version,failclosed,DEK zeroization and token serialization protection. Existing SDK factory takes approved getCryptoKeyVersion/encrypt/decrypt client with timeout3000/retry:null; unsupported/disabled/HMAC metadata rejected. No default ADC or actual SDK initialization here.

Safe correction: pure parser now shares exact custody configuration validation before SDK construction. Malformed/alias/zero/cross-key/duplicate/>20 readable versions or invalid execution reject fixed KEY_CONFIGURATION_REJECTED; vault retains KEY_CUSTODY_UNAVAILABLE. Cryptography/AAD/ciphertext format unchanged. Synthetic startup/rotation/keyabsence/serialization and physical-PG regressions rerun.

| Requirement | Local | Actual Sandbox |
|---|---|---|
| Enabled ENCRYPT_DECRYPT/GOOGLE_SYMMETRIC_ENCRYPTION version | synthetic verified | inspected MAC key INELIGIBLE; qualified alternative UNKNOWN |
| Runtime metadata/encrypt/decrypt | synthetic verified | existing MAC metadata/sign role only; symmetric key permission UNKNOWN |
| Exact active/readable numeric version | strict parser/custody verified | no approved token key binding |
| Separate runtime principal/SDK/secret injection | fake trusted ports | not qualified/no values retrieved |
| Rotation/old ciphertext recovery | fake version tests | approved rotator/policy/retained-readable versions not qualified |

Runtime needs version get and useToEncrypt/useToDecrypt on approved key,with least-privilege key-scope metadata access separately qualified. Rotator/deployer/migrator duties remain separate; do not grant runtime create/destroy/IAM authority. [KMS permissions](https://docs.cloud.google.com/kms/docs/reference/permissions-and-roles).

Outcome: LOCAL_TEST_READY=YES; actual SANDBOX_CONFIG_READY=NO; REAL_SANDBOX_RUNTIME_VERIFIED=NO. Owner may identify an approved existing non-Production symmetric key outside current inventory; otherwise new key/API/IAM/budget gate needed. No HMAC reuse,automatic fallback,private-key download or forced key destruction/rewrap on rollback.
