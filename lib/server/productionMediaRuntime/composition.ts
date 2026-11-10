import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import {
  createProductionMediaRuntimeClientFactories,
  executeProductionMediaRuntime,
  type ProductionMediaRuntimeResources,
} from "./compositionCore";

export type {
  ProductionMediaRuntimeResources,
  ValidatedMediaRuntimeConfiguration,
  MediaRuntimeClientFactories,
} from "./compositionCore";
export {
  validateMediaRuntimeConfiguration,
  createProductionMediaRuntimeClientFactories,
  executeProductionMediaRuntime,
} from "./compositionCore";

const defaultClientFactories = createProductionMediaRuntimeClientFactories(() => getVercelOidcToken());

export const withProductionMediaRuntime = async <T>(
  operation: (resources: ProductionMediaRuntimeResources) => Promise<T>,
): Promise<T> => executeProductionMediaRuntime(operation, defaultClientFactories, process.env);
