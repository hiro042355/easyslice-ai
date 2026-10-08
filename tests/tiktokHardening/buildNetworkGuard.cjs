/* eslint-disable @typescript-eslint/no-require-imports -- Synchronous Node preload guards build workers before imports. */
const http=require("node:http"),https=require("node:https"),http2=require("node:http2"),net=require("node:net");
const allowed=new Set(["fonts.googleapis.com","fonts.gstatic.com"]);
function permit(input){let host;if(typeof input==="string"){try{host=new URL(input).hostname;}catch{host=input;}}else host=input?.hostname??input?.host;if(!allowed.has(String(host).split(":")[0]))throw new Error("BUILD_NETWORK_BOUNDARY");}
for(const networkModule of [http,https])for(const method of ["request","get"]){const original=networkModule[method];networkModule[method]=function(input,...args){permit(input);return original.call(this,input,...args);};}
const h2=http2.connect;http2.connect=function(input,...args){permit(input);return h2.call(this,input,...args);};
const fetchImpl=globalThis.fetch;globalThis.fetch=async(input,...args)=>{permit(typeof input==="object"&&input?.url?input.url:input);return fetchImpl(input,...args);};
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const input=args[0];if(typeof input==="object"){if(input.path)return connect.apply(this,args);permit(input);}else permit(args[1]);return connect.apply(this,args);};
