declare module "jsdom" {
  export class JSDOM {
    constructor(html: string, options?: {url?: string});
    readonly window: { readonly document: Document; readonly Event: typeof Event; close(): void };
  }
}
