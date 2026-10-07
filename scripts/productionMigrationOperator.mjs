// Inert entry point: no file/env discovery, adapters, credentials or subprocesses.
const unsupported = process.argv.length > 2;
console.log(JSON.stringify({tool:"migration-operator-foundation",target:"NONE",productionExecutable:false,status:unsupported?"OPERATION_REJECTED":"INERT"}));
process.exitCode = unsupported ? 2 : 0;
