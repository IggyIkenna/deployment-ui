/** Unit tests for the canonical auth-header helper (authHeaders) and token storage
 * accessors — the piece of GoogleAuth.tsx that's pure and Firebase-SDK-free, so it's
 * testable without mocking `firebase/auth`. Added 2026-08-18 alongside threading
 * authHeaders() through every previously-unauthenticated raw fetch() call site in the
 * app (see plans/active/issues/ — "some pages 401, others work fine" report). */

import { afterEach, describe, expect, it } from "vitest";
import { authHeaders, clearToken, getStoredToken } from "./GoogleAuth";

afterEach(() => {
  sessionStorage.clear();
});

describe("authHeaders", () => {
  it("omits Authorization when no token is stored", () => {
    expect(authHeaders()).toEqual({});
  });

  it("attaches Authorization: Bearer <token> when a token is stored", () => {
    sessionStorage.setItem("google_id_token", "abc123");
    expect(authHeaders()).toEqual({ Authorization: "Bearer abc123" });
  });

  it("merges extra headers with the Authorization header", () => {
    sessionStorage.setItem("google_id_token", "abc123");
    expect(authHeaders({ "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer abc123",
    });
  });

  it("returns just the extra headers, unmodified, when no token is stored", () => {
    expect(authHeaders({ Accept: "application/json" })).toEqual({ Accept: "application/json" });
  });
});

describe("getStoredToken / clearToken", () => {
  it("round-trips through sessionStorage", () => {
    expect(getStoredToken()).toBeNull();
    sessionStorage.setItem("google_id_token", "xyz");
    expect(getStoredToken()).toBe("xyz");
    clearToken();
    expect(getStoredToken()).toBeNull();
  });
});
