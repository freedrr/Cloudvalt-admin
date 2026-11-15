# Cloudvalt Admin

Private admin dashboard for Cloudvalt account records and feedback.

## Local setup

1. Copy `.env.example` to `.env` and set `ADMIN_UIDS` to your Firebase Auth UID. This server variable is the access allowlist; do not prefix it with `VITE_`.
2. Let the server use Google Application Default Credentials, or set `GOOGLE_APPLICATION_CREDENTIALS` to a local Firebase service-account JSON file. For a hosted service, attach a service account with Firestore read access instead of committing a key file.
3. In Firebase Authentication, add the admin app's local or deployed hostname to its authorized domains.
4. Run `bun install`, then `bun run dev` and open `http://localhost:3001` for local use.

For production, run `bun run build` and start the Node server with `bun run start`. Configure `ADMIN_UIDS`, `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, and the server's Google credentials in the hosting provider's private environment. The server checks every request's Firebase ID token and only returns account data to UIDs in `ADMIN_UIDS`.

`VITE_FIREBASE_*` values are public Firebase web-app configuration used only for sign-in. Never put service-account credentials or other private keys in a `VITE_` variable.

## Dashboard data

- User profiles and plan/storage summaries from `users/{uid}`
- File and folder metadata from each user's subcollections
- Feedback and ratings from `users/{uid}/feedback`
- Estimated monthly plan value from assigned plan IDs; this is not a payment ledger or reconciled revenue report

The admin server uses Firebase Admin credentials, so the app's client-side Firestore rules can continue blocking cross-user reads.
