/**
 * Functional integration tests — verifies deployment-ui works correctly
 * with real @unified-trading/ui-auth and @unified-trading/ui-kit deps.
 *
 * Unlike unit tests (which mock these deps), these tests import the REAL
 * library components to catch contract drift between the UI and its deps.
 *
 * Env: VITE_MOCK_API=true (.env.test) => skipAuth=true => AuthProvider dev bypass.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Real imports from @unified-trading/ui-auth — NOT mocked
import { AuthProvider, RequireAuth, useAuth } from "@unified-trading/ui-auth";
import type { AuthProviderConfig } from "@unified-trading/ui-auth";

// Real imports from @unified-trading/ui-kit — NOT mocked
import {
  ErrorBoundary,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  Input,
  Label,
  mockJson,
  mockDelay,
} from "@unified-trading/ui-kit";

// Mock lucide-react to avoid SVG rendering issues in jsdom
vi.mock(
  "lucide-react",
  () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "__esModule") return true;
          return () => null;
        },
      },
    ),
);

const skipAuthConfig: AuthProviderConfig = {
  provider: "google",
  clientId: "",
  redirectUri: "http://localhost/auth/callback",
  scopes: ["openid", "email", "profile"],
  skipAuth: true,
  serviceName: "deployment-ui-test",
};

describe("@unified-trading/ui-auth integration", () => {
  it("AuthProvider with skipAuth=true renders children immediately", () => {
    render(
      <AuthProvider config={skipAuthConfig}>
        <MemoryRouter>
          <div data-testid="protected">Protected content</div>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("RequireAuth passes through children when skipAuth=true", () => {
    render(
      <AuthProvider config={skipAuthConfig}>
        <MemoryRouter>
          <RequireAuth>
            <div data-testid="guarded">Guarded content</div>
          </RequireAuth>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByTestId("guarded")).toBeInTheDocument();
  });

  it("useAuth returns dev credentials when skipAuth=true", () => {
    function AuthStatus() {
      const auth = useAuth();
      return (
        <div>
          <span data-testid="is-auth">{String(auth.isAuthenticated)}</span>
          <span data-testid="token">{auth.token}</span>
          <span data-testid="email">{auth.user?.email}</span>
        </div>
      );
    }

    render(
      <AuthProvider config={skipAuthConfig}>
        <MemoryRouter>
          <AuthStatus />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByTestId("is-auth")).toHaveTextContent("true");
    expect(screen.getByTestId("token")).toHaveTextContent("dev_token");
    expect(screen.getByTestId("email")).toHaveTextContent("dev@local");
  });

  it("useAuth throws when used outside AuthProvider", () => {
    function Orphan() {
      useAuth();
      return null;
    }

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      render(
        <MemoryRouter>
          <ErrorBoundary>
            <Orphan />
          </ErrorBoundary>
        </MemoryRouter>,
      );
    }).not.toThrow();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("@unified-trading/ui-kit integration", () => {
  it("ErrorBoundary renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">OK</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("ErrorBoundary catches thrown errors and shows fallback UI", () => {
    function Bomb(): React.ReactElement {
      throw new Error("Test explosion");
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("Badge renders text content correctly", () => {
    render(<Badge>Deployed</Badge>);
    expect(screen.getByText("Deployed")).toBeInTheDocument();
  });

  it("Button renders and is clickable", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Deploy</Button>);
    const button = screen.getByText("Deploy");
    expect(button).toBeInTheDocument();
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Card composition renders header and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Service Config</CardTitle>
        </CardHeader>
        <CardContent>execution-service v1.2.3</CardContent>
      </Card>,
    );
    expect(screen.getByText("Service Config")).toBeInTheDocument();
    expect(screen.getByText("execution-service v1.2.3")).toBeInTheDocument();
  });

  it("Tabs renders with triggers and content panels", () => {
    render(
      <Tabs defaultValue="deploy">
        <TabsList>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>
        <TabsContent value="deploy">
          <div>Deploy form</div>
        </TabsContent>
        <TabsContent value="history">
          <div>Deployment history</div>
        </TabsContent>
        <TabsContent value="config">
          <div>Service config</div>
        </TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Deploy")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Deploy form")).toBeInTheDocument();
  });

  it("cn utility merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("Input renders with placeholder", () => {
    render(<Input placeholder="Enter service name" />);
    expect(
      screen.getByPlaceholderText("Enter service name"),
    ).toBeInTheDocument();
  });

  it("Label renders text content", () => {
    render(<Label>Service</Label>);
    expect(screen.getByText("Service")).toBeInTheDocument();
  });

  it("mockJson creates a valid Response", () => {
    const resp = mockJson({ status: "healthy" });
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(200);
  });

  it("mockDelay returns a promise that resolves", async () => {
    await expect(mockDelay(1)).resolves.toBeUndefined();
  });
});

describe("auth + ui-kit composition (full stack)", () => {
  it("AuthProvider > RequireAuth > Tabs tree renders end-to-end", () => {
    render(
      <ErrorBoundary>
        <AuthProvider config={skipAuthConfig}>
          <MemoryRouter>
            <RequireAuth>
              <Tabs defaultValue="deploy">
                <TabsList>
                  <TabsTrigger value="deploy">Deploy</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="deploy">
                  <Card>
                    <CardContent>
                      <Badge>Ready</Badge>
                      <Button>Deploy Now</Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </RequireAuth>
          </MemoryRouter>
        </AuthProvider>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Deploy")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Deploy Now")).toBeInTheDocument();
  });
});
