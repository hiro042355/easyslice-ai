import {
  createLocatorMaterializationHandoff,
} from "./locatorMaterializationHandoff";
import type {
  LocatorMaterializationHandoff,
  LocatorMaterializationHandoffResult,
} from "./types";
import {
  createLocatorMaterializationHandoffValidation,
} from "./validation";

export type DeterministicLocatorMaterializationHandoffFixture = Readonly<{
  handoff: LocatorMaterializationHandoff;
  invocations(): number;
  results(): readonly LocatorMaterializationHandoffResult[];
}>;

export const createDeterministicLocatorMaterializationHandoffFixture =
  (): DeterministicLocatorMaterializationHandoffFixture => {
    const handoff = createLocatorMaterializationHandoff(
      createLocatorMaterializationHandoffValidation(),
    );
    const captured: LocatorMaterializationHandoffResult[] = [];
    let invocationCount = 0;

    return Object.freeze({
      handoff: Object.freeze({
        prepare(input: unknown): LocatorMaterializationHandoffResult {
          invocationCount += 1;
          const result = handoff.prepare(input);
          captured.push(result);
          return result;
        },
      }),
      invocations(): number {
        return invocationCount;
      },
      results(): readonly LocatorMaterializationHandoffResult[] {
        return Object.freeze([...captured]);
      },
    });
  };
