import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onIdTokenChanged, signInWithPopup, type Auth } from "firebase/auth";

// Firebase Google sign-in (2026-08-12, switched redirect->popup 2026-08-12) — popup instead
// of signInWithRedirect: the redirect flow depends on Firebase's pending-auth state
// surviving a full-page round trip through Google's login page (sessionStorage/IndexedDB),
// which modern browsers increasingly partition or clear (Safari ITP, Chrome's third-party
// storage changes) — the observed symptom was a redirect LOOP: sign in -> bounce back -> the
// app finds no pending redirect result -> redirects to sign-in again, forever. It also lost
// the original deep-linked route on the round trip. signInWithPopup keeps the whole flow in
// a popup window that messages the opener directly — no persisted cross-navigation state to
// lose, and the main window/URL never moves. Reuses the SAME Firebase project already live
// for unified-trading-system-ui (config values are the public client config — see that
// repo's .env.production for the source).
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

// Must be invoked directly from a user click handler — most browsers block a
// window.open() popup that isn't synchronously tied to a user gesture.
export async function signInWithGooglePopup(): Promise<string> {
  const result = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
  const token = await result.user.getIdToken();
  sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
  return token;
}

// Firebase ID tokens expire hourly; the SDK silently refreshes the signed-in user's
// token in the background. client.ts reads GOOGLE_TOKEN_KEY synchronously from
// sessionStorage per-request, so this listener keeps that copy in sync with the SDK's
// refresh — without it, a session open longer than ~1h would start sending an expired
// token and 401 mid-use.
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
