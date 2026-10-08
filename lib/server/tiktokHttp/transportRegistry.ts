/** Internal server composition branding. No browser/request-body registration path. */
export interface TikTokHttpTransport { request(url:string,init:RequestInit):Promise<Response> }
const accepted=new WeakSet<object>();
export function registerTransport(value:TikTokHttpTransport){accepted.add(value);}
export function isRegisteredTransport(value:object){return accepted.has(value);}
