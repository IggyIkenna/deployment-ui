import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

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

/**
 * Canonical header-attaching helper — the ONE place every /api/* caller (client.ts,
 * deploymentApi.ts, and every component with its own raw `fetch()`) reads the cached
 * token from. Previously duplicated ad hoc (some call sites never attached it at all —
 * see plans/active/issues/, the "some pages 401, others work fine" report, 2026-08-18),
 * which is exactly the kind of drift a single shared source avoids.
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const storedToken = getStoredToken();
  return {
    ...(extra ?? {}),
    ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
  };
}

/** Reactive auth-state subscription (sign-in, sign-out, or session loss) — lets
 * RequireAuth and the app chrome (sign-out control, signed-in email) stay in sync
 * with Firebase's actual state instead of a one-time mount-time check. Returns the
 * unsubscribe function. */
export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth(), callback);
}

export async function signOutOfGoogle(): Promise<void> {
  await signOut(firebaseAuth());
  clearToken();
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

  startStaleTokenSelfHeal();
}

const REFRESH_CHECK_INTERVAL_MS = 60_000;
// Force a refresh once the cached token is within 5 minutes of expiry, not only when it
// has already expired — the goal is to never hand a near-dead token to a caller.
const REFRESH_SKEW_SECONDS = 300;

function decodeJwtExpirySeconds(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

async function refreshTokenIfStale(): Promise<void> {
  const stored = getStoredToken();
  const exp = stored ? decodeJwtExpirySeconds(stored) : null;
  const nowSeconds = Date.now() / 1000;
  if (exp !== null && exp - nowSeconds > REFRESH_SKEW_SECONDS) return;
  const user = firebaseAuth().currentUser;
  if (!user) return;
  try {
    const fresh = await user.getIdToken(true);
    sessionStorage.setItem(GOOGLE_TOKEN_KEY, fresh);
  } catch {
    // Best-effort self-heal — leaves the stale token in place. Requests keep 401ing
    // (same as before this fix) but the next check, 60s later or on tab-focus, retries.
  }
}

// Defensive self-heal for a real, live-observed failure mode: the passive onIdTokenChanged
// refresh above can fall behind in a long-lived tab (deployment-api Cloud Run logs,
// 2026-08-18, showed a cached token still in use ~2.6h past its expiry — consistent with
// browser background-tab timer throttling delaying Firebase's own proactive refresh).
// Re-checking on an interval AND on tab-focus bounds the staleness window instead of
// requiring a manual page reload to recover.
function startStaleTokenSelfHeal(): void {
  void refreshTokenIfStale();
  setInterval(() => void refreshTokenIfStale(), REFRESH_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshTokenIfStale();
  });
}
