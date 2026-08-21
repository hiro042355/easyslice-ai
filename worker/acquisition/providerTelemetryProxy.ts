import { createServer, request as httpRequest, type Server } from "node:http";
import type { AcquisitionTelemetryCollector } from "../../lib/server/acquisitionWorker/telemetry";

const HOST = "127.0.0.1";
export const PROVIDER_DESTINATION_PORT = 4416;
export const PROVIDER_PROXY_PORT = 4417;
export const PROVIDER_PROXY_BODY_LIMIT = 256 * 1024;

export class ProviderTelemetryProxy {
  #active?: AcquisitionTelemetryCollector;
  #server?: Server;
  constructor(private readonly destinationPort = PROVIDER_DESTINATION_PORT, private readonly listenPort = PROVIDER_PROXY_PORT) {}

  async start(): Promise<void> {
    if (this.#server) return;
    this.#server = createServer((incoming, outgoing) => {
      const health = incoming.method === "GET" && incoming.url === "/ping";
      const tokenRequest = incoming.method === "POST" && incoming.url === "/get_pot";
      if (!health && !tokenRequest) { outgoing.writeHead(404).end(); return; }
      let bytes = 0;
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes <= PROVIDER_PROXY_BODY_LIMIT) chunks.push(chunk);
      });
      incoming.on("end", () => {
        if (bytes > PROVIDER_PROXY_BODY_LIMIT) { outgoing.writeHead(413).end(); return; }
        if (tokenRequest) this.#active?.providerRequest();
        const body = Buffer.concat(chunks);
        const upstream = httpRequest({ host: HOST, port: this.destinationPort, method: incoming.method,
          path: incoming.url, headers: { "content-type": incoming.headers["content-type"] ?? "application/json",
            "content-length": String(body.length) } }, (response) => {
          const responseChunks: Buffer[] = [];
          let responseBytes = 0;
          response.on("data", (chunk: Buffer) => {
            responseBytes += chunk.length;
            if (responseBytes <= PROVIDER_PROXY_BODY_LIMIT) responseChunks.push(chunk);
          });
          response.on("end", () => {
            if (responseBytes > PROVIDER_PROXY_BODY_LIMIT) { if (tokenRequest) this.#active?.providerResult(false); outgoing.writeHead(502).end(); return; }
            const responseBody = Buffer.concat(responseChunks);
            const status = response.statusCode ?? 502;
            if (tokenRequest) this.#active?.providerResult(status >= 200 && status < 300);
            outgoing.writeHead(status, { "content-type": response.headers["content-type"] ?? "application/json",
              "content-length": String(responseBody.length) });
            outgoing.end(responseBody);
          });
        });
        upstream.once("error", () => { if (tokenRequest) this.#active?.providerResult(false); if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
        upstream.end(body);
      });
    });
    await new Promise<void>((resolve, reject) => this.#server!.once("error", reject).listen(this.listenPort, HOST, resolve));
  }

  async close(): Promise<void> {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = undefined;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  async observe<T>(collector: AcquisitionTelemetryCollector, operation: () => Promise<T>): Promise<T> {
    if (this.#active) throw new Error("provider-telemetry-concurrency-violation");
    this.#active = collector;
    try { return await operation(); } finally { this.#active = undefined; }
  }
}
