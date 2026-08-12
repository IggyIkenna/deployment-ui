import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onIdTokenChanged,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";

// Firebase Google sign-in (2026-08-12) — replaces a hand-rolled Google OAuth
// implicit-flow redirect that was never actually verifiable: it requested
// response_type=token (an access_token) while RequireAuth parsed the callback
// hash for an id_token that request type never returns, AND deployment-api's
// verify_any_auth only accepts a Firebase-minted ID token (verify_firebase_token),
// not a raw Google OAuth token — so even a correctly-provisioned OAuth client
// could not have produced a token the backend would accept. Firebase Auth's
// Google provider produces exactly the token type the backend already verifies,
// with zero backend changes. Reuses the SAME Firebase project already live for
// unified-trading-system-ui (config values below are the public client config —
// see unified-trading-system-ui/.env.production for the source; these are safe
// to bake into a build, same convention as that repo's firebase-config.ts).
const GOOGLE_TOKEN_KEY = "google_id_token";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
function firebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

let _auth: Auth | null = null;
function firebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(firebaseApp());
  }
  return _auth;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(GOOGLE_TOKEN_KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
}

export function initiateGoogleLogin(): void {
  void signInWithRedirect(firebaseAuth(), new GoogleAuthProvider());
}

// Resolves a pending sign-in redirect (the page just came back from Google's
// sign-in page) and stores the resulting Firebase ID token. Returns null on a
// normal page load with no pending redirect.
export async function completeGoogleLoginRedirect(): Promise<string | null> {
  const result = await getRedirectResult(firebaseAuth());
  if (!result) return null;
  const token = await result.user.getIdToken();
  sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
  return token;
}

// Firebase ID tokens expire hourly; the SDK silently refreshes the
// signed-in user's token in the background. client.ts reads GOOGLE_TOKEN_KEY
// synchronously from sessionStorage per-request, so this listener keeps that
// copy in sync with the SDK's refresh — without it, a session open longer
// than ~1h would start sending an expired token and 401 mid-use.
export function startTokenRefreshListener(): void {
  onIdTokenChanged(firebaseAuth(), (user) => {
    if (user) {
      void user.getIdToken().then((token) => {
        sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
      });
    } else {
      sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
    }
  });
}
