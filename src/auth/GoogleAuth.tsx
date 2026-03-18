// Local auth utilities for Google OAuth

const TOKEN_KEY = "google_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function initiateGoogleLogin(clientId: string, redirectUri: string, scopes: string[]): void {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
