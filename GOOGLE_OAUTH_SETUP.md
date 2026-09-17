# Google OAuth setup for ImportPilot 1.0

Google Sign-In is a blocking ImportPilot 1.0 requirement. This document covers the external Google Cloud configuration that cannot be completed by repository code alone.

## Required production values

Store these only in the production hosting secret/environment store:

```text
GOOGLE_CLIENT_ID=<Google OAuth Web client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<production-app-host>/api/auth/google/callback
```

`APP_ORIGIN` must be the exact public HTTPS origin of the same deployment.

## Google Cloud Console setup

1. Open or create the Google Cloud project that owns ImportPilot authentication.
2. Configure the OAuth consent/branding information for ImportPilot.
3. Create an OAuth 2.0 Client ID of type **Web application**.
4. Add the exact production origin under **Authorized JavaScript origins**, for example:

   `https://app.example.com`

5. Add this exact callback under **Authorized redirect URIs**:

   `https://app.example.com/api/auth/google/callback`

6. Copy Client ID and Client Secret into the hosting secret store as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Set `GOOGLE_OAUTH_REDIRECT_URI` to the exact callback above.
8. Redeploy/restart the candidate so the runtime receives the values.
9. Run `npm run check:production-config`; it must return `IMPORTPILOT_PRODUCTION_CONFIG PASS`.

The scheme, hostname, port and callback path must match exactly.

## Required release smoke tests

On the exact release-candidate deployment:

1. Open login and registration and confirm the Google button is enabled.
2. Sign in with a Google account whose verified email does not yet exist in ImportPilot. Confirm exactly one user/workspace is created and the dashboard opens.
3. Use an existing ImportPilot email/password user whose Google account has the same verified email. Sign in through Google and confirm the existing dashboard/projects are used; no duplicate ImportPilot user or workspace may be created.
4. Sign out and confirm the active ImportPilot session is invalidated.
5. Cancel Google authorization and confirm a controlled localized error is shown.
6. Confirm an invalid/missing OAuth state is rejected.

## Security contract

- Authorization Code flow uses PKCE (`S256`).
- OAuth state is cryptographically random and compared on callback.
- State/verifier are held only in short-lived HttpOnly, SameSite=Lax cookies.
- The public callback/origin is derived from `APP_ORIGIN`/`RENDER_EXTERNAL_URL`, not an internal reverse-proxy host.
- Google identity is accepted only when Google reports `email_verified=true`.
- Existing verified-email ImportPilot users are linked rather than duplicated.
- The existing ImportPilot session and organization-membership model remains the authorization boundary after identity verification.

## Release rule

ImportPilot 1.0 remains **HOLD / NOT RELEASED** until the real Google credentials are configured and both positive smoke cases (new Google user and existing same-email ImportPilot user) pass on the exact candidate deployment.
