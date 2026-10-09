import {open} from "node:fs/promises";
// Only an explicit bounded local JSON file; never discovers environment values or credentials.
try {
 if(process.argv.length!==3)throw new Error();
 const handle=await open(process.argv[2],"r");let bytes;
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>32768)throw new Error();bytes=Buffer.alloc(32769);const result=await handle.read(bytes,0,32769,0);if(result.bytesRead>32768)throw new Error();bytes=bytes.subarray(0,result.bytesRead);}finally{await handle.close();}
 const {evaluateZeroCostReadiness}=await import("../lib/server/tiktokQualification/zeroCostReadiness.ts");
 const report=evaluateZeroCostReadiness(JSON.parse(bytes.toString("utf8")));
 console.log(JSON.stringify(report));process.exitCode=report.status==="READY"?0:2;
}catch{console.error(JSON.stringify({status:"BLOCKED",error:"ZERO_COST_INPUT_REJECTED",reportOnly:true,executionAuthorized:false}));process.exitCode=2;}
