import "server-only";

import { randomUUID } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { createVercelWifCredential, readVercelWifConfiguration, type VercelWifDependencies } from "./vercelWifCredential";

export const withFirebaseAdminAuth = async <T>(
  operation: (auth: Auth) => Promise<T>,
  configuration = readVercelWifConfiguration(),
  dependencies: VercelWifDependencies = { getOidcToken: () => getVercelOidcToken() },
): Promise<T> => {
  const app = initializeApp({
    credential: createVercelWifCredential(configuration, dependencies),
    projectId: configuration.projectId,
  }, `nexcut-vercel-${randomUUID()}`);
  try {
    return await operation(getAuth(app));
  } finally {
    await deleteApp(app);
  }
};
