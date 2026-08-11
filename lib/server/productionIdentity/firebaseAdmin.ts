import "server-only";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });

export const firebaseAdminAuth = getAuth(app);
