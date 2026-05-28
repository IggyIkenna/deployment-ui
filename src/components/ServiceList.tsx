import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Database,
  Globe,
  Layers,
  LineChart,
  Network,
  Package,
  Radio,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

// ── Service operation/mode registry ──────────────────────────────────────────
// Maps each service to its CLI axes: operations, runtime modes, categories.
// This is the UI's view of the CLI convention (codex/06-coding-standards/cli-convention.md).

export interface ServiceOperation {
  value: string;
  label: string;
  description?: string;
}

export interface ServiceConfig {
  description: string;
  dimensions: string[];
  operations: ServiceOperation[];
  modes: string[]; // batch | live
  operationalModes?: string[]; // live | manual | backtest | paper
  categories?: string[]; // CEFI | TRADFI | DEFI | SPORTS
}

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  // L1
  "instruments-service": {
    description: "Instrument universe & definitions",
    dimensions: ["asset_group", "date"],
    operations: [
      {
        value: "instruments",
        label: "Instruments",
        description: "Fetch & normalise instrument reference data",
      },
    ],
    modes: ["batch", "live"],
    categories: ["CEFI", "TRADFI", "DEFI"],
  },
  // L2
  "market-tick-data-service": {
    description: "Download & normalise raw tick data",
    dimensions: ["asset_group", "venue", "date"],
    operations: [
      {
        value: "download",
        label: "Download",
        description: "Download tick data from venues",
      },
      {
        value: "collect-gas-fees",
        label: "Gas Fees",
        description: "Collect EVM gas fee data",
      },
      {
        value: "collect-solana-defi",
        label: "Solana DeFi",
        description: "Collect Solana DeFi protocol data",
      },
      {
        value: "collect-evm-defi",
        label: "EVM DeFi",
        description: "Collect EVM DeFi protocol data",
      },
    ],
    modes: ["batch", "live"],
    categories: ["CEFI", "TRADFI", "DEFI", "SPORTS"],
  },
  "market-data-processing-service": {
    description: "Resample ticks into OHLCV candles",
    dimensions: ["asset_group", "venue", "date"],
    operations: [
      {
        value: "process",
        label: "Process",
        description: "Resample raw ticks into candles",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI", "DEFI"],
  },
  // L3
  "features-calendar-service": {
    description: "Calendar, seasonality & corporate actions",
    dimensions: ["asset_group", "date"],
    operations: [
      {
        value: "calendar",
        label: "Calendar",
        description: "Calendar & seasonality features",
      },
      {
        value: "corporate_actions",
        label: "Corporate Actions",
        description: "Dividends, splits, earnings",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI"],
  },
  "features-delta-one-service": {
    description: "Returns, spreads, delta-one signals",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Compute delta-one features",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI", "DEFI"],
  },
  "features-volatility-service": {
    description: "Realised & implied vol surface",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Compute volatility features",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI", "DEFI"],
  },
  "features-onchain-service": {
    description: "On-chain DeFi & network metrics",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Compute on-chain features",
      },
    ],
    modes: ["batch"],
    categories: ["DEFI"],
  },
  "features-sports-service": {
    description: "Sports market event features",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Compute sports features",
      },
    ],
    modes: ["batch"],
    categories: ["SPORTS"],
  },
  "features-multi-timeframe-service": {
    description: "Cross-timeframe feature aggregation",
    dimensions: ["asset_group", "timeframe", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Aggregate across timeframes",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI", "DEFI"],
  },
  "features-cross-instrument-service": {
    description: "Cross-asset correlation features",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [
      {
        value: "compute",
        label: "Compute",
        description: "Cross-instrument correlations",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI"],
  },
  "features-commodity-service": {
    description: "Commodity-specific features",
    dimensions: ["asset_group", "feature_group", "date"],
    operations: [{ value: "compute", label: "Compute", description: "Commodity features" }],
    modes: ["batch"],
    categories: ["TRADFI"],
  },
  // L4
  "ml-training-service": {
    description: "Train & evaluate ML models",
    dimensions: ["instrument", "timeframe", "target_type", "config"],
    operations: [
      { value: "train", label: "Train", description: "Train ML models" },
      {
        value: "evaluate",
        label: "Evaluate",
        description: "Evaluate model performance",
      },
    ],
    modes: ["batch"],
    categories: ["CEFI", "TRADFI", "DEFI", "SPORTS"],
  },
  "ml-inference-service": {
    description: "Batch & live model inference",
    dimensions: ["instrument", "timeframe", "target_type", "config"],
    operations: [
      {
        value: "infer",
        label: "Inference",
        description: "Run model predictions",
      },
    ],
    modes: ["batch", "live"],
    categories: ["CEFI", "TRADFI", "DEFI", "SPORTS"],
  },
  // L5
  "strategy-service": {
    description: "Strategy, risk, position & P&L",
    dimensions: ["config"],
    operations: [
      {
        value: "backtest",
        label: "Backtest",
        description: "Historical strategy replay",
      },
      {
        value: "trade",
        label: "Trade",
        description: "Live/paper trading signals",
      },
      {
        value: "risk-monitor",
        label: "Risk Monitor",
        description: "Real-time risk & position monitoring",
      },
      {
        value: "position-recon",
        label: "Position Recon",
        description: "Position reconciliation",
      },
      {
        value: "pnl-attribution",
        label: "P&L Attribution",
        description: "P&L attribution & reporting",
      },
    ],
    modes: ["batch", "live"],
    operationalModes: ["live", "paper", "backtest"],
  },
  "execution-service": {
    description: "Order execution & algos",
    dimensions: ["config"],
    operations: [
      {
        value: "live_execution",
        label: "Live Execution",
        description: "Execute orders on venues",
      },
      {
        value: "backtest",
        label: "Backtest",
        description: "Backtest execution strategies",
      },
    ],
    modes: ["batch", "live"],
    operationalModes: ["live", "manual", "paper", "backtest"],
  },
  "trading-agent-service": {
    description: "Autonomous trading agents",
    dimensions: ["config"],
    operations: [{ value: "run", label: "Run", description: "Run trading agents" }],
    modes: ["live"],
    operationalModes: ["live", "paper"],
  },
  // L6
  "alerting-service": {
    description: "Alerts, circuit breakers & notifications",
    dimensions: ["config"],
    operations: [
      {
        value: "monitor",
        label: "Monitor",
        description: "Real-time alert monitoring",
      },
      {
        value: "replay",
        label: "Replay",
        description: "Historical alert replay",
      },
    ],
    modes: ["batch", "live"],
  },
  // Infrastructure
  "ibkr-gateway-infra": {
    description: "Interactive Brokers TWS gateway",
    dimensions: ["config"],
    operations: [{ value: "start", label: "Start", description: "Start IBKR gateway" }],
    modes: ["live"],
  },
  "deployment-service": {
    description: "Deployment orchestration & sharding",
    dimensions: ["service"],
    operations: [{ value: "deploy", label: "Deploy", description: "Deploy services" }],
    modes: ["batch"],
  },
  "odum-research-website": {
    description: "Corporate website",
    dimensions: ["environment"],
    operations: [{ value: "build", label: "Build", description: "Build & deploy website" }],
    modes: ["batch"],
  },
  "deployment-api": {
    description: "Deployment orchestration & treasury",
    dimensions: ["service"],
    operations: [{ value: "deploy", label: "Deploy", description: "Deploy services" }],
    modes: ["batch", "live"],
  },
  "client-reporting-api": {
    description: "Client NAV, PnL & reporting",
    dimensions: ["client_id"],
    operations: [{ value: "report", label: "Report", description: "Generate client reports" }],
    modes: ["batch", "live"],
  },
};

const serviceIcons: Record<string, React.ElementType> = {
  "instruments-service": Package,
  "market-tick-data-service": Database,
  "market-data-processing-service": Cpu,
  "features-calendar-service": Clock,
  "features-delta-one-service": BarChart3,
  "features-volatility-service": TrendingUp,
  "features-onchain-service": Coins,
  "features-sports-service": Activity,
  "features-multi-timeframe-service": LineChart,
  "features-cross-instrument-service": Network,
  "features-commodity-service": Globe,
  "ml-training-service": Brain,
  "ml-inference-service": Brain,
  "strategy-service": TrendingUp,
  "execution-service": Zap,
  "trading-agent-service": Bot,
  "alerting-service": Radio,
  "ibkr-gateway-infra": Network,
  "deployment-service": Layers,
  "odum-research-website": Globe,
};

const PIPELINE_LAYERS = [
  {
    id: "layer1",
    title: "L1: Root",
    description: "Instrument universe",
    color: "var(--color-accent-cyan)",
    services: ["instruments-service"],
  },
  {
    id: "layer2",
    title: "L2: Data",
    description: "Tick data ingestion",
    color: "var(--color-accent-blue)",
    services: ["market-tick-data-service", "market-data-processing-service"],
  },
  {
    id: "layer3",
    title: "L3: Features",
    description: "Feature engineering",
    color: "var(--color-accent-purple)",
    services: [
      "features-calendar-service",
      "features-delta-one-service",
      "features-volatility-service",
      "features-onchain-service",
      "features-sports-service",
      "features-multi-timeframe-service",
      "features-cross-instrument-service",
      "features-commodity-service",
    ],
  },
  {
    id: "layer4",
    title: "L4: ML",
    description: "Model training & inference",
    color: "var(--color-accent-amber)",
    services: ["ml-training-service", "ml-inference-service"],
  },
  {
    id: "layer5",
    title: "L5: Execution",
    description: "Strategy, execution, agents",
    color: "var(--color-accent-green)",
    services: ["strategy-service", "execution-service", "trading-agent-service"],
  },
  {
    id: "layer6",
    title: "L6: Risk",
    description: "Risk, P&L, alerts",
    color: "var(--color-accent-red)",
    services: ["alerting-service"],
  },
  {
    id: "infrastructure",
    title: "Infra",
    description: "Deployment & connectivity",
    color: "var(--color-accent-pink)",
    services: ["ibkr-gateway-infra", "deployment-service"],
  },
  {
    id: "apis",
    title: "APIs",
    description: "Platform APIs",
    color: "var(--color-accent-amber)",
    services: ["deployment-api", "client-reporting-api"],
  },
  {
    id: "website",
    title: "Website",
    description: "Odum Research",
    color: "var(--color-accent-teal)",
    services: ["odum-research-website"],
  },
];

const TOTAL_SERVICES = PIPELINE_LAYERS.reduce((sum, layer) => sum + layer.services.length, 0);

// ── Selection type: service + optional operation ────────────────────────────
export interface ServiceSelection {
  service: string;
  operation?: string;
}

interface ServiceListProps {
  selectedService: string | null;
  onSelectService: (service: string, operation?: string) => void;
}

export function ServiceList({ selectedService, onSelectService }: ServiceListProps) {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const handleServiceClick = (serviceName: string) => {
    const config = SERVICE_REGISTRY[serviceName];
    if (config && config.operations.length > 1) {
      // Toggle expand — don't select yet
      setExpandedService(expandedService === serviceName ? null : serviceName);
      // Also select the service (default operation)
      onSelectService(serviceName, config.operations[0].value);
    } else {
      // Single operation — select directly
      setExpandedService(null);
      onSelectService(serviceName, config?.operations[0]?.value);
    }
  };

  const handleOperationClick = (serviceName: string, operation: string) => {
    onSelectService(serviceName, operation);
  };

  return (
    <Card className="overflow-hidden sticky top-4 max-h-[calc(100vh-6rem)] flex flex-col">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            Services
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">
            {TOTAL_SERVICES}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-y-auto flex-1">
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {PIPELINE_LAYERS.map((layer) => (
            <div key={layer.id}>
              <div
                className="px-3 py-1 bg-[var(--color-bg-tertiary)]"
                style={{ borderLeft: `3px solid ${layer.color}` }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: layer.color }}>
                  {layer.title}
                </span>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {layer.services.map((serviceName) => (
                  <ServiceItem
                    key={serviceName}
                    serviceName={serviceName}
                    config={SERVICE_REGISTRY[serviceName]}
                    layerColor={layer.color}
                    isSelected={selectedService === serviceName}
                    isExpanded={expandedService === serviceName}
                    onClick={() => handleServiceClick(serviceName)}
                    onOperationClick={(op) => handleOperationClick(serviceName, op)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ServiceItemProps {
  serviceName: string;
  config?: ServiceConfig;
  layerColor: string;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onOperationClick: (operation: string) => void;
}

function ServiceItem({
  serviceName,
  config,
  layerColor,
  isSelected,
  isExpanded,
  onClick,
  onOperationClick,
}: ServiceItemProps) {
  const Icon = serviceIcons[serviceName] || Package;
  const hasMultiOps = (config?.operations.length ?? 0) > 1;
  const modes = config?.modes ?? [];
  const opModes = config?.operationalModes ?? [];

  return (
    <div>
      <Button
        variant="ghost"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-hover)] h-auto rounded-none",
          isSelected && "bg-[var(--color-bg-hover)]",
        )}
        style={isSelected ? { borderLeft: `2px solid ${layerColor}` } : undefined}
      >
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-bg-tertiary)]"
          style={isSelected ? { color: layerColor } : { color: "var(--color-text-tertiary)" }}
        >
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium font-mono truncate leading-tight",
              isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
            )}
          >
            {serviceName.replace("-service", "").replace(/-/g, " ")}
          </p>
          {/* Mode badges */}
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {modes.map((m) => (
              <span
                key={m}
                className="text-[9px] font-mono px-1 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
              >
                {m}
              </span>
            ))}
            {opModes.map((m) => (
              <span
                key={m}
                className="text-[9px] font-mono px-1 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-accent-amber)]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        {hasMultiOps ? (
          isExpanded ? (
            <ChevronDown
              className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]"
              style={isSelected ? { color: layerColor } : undefined}
            />
          ) : (
            <ChevronRight
              className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]"
              style={isSelected ? { color: layerColor } : undefined}
            />
          )
        ) : (
          <ChevronRight
            className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]"
            style={isSelected ? { color: layerColor } : undefined}
          />
        )}
      </Button>

      {/* Expanded operations */}
      {isExpanded && hasMultiOps && config && (
        <div className="bg-[var(--color-bg-primary)] border-l-2 border-[var(--color-border-subtle)] ml-5">
          {config.operations.map((op) => (
            <button
              key={op.value}
              onClick={() => onOperationClick(op.value)}
              className="w-full text-left px-3 py-1 hover:bg-[var(--color-bg-hover)] transition-colors flex items-center gap-2"
            >
              <span className="w-1 h-1 rounded-full bg-[var(--color-text-muted)]" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate">{op.label}</p>
                {op.description && (
                  <p className="text-[9px] text-[var(--color-text-muted)] truncate">{op.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
