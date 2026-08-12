import { ReactNode, useEffect, useState } from "react";
import {
  completeGoogleLoginRedirect,
  getStoredToken,
  initiateGoogleLogin,
  startTokenRefreshListener,
} from "./GoogleAuth";
import { getCognitoToken, handleCognitoCallback, initiateCognitoLogin } from "./CognitoAuth";

interface RequireAuthProps {
  children: ReactNode;
}

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true" || import.meta.env.VITE_MOCK_API === "true";
const AUTH_PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || "google";

export function RequireAuth({ children }: RequireAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
        // Firebase Google sign-in (redirect flow) — see GoogleAuth.tsx for why
        // this replaced the previous hand-rolled OAuth implicit flow.
        startTokenRefreshListener();
        const token = getStoredToken();
        if (token) {
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        }
        const fromRedirect = await completeGoogleLoginRedirect();
        if (fromRedirect) {
          setIsAuthenticated(true);
        } else {
          initiateGoogleLogin();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Redirecting to login...</div>;
  }

  return <>{children}</>;
}
