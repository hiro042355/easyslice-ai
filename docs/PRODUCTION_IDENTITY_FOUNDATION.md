# Production Identity Foundation

## Authority

NEXCUT Production uses Google Identity Platform / Firebase Authentication as the application identity authority. The immutable Firebase `uid` is the canonical user identifier. Email addresses, display names, request bodies, and client-supplied identifiers are never identity authority.

YouTube OAuth remains a separate delegated authorization. A YouTube access or refresh token must never be accepted as a NEXCUT login or session credential.

## Server boundary

The Production server uses Firebase Admin SDK with Application Default Credentials. Service-account JSON files, embedded private keys, and `GOOGLE_APPLICATION_CREDENTIALS` are not part of this foundation.

Protected routes verify either a Firebase session cookie or a short-lived ID token. Verification checks provider signature, issuer, audience, expiry, and revocation. Provider failures are reduced to safe neutral authentication outcomes.

The same-origin browser flow exchanges a verified ID token for an HTTP-only, Secure, SameSite=Lax `__Host-nexcut_session` cookie with a five-day maximum lifetime. Session creation and logout require an exact same-origin request. Logout clears the cookie and revokes the Firebase user's refresh tokens.

## Ownership boundary

The required ownership chain is:

UserId → SessionId → JobId → MediaId / ExportId

The server derives UserId from the verified Firebase credential. Future persistence must bind every job, media object, intermediate asset, and export to that server-authoritative UserId. A filename, object path, URL parameter, or client-provided job identifier is insufficient authorization.

## Public client configuration

The following browser configuration is non-secret and must be supplied for the approved Production Firebase application:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

No server credential is exposed to the browser.

## External bootstrap required

Before live authentication validation:

- enable Identity Platform or Firebase Authentication in `nexcut-prod-jp-2026`;
- enable Google as the initial sign-in provider;
- register the approved Production domain as an authorized domain;
- configure the exact Google sign-in redirect/callback required by the provider;
- inject the public Firebase configuration into the Production build/runtime;
- retain the existing Cloud Run runtime service account and ADC authority.

The permanent Production product domain remains an Owner-controlled external authority. The generated Cloud Run URL is not established here as the permanent product identity.
