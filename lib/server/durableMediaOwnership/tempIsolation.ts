import { mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { isUuid } from "./storageKey";

const TEMP_AUTHORITY_ROOT = resolve("/tmp/nexcut/jobs");

export type JobTempPaths = Readonly<{ root: string; input: string; work: string; output: string }>;

const contained = (root: string, candidate: string): string => {
  const normalized = resolve(candidate);
  if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) throw new Error("Job temp path escaped authority root");
  return normalized;
};

export const resolveJobTempPaths = (jobId: string, authorityRoot = TEMP_AUTHORITY_ROOT): JobTempPaths => {
  if (!isUuid(jobId)) throw new Error("Invalid job ID");
  const normalizedAuthorityRoot = resolve(authorityRoot);
  const root = contained(normalizedAuthorityRoot, resolve(normalizedAuthorityRoot, jobId));
  return Object.freeze({
    root,
    input: contained(root, resolve(root, "input")),
    work: contained(root, resolve(root, "work")),
    output: contained(root, resolve(root, "output")),
  });
};

export const createJobTempDirectories = async (jobId: string, authorityRoot?: string): Promise<JobTempPaths> => {
  const paths = resolveJobTempPaths(jobId, authorityRoot);
  await Promise.all([paths.input, paths.work, paths.output].map((directory) => mkdir(directory, { recursive: true })));
  return paths;
};

export const cleanupJobTempRoot = async (jobId: string, authorityRoot?: string): Promise<void> => {
  const paths = resolveJobTempPaths(jobId, authorityRoot);
  await rm(paths.root, { recursive: true, force: true });
};
