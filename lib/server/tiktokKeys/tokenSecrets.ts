import { inspect } from "node:util";
import type { Tokens } from "../localTikTok/custody";
/** Server-only token fields remain usable; ordinary JSON/inspection must not disclose them. */
export function protectTokenSerialization(tokens:Tokens):Tokens {
 const value={accessToken:tokens.accessToken,refreshToken:tokens.refreshToken};
 const redacted=()=>({credentials:"[REDACTED]"});
 Object.defineProperty(value,"toJSON",{value:redacted,enumerable:false});
 Object.defineProperty(value,inspect.custom,{value:redacted,enumerable:false});
 return Object.freeze(value);
}
