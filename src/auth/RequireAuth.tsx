import { ReactNode, useEffect, useState } from "react";
import { getStoredToken, signInWithGooglePopup, startTokenRefreshListener } from "./GoogleAuth";
import { getCognitoToken, handleCognitoCallback, initiateCognitoLogin } from "./CognitoAuth";
import { Button } from "../components/ui/button";

interface RequireAuthProps {
  children: ReactNode;
}

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true" || import.meta.env.VITE_MOCK_API === "true";
const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || "google";

export function RequireAuth({ children }: RequireAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    if (SKIP_AUTH) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    void (async () => {
      if (AUTH_PROVIDER === "cognito") {
        const existing = getCognitoToken();
        if (existing) {
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        }
        // Handle PKCE callback (code in query string)
        if (new URLSearchParams(window.location.search).has("code")) {
          const ok = await handleCognitoCallback();
          if (ok) {
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        }
        if (!window.location.pathname.includes("/auth/callback")) {
          await initiateCognitoLogin();
        }
      } else {
        // Firebase Google sign-in (popup) — see GoogleAuth.tsx for why this replaced
        // the earlier redirect-based flow (redirect loop from browser storage
        // partitioning, and it lost deep-linked routes on the round trip).
        startTokenRefreshListener();
        if (getStoredToken()) {
          setIsAuthenticated(true);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function handleGoogleSignIn(): Promise<void> {
    setSignInError(null);
    setIsSigningIn(true);
    try {
      await signInWithGooglePopup();
      setIsAuthenticated(true);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : "Sign-in failed — please try again");
    } finally {
      setIsSigningIn(false);
    }
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    if (AUTH_PROVIDER === "cognito") {
      return <div>Redirecting to login...</div>;
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-[var(--color-text-secondary)]">Sign in required to access this console.</p>
        <Button onClick={() => void handleGoogleSignIn()} disabled={isSigningIn}>
          {isSigningIn ? "Signing in..." : "Sign in with Google"}
        </Button>
        {signInError && <p className="text-[var(--color-accent-red)] text-sm">{signInError}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
