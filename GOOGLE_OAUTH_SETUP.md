# Google OAuth setup for ImportPilot 1.0

Google sign-in code is already part of the release-hardening branch. This document covers the one external owner/admin setup that cannot be completed from the repository alone.

## Values ImportPilot needs

Production requires these environment variables:

```text
GOOGLE_CLIENT_ID=<Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<production-app-host>/api/auth/google/callback
```

Do not commit real values to Git. Store them in the production hosting platform secret/environment settings.

## Google Cloud Console setup

1. Open the Google Cloud project that will own ImportPilot authentication, or create a dedicated project.
2. Configure the OAuth consent/branding information for ImportPilot.
3. Create an OAuth 2.0 Client ID of type **Web application**.
4. Add the production ImportPilot origin under **Authorized JavaScript origins**, for example:

   `https://app.example.com`

5. Add this exact callback under **Authorized redirect URIs**:

   `https://app.example.com/api/auth/google/callback`

6. Copy the generated Client ID and Client Secret into the production secret store as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Set `GOOGLE_OAUTH_REDIRECT_URI` to the exact redirect URI registered above.
8. Redeploy/restart the app so the production process receives the values.

The scheme, hostname, port and callback path must match exactly. Do not register a localhost callback as the production redirect.

## Required release smoke tests

After credentials are configured:

1. Open the login page and confirm the Google button is enabled.
2. Sign in with a Google account whose email does not yet exist in ImportPilot. Confirm one user/workspace is created and the dashboard opens.
3. Use an existing ImportPilot email/password user whose Google account has the same verified email. Sign in through Google and confirm the existing dashboard/projects are used; no duplicate ImportPilot user may be created.
4. Sign out and confirm the active ImportPilot session is invalidated.
5. Confirm failed/cancelled Google authorization returns a controlled auth error rather than a raw provider response.

## Security contract implemented by ImportPilot

- Authorization Code flow uses PKCE.
- OAuth state is random and checked on callback.
- State/verifier are stored only in short-lived HttpOnly/SameSite cookies.
- ImportPilot accepts the Google identity only when Google reports `email_verified=true`.
- The existing ImportPilot session and organization-membership model remains the authorization boundary after Google identity verification.

## Release rule

PR #74 remains a release **HOLD** until the real Google credentials are configured and the two positive smoke cases above pass on the production-shaped deployment. No real Google secret is required for ordinary CI, unit tests or production build verification.
