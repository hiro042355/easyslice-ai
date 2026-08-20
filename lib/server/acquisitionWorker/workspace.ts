import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AcquisitionWorkspace = Readonly<{
  root: string;
  input: string;
  output: string;
  provider: string;
  mediaPath: string;
}>;

export const resolveAcquisitionWorkspace = (acquisitionId: string, authorityRoot: string): AcquisitionWorkspace => {
  if (!ID.test(acquisitionId)) throw new Error("invalid-acquisition-id");
  const base = path.resolve(authorityRoot);
  const root = path.resolve(base, acquisitionId);
  if (!root.startsWith(`${base}${path.sep}`)) throw new Error("acquisition-workspace-escape");
  const input = path.join(root, "input");
  const output = path.join(root, "output");
  const provider = path.join(root, "provider");
  return Object.freeze({ root, input, output, provider, mediaPath: path.join(output, "canonical.mp4") });
};

export const createAcquisitionWorkspace = async (acquisitionId: string, authorityRoot: string): Promise<AcquisitionWorkspace> => {
  const workspace = resolveAcquisitionWorkspace(acquisitionId, authorityRoot);
  await Promise.all([workspace.input, workspace.output, workspace.provider].map((directory) => mkdir(directory, { recursive: true })));
  return workspace;
};

export const cleanupAcquisitionWorkspace = async (acquisitionId: string, authorityRoot: string): Promise<void> => {
  const workspace = resolveAcquisitionWorkspace(acquisitionId, authorityRoot);
  await rm(workspace.root, { recursive: true, force: true });
};
