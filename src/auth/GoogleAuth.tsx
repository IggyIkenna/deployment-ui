const GOOGLE_TOKEN_KEY = "google_id_token";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(GOOGLE_TOKEN_KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
}

export function initiateGoogleLogin(): void {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri =
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    `${window.location.origin}/auth/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=openid+email+profile`;
  window.location.href = url;
}
