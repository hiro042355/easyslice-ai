import { lstat, open, readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import type {
  PackagingAuditEntry,
  PackagingClassification,
  PackagingDecision,
  PackagingReasonCode,
  PackagingRequest,
  RetryClassification,
} from "./types";

type LocatedOutput = Readonly<{ location: string; archiveEntryName: string }>;
type LocatedArchive = Readonly<{ location: string }>;
type OutputEntry = Readonly<{
  exists: boolean;
  kind: "file" | "directory" | "symbolic-link" | "other";
}>;
export type PackagingOutputLocatorCapability = Readonly<{
  locateOutput(reference: Readonly<{ opaqueReference: string }>): LocatedOutput | Promise<LocatedOutput>;
}>;
export type PackagingArchiveLocatorCapability = Readonly<{
  locateArchive(input: Readonly<{
    opaqueArchiveReference: string;
    deterministicArchiveName: string;
  }>): LocatedArchive | Promise<LocatedArchive>;
}>;
export type PackagingFilesystemCapability = Readonly<{
  inspect(location: string): OutputEntry | Promise<OutputEntry>;
  read(location: string): Uint8Array | Promise<Uint8Array>;
  writeExclusive(location: string, content: Uint8Array): void | Promise<void>;
}>;
export type PackagingArchiveBuilderCapability = Readonly<{
  build(entries: readonly Readonly<{ name: string; content: Uint8Array }>[]):
    Uint8Array | Promise<Uint8Array>;
}>;
export type ZipPackagingDependencies = Readonly<{
  outputLocator: PackagingOutputLocatorCapability;
  archiveLocator: PackagingArchiveLocatorCapability;
  filesystem?: PackagingFilesystemCapability;
  archiveBuilder?: PackagingArchiveBuilderCapability;
}>;

const safeReference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const safeEntryName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" &&
    !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const isNodeError = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  (error as Readonly<{ code?: unknown }>).code === code;
const defaultFilesystem: PackagingFilesystemCapability = {
  inspect: async (location) => {
    try {
      const value = await lstat(location);
      return {
        exists: true,
        kind: value.isSymbolicLink() ? "symbolic-link" :
          value.isFile() ? "file" : value.isDirectory() ? "directory" : "other",
      };
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return { exists: false, kind: "other" };
      throw error;
    }
  },
  read: async (location) => new Uint8Array(await readFile(location)),
  writeExclusive: async (location, content) => {
    const handle = await open(location, "wx");
    try {
      await handle.writeFile(content);
    } finally {
      await handle.close();
    }
  },
};
const defaultArchiveBuilder: PackagingArchiveBuilderCapability = {
  build: (entries) => {
    const archive = new AdmZip();
    for (const entry of entries) archive.addFile(entry.name, Buffer.from(entry.content));
    return new Uint8Array(archive.toBuffer());
  },
};
const retryFor = (classification: PackagingClassification): RetryClassification =>
  classification === "packaged" ? "retry-not-required" :
  classification === "invalid" || classification === "rejected" ? "retry-not-allowed" :
  classification === "already-exists" ? "retry-requires-policy-change" :
  classification === "unavailable" ? "retry-safe" : "retry-external-policy";

export class ReferenceZipPackagingAdapter {
  readonly #outputLocator: PackagingOutputLocatorCapability;
  readonly #archiveLocator: PackagingArchiveLocatorCapability;
  readonly #filesystem: PackagingFilesystemCapability;
  readonly #archiveBuilder: PackagingArchiveBuilderCapability;

  constructor(dependencies: ZipPackagingDependencies) {
    this.#outputLocator = dependencies.outputLocator;
    this.#archiveLocator = dependencies.archiveLocator;
    this.#filesystem = dependencies.filesystem ?? defaultFilesystem;
    this.#archiveBuilder = dependencies.archiveBuilder ?? defaultArchiveBuilder;
  }

  async package(request: PackagingRequest): Promise<PackagingDecision> {
    const invalid = this.#validate(request);
    if (invalid) return this.#decision("invalid", invalid, false, 0, ["validation"]);

    const located: LocatedOutput[] = [];
    try {
      for (const output of request.outputs) {
        const value = await this.#outputLocator.locateOutput({
          opaqueReference: output.opaqueOutputArtifactReference,
        });
        located.push({ location: value.location, archiveEntryName: value.archiveEntryName });
      }
    } catch {
      return this.#decision("unavailable", "output-unavailable", false, 0,
        ["validation", "output-discovery"]);
    }
    if (new Set(located.map((value) => value.archiveEntryName)).size !== located.length ||
      located.some((value) => !safeEntryName.test(value.archiveEntryName)))
      return this.#decision("rejected", "naming-invalid", false, 0,
        ["validation", "output-discovery", "output-validation"]);

    const entries: Array<Readonly<{ name: string; content: Uint8Array }>> = [];
    try {
      for (const output of located) {
        const inspected = { ...(await this.#filesystem.inspect(output.location)) };
        if (!inspected.exists)
          return this.#decision("rejected", "output-not-found", false, 0,
            ["validation", "output-discovery", "output-validation"]);
        if (inspected.kind !== "file")
          return this.#decision("rejected", "output-not-regular", false, 0,
            ["validation", "output-discovery", "output-validation"]);
        entries.push({
          name: output.archiveEntryName,
          content: new Uint8Array(await this.#filesystem.read(output.location)),
        });
      }
    } catch {
      return this.#decision("unavailable", "output-unavailable", false, 0,
        ["validation", "output-discovery", "output-validation"]);
    }

    let archive: LocatedArchive;
    try {
      archive = { ...(await this.#archiveLocator.locateArchive({
        opaqueArchiveReference: request.archive.opaqueArchiveReference,
        deterministicArchiveName: `${request.operationIdentity}.zip`,
      })) };
    } catch {
      return this.#decision("unavailable", "dependency-failure", false, 0,
        ["validation", "output-discovery", "output-validation", "collision-validation"]);
    }
    if (path.extname(archive.location).toLowerCase() !== ".zip")
      return this.#decision("rejected", "naming-invalid", false, 0,
        ["validation", "output-discovery", "output-validation", "collision-validation"]);
    try {
      const existing = await this.#filesystem.inspect(archive.location);
      if (existing.exists)
        return this.#decision("already-exists", "archive-already-exists", false, 0,
          ["validation", "output-discovery", "output-validation", "collision-validation"]);
    } catch {
      return this.#decision("unavailable", "dependency-failure", false, 0,
        ["validation", "output-discovery", "output-validation", "collision-validation"]);
    }

    let content: Uint8Array;
    try {
      content = new Uint8Array(await this.#archiveBuilder.build(
        entries.map((entry) => ({ name: entry.name, content: new Uint8Array(entry.content) })),
      ));
    } catch {
      return this.#decision("failed", "archive-build-failed", false, 0,
        ["validation", "output-discovery", "output-validation",
          "collision-validation", "archive-build"]);
    }
    if (content.byteLength === 0)
      return this.#decision("failed", "archive-build-failed", false, 0,
        ["validation", "output-discovery", "output-validation",
          "collision-validation", "archive-build"]);
    try {
      await this.#filesystem.writeExclusive(archive.location, new Uint8Array(content));
    } catch (error) {
      return this.#decision(
        isNodeError(error, "EEXIST") ? "already-exists" : "failed",
        isNodeError(error, "EEXIST") ? "archive-already-exists" : "archive-write-failed",
        false,
        0,
        ["validation", "output-discovery", "output-validation",
          "collision-validation", "archive-build", "archive-write"],
      );
    }
    return this.#decision("packaged", "archive-created", true, entries.length,
      ["validation", "output-discovery", "output-validation", "collision-validation",
        "archive-build", "archive-write", "projection"],
      request.archive.opaqueArchiveReference,
      new Uint8Array(content));
  }

  #validate(request: PackagingRequest): PackagingReasonCode | undefined {
    if (!request || request.requestVersion !== "1.0" || !request.requestIdentity ||
      !request.operationIdentity || !safeReference.test(request.operationIdentity) ||
      !request.archive || request.archive.referenceVersion !== "1.0" ||
      !safeReference.test(request.archive.opaqueArchiveReference))
      return "request-invalid";
    if (!Array.isArray(request.outputs) || request.outputs.length === 0) return "outputs-missing";
    if (request.outputs.some((output) =>
      output.referenceVersion !== "1.0" ||
      !safeReference.test(output.opaqueOutputArtifactReference)))
      return "reference-invalid";
    const references = request.outputs.map((output) => output.opaqueOutputArtifactReference);
    if (new Set(references).size !== references.length) return "outputs-duplicate";
    if (request.namingPolicy?.policyVersion !== "1.0" ||
      request.namingPolicy.classification !== "operation-identity")
      return "naming-invalid";
    if (request.collisionPolicy?.policyVersion !== "1.0" ||
      request.collisionPolicy.classification !== "reject-existing")
      return "policy-unsupported";
    return undefined;
  }

  #decision(
    classification: PackagingClassification,
    reasonCode: PackagingReasonCode,
    archiveAvailable: boolean,
    outputCount: number,
    stages: readonly PackagingAuditEntry["stage"][],
    opaqueArchiveReference?: string,
    archiveBytes?: Uint8Array,
  ): PackagingDecision {
    return deepFreeze({
      decisionVersion: "1.0",
      classification,
      reasonCode,
      archiveAvailable,
      ...(archiveAvailable && opaqueArchiveReference
        ? { archive: { referenceVersion: "1.0" as const, opaqueArchiveReference } }
        : {}),
      ...(archiveAvailable && archiveBytes
        ? { archiveBytes: new Uint8Array(archiveBytes) }
        : {}),
      outputCount,
      retryClassification: retryFor(classification),
      audit: {
        auditVersion: "1.0",
        entries: stages.map((stage, sequence) => ({
          entryVersion: "1.0", sequence, stage, classification, reasonCode,
        })),
      },
    });
  }
}
