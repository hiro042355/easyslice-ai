import { NextResponse, type NextRequest } from "next/server";
import type {
  HttpBodyProjection,
  HttpHeaderProjection,
  HttpMethodClassification,
  HttpRequestEnvelope,
  HttpResultProjection,
  HttpRouteClassification,
} from "../httpAdapter/types";

export type NextRouteJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly NextRouteJsonValue[]
  | Readonly<{ [key: string]: NextRouteJsonValue }>;

export type NextRouteRequestContext = Readonly<{
  route: HttpRouteClassification;
  requestIdentity: string;
  correlationIdentity: string;
}>;

export type NextRouteHttpAdapterCapability = Readonly<{
  adapt(
    envelope: HttpRequestEnvelope<NextRouteJsonValue>,
  ): Promise<HttpResultProjection<NextRouteJsonValue>>;
}>;

export type ReferenceNextRouteAdapterOptions = Readonly<{
  maximumBodyBytes?: number;
}>;

const REQUEST_HEADERS = Object.freeze([
  ["content-type", "content-type"],
  ["x-request-id", "request-id"],
  ["x-correlation-id", "correlation-id"],
] as const);

const RESPONSE_HEADERS = Object.freeze(new Map<HttpHeaderProjection["nameClassification"], string>([
  ["content-type", "content-type"],
  ["request-id", "x-request-id"],
  ["correlation-id", "x-correlation-id"],
  ["cache-control", "cache-control"],
  ["retry-advice", "retry-after"],
]));

const method = (value: string): HttpMethodClassification | undefined => ({
  GET: "read", POST: "create", PUT: "replace", PATCH: "update", DELETE: "remove",
})[value] as HttpMethodClassification | undefined;

const bodySize = (length: number): "empty" | "small" | "medium" | "large" => {
  if (length === 0) return "empty";
  if (length <= 4_096) return "small";
  if (length <= 32_768) return "medium";
  return "large";
};

const safeBody = (reasonCode: string): Readonly<Record<string, NextRouteJsonValue>> => ({
  responseVersion: "1.0",
  status: "rejected",
  reasonCodes: [reasonCode],
});

const response = (
  body: NextRouteJsonValue,
  status: number,
  headers: Headers = new Headers(),
): NextResponse => {
  headers.set("content-type", "application/json; charset=utf-8");
  try {
    return NextResponse.json(body, { status, headers });
  } catch {
    return new NextResponse('{"responseVersion":"1.0","status":"failed","reasonCodes":["response-projection-failed"]}', {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
};

export class ReferenceNextRouteAdapter {
  readonly #httpAdapter: NextRouteHttpAdapterCapability;
  readonly #maximumBodyBytes: number;

  constructor(httpAdapter: NextRouteHttpAdapterCapability, options: ReferenceNextRouteAdapterOptions = {}) {
    this.#httpAdapter = httpAdapter;
    this.#maximumBodyBytes = options.maximumBodyBytes ?? 65_536;
  }

  async handle(request: NextRequest, context: NextRouteRequestContext): Promise<NextResponse> {
    const projectedMethod = method(request.method);
    if (projectedMethod === undefined) return response(safeBody("method-unsupported"), 405);
    if (context.requestIdentity.length === 0 || context.correlationIdentity.length === 0) {
      return response(safeBody("identity-invalid"), 400);
    }

    const projectedHeaders: HttpHeaderProjection[] = [];
    for (const [nativeName, classification] of REQUEST_HEADERS) {
      const value = request.headers.get(nativeName);
      if (value === null) continue;
      if (value.includes(",")) return response(safeBody("duplicate-header"), 400);
      projectedHeaders.push({
        headerVersion: "1.0",
        nameClassification: classification,
        value,
        declarationOrder: projectedHeaders.length,
      });
    }
    if (request.headers.get("x-request-id") !== null && request.headers.get("x-request-id") !== context.requestIdentity) {
      return response(safeBody("request-identity-mismatch"), 400);
    }
    if (request.headers.get("x-correlation-id") !== null && request.headers.get("x-correlation-id") !== context.correlationIdentity) {
      return response(safeBody("correlation-identity-mismatch"), 400);
    }

    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return response(safeBody("body-read-failed"), 400);
    }
    const byteLength = new TextEncoder().encode(rawBody).byteLength;
    if (byteLength > this.#maximumBodyBytes) return response(safeBody("body-too-large"), 413);
    let parsed: NextRouteJsonValue;
    try {
      parsed = JSON.parse(rawBody) as NextRouteJsonValue;
    } catch {
      return response(safeBody("malformed-json"), 400);
    }
    const projectedBody: HttpBodyProjection<NextRouteJsonValue> = {
      bodyVersion: "1.0",
      classification: "structured",
      value: parsed,
    };
    const envelope: HttpRequestEnvelope<NextRouteJsonValue> = {
      envelopeVersion: "1.0",
      metadata: {
        metadataVersion: "1.0",
        route: context.route,
        method: projectedMethod,
        request: { identityVersion: "1.0", requestIdentity: context.requestIdentity },
        correlation: { identityVersion: "1.0", correlationIdentity: context.correlationIdentity },
        bodySizeClassification: bodySize(byteLength),
        contentClassification: "structured",
      },
      headers: projectedHeaders,
      body: projectedBody,
    };

    let result: HttpResultProjection<NextRouteJsonValue>;
    try {
      result = await this.#httpAdapter.adapt(envelope);
    } catch {
      return response(safeBody("http-adapter-unavailable"), 503);
    }
    const outputHeaders = new Headers();
    for (const header of result.response.headers) {
      const name = RESPONSE_HEADERS.get(header.nameClassification);
      if (name !== undefined) outputHeaders.set(name, header.value);
    }
    return response(result.response.body.value ?? null, result.response.statusCode, outputHeaders);
  }
}
