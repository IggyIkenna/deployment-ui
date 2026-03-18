/**
 * Mock API handlers for deployment-ui.
 * Active when VITE_MOCK_API=true.
 *
 * All /api/* fetch calls are intercepted and return realistic simulated data.
 * This enables full E2E smoke testing without a real backend.
 */

/**
 * Mock API handlers for deployment-ui.
 * Active when VITE_MOCK_API=true.
 *
 * Supports:
 * - VITE_STRESS_SCENARIO: BIG_DRAWDOWN | BIG_TICKS | MISSING_DATA | BAD_SCHEMAS | STALE_DATA | HIGH_CARDINALITY
 * - VITE_MOCK_DELAY_MS: artificial delay in ms for all mock responses
 */

// Default to mock mode unless explicitly disabled
export const MOCK_MODE = import.meta.env.VITE_MOCK_API !== "false";
const STRESS_SCENARIO = import.meta.env.VITE_STRESS_SCENARIO || "";
const MOCK_DELAY_MS = parseInt(import.meta.env.VITE_MOCK_DELAY_MS || "60", 10);

// ---- Mock data ----

const MOCK_SERVICES = [
  // Layer 1: Root Services
  {
    name: "instruments-service",
    layer: 1,
    category: "data",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T14:00:00Z",
    description: "Master instrument reference data service",
  },
  {
    name: "corporate-actions",
    layer: 1,
    category: "data",
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-16T10:00:00Z",
    description: "Corporate actions and dividends processing",
  },
  // Layer 2: Data Ingestion
  {
    name: "market-tick-data-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T16:00:00Z",
    description: "Real-time market tick data ingestion",
  },
  {
    name: "market-data-processing-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["category", "venue", "date"],
    status: "warning",
    lastDeployed: "2026-03-15T12:00:00Z",
    description: "Market data normalization and processing",
  },
  // Layer 3: Feature Engineering
  {
    name: "features-calendar-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T18:00:00Z",
    description: "Trading calendar and holiday features",
  },
  {
    name: "features-delta-one-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "venue", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T18:30:00Z",
    description: "Delta-one derivatives features",
  },
  {
    name: "features-volatility-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "venue", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T18:45:00Z",
    description: "Volatility surface and Greeks features",
  },
  {
    name: "features-onchain-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-18T09:00:00Z",
    description: "On-chain metrics and DeFi features",
  },
  {
    name: "features-sports-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-16T14:00:00Z",
    description: "Sports betting odds and analytics",
  },
  {
    name: "features-multi-timeframe-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "timeframe", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T20:00:00Z",
    description: "Multi-timeframe technical indicators",
  },
  {
    name: "features-cross-instrument-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "venue", "date"],
    status: "warning",
    lastDeployed: "2026-03-14T08:00:00Z",
    description: "Cross-instrument correlation features",
  },
  // Layer 4: Machine Learning
  {
    name: "ml-training-service",
    layer: 4,
    category: "ml",
    dimensions: ["category", "model_id", "date"],
    status: "healthy",
    lastDeployed: "2026-03-16T20:00:00Z",
    description: "ML model training orchestration",
  },
  {
    name: "ml-inference-service",
    layer: 4,
    category: "ml",
    dimensions: ["category", "model_id", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T11:00:00Z",
    description: "Real-time ML model inference",
  },
  // Layer 5: Strategy & Execution
  {
    name: "strategy-service",
    layer: 5,
    category: "execution",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T22:00:00Z",
    description: "Trading strategy execution engine",
  },
  {
    name: "execution-service",
    layer: 5,
    category: "execution",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-18T06:00:00Z",
    description: "Order execution and routing",
  },
  {
    name: "trading-agent-service",
    layer: 5,
    category: "execution",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T23:00:00Z",
    description: "Autonomous trading agents",
  },
  // Layer 6: Risk & Monitoring
  {
    name: "position-balance-monitor-service",
    layer: 6,
    category: "monitoring",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-18T01:00:00Z",
    description: "Position and balance reconciliation",
  },
  {
    name: "risk-and-exposure-service",
    layer: 6,
    category: "monitoring",
    dimensions: ["category", "date"],
    status: "error",
    lastDeployed: "2026-03-13T10:00:00Z",
    description: "Risk metrics and exposure limits",
  },
  {
    name: "pnl-attribution-service",
    layer: 6,
    category: "monitoring",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T02:00:00Z",
    description: "P&L attribution and analysis",
  },
  {
    name: "alerting-service",
    layer: 6,
    category: "monitoring",
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-17T03:00:00Z",
    description: "Alert management and notifications",
  },
  // Infrastructure
  {
    name: "ibkr-gateway-infra",
    layer: 7,
    category: "infrastructure",
    dimensions: [],
    status: "healthy",
    lastDeployed: "2026-03-15T04:00:00Z",
    description: "Interactive Brokers gateway infrastructure",
    isInfrastructure: true,
  },
  {
    name: "deployment-service",
    layer: 7,
    category: "infrastructure",
    dimensions: [],
    status: "healthy",
    lastDeployed: "2026-03-18T00:00:00Z",
    description: "Deployment orchestration service",
    isInfrastructure: true,
  },
  // Website
  {
    name: "odum-research-website",
    layer: 8,
    category: "website",
    dimensions: [],
    status: "healthy",
    lastDeployed: "2026-03-16T12:00:00Z",
    description: "Research portal and documentation",
    isInfrastructure: true,
  },
];

const MOCK_DEPLOYMENTS = [
  {
    id: "dep-001",
    service: "instruments-service",
    status: "completed",
    created_at: "2026-03-18T08:00:00Z",
    updated_at: "2026-03-18T08:45:00Z",
    total_shards: 156,
    completed_shards: 156,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: "daily-instruments",
    summary: { categories: ["cefi", "tradfi"], venues: ["Binance", "OKX", "NYSE", "NASDAQ"], date_range: "2026-03-01 to 2026-03-17" },
  },
  {
    id: "dep-002",
    service: "instruments-service",
    status: "running",
    created_at: "2026-03-18T09:30:00Z",
    updated_at: "2026-03-18T09:45:00Z",
    total_shards: 240,
    completed_shards: 142,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "live", cloud_provider: "gcp", region: "asia-northeast1", traffic_split: 10 },
    tag: "live-canary",
    summary: { categories: ["cefi"], venues: ["Binance", "OKX", "Bybit"], image_tag: "v0.4.2-abc1234" },
  },
  {
    id: "dep-003",
    service: "market-tick-data-service",
    status: "failed",
    created_at: "2026-03-18T07:00:00Z",
    updated_at: "2026-03-18T07:22:00Z",
    total_shards: 72,
    completed_shards: 31,
    failed_shards: 8,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "us-central1" },
    tag: "debug-run",
    summary: { categories: ["tradfi"], venues: ["NYSE", "NASDAQ"], date_range: "2026-03-10 to 2026-03-17" },
    error_message: "OOM: Container exceeded memory limit on 8 shards",
  },
  {
    id: "dep-004",
    service: "features-delta-one-service",
    status: "completed",
    created_at: "2026-03-17T22:00:00Z",
    updated_at: "2026-03-17T23:40:00Z",
    total_shards: 384,
    completed_shards: 384,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: "weekly-retrain",
    summary: { categories: ["cefi", "tradfi", "defi"], feature_groups: ["momentum", "mean_reversion", "volatility"], date_range: "2026-03-01 to 2026-03-17" },
  },
  {
    id: "dep-005",
    service: "ml-training-service",
    status: "completed",
    created_at: "2026-03-17T20:00:00Z",
    updated_at: "2026-03-17T21:15:00Z",
    total_shards: 48,
    completed_shards: 48,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: "model-v3.2",
    summary: { categories: ["cefi"], model_ids: ["alpha_v3", "momentum_v2"], date_range: "2026-02-01 to 2026-03-15" },
  },
  {
    id: "dep-006",
    service: "features-volatility-service",
    status: "running",
    created_at: "2026-03-18T08:30:00Z",
    updated_at: "2026-03-18T09:00:00Z",
    total_shards: 96,
    completed_shards: 45,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: null,
    summary: { categories: ["cefi", "tradfi"], feature_groups: ["iv_surface", "greeks"], date_range: "2026-03-15 to 2026-03-17" },
  },
  {
    id: "dep-007",
    service: "risk-and-exposure-service",
    status: "cancelled",
    created_at: "2026-03-17T14:00:00Z",
    updated_at: "2026-03-17T14:05:00Z",
    total_shards: 24,
    completed_shards: 3,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: "test-run",
    summary: { categories: ["cefi"], date_range: "2026-03-17" },
  },
  {
    id: "dep-008",
    service: "strategy-service",
    status: "completed",
    created_at: "2026-03-17T18:00:00Z",
    updated_at: "2026-03-17T18:30:00Z",
    total_shards: 12,
    completed_shards: 12,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "live", cloud_provider: "gcp", region: "asia-northeast1", traffic_split: 100 },
    tag: "prod-release",
    summary: { categories: ["cefi"], venues: ["Binance", "OKX"], image_tag: "v1.2.0-prod" },
  },
  {
    id: "dep-009",
    service: "corporate-actions",
    status: "pending",
    created_at: "2026-03-18T10:00:00Z",
    updated_at: "2026-03-18T10:00:00Z",
    total_shards: 36,
    completed_shards: 0,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "asia-northeast1" },
    tag: "scheduled",
    summary: { categories: ["tradfi"], date_range: "2026-03-01 to 2026-03-17" },
  },
  {
    id: "dep-010",
    service: "features-onchain-service",
    status: "completed_with_errors",
    created_at: "2026-03-17T16:00:00Z",
    updated_at: "2026-03-17T17:20:00Z",
    total_shards: 64,
    completed_shards: 58,
    failed_shards: 6,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp", region: "us-central1" },
    tag: "defi-features",
    summary: { categories: ["defi"], feature_groups: ["tvl", "yield", "liquidity"], date_range: "2026-03-10 to 2026-03-17" },
    error_message: "RPC rate limit exceeded on 6 shards",
  },
  {
    id: "dep-011",
    service: "execution-service",
    status: "completed",
    created_at: "2026-03-18T06:00:00Z",
    updated_at: "2026-03-18T06:10:00Z",
    total_shards: 8,
    completed_shards: 8,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "live", cloud_provider: "gcp", region: "asia-northeast1", traffic_split: 50 },
    tag: "blue-green",
    summary: { categories: ["cefi"], venues: ["Binance"], image_tag: "v2.1.0-stable" },
  },
  {
    id: "dep-012",
    service: "alerting-service",
    status: "completed",
    created_at: "2026-03-17T03:00:00Z",
    updated_at: "2026-03-17T03:05:00Z",
    total_shards: 4,
    completed_shards: 4,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "live", cloud_provider: "gcp", region: "asia-northeast1", traffic_split: 100 },
    tag: "hotfix-alerts",
    summary: { image_tag: "v0.9.1-hotfix" },
  },
];

const MOCK_CATEGORIES = [
  "cefi",
  "tradfi",
  "defi",
];

const MOCK_VENUES_BY_CATEGORY: Record<string, string[]> = {
  cefi: ["Binance", "OKX", "Bybit", "Kraken", "Coinbase", "Bitfinex", "Huobi", "KuCoin", "Gate.io", "MEXC"],
  tradfi: ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX", "Euronext", "Deutsche Boerse", "ASX", "SGX", "NSE"],
  defi: ["Uniswap", "Aave", "Compound", "MakerDAO", "Curve", "dYdX", "GMX", "Lido", "Rocket Pool", "Balancer"],
};

const MOCK_FEATURE_GROUPS = [
  "momentum",
  "mean_reversion",
  "volatility",
  "order_flow",
  "market_microstructure",
  "sentiment",
  "technical",
  "fundamental",
  "cross_sectional",
  "time_series",
];

const MOCK_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
];

const MOCK_QUOTA = {
  projectId: "unified-trading-prod",
  region: "asia-northeast1-c",
  cpuQuota: { used: 847, limit: 2000, unit: "vCPUs" },
  memoryQuota: { used: 3200, limit: 8192, unit: "GB" },
  instanceQuota: { used: 42, limit: 100, unit: "instances" },
  estimatedCost: {
    perShard: 0.18,
    total: null as number | null,
    currency: "USD",
  },
};

const MOCK_DATA_STATUS = {
  service: "instruments-service",
  overall_completion: 94.2,
  total_expected: 1850,
  total_found: 1742,
  total_missing: 108,
  categories: [
    {
      category: "cefi",
      completion_pct: 97.5,
      total_venues: 10,
      complete_venues: 10,
      venues: [
        { venue: "Binance", completion_pct: 100, expected: 90, found: 90, missing: 0 },
        { venue: "OKX", completion_pct: 98.9, expected: 90, found: 89, missing: 1 },
        { venue: "Bybit", completion_pct: 97.8, expected: 90, found: 88, missing: 2 },
        { venue: "Kraken", completion_pct: 100, expected: 90, found: 90, missing: 0 },
        { venue: "Coinbase", completion_pct: 95.6, expected: 90, found: 86, missing: 4 },
        { venue: "Bitfinex", completion_pct: 96.7, expected: 90, found: 87, missing: 3 },
        { venue: "Huobi", completion_pct: 100, expected: 90, found: 90, missing: 0 },
        { venue: "KuCoin", completion_pct: 94.4, expected: 90, found: 85, missing: 5 },
        { venue: "Gate.io", completion_pct: 97.8, expected: 90, found: 88, missing: 2 },
        { venue: "MEXC", completion_pct: 93.3, expected: 90, found: 84, missing: 6 },
      ],
    },
    {
      category: "tradfi",
      completion_pct: 92.1,
      total_venues: 10,
      complete_venues: 7,
      venues: [
        { venue: "NYSE", completion_pct: 100, expected: 65, found: 65, missing: 0 },
        { venue: "NASDAQ", completion_pct: 100, expected: 65, found: 65, missing: 0 },
        { venue: "LSE", completion_pct: 93.8, expected: 65, found: 61, missing: 4 },
        { venue: "TSE", completion_pct: 89.2, expected: 65, found: 58, missing: 7 },
        { venue: "HKEX", completion_pct: 84.6, expected: 65, found: 55, missing: 10 },
        { venue: "Euronext", completion_pct: 95.4, expected: 65, found: 62, missing: 3 },
        { venue: "Deutsche Boerse", completion_pct: 100, expected: 65, found: 65, missing: 0 },
        { venue: "ASX", completion_pct: 86.2, expected: 65, found: 56, missing: 9 },
        { venue: "SGX", completion_pct: 90.8, expected: 65, found: 59, missing: 6 },
        { venue: "NSE", completion_pct: 80.0, expected: 65, found: 52, missing: 13 },
      ],
    },
    {
      category: "defi",
      completion_pct: 88.5,
      total_venues: 10,
      complete_venues: 5,
      venues: [
        { venue: "Uniswap", completion_pct: 100, expected: 30, found: 30, missing: 0 },
        { venue: "Aave", completion_pct: 96.7, expected: 30, found: 29, missing: 1 },
        { venue: "Compound", completion_pct: 93.3, expected: 30, found: 28, missing: 2 },
        { venue: "MakerDAO", completion_pct: 100, expected: 30, found: 30, missing: 0 },
        { venue: "Curve", completion_pct: 90.0, expected: 30, found: 27, missing: 3 },
        { venue: "dYdX", completion_pct: 83.3, expected: 30, found: 25, missing: 5 },
        { venue: "GMX", completion_pct: 76.7, expected: 30, found: 23, missing: 7 },
        { venue: "Lido", completion_pct: 100, expected: 30, found: 30, missing: 0 },
        { venue: "Rocket Pool", completion_pct: 73.3, expected: 30, found: 22, missing: 8 },
        { venue: "Balancer", completion_pct: 100, expected: 30, found: 30, missing: 0 },
      ],
    },
  ],
  missing_dates: ["2026-03-05", "2026-03-06", "2026-03-12"],
  calendar: Array.from({ length: 30 }, (_, i) => {
    const d = new Date("2026-02-17");
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const isMissing = dateStr === "2026-03-05" || dateStr === "2026-03-06" || dateStr === "2026-03-12";
    const isPartial = dateStr === "2026-03-08" || dateStr === "2026-03-15";
    return {
      date: dateStr,
      status: isMissing ? "missing" : isPartial ? "partial" : "complete",
      shards: isMissing ? 0 : isPartial ? Math.floor(Math.random() * 30) + 20 : Math.floor(Math.random() * 20) + 50,
      completion_pct: isMissing ? 0 : isPartial ? Math.floor(Math.random() * 30) + 60 : 100,
    };
  }),
};

const MOCK_CHECKLIST = {
  service: "instruments-service",
  overallScore: 87,
  readiness_percent: 87,
  isBlocked: false,
  total_items: 15,
  completed_items: 13,
  partial_items: 1,
  pending_items: 1,
  not_applicable_items: 0,
  last_updated: "2026-03-18T09:00:00Z",
  blocking_items: [] as Array<{ id: string; description: string; category: string; notes?: string }>,
  categories: [
    {
      name: "data_coverage",
      display_name: "Data Coverage",
      percent: 95,
      total_items: 4,
      completed_items: 3,
      items: [
        {
          id: "c1",
          description: "CeFi venue coverage ≥ 95%",
          status: "done",
          blocking: false,
          verified_date: "2026-03-18T08:00:00Z",
        },
        {
          id: "c2",
          description: "TradFi venue coverage ≥ 90%",
          status: "done",
          blocking: false,
          verified_date: "2026-03-18T08:00:00Z",
        },
        {
          id: "c3",
          description: "DeFi protocol coverage ≥ 85%",
          status: "partial",
          blocking: false,
          verified_date: "2026-03-17T12:00:00Z",
          notes: "Waiting for Balancer and Rocket Pool integration",
        },
        {
          id: "c4",
          description: "Historical data backfill complete",
          status: "done",
          blocking: true,
          verified_date: "2026-03-15T10:00:00Z",
        },
      ],
    },
    {
      name: "build_health",
      display_name: "Build Health",
      percent: 100,
      total_items: 4,
      completed_items: 4,
      items: [
        {
          id: "b1",
          description: "Latest build passing",
          status: "done",
          blocking: true,
          verified_date: "2026-03-18T08:03:00Z",
        },
        {
          id: "b2",
          description: "No critical CVEs",
          status: "done",
          blocking: true,
          verified_date: "2026-03-18T08:03:00Z",
        },
        {
          id: "b3",
          description: "Test coverage ≥ 80%",
          status: "done",
          blocking: false,
          verified_date: "2026-03-18T08:03:00Z",
        },
        {
          id: "b4",
          description: "Type checking passes",
          status: "done",
          blocking: false,
          verified_date: "2026-03-18T08:03:00Z",
        },
      ],
    },
    {
      name: "deployment_readiness",
      display_name: "Deployment Readiness",
      percent: 75,
      total_items: 4,
      completed_items: 3,
      items: [
        {
          id: "d1",
          description: "Canary deployment validated",
          status: "pending",
          blocking: false,
          notes: "Schedule canary for next deployment window",
        },
        {
          id: "d2",
          description: "Rollback tested",
          status: "done",
          blocking: true,
          verified_date: "2026-03-16T14:00:00Z",
        },
        {
          id: "d3",
          description: "Alert thresholds configured",
          status: "done",
          blocking: false,
          verified_date: "2026-03-17T10:00:00Z",
        },
        {
          id: "d4",
          description: "Runbook documented",
          status: "done",
          blocking: false,
          verified_date: "2026-03-15T16:00:00Z",
        },
      ],
    },
    {
      name: "dependencies",
      display_name: "Dependencies",
      percent: 100,
      total_items: 3,
      completed_items: 3,
      items: [
        {
          id: "dep1",
          description: "unified-trading-library compatible",
          status: "done",
          blocking: true,
          verified_date: "2026-03-18T07:00:00Z",
        },
        {
          id: "dep2",
          description: "No breaking changes in upstream services",
          status: "done",
          blocking: true,
          verified_date: "2026-03-18T06:00:00Z",
        },
        {
          id: "dep3",
          description: "Database migrations applied",
          status: "done",
          blocking: true,
          verified_date: "2026-03-17T22:00:00Z",
        },
      ],
    },
  ],
};

// ---- Route handler ----

function delay(ms = MOCK_DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Stress overrides ----
function getStressDeployments(): typeof MOCK_DEPLOYMENTS {
  if (STRESS_SCENARIO === "MISSING_DATA") return [];
  if (STRESS_SCENARIO === "HIGH_CARDINALITY") {
    return Array.from({ length: 500 }, (_, i) => ({
      id: `dep-hc-${String(i).padStart(4, "0")}`,
      service: MOCK_SERVICES[i % MOCK_SERVICES.length].name,
      status: ["completed", "running", "failed", "queued"][i % 4],
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      updated_at: new Date(Date.now() - i * 1800000).toISOString(),
      total_shards: Math.floor(Math.random() * 200) + 10,
      completed_shards: Math.floor(Math.random() * 100),
      failed_shards: i % 4 === 2 ? Math.floor(Math.random() * 20) : 0,
      parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
      tag: null,
    }));
  }
  if (STRESS_SCENARIO === "BIG_DRAWDOWN") {
    return MOCK_DEPLOYMENTS.map((d) => ({
      ...d,
      status: "failed",
      failed_shards: d.total_shards,
    }));
  }
  return MOCK_DEPLOYMENTS;
}

function getStressServices(): typeof MOCK_SERVICES {
  if (STRESS_SCENARIO === "MISSING_DATA") return [];
  if (STRESS_SCENARIO === "HIGH_CARDINALITY") {
    return Array.from({ length: 100 }, (_, i) => ({
      name: `service-${String(i).padStart(3, "0")}`,
      layer: (i % 6) + 1,
      category: [
        "data",
        "ingestion",
        "features",
        "ml",
        "execution",
        "monitoring",
      ][i % 6],
      dimensions: ["category", "date"],
      status: i % 10 === 0 ? "warning" : "healthy",
      lastDeployed: new Date(Date.now() - i * 86400000).toISOString(),
    }));
  }
  return MOCK_SERVICES;
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRoute(url: string, init?: RequestInit): Promise<Response> {
  await delay();
  const method = init?.method?.toUpperCase() ?? "GET";
  const path = url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/\?.*$/, "")
    .replace("/api/v1/", "/api/");

  // Health
  if (path === "/api/health") {
    return json({
      status: "healthy",
      uptime: 99.97,
      version: "0.1.1",
      mock: true,
    });
  }

  // Services overview (must come before /api/services to avoid partial match)
  if (path === "/api/services/overview") {
    return json({
      services: MOCK_SERVICES.map((s) => ({
        ...s,
        shards: Math.floor(Math.random() * 200) + 20,
      })),
    });
  }

  // Services list
  if (path === "/api/services") {
    return json({ services: getStressServices() });
  }

  // Service sub-routes
  if (path.match(/^\/api\/services\/(.+)\/dimensions$/)) {
    const serviceName = path.match(/^\/api\/services\/(.+)\/dimensions$/)?.[1];
    const svc = MOCK_SERVICES.find((s) => s.name === serviceName);
    const dimNames: string[] = svc?.dimensions ?? ["date"];
    const dimensionObjects = dimNames.map((name) => {
      if (name === "date") {
        return {
          name: "date",
          type: "date_range",
          description: "Date range for batch processing",
          granularity: "daily",
        };
      }
      if (name === "category") {
        return {
          name: "category",
          type: "fixed",
          description: "Market category (cefi=crypto exchanges, tradfi=traditional finance, defi=decentralized protocols)",
          values: MOCK_CATEGORIES,
        };
      }
      if (name === "venue") {
        return {
          name: "venue",
          type: "hierarchical",
          description: "Trading venue (filtered by selected category)",
          parent: "category",
          values: [], // Loaded dynamically based on category
        };
      }
      if (name === "feature_group") {
        return {
          name: "feature_group",
          type: "fixed",
          description: "Feature engineering group",
          values: MOCK_FEATURE_GROUPS,
        };
      }
      if (name === "timeframe") {
        return {
          name: "timeframe",
          type: "fixed",
          description: "Data aggregation timeframe",
          values: MOCK_TIMEFRAMES,
        };
      }
      if (name === "model_id") {
        return {
          name: "model_id",
          type: "fixed",
          description: "ML model identifier",
          values: ["alpha_v3", "momentum_v2", "mean_reversion_v1", "volatility_v2", "sentiment_v1"],
        };
      }
      return { name, type: "fixed", description: name, values: [] };
    });
    return json({
      service: serviceName,
      description: svc?.description ?? "",
      dimensions: dimensionObjects,
      cli_args: { "--start-date": null, "--end-date": null, "--categories": null, "--venues": null },
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/dependencies$/)) {
    const serviceName = path.match(/^\/api\/services\/(.+)\/dependencies$/)?.[1];
    return json({
      service: serviceName,
      description: MOCK_SERVICES.find((s) => s.name === serviceName)?.description ?? "",
      upstream: [
        { service: "instruments-service", description: "Master instrument data", required: true },
        { service: "corporate-actions", description: "Corporate actions data", required: false },
      ],
      downstream_dependents: ["features-delta-one-service", "features-volatility-service", "ml-training-service"],
      outputs: [
        { name: "processed_data", bucket_template: "gs://unified-trading-{category}/{venue}/{date}/processed/" },
        { name: "features", bucket_template: "gs://unified-trading-features/{category}/{venue}/{date}/" },
      ],
      dag: {
        nodes: ["instruments-service", "corporate-actions", serviceName, "features-delta-one-service", "ml-training-service"],
        edges: [
          { from: "instruments-service", to: serviceName, required: true },
          { from: "corporate-actions", to: serviceName, required: false },
          { from: serviceName, to: "features-delta-one-service", required: true },
          { from: serviceName, to: "ml-training-service", required: true },
        ],
        execution_order: ["instruments-service", "corporate-actions", serviceName, "features-delta-one-service", "ml-training-service"],
      },
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/checklist\/validate$/)) {
    return json({
      service: "instruments-service",
      ready: true,
      readiness_percent: 100,
      total_items: 10,
      completed_items: 10,
      blocking_items: [],
      warnings: [],
      can_proceed_with_acknowledgment: false,
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/checklist$/)) {
    return json(MOCK_CHECKLIST);
  }
  if (path.match(/^\/api\/services\/(.+)\/status$/)) {
    return json({ status: "healthy", lastCheck: new Date().toISOString() });
  }
  if (path.match(/^\/api\/services\/(.+)\/start-dates$/)) {
    return json({ service: "instruments-service", start_dates: {} });
  }
  if (path.match(/^\/api\/services\/(.+)\/data-status$/)) {
    return json(MOCK_DATA_STATUS);
  }

  // Config
  if (path.match(/^\/api\/config\/venues\/(.+)$/)) {
    const cat = path.split("/").pop() ?? "cefi";
    return json({ category: cat, venues: MOCK_VENUES_BY_CATEGORY[cat] ?? [] });
  }
  if (path.match(/^\/api\/config\/venues/)) {
    const cat = new URL(url, "http://x").searchParams.get("category") ?? "cefi";
    return json({
      categories: MOCK_CATEGORIES.reduce((acc, c) => {
        acc[c] = MOCK_VENUES_BY_CATEGORY[c] ?? [];
        return acc;
      }, {} as Record<string, string[]>),
      category: cat,
      venues: MOCK_VENUES_BY_CATEGORY[cat] ?? [],
    });
  }
  if (path.match(/^\/api\/config\/start-dates/)) {
    return json({ dates: { equity: "2020-01-02", crypto: "2019-01-01" } });
  }
  if (path === "/api/config/region") {
    return json({
      gcs_region: "asia-northeast1",
      storage_region: "asia-northeast1",
      cloud_provider: "gcp",
      zones: ["asia-northeast1-a", "asia-northeast1-b", "asia-northeast1-c"],
    });
  }

  // Venues
  if (path.startsWith("/api/venues")) {
    const cat = url.searchParams.get("category") ?? "cefi";
    return json({ 
      categories: MOCK_CATEGORIES.reduce((acc, c) => {
        acc[c] = MOCK_VENUES_BY_CATEGORY[c] ?? [];
        return acc;
      }, {} as Record<string, string[]>),
      category: cat, 
      venues: MOCK_VENUES_BY_CATEGORY[cat] ?? [], 
      data_types: ["ohlcv", "trades", "orderbook", "funding", "liquidations"] 
    });
  }

  // Deployments
  if (path === "/api/deployments" && method === "POST") {
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
    const serviceName = (body.service as string | undefined) ?? "instruments-service";
    const isDryRun = (body.dry_run as boolean | undefined) ?? true;
    const categories = (body.categories as string[] | undefined) ?? ["cefi", "tradfi"];
    const startDate = (body.start_date as string | undefined) ?? "2026-03-01";
    const endDate = (body.end_date as string | undefined) ?? "2026-03-17";
    const computeMode = (body.compute as string | undefined) ?? "cloud_run";
    
    // Generate realistic shards based on categories and date range
    const mockShards: Array<{
      shard_id: string;
      dimensions: Record<string, string | number>;
      cli_args: string[];
    }> = [];
    
    // Generate multiple dates for preview
    const dates = ["2026-03-15", "2026-03-16", "2026-03-17"];
    
    for (const category of categories) {
      const venues = MOCK_VENUES_BY_CATEGORY[category] ?? [];
      for (const venue of venues.slice(0, 2)) { // First 2 venues per category for preview
        for (const date of dates.slice(0, 2)) { // First 2 dates
          mockShards.push({
            shard_id: `${category}_${venue}_${date}`,
            dimensions: {
              category,
              venue,
              date,
            },
            cli_args: [
              `--category=${category}`,
              `--venue=${venue}`,
              `--start-date=${date}`,
              `--end-date=${date}`,
            ],
          });
        }
      }
    }
    
    const totalShards = categories.reduce((acc, cat) => {
      return acc + (MOCK_VENUES_BY_CATEGORY[cat]?.length ?? 0) * 17; // 17 days
    }, 0);

    const deploymentId = `dep-${Date.now()}`;
    const now = new Date().toISOString();

    return json(
      {
        dry_run: isDryRun,
        deployment_id: isDryRun ? null : deploymentId,
        service: serviceName,
        compute_mode: computeMode,
        total_shards: totalShards,
        shards: mockShards,
        shards_truncated: totalShards > mockShards.length,
        message: isDryRun 
          ? `Dry run complete: ${totalShards} shards would be created`
          : `Deployment ${deploymentId} started with ${totalShards} shards`,
        started_at: isDryRun ? null : now,
        cli_command: `python -m unified_trading_deployment.cli deploy -s ${serviceName} --categories ${categories.join(",")} --start-date ${startDate} --end-date ${endDate} --compute ${computeMode}`,
        summary: {
          breakdown: {
            categories: categories.length,
            venues: categories.reduce((acc, cat) => acc + (MOCK_VENUES_BY_CATEGORY[cat]?.length ?? 0), 0),
            dates: 17,
          },
          advisor: {
            recommended_max_concurrent: 50,
            recommended_date_granularity: "daily",
            warnings: totalShards > 500 ? ["Large deployment: consider running in batches"] : [],
            notes: ["Using cloud_run for cost efficiency"],
          },
        },
      },
      201,
    );
  }
  if (path === "/api/deployments") {
    const deps = getStressDeployments();
    return json({
      deployments: deps,
      total: deps.length,
    });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/quota$/)) {
    const shards = parseInt(
      new URL(url, "http://x").searchParams.get("shards") ?? "50",
    );
    return json({
      total_shards: shards,
      max_concurrent: 2000,
      estimated_duration_min: 5,
    });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/events$/)) {
    const id = path.split("/")[3];
    const now = new Date();
    const events = [
      {
        event_id: `evt-${id}-001`,
        timestamp: new Date(now.getTime() - 120000).toISOString(),
        type: "deployment_started",
        message: "Deployment initiated",
        metadata: { shards: 48, compute: "cloud_run" },
      },
      {
        event_id: `evt-${id}-002`,
        timestamp: new Date(now.getTime() - 90000).toISOString(),
        type: "shard_started",
        message: "Started 24 shards in batch 1",
        metadata: { batch: 1, shards_started: 24 },
      },
      {
        event_id: `evt-${id}-003`,
        timestamp: new Date(now.getTime() - 60000).toISOString(),
        type: "shard_completed",
        message: "Completed 20 shards in batch 1",
        metadata: { batch: 1, shards_completed: 20, shards_remaining: 4 },
      },
      {
        event_id: `evt-${id}-004`,
        timestamp: new Date(now.getTime() - 30000).toISOString(),
        type: "shard_started",
        message: "Started 24 shards in batch 2",
        metadata: { batch: 2, shards_started: 24 },
      },
    ];
    return json({ deployment_id: id, events, count: events.length });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/vm-events$/)) {
    const id = path.split("/")[3];
    const now = new Date();
    const vmEvents = [
      { event_id: `vm-${id}-001`, timestamp: new Date(now.getTime() - 90000).toISOString(), type: "vm_started", vm_name: "shard-worker-001", message: "VM instance started" },
      { event_id: `vm-${id}-002`, timestamp: new Date(now.getTime() - 60000).toISOString(), type: "vm_healthy", vm_name: "shard-worker-001", message: "VM passed health check" },
      { event_id: `vm-${id}-003`, timestamp: new Date(now.getTime() - 30000).toISOString(), type: "task_started", vm_name: "shard-worker-001", message: "Started processing shard batch" },
    ];
    return json({ deployment_id: id, events: vmEvents, count: vmEvents.length });
  }
  if (path.match(/^\/api\/deployments\/(.+)$/)) {
    const id = path.split("/").pop();
    const dep =
      MOCK_DEPLOYMENTS.find((d) => d.id === id) ?? MOCK_DEPLOYMENTS[0];
    return json({ deployment: dep });
  }

  // Quota (standalone endpoint)
  if (path === "/api/quota" || path.startsWith("/api/quota")) {
    const shards = parseInt(
      new URL(url, "http://x").searchParams.get("shards") ?? "50",
    );
    return json({
      ...MOCK_QUOTA,
      estimatedCost: { ...MOCK_QUOTA.estimatedCost, total: shards * 0.18 },
    });
  }

  // Data status (standalone)
  if (path.match(/^\/api\/data-status/)) {
    return json(MOCK_DATA_STATUS);
  }

  // Cloud builds
  if (
    path === "/api/cloud-builds" ||
    path === "/cloud-builds/triggers" ||
    path === "/api/cloud-builds/triggers"
  ) {
    return json({
      triggers: [
        {
          trigger_id: "trig-001",
          service: "instruments-service",
          type: "service",
          github_repo: "IggyIkenna/instruments-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "SUCCESS",
            commit_sha: "a8f2c91",
            create_time: "2026-03-18T08:00:00Z",
            duration_seconds: 185,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-001",
            build_id: "build-001",
          },
        },
        {
          trigger_id: "trig-002",
          service: "market-tick-data-service",
          type: "service",
          github_repo: "IggyIkenna/market-tick-data-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "SUCCESS",
            commit_sha: "b3e4d72",
            create_time: "2026-03-17T22:30:00Z",
            duration_seconds: 210,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-002",
            build_id: "build-002",
          },
        },
        {
          trigger_id: "trig-003",
          service: "features-delta-one-service",
          type: "service",
          github_repo: "IggyIkenna/features-delta-one-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "FAILURE",
            commit_sha: "c5f6e83",
            create_time: "2026-03-18T06:15:00Z",
            duration_seconds: 95,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-003",
            build_id: "build-003",
            error_message: "Test suite failed: 3 tests failed in test_features.py",
          },
        },
        {
          trigger_id: "trig-004",
          service: "ml-training-service",
          type: "service",
          github_repo: "IggyIkenna/ml-training-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "SUCCESS",
            commit_sha: "d7g8h94",
            create_time: "2026-03-17T18:00:00Z",
            duration_seconds: 340,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-004",
            build_id: "build-004",
          },
        },
        {
          trigger_id: "trig-005",
          service: "unified-trading-library",
          type: "sdk",
          github_repo: "IggyIkenna/unified-trading-library",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "SUCCESS",
            commit_sha: "e9f0a05",
            create_time: "2026-03-18T07:00:00Z",
            duration_seconds: 420,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-005",
            build_id: "build-005",
          },
        },
        {
          trigger_id: "trig-006",
          service: "strategy-service",
          type: "service",
          github_repo: "IggyIkenna/strategy-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "WORKING",
            commit_sha: "f1g2h16",
            create_time: "2026-03-18T09:45:00Z",
            duration_seconds: null,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-006",
            build_id: "build-006",
          },
        },
        {
          trigger_id: "trig-007",
          service: "risk-and-exposure-service",
          type: "service",
          github_repo: "IggyIkenna/risk-and-exposure-service",
          branch_pattern: "main",
          disabled: true,
          last_build: {
            status: "FAILURE",
            commit_sha: "g3h4i27",
            create_time: "2026-03-15T10:00:00Z",
            duration_seconds: 45,
            log_url: "https://console.cloud.google.com/cloud-build/builds/build-007",
            build_id: "build-007",
            error_message: "Dependency resolution failed: conflicting versions",
          },
        },
      ],
    });
  }
  if (path.match(/^\/cloud-builds\/history\//)) {
    const now = new Date();
    return json({ 
      builds: [
        {
          id: "build-recent-001",
          status: "SUCCESS",
          startTime: new Date(now.getTime() - 3600000).toISOString(),
          finishTime: new Date(now.getTime() - 3300000).toISOString(),
          duration_seconds: 300,
          log_url: "https://console.cloud.google.com/cloud-build/builds/build-recent-001",
          source: { branch: "main", commit: "abc1234" },
        },
        {
          id: "build-recent-002",
          status: "SUCCESS",
          startTime: new Date(now.getTime() - 86400000).toISOString(),
          finishTime: new Date(now.getTime() - 86100000).toISOString(),
          duration_seconds: 300,
          log_url: "https://console.cloud.google.com/cloud-build/builds/build-recent-002",
          source: { branch: "main", commit: "def5678" },
        },
      ] 
    });
  }
  if (path === "/cloud-builds/trigger" && method === "POST") {
    return json(
      {
        success: true,
        message: "Build triggered (mock)",
        build_id: `build-${Date.now()}`,
      },
      201,
    );
  }
  if (path.match(/^\/api\/cloud-builds\/(.+)\/trigger$/) && method === "POST") {
    return json(
      {
        build: {
          id: `cb-${Date.now()}`,
          status: "QUEUED",
          startTime: new Date().toISOString(),
        },
        message: "Build triggered (mock)",
      },
      201,
    );
  }

  // Service status
  if (path.match(/^\/(?:api\/)?service-status\/(.+)\/status$/)) {
    return json({
      service: "instruments-service",
      health: "healthy",
      last_data_update: "2026-01-15T08:00:00Z",
      last_deployment: "2026-01-15T10:00:00Z",
      last_build: "2026-01-14T20:00:00Z",
      last_code_push: "2026-01-14T18:00:00Z",
      anomalies: [],
      details: {
        deployment: {
          deployment_id: "dep-test-001",
          status: "completed",
          compute_type: "cloud_run",
        },
        build: {
          status: "SUCCESS",
          commit_sha: "abc1234",
          duration_seconds: 120,
        },
        code: { commit_sha: "abc1234", message: "feat: update", author: "dev" },
      },
    });
  }

  // Cache — handle both POST (client uses POST) and DELETE
  if (path === "/api/cache/clear") {
    return json({ cleared: true, message: "Cache cleared (mock)" });
  }
  if (path === "/api/cache") {
    return json({ cleared: true, message: "Cache cleared (mock)" });
  }

  // Categories
  if (path === "/api/categories") {
    return json({ categories: MOCK_CATEGORIES });
  }

  // Builds
  if (path.match(/^\/api\/builds\/.+/)) {
    return json([
      {
        tag: "v0.3.1-abc1234",
        display: "v0.3.1 (abc1234)",
        version: "0.3.1",
        branch: "main",
        is_v1: false,
      },
      {
        tag: "v0.3.0-def5678",
        display: "v0.3.0 (def5678)",
        version: "0.3.0",
        branch: "main",
        is_v1: false,
      },
    ]);
  }

  // Deploy a specific build
  if (path.match(/^\/api\/deployments\/.+\/deploy$/) && method === "POST") {
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
    return json(
      {
        status: "deploying",
        service: path.split("/")[3],
        image_tag: (body.image_tag as string | undefined) ?? "latest",
        environment: (body.environment as string | undefined) ?? "dev",
      },
      201,
    );
  }

  // Rollback
  if (path.match(/^\/api\/deployments\/.+\/rollback$/) && method === "POST") {
    return json({
      id: path.split("/")[3],
      status: "rolling_back",
      message: "Rollback initiated (mock)",
    });
  }

  // Epics
  if (path === "/api/epics") {
    return json([
      {
        id: "epic-code-completion",
        name: "Code Completion",
        description: "All services passing CI/CD with full test coverage",
        status: "in_progress",
        repos_total: 24,
        repos_done: 18,
        repos_blocked: 2,
        repos_optional: 4,
        completion_pct: 75.0,
        data_availability: { historical: true, live: true, mock: true, testnet: true },
      },
      {
        id: "epic-deployment",
        name: "Deployment Readiness",
        description: "All services deployed and operational in production",
        status: "in_progress",
        repos_total: 24,
        repos_done: 12,
        repos_blocked: 3,
        repos_optional: 4,
        completion_pct: 50.0,
        data_availability: { historical: true, live: false, mock: true, testnet: true },
      },
      {
        id: "epic-business",
        name: "Business Readiness",
        description: "Business validation and go-live approval",
        status: "in_progress",
        repos_total: 24,
        repos_done: 6,
        repos_blocked: 1,
        repos_optional: 4,
        completion_pct: 25.0,
        data_availability: { historical: true, live: false, mock: true, testnet: false },
      },
    ]);
  }
  if (path.match(/^\/api\/epics\/(.+)$/)) {
    const epicId = path.split("/").pop();
    return json({
      id: epicId,
      name: epicId,
      status: "in_progress",
      repos: MOCK_SERVICES.map((s) => ({
        name: s.name,
        code_gate: "C4",
        deployment_gate: "D1",
        business_gate: "B0",
      })),
    });
  }

  // Services overview
  if (
    path === "/api/service-status/overview" ||
    path === "/api/services/overview"
  ) {
    return json({
      services: MOCK_SERVICES.map((s) => ({
        name: s.name,
        layer: s.layer,
        category: s.category,
        status: s.status,
        health: "healthy",
        lastDeployed: s.lastDeployed,
      })),
      total: MOCK_SERVICES.length,
      healthy: MOCK_SERVICES.length - 1,
      warning: 1,
      error: 0,
    });
  }

  // Config dependencies
  if (path.match(/^\/api\/config\/dependencies\/.+/)) {
    return json({
      dependencies: ["unified-trading-library", "unified-cloud-interface"],
      service: path.split("/").pop(),
    });
  }

  // Config expected-start-dates
  if (path.match(/^\/api\/config\/expected-start-dates\/.+/)) {
    return json({
      service: path.split("/").pop(),
      start_dates: {
        equity: "2020-01-02",
        crypto: "2019-01-01",
        fx: "2018-01-02",
      },
    });
  }

  // Checklists
  if (path.match(/^\/api\/checklists\/(.+)\/checklist\/validate$/)) {
    return json({ valid: true, errors: [], warnings: [] });
  }
  if (path.match(/^\/api\/checklists\/(.+)\/checklist$/)) {
    return json(MOCK_CHECKLIST);
  }
  if (path === "/api/checklists") {
    return json({
      checklists: MOCK_SERVICES.map((s) => ({
        service: s.name,
        items_total: 10,
        items_complete: 7,
        completion_pct: 70.0,
      })),
    });
  }

  // Capabilities
  if (path === "/api/capabilities") {
    return json({
      capabilities: [
        "batch_deploy",
        "live_deploy",
        "cloud_build",
        "rollback",
        "config_browse",
      ],
      version: "0.3.0",
    });
  }
  if (path.match(/^\/api\/capabilities\/service-categories\/.+/)) {
    return json({
      categories: ["data", "ingestion", "features", "ml"],
      service: path.split("/").pop(),
    });
  }

  // Deployment quota-info
  if (path === "/api/deployments/quota-info") {
    return json({
      max_concurrent: 2000,
      current_running: 0,
      available: 2000,
      estimated_cost_per_shard: 0.18,
      daily_budget: 500.0,
      daily_spent: 0,
    });
  }

  // Deployment report
  if (path.match(/^\/api\/deployments\/(.+)\/report$/)) {
    return json({
      deployment_id: path.split("/")[3],
      shards_total: 50,
      shards_completed: 50,
      shards_failed: 0,
      duration_minutes: 12,
      cost_usd: 9.0,
    });
  }

  // Deployment live-health
  if (path.match(/^\/api\/deployments\/(.+)\/live-health$/)) {
    return json({
      deployment_id: path.split("/")[3],
      status: "healthy",
      checks: [],
    });
  }

  // Data status turbo
  if (path.startsWith("/api/data-status/turbo/cache/clear")) {
    return json({ cleared: true });
  }
  if (path.startsWith("/api/data-status/turbo")) {
    return json(MOCK_DATA_STATUS);
  }
  if (path.startsWith("/api/data-status/venue-filters")) {
    return json({
      venues: ["Binance", "OKX", "Bybit", "Coinbase"],
      categories: ["crypto", "equity", "fx"],
    });
  }
  if (path.startsWith("/api/data-status/list-files")) {
    return json({ 
      files: [
        { name: "ohlcv_2026-03-17.parquet", size: 12480000, modified: "2026-03-17T23:59:00Z" },
        { name: "ohlcv_2026-03-16.parquet", size: 12350000, modified: "2026-03-16T23:59:00Z" },
        { name: "trades_2026-03-17.parquet", size: 85600000, modified: "2026-03-17T23:59:00Z" },
      ], 
      directories: ["archive", "staging", "processed"], 
      error: null 
    });
  }
  if (path.startsWith("/api/data-status/instruments")) {
    return json({
      instruments: ["BTC/USDT", "ETH/USDT", "AAPL", "MSFT"],
      error: null,
    });
  }
  if (path.startsWith("/api/data-status/instrument-availability")) {
    return json({
      overall: { total: 5, available: 5, missing: 0 },
      by_data_type: {},
      error: null,
    });
  }

  // Cloud builds history (fix path to also match /api/ prefix)
  if (path.match(/^\/api\/cloud-builds\/history\/.+/)) {
    const now = new Date();
    return json({ 
      builds: [
        {
          id: "api-build-001",
          status: "SUCCESS",
          startTime: new Date(now.getTime() - 7200000).toISOString(),
          finishTime: new Date(now.getTime() - 6900000).toISOString(),
          duration_seconds: 300,
          source: { branch: "main", commit: "xyz9876" },
        },
      ] 
    });
  }

  // Config discover/browse
  if (path.match(/^\/api\/services\/(.+)\/discover-configs$/)) {
    // Extract cloud_path from query string
    const cloudPath = url.searchParams.get("cloud_path") ?? "";
    const mockConfigs = [
      { name: "config_binance.yaml", path: `${cloudPath}config_binance.yaml`, size: 2048, modified: "2026-03-18T08:00:00Z" },
      { name: "config_coinbase.yaml", path: `${cloudPath}config_coinbase.yaml`, size: 1856, modified: "2026-03-17T12:00:00Z" },
      { name: "config_kraken.yaml", path: `${cloudPath}config_kraken.yaml`, size: 1920, modified: "2026-03-16T14:00:00Z" },
    ];
    return json({ configs: mockConfigs, total_configs: mockConfigs.length, total: mockConfigs.length });
  }
  if (path.match(/^\/api\/services\/(.+)\/list-directories$/)) {
    const mockDirs = ["cefi", "tradfi", "defi", "onchain", "2026", "archive"];
    return json({ directories: mockDirs, total: mockDirs.length });
  }
  if (path.match(/^\/api\/services\/(.+)\/config-buckets$/)) {
    const serviceName = path.match(/^\/api\/services\/(.+)\/config-buckets$/)?.[1] ?? "unknown";
    return json({
      service: serviceName,
      buckets: [
        { name: "unified-trading-configs-prod", path: "gs://unified-trading-configs-prod/" },
        { name: "unified-trading-configs-staging", path: "gs://unified-trading-configs-staging/" },
        { name: "unified-trading-configs-dev", path: "gs://unified-trading-configs-dev/" },
      ],
      default_bucket: "gs://unified-trading-configs-prod/",
      project_id: "unified-trading-prod",
    });
  }

  return json({ error: "Mock: no handler", path }, 404);
}

export function installDeploymentMockHandlers(enabled = MOCK_MODE) {
  if (!enabled) return;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (
      url.includes("/api/") ||
      url.includes("/cloud-builds/") ||
      url.includes("/service-status/")
    ) {
      return handleRoute(url, init);
    }
    return original(input, init);
  };
}
