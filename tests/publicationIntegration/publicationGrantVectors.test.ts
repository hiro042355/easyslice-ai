import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { verifyPublicationGrant } from "../../lib/publicationIntegration/grant";

type Vector = {
  name: string;
  token: string;
  now: number;
  expect: { ok: boolean; reason?: string };
};

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/publicationIntegration/vectors/publicationGrantVectors.json"), "utf8"),
) as { keys: Record<string, string>; vectors: Vector[] };

describe("publication grant shared vectors (Core side)", () => {
  for (const vector of fixture.vectors) {
    it(`${vector.name} -> ${vector.expect.ok ? "accepted" : vector.expect.reason}`, () => {
      const result = verifyPublicationGrant({
        token: vector.token,
        signingKeys: fixture.keys,
        now: vector.now,
      } as Parameters<typeof verifyPublicationGrant>[0]);
      if (vector.expect.ok) {
        assert.equal(result.code, "GRANT_VERIFIED");
      } else {
        assert.deepEqual(result, { code: "GRANT_REJECTED", reason: vector.expect.reason });
      }
    });
  }
});
