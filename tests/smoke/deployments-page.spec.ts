/**
 * Smoke: Deployments observability page renders against the mock API.
 *
 * Regression guard for the /deployments surface — MERGED into one flat all-modes table
 * (operator 2026-07-08; live/batch/paper are a Mode FILTER, not tabs). Guards: the unified
 * table renders every mode with a Mode badge, the failed/137 row shows the failed badge +
 * exit code, a mode+status filter deep-link narrows the list, and the per-target drill-down
 * renders. The mock API (VITE_MOCK_API=true via the playwright webServer) serves
 * /api/deployments/inventory + the umbrella summaries.
 */
import { expect, test } from "@playwright/test";

test.describe("Deployments observability page (unified all-modes)", () => {
  test("the /deployments page renders one flat table with every mode + a Mode filter", async ({ page }) => {
    // status=all so completed/failed + paper rows show alongside running (the default is
    // running — live-first). On the plain route this is a real filter deep-link (the fix).
    await page.goto("/deployments?status=all");
    await expect(page).toHaveURL(/status=all/);
    await expect(page.getByTestId("deployments-page")).toBeVisible();
    // Mode is a FILTER now, not per-mode tabs.
    await expect(page.getByTestId("umbrella-tab-LIVE")).toHaveCount(0);
    await expect(page.getByTestId("filter-mode")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    // Rows from MULTIPLE modes appear together (live + batch + paper) with Mode badges.
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-sports-backfill-20260621")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-paper-trading-1")).toBeVisible();
    await expect(page.getByTestId("mode-badge-LIVE").first()).toBeVisible();
    await expect(page.getByTestId("mode-badge-BATCH").first()).toBeVisible();
    await expect(page.getByTestId("mode-badge-PAPER").first()).toBeVisible();
    // Both GCP and AWS cloud badges render.
    await expect(page.getByTestId("cloud-badge-GCP").first()).toBeVisible();
    await expect(page.getByTestId("cloud-badge-AWS").first()).toBeVisible();
  });

  test("the mode filter (umbrella deep-link) surfaces the failed/137 (OOM) batch row", async ({ page }) => {
    // status=all reveals the failed row (default running would hide it); umbrella=batch scopes mode.
    await page.goto("/deployments?umbrella=batch&status=all");
    const row = page.getByTestId("deployment-row-sports-backfill-20260621");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("status-sports-backfill-20260621")).toContainText("failed");
    await expect(row).toContainText("137 (OOM)");
    // The per-umbrella summary header surfaces the last failure.
    await expect(page.getByTestId("summary-last-failure")).toContainText("sports-backfill-20260621");
  });

  test("status filter deep-link narrows the list to failed targets", async ({ page }) => {
    await page.goto("/deployments?umbrella=batch&status=failed");
    await expect(page.getByTestId("deployment-row-sports-backfill-20260621")).toBeVisible();
    // The succeeded Cloud Run job is filtered out.
    await expect(page.getByTestId("deployment-row-manifest-consolidator")).toHaveCount(0);
    // The status select reflects the URL param.
    await expect(page.getByTestId("filter-status")).toHaveValue("failed");
  });

  test("per-target detail drills down with exit code, run.log link, timeline + log tail", async ({ page }) => {
    await page.goto("/deployments?umbrella=batch&status=all");
    await page.getByTestId("deployment-link-sports-backfill-20260621").click();
    // A row opens the in-context slide-over (deep-linkable via ?detail=), not a full-page nav.
    // The standalone full page still exists at /deployments/:name (Alerts deep-links to it).
    await expect(page.getByTestId("cockpit-detail-panel")).toBeVisible();
    await expect(page).toHaveURL(/detail=sports-backfill-20260621/);
    await expect(page.getByTestId("deployment-detail-page")).toBeVisible();
    await expect(page.getByTestId("deployment-detail-title")).toContainText("sports-backfill-20260621");
    await expect(page.getByTestId("detail-exit-code")).toContainText("137 (OOM)");
    await expect(page.getByTestId("detail-run-log")).toContainText("run.log");
    // Reused per-VM detail backbone renders.
    await expect(page.getByTestId("vm-events-timeline")).toBeVisible();
  });
});

test.describe("Deployments date-range filter (WS-2, URL-backed ?date_from=&date_to=)", () => {
  test("a date-range deep-link narrows to targets that ran in the window, keeps signal-less rows", async ({ page }) => {
    // cefi-backfill-20260620 last-ran 2026-06-20T22:14:00Z (inside); defi-live-capture-1 last-ran
    // 2026-06-22 (outside, excluded); uts-shared-deployment-api has no last_run_at at all (an
    // always-on Cloud Run service) and must NEVER be filtered out by a date range (honest-absence
    // pass-through, matches deployment-api `_apply_date_range`).
    await page.goto("/deployments?status=all&date_from=2026-06-20&date_to=2026-06-20");
    await expect(page.getByTestId("filter-date-from")).toHaveValue("2026-06-20");
    await expect(page.getByTestId("filter-date-to")).toHaveValue("2026-06-20");
    await expect(page.getByTestId("deployment-row-cefi-backfill-20260620")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toHaveCount(0);
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toBeVisible();
  });

  test("editing the date inputs writes ?date_from=&date_to= to the URL; the ✕ clears both", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("filter-date-clear")).toHaveCount(0);
    await page.getByTestId("filter-date-from").fill("2026-06-20");
    await expect(page).toHaveURL(/date_from=2026-06-20/);
    await page.getByTestId("filter-date-to").fill("2026-06-21");
    await expect(page).toHaveURL(/date_to=2026-06-21/);
    await expect(page.getByTestId("filter-date-clear")).toBeVisible();
    await page.getByTestId("filter-date-clear").click();
    await expect(page).not.toHaveURL(/date_from=/);
    await expect(page).not.toHaveURL(/date_to=/);
    await expect(page.getByTestId("filter-date-clear")).toHaveCount(0);
  });
});

test.describe("Deployments kind filter — multi-select toggle chips (decision 3, ?kind=)", () => {
  test("toggling multiple kind chips shows the UNION; toggling all off reverts to every kind", async ({ page }) => {
    await page.goto("/deployments?status=all");
    // A VM row is visible with no kind filter active.
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("filter-kind-CLOUD_RUN_SERVICE")).toHaveAttribute("aria-pressed", "false");

    // Toggle CLOUD_RUN_SERVICE on — narrows to that one kind (services found despite Mode="—").
    await page.getByTestId("filter-kind-CLOUD_RUN_SERVICE").click();
    await expect(page).toHaveURL(/kind=CLOUD_RUN_SERVICE/);
    await expect(page.getByTestId("filter-kind-CLOUD_RUN_SERVICE")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toHaveCount(0);

    // Toggle SCHEDULER on too — the UNION of both kinds now shows (not a replace).
    await page.getByTestId("filter-kind-SCHEDULER").click();
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toBeVisible();
    await expect(page.getByTestId("deployment-row-wsd-consolidator-cron")).toBeVisible();

    // Toggle CLOUD_RUN_SERVICE back off — SCHEDULER stays selected, the service row drops out.
    await page.getByTestId("filter-kind-CLOUD_RUN_SERVICE").click();
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toHaveCount(0);
    await expect(page.getByTestId("deployment-row-wsd-consolidator-cron")).toBeVisible();

    // Toggle SCHEDULER off too — empty selection = "all", the ?kind= param is dropped entirely.
    await page.getByTestId("filter-kind-SCHEDULER").click();
    await expect(page).not.toHaveURL(/kind=/);
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
  });

  test("an old single-value deep-link (?kind=VM) still works as a 1-element set", async ({ page }) => {
    await page.goto("/deployments?status=all&kind=VM");
    await expect(page.getByTestId("filter-kind-VM")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-uts-shared-deployment-api")).toHaveCount(0);
  });
});

test.describe("Deployments service dropdown filter (WS-3, client-side, ?service=)", () => {
  test("options derive from the loaded inventory; selecting one narrows to that service only", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    // Options are populated from distinct `service` values already in the loaded inventory —
    // both fixtures' services must be present as selectable options.
    const select = page.getByTestId("filter-service");
    await expect(select.locator('option[value="market-tick-data-service"]')).toHaveCount(1);
    await expect(select.locator('option[value="execution-service"]')).toHaveCount(1);

    // Both rows visible with no service filter active.
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toBeVisible();

    // Selecting one service narrows to it — CLIENT-SIDE (no network round-trip; this is the
    // decision 2026-07-20 requires — server `?service=` is a distinct, unused-by-this-control param).
    await select.selectOption("market-tick-data-service");
    await expect(page).toHaveURL(/service=market-tick-data-service/);
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toHaveCount(0);

    // Reverting to "all" drops the ?service= param.
    await select.selectOption("");
    await expect(page).not.toHaveURL(/service=/);
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toBeVisible();
  });
});

test.describe("Deployments target search box (WS-3, case-insensitive substring, ?q=)", () => {
  test("typing narrows to matching targets instantly; the URL param is debounced; ✕ clears both", async ({ page }) => {
    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toBeVisible();
    await expect(page.getByTestId("filter-target-search-clear")).toHaveCount(0);

    // Case-insensitive substring match on the Target column (item.name) — filtering itself is
    // instant (client-side array filter), so no need to wait out the debounce for this assertion.
    const search = page.getByTestId("filter-target-search");
    await search.fill("DEFI");
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toHaveCount(0);

    // The URL write is debounced (300ms) — `toHaveURL`'s built-in polling covers the wait.
    await expect(page).toHaveURL(/q=DEFI/);

    // The ✕ clears both the visible input and the URL param.
    await page.getByTestId("filter-target-search-clear").click();
    await expect(search).toHaveValue("");
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toBeVisible();
    await expect(page).not.toHaveURL(/q=/);
  });

  test("a deep-linked ?q= narrows the list on load", async ({ page }) => {
    await page.goto("/deployments?status=all&q=cefi");
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();
    await expect(page.getByTestId("filter-target-search")).toHaveValue("cefi");
    await expect(page.getByTestId("deployment-row-cefi-live-trading-1")).toBeVisible();
    await expect(page.getByTestId("deployment-row-defi-live-capture-1")).toHaveCount(0);
  });
});

test.describe("deploymentApi.ts requests carry the operator's Google auth header (regression guard)", () => {
  // Root-cause regression for the 2026-08-14 live-401 fix: deploymentApi.ts's ~34 fetch() call
  // sites (unlike client.ts's createApiClient(), which always attached it) never sent the
  // sessionStorage "google_id_token" as an Authorization header, so every deploymentApi.ts-backed
  // call — including this page's own getDeploymentInventory() — 401'd against a live backend even
  // when the operator was already signed in. Fixed via a local authHeaders() helper in
  // deploymentApi.ts mirroring client.ts's exact header-attaching logic.
  //
  // This can't be proven with page.route()/waitForRequest(): under VITE_MOCK_API=true, src/lib/
  // mock-api.ts's installDeploymentMockHandlers() monkey-patches window.fetch directly and answers
  // every /api/* call in-JS (handleRoute()) without the request ever reaching the network — so
  // Playwright's CDP-level network interception never fires for it. Instead we install a
  // getter/setter on window.fetch via addInitScript BEFORE any page script runs: the getter always
  // returns a recording wrapper, and the setter captures whatever function main.tsx's
  // installDeploymentMockHandlers() later assigns to window.fetch as the real implementation to
  // delegate to. That records the actual `init.headers` deploymentApi.ts's fetch() calls send,
  // regardless of whether the call is answered in-JS or ever reaches the network.
  test("getDeploymentInventory() (deploymentApi.ts) sends Authorization: Bearer <google_id_token>", async ({
    page,
  }) => {
    const TEST_TOKEN = "test-id-token-e2e";
    await page.addInitScript((token) => {
      (
        window as unknown as { __capturedFetchCalls: Array<{ url: string; headers: Record<string, string> }> }
      ).__capturedFetchCalls = [];
      let current = window.fetch.bind(window);
      Object.defineProperty(window, "fetch", {
        configurable: true,
        get() {
          return (...args: Parameters<typeof fetch>) => {
            const [input, init] = args;
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            const headers: Record<string, string> = {};
            const h = init?.headers;
            if (h instanceof Headers) {
              h.forEach((v, k) => (headers[k] = v));
            } else if (Array.isArray(h)) {
              for (const [k, v] of h) headers[k] = v;
            } else if (h) {
              Object.assign(headers, h);
            }
            (
              window as unknown as { __capturedFetchCalls: Array<{ url: string; headers: Record<string, string> }> }
            ).__capturedFetchCalls.push({ url, headers });
            return current(...args);
          };
        },
        set(fn: typeof fetch) {
          current = fn;
        },
      });
      // Simulates an operator already signed in via the GoogleAuth popup flow (src/auth/
      // GoogleAuth.tsx stores the Firebase ID token under this exact sessionStorage key).
      sessionStorage.setItem("google_id_token", token);
    }, TEST_TOKEN);

    await page.goto("/deployments?status=all");
    await expect(page.getByTestId("deployments-page")).toBeVisible();
    await expect(page.getByTestId("deployment-matrix")).toBeVisible();

    const calls = await page.evaluate(
      () =>
        (window as unknown as { __capturedFetchCalls: Array<{ url: string; headers: Record<string, string> }> })
          .__capturedFetchCalls,
    );
    const inventoryCall = calls.find((c) => c.url.includes("/api/deployments/inventory"));
    expect(
      inventoryCall,
      `expected a deploymentApi.ts getDeploymentInventory() call to /api/deployments/inventory; captured: ${JSON.stringify(calls.map((c) => c.url))}`,
    ).toBeTruthy();
    expect(inventoryCall?.headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });
});
