import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AuthProviderConfig {
  provider: "google" | "cognito";
  clientId: string;
  redirectUri: string;
  scopes: string[];
  skipAuth?: boolean;
  serviceName?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { email?: string; name?: string } | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  config: AuthProviderConfig;
  children: ReactNode;
}

export function AuthProvider({ config, children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(config.skipAuth ?? false);
  const [isLoading, setIsLoading] = useState(!config.skipAuth);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(
    config.skipAuth ? { email: "dev@localhost", name: "Dev User" } : null
  );

  useEffect(() => {
    if (config.skipAuth) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // Check for existing token
    const token = localStorage.getItem("auth_token");
    if (token) {
      setIsAuthenticated(true);
      setUser({ email: "user@example.com" });
    }
    setIsLoading(false);
  }, [config.skipAuth]);

  const login = () => {
    if (config.skipAuth) return;
    // In a real implementation, this would redirect to OAuth
    console.log("Initiating login with", config.provider);
    // For now, simulate login
    localStorage.setItem("auth_token", "mock_token");
    setIsAuthenticated(true);
    setUser({ email: "user@example.com" });
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center p-8">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
            Authentication Required
          </h1>
          <p className="text-[var(--color-text-secondary)] mb-4">
            Please sign in to continue
          </p>
          <button
            onClick={login}
            className="px-4 py-2 bg-[var(--color-accent-blue)] text-white rounded-md hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
