import assert from "node:assert/strict";
import test from "node:test";
import { createSensitiveCanonicalVocalWorkflowInput } from "@/lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput";
import { vocalInput } from "./fixture";

const invalid = { status: "invalid", issues: [{ reasonCode: "sensitive-construction-invalid" }] };

test("malformed, cyclic, accessor, prototype, and symbol inputs fail safely", () => {
  const malformed = [null, undefined, {}, [], "secret"];
  for (const value of malformed) {
    assert.deepEqual(Reflect.apply(createSensitiveCanonicalVocalWorkflowInput, undefined, [value]), invalid);
  }
  const cyclic = vocalInput();
  cyclic.adapterInput.assets.pronunciationHints = [cyclic.context.operationRef];
  Object.defineProperty(cyclic.context, "cycle", { value: cyclic, enumerable: true });
  assert.deepEqual(Reflect.apply(createSensitiveCanonicalVocalWorkflowInput, undefined, [cyclic]), invalid);
  const getter = vocalInput();
  Object.defineProperty(getter, "providerId", { get() { throw new Error("raw secret"); }, enumerable: true });
  assert.deepEqual(Reflect.apply(createSensitiveCanonicalVocalWorkflowInput, undefined, [getter]), invalid);
  const symbol = vocalInput();
  Object.defineProperty(symbol, Symbol("secret"), { value: true });
  assert.deepEqual(createSensitiveCanonicalVocalWorkflowInput(symbol), invalid);
  assert.doesNotMatch(JSON.stringify(invalid), /raw secret|lyrics|scene|asset|provider|tenant/i);
});
