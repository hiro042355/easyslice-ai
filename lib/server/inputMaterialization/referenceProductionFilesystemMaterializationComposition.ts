import {
  createProductionFilesystemMaterializationComposition,
} from "./productionFilesystemMaterializationComposition";

export const createReferenceProductionFilesystemMaterializationComposition =
  () => {
    const order: string[] = [];
    let sourceLocatorInvocations = 0;
    let workspaceLocatorInvocations = 0;
    let inspectInvocations = 0;
    let copyInvocations = 0;

    const composition =
      createProductionFilesystemMaterializationComposition({
        sourceLocator: {
          locateSource() {
            sourceLocatorInvocations += 1;
            order.push("source-locator");
            return { location: "reference-source" };
          },
        },
        workspaceLocator: {
          locateWorkspace() {
            workspaceLocatorInvocations += 1;
            order.push("workspace-locator");
            return { location: "reference-workspace" };
          },
        },
        filesystem: {
          inspect(location) {
            inspectInvocations += 1;
            order.push("filesystem-inspect");
            if (location === "reference-source") {
              return { exists: true, kind: "file" };
            }
            if (location === "reference-workspace") {
              return { exists: true, kind: "directory" };
            }
            return { exists: false, kind: "other" };
          },
          copyExclusive() {
            copyInvocations += 1;
            order.push("filesystem-copy");
          },
        },
      });

    return Object.freeze({
      composition,
      sourceLocatorInvocations: () => sourceLocatorInvocations,
      workspaceLocatorInvocations: () => workspaceLocatorInvocations,
      inspectInvocations: () => inspectInvocations,
      copyInvocations: () => copyInvocations,
      invocationOrder: () => Object.freeze([...order]),
    });
  };
