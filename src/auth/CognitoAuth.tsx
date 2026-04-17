const COGNITO_TOKEN_KEY = "cognito_access_token";

export function getCognitoToken(): string | null {
  return sessionStorage.getItem(COGNITO_TOKEN_KEY);
}

export function clearCognitoToken(): void {
  sessionStorage.removeItem(COGNITO_TOKEN_KEY);
}

export function initiateCognitoLogin(): void {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const redirectUri =
    import.meta.env.VITE_COGNITO_REDIRECT_URI ||
    `${window.location.origin}/auth/callback`;
  const url = `${domain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

export async function handleCognitoCallback(): Promise<string | null> {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return null;

  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const redirectUri =
    import.meta.env.VITE_COGNITO_REDIRECT_URI ||
    `${window.location.origin}/auth/callback`;
  const resp = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await resp.json();
  const token = data.access_token || data.id_token;
  if (token) sessionStorage.setItem(COGNITO_TOKEN_KEY, token);
  return token;
}
