import {
  ChevronRight,
  Database,
  Cpu,
  BarChart3,
  Zap,
  Brain,
  TrendingUp,
  Clock,
  Package,
  Layers,
  Hammer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

const serviceIcons: Record<string, React.ElementType> = {
  "instruments-service": Package,
  "corporate-actions": Clock,
  "market-tick-data-handler": Database,
  "market-data-processing-service": Cpu,
  "features-calendar-service": Clock,
  "features-delta-one-service": BarChart3,
  "features-volatility-service": TrendingUp,
  "features-onchain-service": Zap,
  "ml-training-service": Brain,
  "ml-inference-service": Brain,
  "strategy-service": TrendingUp,
  "execution-services": Zap,
  "unified-trading-deployment-v2": Hammer,
};

// Static service metadata - no API call needed!
// This makes the service list instant to render
const SERVICE_METADATA: Record<
  string,
  { description: string; dimensions: string[] }
> = {
  "instruments-service": {
    description: "Generate instrument definitions",
    dimensions: ["category", "date"],
  },
  "corporate-actions": {
    description: "Corporate actions data",
    dimensions: ["category", "date"],
  },
  "market-tick-data-handler": {
    description: "Download raw tick data",
    dimensions: ["category", "venue", "date"],
  },
  "market-data-processing-service": {
    description: "Process tick data into candles",
    dimensions: ["category", "venue", "date"],
  },
  "features-calendar-service": {
    description: "Calendar-based features",
    dimensions: ["category", "date"],
  },
  "features-delta-one-service": {
    description: "Delta-one features",
    dimensions: ["category", "feature_group", "date"],
  },
  "features-volatility-service": {
    description: "Volatility features",
    dimensions: ["category", "feature_group", "date"],
  },
  "features-onchain-service": {
    description: "On-chain features",
    dimensions: ["category", "feature_group", "date"],
  },
  "ml-training-service": {
    description: "Train ML models",
    dimensions: ["instrument", "timeframe", "target_type", "config"],
  },
  "ml-inference-service": {
    description: "Run ML inference",
    dimensions: ["instrument", "timeframe", "target_type", "config"],
  },
  "strategy-service": {
    description: "Backtest strategies",
    dimensions: ["config"],
  },
  "execution-services": {
    description: "Execution algorithms",
    dimensions: ["config"],
  },
  "unified-trading-deployment-v2": {
    description: "Deployment orchestration platform",
    dimensions: ["service"],
  },
};

// Define pipeline layers in correct execution order (from dependencies.yaml)
const PIPELINE_LAYERS = [
  {
    id: "layer1",
    title: "Layer 1: Root Services",
    description: "Generate instrument definitions and corporate actions",
    color: "#22d3ee", // cyan
    services: ["instruments-service", "corporate-actions"],
  },
  {
    id: "layer2",
    title: "Layer 2: Data Ingestion",
    description: "Download and process raw tick data",
    color: "#60a5fa", // blue
    services: ["market-tick-data-handler", "market-data-processing-service"],
  },
  {
    id: "layer3",
    title: "Layer 3: Feature Engineering",
    description: "Generate features from processed data",
    color: "#a78bfa", // purple
    services: [
      "features-calendar-service",
      "features-delta-one-service",
      "features-volatility-service",
      "features-onchain-service",
    ],
  },
  {
    id: "layer4",
    title: "Layer 4: Machine Learning",
    description: "Train and run ML models",
    color: "#fbbf24", // amber
    services: ["ml-training-service", "ml-inference-service"],
  },
  {
    id: "layer5",
    title: "Layer 5: Strategy & Execution",
    description: "Backtest strategies and execution algorithms",
    color: "#4ade80", // green
    services: ["strategy-service", "execution-services"],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    description: "Deployment and orchestration tools",
    color: "#f472b6", // pink
    services: ["unified-trading-deployment-v2"],
  },
];

// Count total services
const TOTAL_SERVICES = PIPELINE_LAYERS.reduce(
  (sum, layer) => sum + layer.services.length,
  0,
);

interface ServiceListProps {
  selectedService: string | null;
  onSelectService: (service: string) => void;
}

export function ServiceList({
  selectedService,
  onSelectService,
}: ServiceListProps) {
  // No API call needed - render immediately from static data!

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--color-accent-cyan)]" />
            Pipeline Services
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {TOTAL_SERVICES} services
          </Badge>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Services ordered by execution dependency
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {PIPELINE_LAYERS.map((layer) => (
            <div key={layer.id}>
              <div
                className="px-5 py-2.5 bg-[var(--color-bg-tertiary)]"
                style={{ borderLeft: `3px solid ${layer.color}` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: layer.color }}
                  >
                    {layer.title}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {layer.description}
                </p>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {layer.services.map((serviceName) => (
                  <ServiceItem
                    key={serviceName}
                    serviceName={serviceName}
                    metadata={SERVICE_METADATA[serviceName]}
                    layerColor={layer.color}
                    isSelected={selectedService === serviceName}
                    onClick={() => onSelectService(serviceName)}
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
  metadata?: { description: string; dimensions: string[] };
  layerColor: string;
  isSelected: boolean;
  onClick: () => void;
}

function ServiceItem({
  serviceName,
  metadata,
  layerColor,
  isSelected,
  onClick,
}: ServiceItemProps) {
  const Icon = serviceIcons[serviceName] || Package;
  const dimensions = metadata?.dimensions || [];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]",
        isSelected && "bg-[var(--color-bg-hover)]",
      )}
      style={isSelected ? { borderLeft: `2px solid ${layerColor}` } : undefined}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          isSelected
            ? "bg-[var(--color-bg-tertiary)]"
            : "bg-[var(--color-bg-tertiary)]",
        )}
        style={
          isSelected
            ? { color: layerColor }
            : { color: "var(--color-text-tertiary)" }
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium font-mono truncate",
            isSelected
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          {serviceName}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] truncate">
          {dimensions.length > 0 ? dimensions.join(" × ") : "config-based"}
        </p>
      </div>
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 transition-transform",
          isSelected
            ? "text-[var(--color-text-secondary)]"
            : "text-[var(--color-text-muted)]",
        )}
        style={isSelected ? { color: layerColor } : undefined}
      />
    </button>
  );
}
