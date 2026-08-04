import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Table2,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CoverageScope,
  DataTypeCheckResponse,
  InstrumentSearchMatch,
  TurboAssetGroupStatus,
  TurboDataStatusResponse,
  TurboLeagueStatus,
  TurboSubDimension,
  VenueCheckResponse,
} from "../api/client";
import * as api from "../api/client";
import {
  UPSTREAM_CHECK_SERVICES,
  buildFixturesCsvDownloadUrl,
  buildShardDownloadUrl,
  searchInstruments,
} from "../api/client";
import {
  getAssetGroupBreakdown,
  isHierarchicalDrilldownRedundant,
  isPredictionCqgAxis,
  showsFixturesOnlyDrillNote,
  showsGlobalReferenceAffordance,
} from "../lib/data-status-helpers";
import { cn, formatEventDrivenCoverageLabel, formatRatePerDay, isRateMetricRow } from "../lib/utils";
import type {
  AssetGroupVenuesResponse,
  AssetGroupStatus as CategoryStatus,
  CreateDeploymentResponse,
  DataStatusResponse,
} from "../types";
import { BreakdownsAccordion } from "./BreakdownsAccordion";
import { BucketCountsBadge, SchemaModal, type ShardCoordinate } from "./DataStatusDrilldown";
import { ExecutionDataStatus } from "./ExecutionDataStatus";
import { FailurePillarStack } from "./FailurePillarStack";
import { FeatureFamilyBreakdown, groupFeatureGroupsByFamily } from "./FeatureFamilyBreakdown";
import { FixtureBreakdown } from "./FixtureBreakdown";
import { FixturesBrowser } from "./FixturesBrowser";
import { HeatmapCalendar } from "./HeatmapCalendar";
import { HierarchicalShardDrilldown } from "./HierarchicalShardDrilldown";
import { NeedsAttention } from "./NeedsAttention";
import type { NeedsAttentionItem } from "../lib/needs-attention";
import { deriveNeedsAttention } from "../lib/needs-attention";
import { LeafSchemaModal, type LeafSchemaModalCoord } from "./LeafSchemaModal";
import { PoolBreakdownModal } from "./PoolBreakdownModal";
import { ShardDetailModal, type ShardDetailCoordInput } from "./ShardDetailModal";
import { TypedReasonBadges } from "./TypedReasonBadges";
import { AxisValueCensus } from "./AxisValueCensus";
import { DistinctValuesPanel } from "./DistinctValuesPanel";
import { CatalogueExplorer } from "./CatalogueExplorer";
import { HonestCoverageCard } from "./HonestCoverageCard";
import { PipelineTraceCard } from "./PipelineTraceCard";
import { SportsFeatureCoverageCard } from "./SportsFeatureCoverageCard";
import { NewListingsCard, UpcomingExpiriesCard } from "./LifecycleCards";
import { LiveFreshnessPanel } from "./LiveFreshnessPanel";
import { PredictionCatalogueCard } from "./PredictionCatalogue";
import { UpcomingFixtures } from "./UpcomingFixtures";
import { VenueDetailPanel } from "./VenueDetailPanel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

interface DataStatusTabProps {
  serviceName: string;
  deploymentResult?: CreateDeploymentResponse | null;
  isDeploying?: boolean;
  onDeployMissing?: (params: {
    service: string;
    start_date: string;
    end_date: string;
    region?: string; // GCP region (default: backend GCS_REGION)
    asset_groups?: string[];
    venues?: string[]; // Filter deployment to specific venues
    folders?: string[]; // Filter by folder/instrument type (spot, perpetuals, etc.)
    data_types?: string[]; // Filter by data type (trades, book_snapshot_5, etc.)
    force?: boolean;
    dry_run?: boolean;
    skip_existing?: boolean;
    exclude_dates?: Record<string, string[] | Record<string, string[]>>; // Dates with existing data: asset_group-level or venue-level
    date_granularity?: "daily" | "weekly" | "monthly" | "none"; // Date batching granularity
    deploy_missing_only?: boolean; // Use backend to calculate missing shards (more accurate)
    first_day_of_month_only?: boolean; // Only deploy first day of each month (TARDIS free tier)
    previewRefreshOnly?: boolean; // When true: refresh preview in-place without closing modal or switching tabs
    mode?: "batch" | "live"; // batch vs live GCS paths
  }) => void;
}

/** Today at 08:00 local, formatted for datetime-local input. */
function getTodayAt8am(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T08:00:00`;
}

// Full-history start — API-Football fixtures (and the UAC-declared universe more
// broadly) go back to 2018-01-01. Still reachable via the "All" start-date preset
// below; it is no longer the silent DEFAULT (see DEFAULT_LOOKBACK_DAYS).
const FULL_HISTORY_START_DATE = "2018-01-01";

// Default initial range — a bounded recent window, not full history. A full-history
// (2018→now) scan is the heaviest thing the manifest builder runs: fine in prod
// (parallel process pool + a <500ms rollup fast-path when a fresh rollup blob
// exists), but on a macOS dev host the pool can't fork (BrokenProcessPool →
// thread-pool fallback) AND beta mode always takes the on-demand compute path (no
// rollup) — and even in prod it's needless latency for the common case. Operator
// decision (deployment_ui_ux_caching_walkthrough, 2026-07-14, superseding the prior
// 2026-06-14 2018-01-01-default instruction): default to the last 90 days; full
// history remains one click away via the "All" start-date preset.
const DEFAULT_LOOKBACK_DAYS = 90;

/** `DEFAULT_LOOKBACK_DAYS` days back from today, YYYY-MM-DD. */
function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS);
  return d.toISOString().split("T")[0];
}

// b4: Services whose manifest correctness is tracked in Data Status.
// Services NOT in this list (execution, risk, pnl, alerting…) are runtime
// services — their health belongs in Monitor → Live / Experiments, not here.
const DATA_PIPELINE_SERVICES = new Set([
  "instruments-service",
  "market-tick-data-service",
  "market-data-processing-service",
  "features-cefi-service",
  "features-defi-service",
  "features-tradfi-service",
  "features-sports-service",
  "features-prediction-service",
]);

// Sub-dimension label mapping — keyed by the response key from manifest_reader
const SUB_DIMENSION_LABELS: Record<string, string> = {
  venues: "Venues",
  data_types: "Data Types",
  feature_groups: "Feature Groups",
  timeframes: "Timeframes",
  strategies: "Strategies",
  models: "Models",
  modes: "Modes",
  domains: "Domains",
  clients: "Clients",
  alert_types: "Alert Types",
};

// Response keys that carry sub-dimension data (order matters for fallback chain)
const SUB_DIMENSION_KEYS = Object.keys(SUB_DIMENSION_LABELS);

/** Extract sub-dimension data from a category result, regardless of which key it's under. */
function getSubDimensionData(catData: TurboAssetGroupStatus): {
  data: Record<string, TurboSubDimension> | null;
  key: string | null;
  label: string;
} {
  // Honour the `breakdown_axis` discriminator emitted by deployment-api's
  // aggregator. SPORTS uses `data_type` axis; CEFI / TRADFI / DEFI use
  // `venue` axis; PREDICTION post-v9 uses `canonical_question_group` axis
  // (drilldown also lives under `data_types`, keyed by cqg group name).
  // Consumers MUST branch on this when the drilldown lives under either key
  // — both are present on the response, but only one is populated.
  if (catData.breakdown_axis === "data_type" || catData.breakdown_axis === "canonical_question_group") {
    const dt = catData.data_types;
    if (dt && typeof dt === "object") {
      const label =
        catData.breakdown_axis === "canonical_question_group"
          ? "Question Groups"
          : (SUB_DIMENSION_LABELS["data_types"] ?? "data_types");
      return {
        data: dt as Record<string, TurboSubDimension>,
        key: "data_types",
        label,
      };
    }
  }
  if (catData.breakdown_axis === "venue") {
    const v = catData.venues;
    if (v && typeof v === "object") {
      return {
        data: v as Record<string, TurboSubDimension>,
        key: "venues",
        label: SUB_DIMENSION_LABELS["venues"] || "venues",
      };
    }
  }
  // Legacy fallback: scan the known sub-dimension keys and pick the first
  // populated one. Skip empty {} so a vestigial `venues: {}` (e.g. on a
  // SPORTS response where breakdown_axis wasn't emitted) doesn't mask the
  // real drilldown that lives further down the list.
  for (const key of SUB_DIMENSION_KEYS) {
    const subDimension = catData[key as keyof TurboAssetGroupStatus];
    if (
      subDimension &&
      typeof subDimension === "object" &&
      Object.keys(subDimension as Record<string, unknown>).length > 0
    ) {
      return {
        data: subDimension as Record<string, TurboSubDimension>,
        key,
        label: SUB_DIMENSION_LABELS[key] || key,
      };
    }
  }
  return { data: null, key: null, label: "" };
}

/**
 * Names from the venue-axis sub-dimension that no `chains` group already
 * covers. A mixed category (e.g. CEFI: 2 on-chain CLOB venues out of 24)
 * has both a `chains` breakdown AND venues no chain covers — those must
 * still render somewhere. A fully-on-chain category (e.g. DeFi, where
 * ~every venue has a chain) returns [] here, which is what keeps its
 * existing chains-only card unchanged.
 */
export function getUncoveredVenueNames(catData: TurboAssetGroupStatus): string[] {
  const chainCoveredVenues = new Set<string>();
  for (const chain of Object.values(catData.chains ?? {})) {
    for (const v of chain.venues) chainCoveredVenues.add(v);
  }
  const allVenues = Object.keys(getSubDimensionData(catData).data || {});
  return allVenues.filter((name) => !chainCoveredVenues.has(name));
}

// Venue pill list with search and capped display
function VenuePillList({ venues }: { venues: Record<string, number> }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(venues);
  const filtered = search ? entries.filter(([v]) => v.toLowerCase().includes(search.toLowerCase())) : entries;
  const MAX_VISIBLE = 8;
  const visible = expanded ? filtered : filtered.slice(0, MAX_VISIBLE);
  const hiddenCount = filtered.length - visible.length;

  return (
    <div className="space-y-1">
      {entries.length > MAX_VISIBLE && (
        <input
          type="text"
          name="venue-search"
          aria-label="Search venues"
          placeholder="Search venues..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setExpanded(false);
          }}
          className="w-full px-2 py-1 rounded text-[10px] bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
      )}
      <div className="flex flex-wrap gap-1">
        {visible.map(([venue, count]) => (
          <span
            key={venue}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
          >
            {venue} <strong>{count.toLocaleString()}</strong>
          </span>
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--color-bg-tertiary)] text-[var(--color-accent-cyan)] hover:underline cursor-pointer border-none"
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Lazy-mounting wrapper for the hierarchical shard-atom drill-down.
 *
 * A native ``<details>`` collapses its children VISUALLY (CSS) but React
 * still MOUNTS them, so ``HierarchicalShardDrilldown``'s fetch-on-mount
 * effect fired for EVERY asset_group on page load even while collapsed —
 * 5 concurrent full-index reads that OOM-killed the 4 GiB deployment-api
 * container (503 storm on /drilldown + /api/health flap → "Backend
 * unreachable"). Gate the mount on the ``open`` state so the expensive
 * drilldown request only fires when the operator actually expands that
 * asset_group's panel.
 */
export function LazyDrilldownDetails({
  service,
  assetGroup,
  startDate,
  endDate,
  className = "mt-3",
  summaryLabel = "Hierarchical drill-down (shard atom)",
  summaryClassName = "text-[10px] text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)]",
  onOpenLeafSchema,
}: {
  service: string;
  assetGroup: string;
  startDate: string;
  endDate: string;
  className?: string;
  summaryLabel?: string;
  summaryClassName?: string;
  onOpenLeafSchema?: (coord: LeafSchemaModalCoord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className={className} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={summaryClassName}>{summaryLabel}</summary>
      <div className="mt-2">
        {open ? (
          <HierarchicalShardDrilldown
            service={service}
            assetGroup={assetGroup}
            startDate={startDate}
            endDate={endDate}
            initialDepth={1}
            onOpenLeafSchema={onOpenLeafSchema}
          />
        ) : null}
      </div>
    </details>
  );
}

const DATE_PAGE_SIZE = 60;

export function DateList({
  dates,
  onClickDate,
  btnClassName,
  testIdPrefix,
  downloadUrl,
  downloadTitle,
}: {
  dates: string[];
  onClickDate: (date: string) => void;
  btnClassName: string;
  testIdPrefix: string;
  downloadUrl?: (date: string) => string;
  downloadTitle?: (date: string) => string;
}) {
  const [limit, setLimit] = useState(DATE_PAGE_SIZE);
  const visible = dates.slice(0, limit);
  // Visible-count options for the size selector. "All" maps to the full
  // length so a single selection can render every date (replacing the slow
  // fixed +60-at-a-time stepping). We only surface options that are smaller
  // than the total plus the always-available "All".
  const PAGE_SIZE_OPTIONS = [50, 100, 200, 1000, 2000];
  return (
    <>
      {visible.map((date) => (
        <span key={date} className="inline-flex items-center gap-0.5">
          <button
            type="button"
            className={btnClassName}
            title={`Show shard details for ${date}`}
            data-testid={`${testIdPrefix}-${date}`}
            onClick={() => onClickDate(date)}
          >
            {date}
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl(date)}
              className="inline-flex items-center justify-center px-1 py-0.5 rounded border border-[var(--color-accent-cyan)] text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)] hover:text-[var(--color-bg-primary)] focus:outline-none"
              title={downloadTitle ? downloadTitle(date) : `Download CSV for ${date}`}
              download
              onClick={(e) => e.stopPropagation()}
              data-testid={`${testIdPrefix}-${date}-download`}
            >
              <Download className="h-3 w-3" />
            </a>
          )}
        </span>
      ))}
      {dates.length > DATE_PAGE_SIZE && (
        <select
          className="text-[7px] font-mono px-1 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus:outline-none"
          title="Number of dates to show"
          aria-label="Number of dates to show"
          data-testid={`${testIdPrefix}-page-size`}
          value={limit >= dates.length ? "all" : String(limit)}
          onChange={(e) => {
            const v = e.target.value;
            setLimit(v === "all" ? dates.length : Number(v));
          }}
        >
          {PAGE_SIZE_OPTIONS.filter((n) => n < dates.length).map((n) => (
            <option key={n} value={String(n)}>
              Show {n}
            </option>
          ))}
          <option value="all">All ({dates.length})</option>
        </select>
      )}
    </>
  );
}

// Internal component for non-execution-services
function DataStatusTabInternal({ serviceName, deploymentResult, isDeploying, onDeployMissing }: DataStatusTabProps) {
  // Default startDate = a bounded recent window (see DEFAULT_LOOKBACK_DAYS above),
  // NOT full history — full history is an explicit user action (the "All" preset).
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dataStatusMode, setDataStatusMode] = useState<"batch" | "live">("batch");

  // Data status view mode toggle (batch/scheduled-today/live) - separate from table/calendar display mode
  const [dataStatusViewMode, setDataStatusViewMode] = useState<"batch" | "scheduled-today" | "live">("batch");

  // NOTE: Removed debounced dates - no longer auto-fetching on date change
  // Users must click "Check Status" button to fetch data

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([]);
  // Coverage-scope denominator filter (could_exist / mvp / all) — mirrors
  // VenueCoverageTable's toggle. Defaults to "could_exist" so this page's
  // headline numbers are byte-for-byte unchanged until an operator opts in.
  const [scope, setScope] = useState<CoverageScope>("could_exist");
  const [availableVenues, setAvailableVenues] = useState<string[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([
    "CEFI",
    "DEFI",
    "TRADFI",
    "SPORTS",
    "PREDICTION",
  ]); // Default to all
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Venue-specific available filters (from venue_data_types.yaml)
  const [venueAvailableFolders, setVenueAvailableFolders] = useState<string[]>([]);
  const [venueAvailableDataTypes, setVenueAvailableDataTypes] = useState<string[]>([]);
  const [venueFiltersLoading, setVenueFiltersLoading] = useState(false);

  // File listing state
  const [fileListingData, setFileListingData] = useState<api.ListFilesResponse | null>(null);
  const [fileListingLoading, setFileListingLoading] = useState(false);
  const [fileListingError, setFileListingError] = useState<string | null>(null);
  const [showFileListing, setShowFileListing] = useState(false);

  // Timeframe selection for market-data-processing-service file listing
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("1m");
  const availableTimeframes = ["15s", "1m", "5m", "15m", "1h", "4h", "24h"];
  const [data, setData] = useState<DataStatusResponse | null>(null);
  const [turboData, setTurboData] = useState<TurboDataStatusResponse | null>(null);
  const [venueCheckData, setVenueCheckData] = useState<VenueCheckResponse | null>(null);
  const [dataTypeCheckData, setDataTypeCheckData] = useState<DataTypeCheckResponse | null>(null);

  // Venue detail drill-down state.
  //
  // - ``venueDetailKey`` toggles visibility of the inline panel.  Shape:
  //   "<CATEGORY>:<VENUE>".  For DeFi the "venue" is either a chain name
  //   (``ETHEREUM``) or a composite protocol-chain (``AAVE_V3-ETHEREUM``).
  // - ``venueDetailData`` holds the response.  We accept either the CeFi v1
  //   shape (``VenueDetailResult``) or the v2 shape (``VenueDetailV2Response``)
  //   returned by the DeFi-aware ``/api/data-status/venue-detail`` endpoint.
  const [venueDetailKey, setVenueDetailKey] = useState<string | null>(null);
  const [venueDetailData, setVenueDetailData] = useState<api.VenueDetailResult | api.VenueDetailV2Response | null>(
    null,
  );
  const [venueDetailLoading, setVenueDetailLoading] = useState(false);

  // Schema drill-down modal. (The sibling per-day instrument-browse modal,
  // `instrumentsModal`, was removed 2026-07-17 — genuinely dead since commit
  // f4a8e4e (2026-04-24) rerouted its only opener to ShardDetailModal without
  // cleaning up the state; ShardDetailModal now nests InstrumentsModal itself
  // for "grouped" shards, restoring reachability. See P6 UI evidence.)
  const [schemaModal, setSchemaModal] = useState<Omit<ShardCoordinate, "day"> | null>(null);
  // DEFI per-pool drill-down modal — backed by /api/data-status/pools/breakdown.
  const [poolBreakdownModal, setPoolBreakdownModal] = useState<{
    venue: string;
    chain: string;
    day: string;
  } | null>(null);
  // Unified shard-detail modal (4 tabs: schema / sample / payload / download)
  const [shardDetailCoord, setShardDetailCoord] = useState<ShardDetailCoordInput | null>(null);
  const openShardDetail = useCallback((c: ShardDetailCoordInput) => {
    setShardDetailCoord(c);
  }, []);

  // Writegate Phase 4.B.3 — leaf-stats schema modal. Triggered by clicking a
  // typed-reason badge on a venue summary line; the badge passes the
  // representative leaf coord (venue + most-recent captured day + first
  // data_type + AUTO instrument_type — the deployment-api leaf-stats route
  // resolves the leaf parquet via _gcs_path_for_shard).
  const [leafSchemaCoord, setLeafSchemaCoord] = useState<LeafSchemaModalCoord | null>(null);

  // SPORTS fixture-level breakdown — toggled per (league, day, readOnly) key.
  // readOnly flag disables per-fixture download buttons for red (missing) dates.
  const [fixtureBreakdownKey, setFixtureBreakdownKey] = useState<{
    day: string;
    league_id: string;
    readOnly: boolean;
  } | null>(null);
  const toggleFixtureBreakdown = (day: string, league_id: string, readOnly: boolean) => {
    setFixtureBreakdownKey((prev) =>
      prev && prev.day === day && prev.league_id === league_id && prev.readOnly === readOnly
        ? null
        : { day, league_id, readOnly },
    );
  };

  const handleVenueClick = async (category: string, venue: string) => {
    const key = `${category}:${venue}`;
    if (venueDetailKey === key) {
      setVenueDetailKey(null); // toggle off
      return;
    }
    setVenueDetailKey(key);
    setVenueDetailLoading(true);
    setVenueDetailData(null);
    try {
      // DeFi uses the v2 endpoint that returns chain-level protocols or
      // composite-level pools.  CeFi / SPORTS / TRADFI / PREDICTION keep the
      // legacy v1 shape (instrument_types + top_instruments) for now.
      const result =
        category === "DEFI"
          ? await api.fetchVenueDetailV2({
              service: serviceName,
              asset_group: category,
              venue,
            })
          : await api.fetchVenueDetail(serviceName, category, venue);
      setVenueDetailData(result);
    } catch {
      setVenueDetailData(null);
    } finally {
      setVenueDetailLoading(false);
    }
  };

  // Check venues disabled - turbo mode handles venue breakdown automatically
  const checkVenues = false; // Removed toggle, turbo mode always gives venue breakdown
  // Check data types disabled - turbo mode shows data_types by default in breakdown
  const checkDataTypes = false;

  // Use manifest mode (fastest — reads parquet index) for services with ManifestWriter
  const useManifestMode = api.MANIFEST_MODE_SERVICES.includes(serviceName) && !checkVenues && !checkDataTypes;
  // Fallback to turbo mode (blob listing) for services without manifests
  const useTurboMode =
    !useManifestMode && api.TURBO_MODE_SERVICES.includes(serviceName) && !checkVenues && !checkDataTypes;
  const turboSubDimension = api.TURBO_SUB_DIMENSION_SERVICES[serviceName];
  const [loading, setLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Deploy Missing modal state
  const [deployMissingModalOpen, setDeployMissingModalOpen] = useState(false);
  const [deployMissingForce, setDeployMissingForce] = useState(true);
  const [deployMissingDryRun, setDeployMissingDryRun] = useState(true); // Default to preview mode
  const [deployMissingDateGranularity, setDeployMissingDateGranularity] = useState<
    "daily" | "weekly" | "monthly" | "none"
  >("daily");
  const [deployMissingRegion, setDeployMissingRegion] = useState<string>("asia-northeast1");

  // Region validation (backend GCS_REGION for cross-region egress warning)
  const [backendRegion, setBackendRegion] = useState<string>("asia-northeast1");
  const [showDeployMissingRegionWarning, setShowDeployMissingRegionWarning] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/config/region")
      .then((r) => r.json())
      .then((data) => {
        const region = data.storage_region ?? data.gcs_region ?? "asia-northeast1";
        setBackendRegion(region);
        setDeployMissingRegion(region);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setShowDeployMissingRegionWarning(deployMissingRegion !== backendRegion);
  }, [deployMissingRegion, backendRegion]);

  // Auto-fetch coverage summary on mount (fast — reads manifest parquets only)
  useEffect(() => {
    if (!api.MANIFEST_MODE_SERVICES.includes(serviceName)) return;
    const controller = new AbortController();
    setCoverageSummaryLoading(true);
    api
      .getDataCoverageSummary({
        service: serviceName,
        signal: controller.signal,
      })
      .then((result) => setCoverageSummary(result))
      .catch(() => setCoverageSummary(null))
      .finally(() => setCoverageSummaryLoading(false));
    return () => controller.abort();
  }, [serviceName]);

  // Phase 3 — auto-fetch per-(service, asset_group) shard/display/primary
  // axis SSOT alongside coverage-summary. The two fetches are independent
  // and run in parallel.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getShardAxisMatrix(serviceName, controller.signal)
      .then((result) => setShardAxisMatrix(result))
      .catch(() => setShardAxisMatrix(null));
    return () => controller.abort();
  }, [serviceName]);

  // First day of month filter - useful for TARDIS free tier (no API key needed)
  const [firstDayOfMonthOnly, setFirstDayOfMonthOnly] = useState(false);

  // Phase C (honest-coverage): "Show only failures" — scopes the category
  // breakdown to rows with failure_rate > 0 (attempted_failed manifest rows).
  // Persisted in localStorage so the toggle survives page reloads.
  const [showOnlyFailures, setShowOnlyFailures] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("deployment-ui/show-only-failures") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("deployment-ui/show-only-failures", showOnlyFailures ? "1" : "0");
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [showOnlyFailures]);

  // Freshness mode - only count data as "found" if updated on/after this date
  const [requireFreshness, setRequireFreshness] = useState(false);
  const [freshnessDate, setFreshnessDate] = useState("");

  // Instrument search state
  const [instrumentSearchMode, setInstrumentSearchMode] = useState(false);
  const [instrumentSearchQuery, setInstrumentSearchQuery] = useState("");
  const [instrumentSearchResults, setInstrumentSearchResults] = useState<api.InstrumentSearchResult[]>([]);
  const [instrumentSearchLoading, setInstrumentSearchLoading] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<api.InstrumentSearchResult | null>(null);
  const [instrumentAvailability, setInstrumentAvailability] = useState<api.InstrumentAvailabilityResponse | null>(null);
  const [instrumentAvailabilityLoading, setInstrumentAvailabilityLoading] = useState(false);
  const [instrumentAvailabilityError, setInstrumentAvailabilityError] = useState<string | null>(null);
  const [showInstrumentDropdown, setShowInstrumentDropdown] = useState(false);

  // Cross-category canonical-symbol search (Gap 3 of cross-category audit).
  // Distinct from the per-category dropdown above — this hits
  // ``/api/data-status/instruments/search`` directly and returns canonical
  // IDs across all 5 categories (cefi/tradfi/defi/sports/prediction).
  const [symbolSearchQuery, setSymbolSearchQuery] = useState("");
  const [symbolSearchResults, setSymbolSearchResults] = useState<InstrumentSearchMatch[]>([]);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const [symbolSearchTruncated, setSymbolSearchTruncated] = useState(false);
  const symbolSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request sequence — guards against a stale (slower, earlier-fired)
  // search response overwriting a newer one's results if they resolve out of
  // network-latency order (debounce alone only prevents overlapping TIMERS,
  // not overlapping in-flight fetches).
  const symbolSearchSeqRef = useRef(0);

  // Symbol-search click-through (2026-07-21). Deliberately its OWN state,
  // not the pre-existing `selectedInstrument`/`instrumentAvailability` pair
  // the manual "Instrument-Level Search" dropdown drives: that pair is wiped
  // by an effect keyed on `[instrumentSearchMode, selectedCategories]`
  // (see below) whenever either changes for an UNRELATED reason (e.g. the
  // operator toggling a category filter elsewhere on the page while a
  // symbol-search result panel is open) — reusing it would make the
  // click-through panel disappear out from under the operator. It also
  // renders regardless of `serviceName`/`selectedCategories`, since that
  // reused block is additionally gated to `selectedCategories.length === 1`
  // on MTDS/MDPS only, which would make the click-through invisible on every
  // other service tab. This new state never touches `selectedCategories` or
  // `turboData`, so it can never affect the macro drilldown below it.
  const [symbolSearchSelectedInstrument, setSymbolSearchSelectedInstrument] =
    useState<api.InstrumentSearchResult | null>(null);
  const [symbolSearchInstrumentAvailability, setSymbolSearchInstrumentAvailability] =
    useState<api.InstrumentAvailabilityResponse | null>(null);
  const [symbolSearchInstrumentLoading, setSymbolSearchInstrumentLoading] = useState(false);
  const [symbolSearchInstrumentError, setSymbolSearchInstrumentError] = useState<string | null>(null);

  // Symbol-search click-through — SPORTS branch. `league_id` is the clicked
  // match's bare canonical_id (sports rows use the bare league_id, never the
  // VENUE:TYPE:SYMBOL composite non-sports rows use). Independent state for
  // the same coupling reasons as above.
  const [symbolSearchLeague, setSymbolSearchLeague] = useState<string | null>(null);
  const [symbolSearchLeagueStatus, setSymbolSearchLeagueStatus] = useState<TurboAssetGroupStatus | null>(null);
  const [symbolSearchLeagueLoading, setSymbolSearchLeagueLoading] = useState(false);
  const [symbolSearchLeagueError, setSymbolSearchLeagueError] = useState<string | null>(null);
  // Day picked from that league's found-dates list — drives an inline
  // `<FixtureBreakdown>` (the existing per-fixture drilldown), composed
  // rather than duplicated.
  const [symbolSearchLeagueDay, setSymbolSearchLeagueDay] = useState<string | null>(null);

  // Coverage summary state — auto-fetched on mount for instruments-service
  const [coverageSummary, setCoverageSummary] = useState<api.CoverageSummaryResponse | null>(null);
  const [coverageSummaryLoading, setCoverageSummaryLoading] = useState(false);

  // Per-(service, asset_group) shard / display / primary axis SSOT — Phase 3
  // of data_status_multi_axis_shard_propagation_2026_05_06.plan. Drives
  // the per-asset-group BreakdownsAccordion + downstream secondary-axis
  // selectors (DEFI chain, sports league_id, strategy job_id, etc.). On
  // fetch failure or empty payload the accordion silently no-ops — the
  // venue-pill list above stays intact, so a Phase 0/2 deploy lag
  // (deployment-api older image, axis-matrix endpoint missing) doesn't
  // break the existing UI surface.
  const [shardAxisMatrix, setShardAxisMatrix] = useState<api.ShardAxisMatrixResponse | null>(null);

  // Manifest secondary-axis filter — set when the operator clicks a value
  // in the per-asset-group BreakdownsAccordion (DEFI chain, sports league,
  // strategy job_id, …). Drives a re-fetch of /api/data-status/manifest
  // with `?secondary_axis={axis}&{axis}={value}` so the cell grid scopes
  // to that filter. Cleared via the "Clear filter" button in the active-
  // filter banner. Phase 3 of data_status_multi_axis_shard_propagation.
  const [manifestFilter, setManifestFilter] = useState<{
    axis: string;
    value: string;
  } | null>(null);

  // Venue toggle removed - turbo mode handles venue breakdown automatically
  // instruments-service uses sub_dimension: "venue" which gives venue breakdown in turbo mode
  const supportsVenueCheck = false;
  // Removed: data type toggle no longer needed - turbo mode shows data_types by default
  const supportsDataTypeCheck = false;

  // Track request ID to prevent race conditions (stale responses overwriting fresh data)
  const requestIdRef = useRef(0);
  // AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // "Needs Attention" triage panel (top of the Data Status surface) — ranks
  // failures/gaps/stale captures across every asset_group already loaded in
  // `turboData`. Pure derivation lives in lib/needs-attention.ts; this just
  // memoizes it and wires row-clicks to the existing "filter to category"
  // affordance + scrolls the Data Coverage card into view.
  const needsAttentionItems = useMemo(() => deriveNeedsAttention(turboData), [turboData]);
  const dataCoverageCardRef = useRef<HTMLDivElement>(null);
  const handleNeedsAttentionSelect = useCallback((item: NeedsAttentionItem) => {
    setSelectedCategories([item.assetGroup]);
    // Scrolling `dataCoverageCardRef` right here races the re-render the
    // `setSelectedCategories` state update schedules — content above the
    // card can grow/shrink as the category filter takes effect, moving the
    // card AGAIN after this scroll lands (measured flake: the card was
    // back out of viewport by the time an assertion checked). Defer past
    // two animation frames so the scroll runs against the POST-update,
    // painted layout instead of the stale pre-update one. "auto" (instant),
    // not "smooth" — no need to animate a jump that's already deferred.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dataCoverageCardRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    });
  }, []);

  // Cancel any pending query
  const cancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setError(null);
  }, []);

  // Fetch data - accepts dates as parameters to avoid stale closure issues
  const fetchData = useCallback(
    async (fetchStart: string, fetchEnd: string) => {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Increment request ID - only the latest request should update state
      const thisRequestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      // Clear old data immediately when starting new fetch
      setData(null);
      setTurboData(null);
      setVenueCheckData(null);
      setDataTypeCheckData(null);

      try {
        if (checkVenues && supportsVenueCheck) {
          // Venue check mode - returns different response shape
          const result = (await api.getDataStatus({
            service: serviceName,
            start_date: fetchStart,
            end_date: fetchEnd,
            asset_group: selectedCategories.length > 0 ? selectedCategories : undefined,
            check_venues: true,
            force_refresh: false, // Use cache for speed
          })) as VenueCheckResponse;

          // Skip if a newer request has started
          if (thisRequestId !== requestIdRef.current) return;

          // CRITICAL: Validate response matches request
          if (result.start_date !== fetchStart || result.end_date !== fetchEnd) {
            setError(
              `Backend returned wrong dates! Requested ${fetchStart}-${fetchEnd}, got ${result.start_date}-${result.end_date}`,
            );
            return;
          }

          setVenueCheckData(result);
        } else if (checkDataTypes && supportsDataTypeCheck) {
          // Data type check mode - returns per-data-type breakdown
          const result = (await api.getDataStatus({
            service: serviceName,
            start_date: fetchStart,
            end_date: fetchEnd,
            asset_group: selectedCategories.length > 0 ? selectedCategories : ["TRADFI"], // Default to TRADFI for data type check
            check_data_types: true,
            force_refresh: false, // Use cache for speed
          })) as DataTypeCheckResponse;

          // Skip if a newer request has started
          if (thisRequestId !== requestIdRef.current) return;
          setDataTypeCheckData(result);
        } else if (useManifestMode) {
          // MANIFEST MODE: Reads consolidated parquet index (fastest path)
          // Works with both GCS and S3 (cloud-agnostic).
          //
          // Secondary-axis filter: when the operator selects a value in the
          // per-asset-group BreakdownsAccordion, `manifestFilter` is set
          // and we thread (a) `secondary_axis={axis}` to ask the API to
          // include that column in the response, and (b) the per-axis
          // filter param (chain / league_id / fixture_id /
          // canonical_question_group / job_id) so the response is scoped.
          // Filter cleared via the active-filter banner.
          const filterAxis = manifestFilter?.axis;
          const filterValue = manifestFilter?.value;
          const result = await api.getDataStatusManifest({
            service: serviceName,
            start_date: fetchStart,
            end_date: fetchEnd,
            asset_group: selectedCategories.length > 0 ? selectedCategories : undefined,
            secondary_axis: filterAxis,
            chain: filterAxis === "chain" ? filterValue : undefined,
            league_id: filterAxis === "league_id" ? filterValue : undefined,
            fixture_id: filterAxis === "fixture_id" ? filterValue : undefined,
            canonical_question_group: filterAxis === "canonical_question_group" ? filterValue : undefined,
            job_id: filterAxis === "job_id" ? filterValue : undefined,
            scope,
            signal: abortController.signal,
          });

          // Skip if a newer request has started
          if (thisRequestId !== requestIdRef.current) return;
          setTurboData(result); // Same shape as turbo response
        } else if (useTurboMode) {
          // TURBO MODE: Uses month-prefix queries (5s instead of 60s+)
          const includeSubDims = !!turboSubDimension;
          // Enable upstream availability check for dependent services
          // This ensures "missing" only counts dates where upstream data exists
          const checkUpstream = UPSTREAM_CHECK_SERVICES.includes(serviceName);
          const venueFilter = selectedVenues.length > 0 ? selectedVenues : undefined;
          const folderFilter = selectedFolders.length > 0 ? selectedFolders : undefined;
          const dataTypeFilter = selectedDataTypes.length > 0 ? selectedDataTypes : undefined;
          const result = await api.getDataStatusTurbo({
            service: serviceName,
            start_date: fetchStart,
            end_date: fetchEnd,
            mode: dataStatusMode,
            asset_group: selectedCategories.length > 0 ? selectedCategories : undefined,
            venue: venueFilter, // Filter by venue to reduce GCS scan scope
            folder: folderFilter, // Filter by folder/instrument type
            data_type: dataTypeFilter, // Filter by data type
            include_sub_dimensions: includeSubDims,
            include_dates_list: true, // Include dates for deploy missing filtering
            full_dates_list: true, // Get complete lists (cached anyway, no extra cost)
            check_upstream_availability: checkUpstream, // Check upstream data for dependent services
            first_day_of_month_only: firstDayOfMonthOnly, // Only check first day of each month (TARDIS free tier)
            freshness_date:
              requireFreshness && freshnessDate
                ? `${freshnessDate.replace(" ", "T")}Z`.slice(0, 20) // Force UTC interpretation (append Z, no local timezone conversion)
                : undefined,
            scope,
            signal: abortController.signal, // Allow cancellation
          });

          // Skip if a newer request has started
          if (thisRequestId !== requestIdRef.current) return;

          // Validate response matches requested dates (detect stale data/bugs)
          if (result.date_range.start !== fetchStart || result.date_range.end !== fetchEnd) {
            setError(
              `Date mismatch: requested ${fetchStart} to ${fetchEnd}, but received ${result.date_range.start} to ${result.date_range.end}. This may indicate a bug - please report this.`,
            );
            return;
          }

          setTurboData(result);
        } else {
          // Standard mode
          const result = (await api.getDataStatus({
            service: serviceName,
            start_date: fetchStart,
            end_date: fetchEnd,
            asset_group: selectedCategories.length > 0 ? selectedCategories : undefined,
            force_refresh: false, // Use cache (5-min TTL) for speed
          })) as DataStatusResponse;

          // Skip if a newer request has started
          if (thisRequestId !== requestIdRef.current) return;

          // Validate response matches requested dates (detect cache issues)
          if (result.start_date !== fetchStart || result.end_date !== fetchEnd) {
            // Date mismatch - use data anyway but could indicate cache issues
          }

          setData(result);
        }
      } catch (err) {
        // Only set error if this is still the latest request
        if (thisRequestId === requestIdRef.current) {
          // Don't show error for cancelled requests
          if (err instanceof Error && (err.name === "AbortError" || err.message === "Request was cancelled")) {
            return;
          }
          setError(err instanceof Error ? err.message : "Failed to fetch data status");
        }
      } finally {
        // Only clear loading if this is still the latest request
        if (thisRequestId === requestIdRef.current) {
          setLoading(false);
        }
        // Clear abort controller reference when done
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [
      serviceName,
      selectedCategories,
      selectedVenues,
      selectedFolders,
      selectedDataTypes,
      checkVenues,
      supportsVenueCheck,
      checkDataTypes,
      supportsDataTypeCheck,
      useManifestMode,
      useTurboMode,
      turboSubDimension,
      firstDayOfMonthOnly,
      requireFreshness,
      freshnessDate,
      dataStatusMode,
      manifestFilter,
      scope,
    ],
  );

  // Re-fetch the manifest when the secondary-axis filter changes. We
  // don't want to wait for the next user-driven date change — clicking a
  // chain pill should produce an immediate scoped result. Only fires in
  // manifest mode (manifest is the only mode that consumes the filter).
  useEffect(() => {
    if (!useManifestMode) return;
    if (!startDate || !endDate) return;
    void fetchData(startDate, endDate);
    // We deliberately depend on the filter object identity — fetchData
    // already closes over manifestFilter via its useCallback deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestFilter]);

  // Re-fetch when the venue / folder / data-type selection changes. These
  // filters are threaded into the request (turbo mode `venue`/`folder`/
  // `data_type` params — see fetchData above) but the request itself only
  // fires from the manifest-mode effect, the cache-clear, and the manual
  // "Check Status" button. Without this trigger, toggling a venue chip
  // updates `selectedVenues` state but never re-narrows the scan, so the
  // selection appears to do nothing. We guard it so it only fires AFTER the
  // first manual load (data/turboData already populated) and never while a
  // request is in flight — mirrors the manifest-mode effect above.
  useEffect(() => {
    // Only re-fetch once the operator has already loaded results once.
    if (!data && !turboData) return;
    if (loading) return;
    if (!startDate || !endDate) return;
    void fetchData(startDate, endDate);
    // We depend on the selection arrays; fetchData closes over them via its
    // useCallback deps. data/turboData/loading are read as a fire-guard only
    // (we don't want to re-fetch when those identities change), so they are
    // intentionally excluded from the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenues, selectedFolders, selectedDataTypes, scope]);

  // Clear data status cache only (doesn't affect deployment state cache)
  const handleClearDataStatusCache = useCallback(async () => {
    setClearingCache(true);
    try {
      await api.clearDataStatusCache();
      // Re-fetch with fresh data
      await fetchData(startDate, endDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear cache");
    } finally {
      setClearingCache(false);
    }
  }, [startDate, endDate, fetchData]);

  // Fetch file listing for fully specified path
  const fetchFileListing = useCallback(async () => {
    if (
      selectedCategories.length !== 1 ||
      selectedVenues.length !== 1 ||
      selectedFolders.length !== 1 ||
      selectedDataTypes.length !== 1
    ) {
      setFileListingError("Please select exactly one category, venue, folder, and data type");
      return;
    }

    setFileListingLoading(true);
    setFileListingError(null);
    setShowFileListing(true);

    try {
      const result = await api.listFiles({
        service: serviceName,
        asset_group: selectedCategories[0],
        venue: selectedVenues[0],
        folder: selectedFolders[0],
        data_type: selectedDataTypes[0],
        start_date: startDate,
        end_date: endDate,
        // Include timeframe for market-data-processing-service
        timeframe: serviceName === "market-data-processing-service" ? selectedTimeframe : undefined,
      });

      if (result.error) {
        setFileListingError(result.error);
        setFileListingData(null);
      } else {
        setFileListingData(result);
      }
    } catch (err) {
      setFileListingError(err instanceof Error ? err.message : "Failed to fetch file listing");
      setFileListingData(null);
    } finally {
      setFileListingLoading(false);
    }
  }, [
    serviceName,
    selectedCategories,
    selectedVenues,
    selectedFolders,
    selectedDataTypes,
    startDate,
    endDate,
    selectedTimeframe,
  ]);

  // Instrument search - debounced search as user types
  const searchInstrumentsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request sequence — same stale-response guard as symbolSearchSeqRef above.
  const instrumentSearchSeqRef = useRef(0);
  const fetchInstruments = useCallback(
    async (searchQuery: string) => {
      if (selectedCategories.length !== 1) {
        setInstrumentSearchResults([]);
        return;
      }

      // Clear previous timer
      if (searchInstrumentsDebounceRef.current) {
        clearTimeout(searchInstrumentsDebounceRef.current);
      }

      // Debounce the search
      searchInstrumentsDebounceRef.current = setTimeout(async () => {
        const mySeq = ++instrumentSearchSeqRef.current;
        setInstrumentSearchLoading(true);
        try {
          const result = await api.getInstrumentsList({
            asset_group: selectedCategories[0],
            search: searchQuery || undefined,
            limit: 50, // Show top 50 matches
          });
          if (mySeq !== instrumentSearchSeqRef.current) return; // stale response, discard
          if (result.error) {
            setInstrumentSearchResults([]);
          } else {
            setInstrumentSearchResults(result.instruments);
            // Only show dropdown if no instrument is currently selected
            // (prevents dropdown from reopening after selection)
            if (!selectedInstrument) {
              setShowInstrumentDropdown(result.instruments.length > 0);
            }
          }
        } catch {
          if (mySeq !== instrumentSearchSeqRef.current) return;
          setInstrumentSearchResults([]);
        } finally {
          if (mySeq === instrumentSearchSeqRef.current) setInstrumentSearchLoading(false);
        }
      }, 300); // 300ms debounce
    },
    [selectedCategories, selectedInstrument],
  );

  // Cross-category canonical-symbol search (institutional Gap 3).
  // Debounced 250ms — queries shorter than 2 chars return early to avoid
  // hammering GCS during initial keystrokes.
  const runSymbolSearch = useCallback((query: string) => {
    if (symbolSearchDebounceRef.current) {
      clearTimeout(symbolSearchDebounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSymbolSearchResults([]);
      setSymbolSearchTruncated(false);
      setSymbolSearchLoading(false);
      return;
    }
    symbolSearchDebounceRef.current = setTimeout(async () => {
      const mySeq = ++symbolSearchSeqRef.current;
      setSymbolSearchLoading(true);
      try {
        const result = await searchInstruments({ query: trimmed, limit: 50 });
        // A newer search has since started — this response is stale, discard it.
        if (mySeq !== symbolSearchSeqRef.current) return;
        setSymbolSearchResults(result.matches);
        setSymbolSearchTruncated(result.truncated);
      } catch {
        if (mySeq !== symbolSearchSeqRef.current) return;
        setSymbolSearchResults([]);
        setSymbolSearchTruncated(false);
      } finally {
        if (mySeq === symbolSearchSeqRef.current) setSymbolSearchLoading(false);
      }
    }, 250);
  }, []);

  // Symbol-search click-through — non-SPORTS branch (cefi/tradfi/defi/prediction).
  // Deliberately a plain (non-`useCallback`) async function: it reads
  // `startDate`/`endDate`/`serviceName` fresh from the render closure it was
  // created in rather than from a memoized, potentially-stale one — the
  // existing `fetchInstrumentAvailability` above is a `useCallback` gated on
  // `selectedInstrument` state, so calling it back-to-back with the
  // `setSelectedInstrument` that's supposed to feed it would silently no-op
  // (state updates are async; the callback would still see the old value).
  // This handler builds the request directly from the clicked match instead.
  const handleSymbolSearchInstrumentClick = async (match: InstrumentSearchMatch) => {
    // Toggle off if the same instrument is clicked again.
    if (symbolSearchSelectedInstrument?.instrument_key === match.canonical_id) {
      setSymbolSearchSelectedInstrument(null);
      setSymbolSearchInstrumentAvailability(null);
      setSymbolSearchInstrumentError(null);
      return;
    }
    // Also collapse any open SPORTS panel — only one click-through result is
    // shown at a time directly under the search box.
    setSymbolSearchLeague(null);
    setSymbolSearchLeagueStatus(null);
    setSymbolSearchLeagueError(null);
    setSymbolSearchLeagueDay(null);

    // `canonical_id` here is `InstrumentSearchMatch.canonical_id` — a
    // single-colon `VENUE:TYPE:SYMBOL` composite (e.g.
    // "BINANCE-FUTURES:PERPETUAL:BTC-USDT"), confirmed against the producer
    // code and unit-test fixtures in deployment-api's data_query_service.py.
    // This is a COMPLETELY DIFFERENT id format from the `::`-delimited
    // `instrument_key` the separate "Instrument-Level Search" dropdown box
    // uses (that one's own Bug-B fix splits on "::" — reusing that logic
    // here would silently send a malformed/overly-composite string to the
    // availability endpoint). The backend's `instrument` param is a plain
    // string EQUALITY match against the manifest's `instrument_id` column
    // (not a colon-split there either) — so the bare symbol must be
    // extracted client-side. Since `venue`/`instrument_type` are already
    // separate fields on the same match, the robust extraction is to strip
    // the match's own `venue:instrument_type:` prefix verbatim; fall back to
    // positionally dropping the first two colon-delimited segments only if
    // that prefix doesn't match (defensive against casing/format drift).
    // Legacy, not-yet-canonicalized instrument_key values (zero colons — UAC's
    // own canonical_id parser documents this shape as still-live, pending
    // removal) fall through both the prefix-strip and the positional-split
    // branches to an EMPTY string; sending that as `instrument` would
    // silently render a misleading "0 found / 0 missing" instead of a real
    // check. Guard: fewer than 3 colon-segments means there's no
    // venue:type:symbol structure to extract at all, so use canonical_id
    // itself as the bare symbol.
    const colonSegments = match.canonical_id.split(":");
    const prefix = `${match.venue}:${match.instrument_type}:`;
    const bareSymbol =
      colonSegments.length < 3
        ? match.canonical_id
        : match.canonical_id.startsWith(prefix)
          ? match.canonical_id.slice(prefix.length)
          : colonSegments.slice(2).join(":");

    const constructed: api.InstrumentSearchResult = {
      instrument_key: match.canonical_id,
      venue: match.venue,
      instrument_type: match.instrument_type,
      symbol: bareSymbol,
    };
    setSymbolSearchSelectedInstrument(constructed);
    setSymbolSearchInstrumentAvailability(null);
    setSymbolSearchInstrumentError(null);
    setSymbolSearchInstrumentLoading(true);
    try {
      const result = await api.getInstrumentAvailability({
        instrument_key: constructed.instrument_key,
        venue: constructed.venue,
        instrument_type: constructed.instrument_type,
        instrument: bareSymbol,
        asset_group: match.asset_group,
        start_date: startDate,
        end_date: endDate,
        service: serviceName,
      });
      if (result.error) {
        setSymbolSearchInstrumentError(result.error);
        setSymbolSearchInstrumentAvailability(null);
      } else {
        setSymbolSearchInstrumentAvailability(result);
      }
    } catch (err) {
      setSymbolSearchInstrumentError(err instanceof Error ? err.message : "Failed to check availability");
      setSymbolSearchInstrumentAvailability(null);
    } finally {
      setSymbolSearchInstrumentLoading(false);
    }
  };

  // Symbol-search click-through — SPORTS branch. Fetches this league's
  // found/missing dates over the page's current start/end date range via
  // the already-built `/data-status/manifest?secondary_axis=league_id`
  // contract — a lightweight, independent call (NOT the page-wide
  // `turboData`/`manifestFilter` path the macro drilldown owns), so it can
  // never replace or cancel that view. Per MTDS semantics, SPORTS' sole
  // primary data_type ("trades", labeled "Odds" in the drilldown schema) IS
  // this found/missing list — no separate odds fetch is needed here.
  const handleSymbolSearchLeagueClick = async (match: InstrumentSearchMatch) => {
    const league_id = match.canonical_id;
    // Toggle off if the same league is clicked again.
    if (symbolSearchLeague === league_id) {
      setSymbolSearchLeague(null);
      setSymbolSearchLeagueStatus(null);
      setSymbolSearchLeagueError(null);
      setSymbolSearchLeagueDay(null);
      return;
    }
    // Also collapse any open non-SPORTS instrument panel.
    setSymbolSearchSelectedInstrument(null);
    setSymbolSearchInstrumentAvailability(null);
    setSymbolSearchInstrumentError(null);

    setSymbolSearchLeague(league_id);
    setSymbolSearchLeagueDay(null);
    setSymbolSearchLeagueStatus(null);
    setSymbolSearchLeagueError(null);
    setSymbolSearchLeagueLoading(true);
    try {
      const resp = await api.getDataStatusManifest({
        service: serviceName,
        start_date: startDate,
        end_date: endDate,
        asset_group: ["SPORTS"],
        secondary_axis: "league_id",
        league_id,
      });
      setSymbolSearchLeagueStatus(resp.asset_groups?.SPORTS ?? null);
    } catch (err) {
      setSymbolSearchLeagueError(err instanceof Error ? err.message : "Failed to load league availability");
    } finally {
      setSymbolSearchLeagueLoading(false);
    }
  };

  // Fetch instrument availability when an instrument is selected
  const fetchInstrumentAvailability = useCallback(async () => {
    if (!selectedInstrument) return;

    setInstrumentAvailabilityLoading(true);
    setInstrumentAvailabilityError(null);

    try {
      // The backend keys on venue/instrument_type/instrument (never instrument_key,
      // which it doesn't accept — Bug B). Derive the bare symbol from `symbol` when
      // present, falling back to the trailing segment of instrument_key (its
      // observed "VENUE::SYMBOL"-style format) since not every source populates it.
      const bareInstrument =
        selectedInstrument.symbol ||
        selectedInstrument.instrument_key.split("::").pop() ||
        selectedInstrument.instrument_key;
      const result = await api.getInstrumentAvailability({
        instrument_key: selectedInstrument.instrument_key,
        venue: selectedInstrument.venue,
        instrument_type: selectedInstrument.instrument_type,
        instrument: bareInstrument,
        asset_group: selectedCategories[0] ?? "",
        start_date: startDate,
        end_date: endDate,
        data_type: selectedDataTypes.length === 1 ? selectedDataTypes[0] : undefined,
        first_day_of_month_only: firstDayOfMonthOnly,
        service: serviceName,
        timeframe: serviceName === "market-data-processing-service" ? selectedTimeframe : undefined,
        // Pass instrument availability window from definition
        available_from: selectedInstrument.available_from_datetime || undefined,
        available_to: selectedInstrument.available_to_datetime || undefined,
      });

      if (result.error) {
        setInstrumentAvailabilityError(result.error);
        setInstrumentAvailability(null);
      } else {
        setInstrumentAvailability(result);
      }
    } catch (err) {
      setInstrumentAvailabilityError(err instanceof Error ? err.message : "Failed to check availability");
      setInstrumentAvailability(null);
    } finally {
      setInstrumentAvailabilityLoading(false);
    }
  }, [
    selectedInstrument,
    selectedCategories,
    startDate,
    endDate,
    selectedDataTypes,
    firstDayOfMonthOnly,
    serviceName,
    selectedTimeframe,
  ]);

  // Clear instrument search state when mode changes or category changes
  useEffect(() => {
    if (!instrumentSearchMode) {
      setInstrumentSearchQuery("");
      setInstrumentSearchResults([]);
      setSelectedInstrument(null);
      setInstrumentAvailability(null);
      setInstrumentAvailabilityError(null);
    }
  }, [instrumentSearchMode, selectedCategories]);

  // NOTE: Removed auto-fetch on mount for faster startup
  // The turbo endpoint can take 30+ seconds depending on GCS load
  // Users must click "Check Status" to load data
  // This provides a much faster initial page load experience

  // Fetch available categories for this service from sharding config
  useEffect(() => {
    setCategoriesLoading(true);
    api
      .getServiceAssetGroups(serviceName)
      .then((response) => {
        if (response.asset_groups && response.asset_groups.length > 0) {
          setAvailableCategories(response.asset_groups);
          // Clear selected categories that are no longer available
          setSelectedCategories((prev) => prev.filter((cat) => response.asset_groups.includes(cat)));
        } else {
          // Service has no category dimension (e.g., features-calendar-service)
          // Default to all categories for backward compatibility
          setAvailableCategories(["CEFI", "DEFI", "TRADFI", "SPORTS", "PREDICTION"]);
        }
      })
      .catch(() => {
        // On error, default to all categories
        setAvailableCategories(["CEFI", "DEFI", "TRADFI", "SPORTS", "PREDICTION"]);
      })
      .finally(() => {
        setCategoriesLoading(false);
      });
  }, [serviceName]);

  // Clear data when switching services
  useEffect(() => {
    setData(null);
    setTurboData(null);
    setVenueCheckData(null);
    setDataTypeCheckData(null);
    setError(null);
    setSelectedCategories([]);
    setSelectedVenues([]);
    setAvailableVenues([]);
    // Clear venue-specific filters
    setSelectedFolders([]);
    setSelectedDataTypes([]);
    setVenueAvailableFolders([]);
    setVenueAvailableDataTypes([]);
  }, [serviceName]);

  // Fetch available venues when category changes
  useEffect(() => {
    // Clear venues when category changes
    setSelectedVenues([]);
    setAvailableVenues([]);
    // Also clear venue-specific filters
    setSelectedFolders([]);
    setSelectedDataTypes([]);
    setVenueAvailableFolders([]);
    setVenueAvailableDataTypes([]);

    // Only fetch if exactly one category is selected (venues are hierarchical)
    if (selectedCategories.length !== 1) {
      return;
    }

    const category = selectedCategories[0];
    setVenuesLoading(true);

    api
      .getVenuesByAssetGroup(category)
      .then((response: AssetGroupVenuesResponse) => {
        setAvailableVenues(response.venues || []);
      })
      .catch(() => {
        setAvailableVenues([]);
      })
      .finally(() => {
        setVenuesLoading(false);
      });
  }, [selectedCategories]);

  // Fetch venue-specific filters when exactly one venue is selected
  useEffect(() => {
    // Clear venue-specific filters when venue selection changes
    setSelectedFolders([]);
    setSelectedDataTypes([]);
    setVenueAvailableFolders([]);
    setVenueAvailableDataTypes([]);

    // Only fetch if exactly one venue and one category is selected
    if (selectedVenues.length !== 1 || selectedCategories.length !== 1) {
      return;
    }

    const category = selectedCategories[0];
    const venue = selectedVenues[0];
    setVenueFiltersLoading(true);

    api
      .getVenueFilters(category, venue)
      .then((response) => {
        setVenueAvailableFolders(response.folders || []);
        setVenueAvailableDataTypes(response.data_types || []);
      })
      .catch(() => {
        setVenueAvailableFolders([]);
        setVenueAvailableDataTypes([]);
      })
      .finally(() => {
        setVenueFiltersLoading(false);
      });
  }, [selectedVenues, selectedCategories]);

  // Toggle venue expansion for data type view
  const toggleVenue = (venueKey: string) => {
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      if (next.has(venueKey)) {
        next.delete(venueKey);
      } else {
        next.add(venueKey);
      }
      return next;
    });
  };

  const toggleDate = (dateKey: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const getCompletionColor = (percent: number) => {
    if (percent >= 99) return "var(--color-accent-green)";
    if (percent >= 95) return "var(--color-accent-amber)";
    return "var(--color-accent-red)";
  };

  /** Format completion %. Shows 1 decimal when 99–99.99% to avoid false 100%. */
  const formatPct = (pct: number): string => {
    if (pct >= 100) return "100";
    if (pct >= 99) return pct.toFixed(1);
    return pct.toFixed(0);
  };

  /**
   * Human-readable label for honest-coverage `unit` strings emitted by
   * deployment-api. Maps the canonical v5 vocabulary (see
   * `data_status_service.py` `SPORTS_ENTITY_META` + MTDS `_*_shards` builders)
   * plus the legacy `"fixtures"` emitter. Unknown units fall back to `shards`.
   */
  const formatUnitLabel = (unit: string | undefined): string => {
    switch (unit) {
      case "fixture_dates":
      case "bookmaker_fixture_dates":
      case "fixtures":
        return "fixture-days";
      case "daily_snapshots":
      case "shard_days":
      case "shard_days_legacy":
        return "days";
      case "cadence_refreshes":
        return "refreshes";
      case "season_snapshots":
        return "seasons";
      case "shard_instrument_days":
        return "instrument-days";
      default:
        return "shards";
    }
  };

  /** Neutral color for rate-metric rows — signals "not a coverage %". */
  const getRateMetricColor = (): string => "var(--color-text-muted)";

  const getCompletionBadgeClass = (percent: number) => {
    if (percent >= 100)
      return "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]";
    if (percent >= 80)
      return "bg-[var(--color-status-running-bg)] text-[var(--color-accent-cyan)] border-[var(--color-status-running-border)]";
    if (percent >= 50)
      return "bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border-[var(--color-status-warning-border)]";
    return "bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)]";
  };

  const getCategoryCompletion = (catData: CategoryStatus) => {
    let complete = 0;
    let total = 0;
    Object.values(catData.venues).forEach((v) => {
      complete += v.complete;
      total += v.total;
    });
    return total > 0 ? (complete / total) * 100 : 0;
  };

  const getMissingCount = (catData: CategoryStatus) => {
    let missing = 0;
    Object.values(catData.venues).forEach((v) => {
      missing += v.total - v.complete;
    });
    return missing;
  };

  // Calculate total missing from either turbo data or standard data
  // For turbo mode, use total_missing which is venue-weighted (consistent with overall_completion_pct)
  const totalMissing = useMemo(() => {
    if (turboData) {
      // Derive missing from completion_pct — total_missing may be absent from API response
      if (turboData.total_missing != null && turboData.total_missing > 0) {
        return turboData.total_missing;
      }
      // Fallback: if overall_completion_pct < 100, there IS missing data
      if ((turboData.overall_completion_pct ?? 0) < 99.99) {
        return Math.max(1, (turboData.overall_dates_expected ?? 0) - (turboData.overall_dates_found ?? 0));
      }
      return 0;
    }
    if (data) {
      return Object.values(data.asset_groups).reduce((sum, cat) => sum + getMissingCount(cat), 0);
    }
    return 0;
  }, [data, turboData]);

  // Get categories with missing data for deploy missing
  // IMPORTANT: Check both category-level AND venue-level missing data
  const categoriesWithMissing = useMemo(() => {
    if (turboData && turboData.asset_groups) {
      return Object.entries(turboData.asset_groups)
        .filter(([_, catData]) => {
          // Check category-level missing
          if ((catData.dates_missing || 0) > 0) return true;

          // Check if there are entirely missing venues (expected but no data at all)
          // These are in venue_summary.expected_but_missing, NOT in catData.venues
          const expectedButMissing = catData.venue_summary?.expected_but_missing || [];
          if (expectedButMissing.length > 0) return true;

          // Also check if any sub-dimension rows within this category have
          // missing data. Sub-dimension may live under `venues` (legacy) or
          // `data_types` (SPORTS, via `breakdown_axis: "data_type"`).
          // Use dimension-weighted values when available for accurate detection.
          const breakdown = getAssetGroupBreakdown(catData);
          if (breakdown) {
            for (const [_, subData] of Object.entries(breakdown)) {
              const subExpected =
                subData._dim_weighted_expected ?? subData.dates_expected_venue ?? subData.dates_expected ?? 0;
              const subFound = subData._dim_weighted_found ?? subData.dates_found ?? 0;
              if (subFound < subExpected) return true;
            }
          }

          return false;
        })
        .map(([cat]) => cat);
    }
    if (data) {
      return Object.entries(data.asset_groups)
        .filter(([_, catData]) => getMissingCount(catData) > 0)
        .map(([cat]) => cat);
    }
    return [];
  }, [data, turboData]);

  // Open the deploy missing modal
  const handleOpenDeployMissingModal = () => {
    if (!onDeployMissing || totalMissing === 0) return;
    setDeployMissingModalOpen(true);
  };

  // NOTE: existingDatesPerCategory removed - we now use deploy_missing_only=true
  // which lets the backend calculate missing shards with full (non-truncated) date lists
  // This fixes the bug where truncated dates_found_list caused incorrect shard counts

  // Get the effective categories for deploy missing
  // IMPORTANT: Respect user's filter selection - only deploy for categories they selected
  const effectiveDeployCategories = useMemo(() => {
    // If user selected specific categories, use those (intersected with categories that have missing data)
    if (selectedCategories.length > 0) {
      return selectedCategories.filter((cat) => categoriesWithMissing.includes(cat));
    }
    // Otherwise use all categories with missing data
    return categoriesWithMissing;
  }, [selectedCategories, categoriesWithMissing]);

  // Execute deploy missing with selected options
  // When previewRefreshOnly is true: refresh preview in-place without closing modal or switching tabs
  const handleConfirmDeployMissing = useCallback(
    (previewRefreshOnly = false) => {
      if (!onDeployMissing) return;

      // IMPORTANT: If no categories have missing data, don't deploy
      // This prevents accidentally deploying all categories when user's filter has no missing data
      if (effectiveDeployCategories.length === 0) {
        if (!previewRefreshOnly) setDeployMissingModalOpen(false);
        return;
      }

      // Use deploy_missing_only=true for accurate missing data calculation
      // The backend will fetch full date lists (not truncated) and filter properly
      // This fixes the bug where exclude_dates was built from truncated UI data
      onDeployMissing({
        service: serviceName,
        start_date: startDate,
        end_date: endDate,
        mode: dataStatusMode,
        region: deployMissingRegion,
        asset_groups: effectiveDeployCategories, // ALWAYS pass explicit asset groups, never undefined
        venues: selectedVenues.length > 0 ? selectedVenues : undefined, // Pass venue filter if selected
        folders: selectedFolders.length > 0 ? selectedFolders : undefined, // Pass folder/instrument type filter
        data_types: selectedDataTypes.length > 0 ? selectedDataTypes : undefined, // Pass data type filter
        force: deployMissingForce,
        dry_run: deployMissingDryRun,
        skip_existing: true, // Always skip existing for deploy missing
        deploy_missing_only: true, // Use backend for accurate missing shard calculation
        date_granularity: deployMissingDateGranularity,
        first_day_of_month_only: firstDayOfMonthOnly, // Pass first day of month filter
        previewRefreshOnly, // When true: stay in modal, don't switch tabs
      });

      if (!previewRefreshOnly) setDeployMissingModalOpen(false);
    },
    [
      onDeployMissing,
      effectiveDeployCategories,
      serviceName,
      startDate,
      endDate,
      selectedVenues,
      selectedFolders,
      selectedDataTypes,
      deployMissingForce,
      deployMissingDryRun,
      deployMissingDateGranularity,
      firstDayOfMonthOnly,
      deployMissingRegion,
      dataStatusMode,
    ],
  );

  // Auto-refresh preview when date granularity changes
  // Keeps modal open and user on data-status tab - only updates the preview overlay
  // This allows users to tweak granularity/options and see updated shard counts in-place
  useEffect(() => {
    // Only auto-refresh if:
    // 1. Modal is open (user is viewing the deploy missing dialog)
    // 2. In preview mode (dry run = true)
    // 3. Has categories to deploy (prevent empty deploys)
    if (deployMissingModalOpen && deployMissingDryRun && effectiveDeployCategories.length > 0) {
      const timeoutId = setTimeout(() => {
        handleConfirmDeployMissing(true); // previewRefreshOnly: stay in modal, don't switch tabs
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [
    deployMissingDateGranularity,
    deployMissingModalOpen,
    deployMissingDryRun,
    effectiveDeployCategories.length,
    handleConfirmDeployMissing,
  ]);

  // Handle instrument-level deploy missing
  const handleInstrumentDeployMissing = useCallback(() => {
    if (!onDeployMissing || !selectedInstrument || !instrumentAvailability) return;

    // Get data types that have missing data
    const dataTypesWithMissing = Object.entries(instrumentAvailability.by_data_type)
      .filter(([, stats]) => stats.dates_missing > 0)
      .map(([dataType]) => dataType);

    if (dataTypesWithMissing.length === 0) return;

    // Parse instrument key to get venue and folder/instrument_type
    const venue = selectedInstrument.venue;
    const folder = selectedInstrument.instrument_type;

    // Use the effective date range from availability window if available
    const effectiveStart = instrumentAvailability.availability_window?.effective_start || startDate;
    const effectiveEnd = instrumentAvailability.availability_window?.effective_end || endDate;

    // Deploy with instrument-specific filters
    onDeployMissing({
      service: serviceName,
      start_date: effectiveStart,
      end_date: effectiveEnd,
      mode: dataStatusMode,
      region: deployMissingRegion,
      asset_groups: selectedCategories, // Use current asset_group filter
      venues: [venue], // Single venue from instrument
      folders: [folder], // Single folder/instrument_type from instrument
      data_types: dataTypesWithMissing, // Only data types with missing data
      force: false,
      dry_run: true, // Default to preview mode for safety
      skip_existing: true,
      deploy_missing_only: true,
      date_granularity: deployMissingDateGranularity,
      first_day_of_month_only: firstDayOfMonthOnly,
    });
  }, [
    onDeployMissing,
    selectedInstrument,
    instrumentAvailability,
    startDate,
    endDate,
    selectedCategories,
    deployMissingDateGranularity,
    firstDayOfMonthOnly,
    serviceName,
    deployMissingRegion,
    dataStatusMode,
  ]);

  // Convert data to heatmap format for calendar view
  // Uses actual missing_dates from API for accurate per-day status
  // Works with both standard data and venueCheckData
  const heatmapData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const result: {
      date: string;
      status: "complete" | "partial" | "missing" | "future";
      coverage?: number;
      tooltip?: string;
    }[] = [];

    try {
      // DIFFERENT LOGIC FOR VENUE CHECK MODE vs STANDARD MODE
      if (venueCheckData) {
        // VENUE CHECK MODE: Use dates_with_missing_venues structure
        // Build set of dates that have missing venues
        const datesWithIssues = new Set<string>();
        const dateDetails = new Map<string, string[]>(); // date -> [category: X venues missing]

        Object.entries(venueCheckData.asset_groups).forEach(([catName, catData]) => {
          if (!catData.dates_with_missing_venues) return;

          catData.dates_with_missing_venues.forEach((dateInfo) => {
            datesWithIssues.add(dateInfo.date);
            if (!dateDetails.has(dateInfo.date)) {
              dateDetails.set(dateInfo.date, []);
            }
            dateDetails.get(dateInfo.date)!.push(`${catName}: ${dateInfo.missing.length} venues`);
          });
        });

        // Generate day entries
        const currentDate = new Date(start);
        while (currentDate <= end) {
          const dateStr = currentDate.toISOString().split("T")[0];
          const isFuture = currentDate > today;

          if (isFuture) {
            result.push({ date: dateStr, status: "future" });
          } else if (datesWithIssues.has(dateStr)) {
            const details = dateDetails.get(dateStr) || [];
            result.push({
              date: dateStr,
              status: "partial",
              coverage: 50, // Approximate
              tooltip: `${dateStr}: Missing venues (${details.join(", ")})`,
            });
          } else {
            result.push({
              date: dateStr,
              status: "complete",
              coverage: 100,
              tooltip: `${dateStr}: All venues present`,
            });
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }

        return result;
      }

      // STANDARD MODE: Calculate per-day coverage properly
      if (!data || !data.asset_groups) return [];

      // For each date, calculate how many venue-days have data
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const isFuture = currentDate > today;

        if (isFuture) {
          result.push({ date: dateStr, status: "future" });
        } else {
          // Count venues with data for this specific date
          let venuesWithData = 0;
          let totalVenues = 0;
          const missingVenues: string[] = [];

          Object.entries(data.asset_groups).forEach(([catName, catData]) => {
            if (!catData || !catData.venues) return;

            Object.entries(catData.venues).forEach(([venueName, venueData]) => {
              totalVenues++;

              // Check if this date is in missing_dates
              const missing = venueData.missing_dates || [];
              if (missing.includes(dateStr)) {
                // Date is missing for this venue
                missingVenues.push(`${catName}/${venueName}`);
              } else {
                // Date has data for this venue
                venuesWithData++;
              }
            });
          });

          const coverage = totalVenues > 0 ? Math.round((venuesWithData / totalVenues) * 100) : 0;

          if (coverage === 100) {
            result.push({
              date: dateStr,
              status: "complete",
              coverage: 100,
              tooltip: `${dateStr}: All ${totalVenues} venues complete`,
            });
          } else if (coverage === 0) {
            result.push({
              date: dateStr,
              status: "missing",
              coverage: 0,
              tooltip: `${dateStr}: No data (${missingVenues.length} venues missing)`,
            });
          } else {
            result.push({
              date: dateStr,
              status: "partial",
              coverage,
              tooltip: `${dateStr}: ${coverage}% coverage (${venuesWithData}/${totalVenues} venues, ${missingVenues.length} missing)`,
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return result;
    } catch {
      return [];
    }
  }, [data, venueCheckData, startDate, endDate]);

  return (
    <div className="space-y-4">
      {/* b4: out-of-scope banner for runtime services (execution, risk, pnl, alerting…) */}
      {!DATA_PIPELINE_SERVICES.has(serviceName) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            <strong>{serviceName}</strong> is a runtime service — its health is tracked in{" "}
            <strong>Monitor → Live</strong> or <strong>Monitor → Experiments</strong>. Data Status shows manifest-driven
            coverage for data-pipeline services only (instruments, MTDS, MDPS, features-*).
          </span>
        </div>
      )}
      {/* Data Status View Mode Toggle (B4 + B5) */}
      <Tabs
        value={dataStatusViewMode}
        onValueChange={(mode: string) => {
          const newMode = mode as "batch" | "scheduled-today" | "live";
          setDataStatusViewMode(newMode);

          if (newMode === "scheduled-today") {
            // Set dates to today
            const today = new Date().toISOString().split("T")[0];
            setStartDate(today);
            setEndDate(today);
            setDataStatusMode("batch");
          } else if (newMode === "batch") {
            // Reset to the workspace-wide default (bounded recent window, not full
            // history — see DEFAULT_LOOKBACK_DAYS).
            setStartDate(getDefaultStartDate());
            const d = new Date();
            d.setDate(d.getDate() - 1);
            setEndDate(d.toISOString().split("T")[0]);
            setDataStatusMode("batch");
          } else if (newMode === "live") {
            setDataStatusMode("live");
          }
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="batch">Batch</TabsTrigger>
          <TabsTrigger value="scheduled-today">Today</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* b6: Live mode shows freshness panel; Batch/Scheduled show manifest coverage below */}
      {dataStatusViewMode === "live" && <LiveFreshnessPanel />}
      {dataStatusViewMode !== "live" && (
        <>
          {serviceName === "instruments-service" && <UpcomingFixtures />}
          {serviceName === "instruments-service" && <FixturesBrowser />}
          {serviceName === "instruments-service" && <NewListingsCard />}
          {serviceName === "instruments-service" && <UpcomingExpiriesCard />}
          {serviceName === "instruments-service" && <PredictionCatalogueCard />}
          {/* P6 phase-1 catalogue explorer — availability-derived "captured
              instruments" list, IS-only (phase-1 scope; see
              data_status_page_ux_and_canonicalisation_2026_07_16 P6). */}
          {serviceName === "instruments-service" && <CatalogueExplorer />}

          {/* Track-6 restoration (cefi_consolidated_closeout_2026_07_18) — the
              non-canonical-naming / duplication detector: distinct RAW manifest
              values per axis, straight off read_availability_index (not the
              identity catalogue behind CatalogueExplorer's dropdowns, and not
              canonicalised like the drilldown/coverage-summary breakdowns). */}
          {serviceName === "instruments-service" && <AxisValueCensus />}

          {/* RAW distinct-values enumeration (cefi_consolidated_closeout_2026_07_18)
              — every distinct raw value per axis (venues / instrument_types /
              data_types / chains) from the honest-coverage rollup, each flagged
              with the backend's authoritative is_canonical verdict so drift /
              duplication is eyeball-able. */}
          {serviceName === "instruments-service" && <DistinctValuesPanel />}

          {/* Pipeline Trace (GAP G-TRACE) — cross-service, not scoped to one
              serviceName tab: threads one instrument/date through every stage
              (IS->MTDS->MDPS->features->strategy->execution) in one call. */}
          <PipelineTraceCard />

          {/* Honest Coverage Card — per-asset-group coverage % from daily cron VM */}
          <HonestCoverageCard />

          {/* Sports feature coverage (Phase 8.A, features_sports_honest_coverage_2026_05_05.plan.md)
              — per-feature-rollup honest coverage reading the Phase-3
              sports_honest_coverage() axis via the turbo endpoint. */}
          {serviceName === "features-sports-service" && <SportsFeatureCoverageCard />}

          {/* Coverage Summary Card — auto-loaded from manifest */}
          {(coverageSummary || coverageSummaryLoading) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                    <CardTitle className="text-base">Instrument Coverage Summary</CardTitle>
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                      title={
                        coverageSummary?.totals_source === "rollup"
                          ? "Served from pre-computed rollup (≤30 min stale). Numbers may differ from live manifest until writegate Phase 3.D.4 lands."
                          : "Served from live manifest scan."
                      }
                    >
                      {coverageSummary?.totals_source === "rollup" ? "ROLLUP" : "MANIFEST"}
                    </Badge>
                  </div>
                  {coverageSummary?.totals && (
                    <div className="text-right">
                      <div className="text-2xl font-mono font-bold text-[var(--color-accent-cyan)]">
                        {(
                          coverageSummary.totals.unique_instruments ?? coverageSummary.totals.latest_day_instruments
                        ).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">
                        {coverageSummary.totals.unique_instruments != null
                          ? "unique instruments — all-time incl. expired/delisted/resolved (catalogue-deduplicated, all asset groups)"
                          : "instruments (latest day, sum across asset groups)"}
                      </div>
                      {coverageSummary.totals.unique_instruments != null && (
                        <div
                          className="text-[10px] font-semibold text-[var(--color-text-muted)]"
                          title="The live, currently-active universe — not the all-time total above."
                        >
                          {coverageSummary.totals.latest_day_instruments.toLocaleString()} active on latest day
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {coverageSummaryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading coverage summary...
                  </div>
                ) : coverageSummary?.totals ? (
                  <div className="space-y-3">
                    {/* Grand totals row */}
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="p-2 rounded bg-[var(--color-bg-tertiary)]">
                        <div className="text-lg font-mono font-bold">
                          {(coverageSummary.totals.shards ?? 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">Total Shards</div>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-bg-tertiary)]">
                        <div className="text-lg font-mono font-bold">
                          {((coverageSummary.totals.instrument_rows ?? 0) / 1_000_000).toFixed(1)}M
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">Instrument Rows</div>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-bg-tertiary)]">
                        <div className="text-lg font-mono font-bold">
                          {(coverageSummary.totals.dates_across_asset_groups ?? 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">Dates (all asset groups)</div>
                      </div>
                      <div className="p-2 rounded bg-[var(--color-bg-tertiary)]">
                        <div className="text-lg font-mono font-bold">
                          {Object.keys(coverageSummary.asset_groups ?? {}).length}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">Asset Groups</div>
                      </div>
                    </div>

                    {/* Per asset group breakdown (CeFi / DeFi / TradFi / …) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.entries(coverageSummary.asset_groups ?? {}).map(([cat, catData]) => {
                        // Phase 3 (data_status_multi_axis_shard_propagation): pull
                        // per-(service, asset_group) breakdown axes from UAC SSOT
                        // via deployment-api /api/config/shard-axis-matrix. Empty
                        // axes (writer hasn't populated the column yet) still
                        // render with a "no data yet" placeholder by design — UI
                        // shape leads, writers follow.
                        const axisKey = cat.toLowerCase();
                        const breakdownAxes = shardAxisMatrix?.breakdown_axes?.[serviceName]?.[axisKey] ?? [];
                        const breakdowns = catData.breakdowns ?? {};
                        return (
                          <div
                            key={cat}
                            className="p-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {cat}
                              </Badge>
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {catData.unique_venues} {catData.sub_dimension_label ?? "venues"}
                              </span>
                            </div>
                            <div className="text-sm font-mono font-bold">
                              {catData.latest_day_total.toLocaleString()} instruments (latest day)
                            </div>
                            <div className="text-[10px] text-[var(--color-text-muted)] mb-2">
                              {catData.unique_dates.toLocaleString()} dates &middot;{" "}
                              {catData.total_shards.toLocaleString()} shards
                              {catData.date_range && (
                                <>
                                  {" "}
                                  &middot; {catData.date_range.start} to {catData.date_range.end}
                                </>
                              )}
                            </div>
                            {/* Instrument type pills — show first 8 with expandable overflow */}
                            <VenuePillList venues={catData.latest_day_instruments} />
                            {breakdownAxes.length > 0 ? (
                              <div className="mt-3">
                                <BreakdownsAccordion
                                  axes={breakdownAxes}
                                  breakdowns={breakdowns}
                                  title="Breakdowns"
                                  onSelectValue={(axis, value) => setManifestFilter({ axis, value })}
                                />
                              </div>
                            ) : null}
                            {/* Drilldown plan Phase 2: hierarchical shard-atom
                          drill-down. Tree shape comes from the codex
                          per-(service, asset_group) shard-axis matrix
                          (UAC SSOT). Each leaf row exposes a per-shard
                          CSV download + a Deploy-Missing button that
                          composes the surgical --shard-key=... command
                          for missing shards. Default-collapsed; the
                          drilldown request is LAZY (fires on expand, not on
                          mount) via LazyDrilldownDetails so the page doesn't
                          fan out 5 concurrent full-index reads (and 5000
                          instruments) by default.

                          P5: suppressed for instruments-service cefi/tradfi/defi
                          — their shard axes (venue, +chain for defi) are a
                          strict subset of the "Data Coverage" grid below, so
                          this drilldown is redundant there. Kept for IS
                          sports/prediction (league_id / cqg axes the grid does
                          not expand) + every other service (primary drilldown).
                          isHierarchicalDrilldownRedundant is an axis-comparison
                          predicate, NOT a blanket service-name gate. */}
                            {!isHierarchicalDrilldownRedundant(serviceName, axisKey, shardAxisMatrix) && (
                              <LazyDrilldownDetails
                                service={serviceName}
                                assetGroup={axisKey}
                                startDate={startDate}
                                endDate={endDate}
                                onOpenLeafSchema={setLeafSchemaCoord}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Cross-category canonical-symbol search (Gap 3 of cross-category audit).
          Hits /api/data-status/instruments/search; matches against
          ``instrument_key`` (CeFi/TradFi/DeFi/Prediction) or ``league_id``
          (Sports). Whitespace tokenises into AND-matched substrings. */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
                <CardTitle className="text-base">Symbol search</CardTitle>
                <span className="text-[10px] text-[var(--color-text-muted)] ml-2">
                  cross-category &middot; canonical IDs &middot; whitespace = AND-match
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Input
                  id="symbol-search"
                  name="symbol-search"
                  aria-label="Symbol search"
                  type="text"
                  value={symbolSearchQuery}
                  onChange={(e) => {
                    setSymbolSearchQuery(e.target.value);
                    runSymbolSearch(e.target.value);
                  }}
                  placeholder="e.g. BTC-USDT, EPL, USDC WETH 500, 0x5fe3..."
                  className="text-sm font-mono"
                  data-testid="symbol-search-input"
                />
                {symbolSearchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
                )}
              </div>
              {symbolSearchQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
                  {symbolSearchResults.length === 0 && !symbolSearchLoading && (
                    <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                      No matches. Try a partial substring (e.g. ``btc``, ``eigenlayer``, ``epl``) or two-token AND-match
                      (``usdc weth``).
                    </div>
                  )}
                  {symbolSearchResults.map((m) => {
                    const isSports = m.asset_group === "SPORTS";
                    const isSelected = isSports
                      ? symbolSearchLeague === m.canonical_id
                      : symbolSearchSelectedInstrument?.instrument_key === m.canonical_id;
                    const onActivate = () => {
                      if (isSports) {
                        void handleSymbolSearchLeagueClick(m);
                      } else {
                        void handleSymbolSearchInstrumentClick(m);
                      }
                    };
                    return (
                      <div
                        key={`${m.canonical_id}__${m.asset_group}__${m.venue}__${m.instrument_type}`}
                        className={cn(
                          "flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-hover)] text-xs cursor-pointer",
                          isSelected && "bg-[var(--color-bg-hover)]",
                        )}
                        data-testid="symbol-search-result"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={onActivate}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onActivate();
                          }
                        }}
                      >
                        <Badge variant="outline" className="text-[9px] font-mono shrink-0 w-20 justify-center">
                          {m.asset_group}
                        </Badge>
                        <span className="font-mono truncate flex-1 text-[var(--color-text)]" title={m.canonical_id}>
                          {m.canonical_id}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">{m.venue}</span>
                        {m.instrument_type && (
                          <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0 opacity-70">
                            {m.instrument_type}
                          </span>
                        )}
                        {isSelected && (
                          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                        )}
                        {!isSelected && (
                          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]/40" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                  {symbolSearchTruncated && (
                    <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] italic border-t border-[var(--color-border-subtle)]">
                      Showing first 50 matches — refine your query for narrower results.
                    </div>
                  )}
                </div>
              )}

              {/* Click-through — SPORTS branch: this league's day-level
              found/missing dates (== odds coverage, MTDS SPORTS data_type
              "trades") over the page's current start/end date range. A new,
              independent inline panel — does NOT touch turboData/
              manifestFilter, so it never replaces or scrolls to the macro
              drilldown below. */}
              {symbolSearchLeague && (
                <div
                  className="mt-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-3 text-xs"
                  data-testid="symbol-search-league-panel"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-medium text-[var(--color-text)]">
                      {symbolSearchLeague} <span className="text-[var(--color-text-muted)]">— odds availability</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSymbolSearchLeague(null);
                        setSymbolSearchLeagueStatus(null);
                        setSymbolSearchLeagueError(null);
                        setSymbolSearchLeagueDay(null);
                      }}
                      className="text-[10px] text-[var(--color-text-muted)] hover:underline"
                      data-testid="symbol-search-league-dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                  {symbolSearchLeagueLoading && (
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading day-level availability…
                    </div>
                  )}
                  {symbolSearchLeagueError && (
                    <div className="flex items-center gap-2 text-[var(--color-accent-red)]">
                      <AlertCircle className="h-3 w-3" />
                      {symbolSearchLeagueError}
                    </div>
                  )}
                  {!symbolSearchLeagueLoading && !symbolSearchLeagueError && symbolSearchLeagueStatus && (
                    <>
                      <div className="mb-2 text-[var(--color-text-muted)]">
                        {symbolSearchLeagueStatus.dates_found_count ?? 0} found &middot;{" "}
                        {symbolSearchLeagueStatus.dates_missing_count ?? 0} missing ({startDate} &rarr; {endDate})
                      </div>
                      {(symbolSearchLeagueStatus.dates_found_list ?? []).length === 0 &&
                      (symbolSearchLeagueStatus.dates_missing_list ?? []).length === 0 ? (
                        <div className="text-[var(--color-text-muted)] italic">
                          No dates in the current range for this league.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div
                            className="flex flex-wrap gap-1 max-h-40 overflow-y-auto"
                            data-testid="symbol-search-league-found-days"
                          >
                            {(symbolSearchLeagueStatus.dates_found_list ?? []).map((day) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => setSymbolSearchLeagueDay((prev) => (prev === day ? null : day))}
                                className={cn(
                                  "px-1.5 py-0.5 rounded font-mono text-[10px] border",
                                  symbolSearchLeagueDay === day
                                    ? "bg-[var(--color-accent-green)] text-black border-[var(--color-accent-green)]"
                                    : "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-transparent hover:opacity-80",
                                )}
                                data-testid={`symbol-search-league-day-${day}`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          {(symbolSearchLeagueStatus.dates_missing_list ?? []).length > 0 && (
                            <details>
                              <summary className="text-[10px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                {symbolSearchLeagueStatus.dates_missing_list?.length} missing dates (click to expand)
                              </summary>
                              <div className="flex flex-wrap gap-1 mt-1 max-h-40 overflow-y-auto">
                                {(symbolSearchLeagueStatus.dates_missing_list ?? []).map((day) => (
                                  <span
                                    key={day}
                                    className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
                                  >
                                    {day}
                                  </span>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                      {symbolSearchLeagueDay && (
                        <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2">
                          <div className="text-[10px] text-[var(--color-text-muted)] mb-1">
                            Fixtures on {symbolSearchLeagueDay}:
                          </div>
                          <FixtureBreakdown day={symbolSearchLeagueDay} league_id={symbolSearchLeague} readOnly />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Click-through — non-SPORTS branch (cefi/tradfi/defi/prediction):
              reuses the `getInstrumentAvailability` contract exactly as the
              existing manual "Instrument-Level Search" flow does, via its
              OWN state (see the declaration comment above for why). */}
              {symbolSearchSelectedInstrument && (
                <div
                  className="mt-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-3 text-xs"
                  data-testid="symbol-search-instrument-panel"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono font-medium text-[var(--color-text)]">
                        {symbolSearchSelectedInstrument.instrument_key}
                      </span>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                        <span className="text-[var(--color-accent-purple)]">
                          {symbolSearchSelectedInstrument.venue}
                        </span>
                        {" • "}
                        <span className="text-[var(--color-accent-cyan)]">
                          {symbolSearchSelectedInstrument.instrument_type}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSymbolSearchSelectedInstrument(null);
                        setSymbolSearchInstrumentAvailability(null);
                        setSymbolSearchInstrumentError(null);
                      }}
                      className="text-[10px] text-[var(--color-text-muted)] hover:underline shrink-0"
                      data-testid="symbol-search-instrument-dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                  {symbolSearchInstrumentLoading && (
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking availability…
                    </div>
                  )}
                  {symbolSearchInstrumentError && (
                    <div className="flex items-center gap-2 text-[var(--color-accent-red)]">
                      <AlertCircle className="h-3 w-3" />
                      {symbolSearchInstrumentError}
                    </div>
                  )}
                  {!symbolSearchInstrumentLoading && symbolSearchInstrumentAvailability && (
                    <div className="space-y-2">
                      <div className="p-2 rounded bg-[var(--color-bg-tertiary)] border border-[var(--color-border-default)]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">Overall Availability</span>
                          <Badge
                            className={getCompletionBadgeClass(
                              symbolSearchInstrumentAvailability.overall.completion_pct,
                            )}
                          >
                            {symbolSearchInstrumentAvailability.overall.completion_pct.toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="w-full bg-[var(--color-bg-secondary)] rounded-full h-1.5 mb-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(symbolSearchInstrumentAvailability.overall.completion_pct, 100)}%`,
                              backgroundColor: getCompletionColor(
                                symbolSearchInstrumentAvailability.overall.completion_pct,
                              ),
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
                          <span>
                            Found:{" "}
                            <span className="text-[var(--color-accent-green)]">
                              {symbolSearchInstrumentAvailability.overall.found}
                            </span>
                          </span>
                          <span>
                            Missing:{" "}
                            <span className="text-[var(--color-accent-red)]">
                              {symbolSearchInstrumentAvailability.overall.missing}
                            </span>
                          </span>
                          <span>Expected: {symbolSearchInstrumentAvailability.overall.expected}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(symbolSearchInstrumentAvailability.by_data_type).map(([dataType, stats]) => (
                          <div
                            key={dataType}
                            className="p-1.5 rounded bg-[var(--color-bg-tertiary)] border border-[var(--color-border-subtle)]"
                          >
                            <div className="flex items-center justify-between">
                              <span>{dataType}</span>
                              <span
                                className={cn(
                                  "text-[10px] font-medium",
                                  stats.completion_pct >= 100
                                    ? "text-[var(--color-accent-green)]"
                                    : stats.completion_pct >= 50
                                      ? "text-[var(--color-accent-amber)]"
                                      : "text-[var(--color-accent-red)]",
                                )}
                              >
                                {stats.completion_pct.toFixed(1)}% ({stats.dates_found}/
                                {stats.dates_found + stats.dates_missing})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[var(--color-text-muted)]" />
                  <CardTitle className="text-base">Filters</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearDataStatusCache}
                    disabled={loading || clearingCache}
                    title="Clear data status cache and re-fetch (does not affect deployment state)"
                  >
                    {clearingCache ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Clear Cache
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fetchData(startDate, endDate)} disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Check Status
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(useManifestMode || useTurboMode) && (
                <div className="mb-4">
                  <Label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
                    Mode{useManifestMode ? " (Manifest — fastest)" : " (Turbo)"}
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={dataStatusMode === "batch" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDataStatusMode("batch")}
                    >
                      Batch
                    </Button>
                    <Button
                      type="button"
                      variant={dataStatusMode === "live" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDataStatusMode("live")}
                    >
                      Live
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Batch: historical GCS paths. Live: real-time GCS paths.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label
                    htmlFor="data-status-start-date"
                    className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block"
                  >
                    Start Date
                  </Label>
                  <Input
                    id="data-status-start-date"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                    }}
                    className="h-9"
                  />
                  <div className="flex gap-1 mt-1">
                    {[
                      { label: "30d", days: 30, testId: "30d" },
                      { label: "90d", days: 90, testId: "90d" },
                      { label: "1y", days: 365, testId: "1y" },
                      { label: "All", days: null, testId: "all" },
                    ].map((p) => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        data-testid={`data-status-start-preset-${p.testId}`}
                        title={
                          p.days === null
                            ? `Load full history (${FULL_HISTORY_START_DATE} → today) — a much slower scan than the default window; click Check Status to apply.`
                            : undefined
                        }
                        onClick={() => {
                          if (p.days === null) {
                            // Full history — an explicit user action, never the silent
                            // default (see DEFAULT_LOOKBACK_DAYS above).
                            setStartDate(FULL_HISTORY_START_DATE);
                          } else {
                            const d = new Date();
                            d.setDate(d.getDate() - p.days);
                            setStartDate(d.toISOString().split("T")[0]);
                          }
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label
                    htmlFor="data-status-end-date"
                    className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block"
                  >
                    End Date
                  </Label>
                  <Input
                    id="data-status-end-date"
                    name="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                    }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
                    Require Freshness
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={requireFreshness ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        const turningOn = !requireFreshness;
                        setRequireFreshness(turningOn);
                        if (turningOn) setFreshnessDate(getTodayAt8am());
                      }}
                    >
                      {requireFreshness ? "On" : "Off"}
                    </Button>
                    {requireFreshness && (
                      <>
                        <Input
                          id="data-status-freshness"
                          name="freshnessDate"
                          aria-label="Require freshness — updated since"
                          type="datetime-local"
                          step="1"
                          value={freshnessDate}
                          onChange={(e) => setFreshnessDate(e.target.value)}
                          className="h-9 flex-1"
                          placeholder="Updated since..."
                          title="Enter your local time — it will be converted to UTC for comparison against GCS blob timestamps"
                        />
                        {freshnessDate && (
                          <span
                            className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap"
                            title="GCS blob timestamps are always UTC regardless of bucket region"
                          >
                            = {new Date(freshnessDate).toISOString().replace("T", " ").slice(0, 19)} UTC
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <Label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">Asset Groups</Label>
                  <div className="flex gap-2 flex-wrap">
                    {categoriesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading asset groups...
                      </div>
                    ) : (
                      availableCategories.map((cat) => (
                        <Button
                          key={cat}
                          type="button"
                          variant={selectedCategories.includes(cat) ? "default" : "outline"}
                          size="sm"
                          data-testid={`asset-group-toggle-${cat}`}
                          data-selected={selectedCategories.includes(cat)}
                          onClick={() => {
                            setSelectedCategories((prev) =>
                              prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
                            );
                          }}
                        >
                          {cat}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--color-text-muted)] mb-1 block">
                    Coverage Scope
                  </Label>
                  <div className="flex gap-2 flex-wrap" data-testid="data-status-scope-toggle">
                    {(
                      [
                        { value: "mvp", label: "MVP" },
                        { value: "could_exist", label: "Could exist" },
                        { value: "all", label: "All" },
                      ] as { value: CoverageScope; label: string }[]
                    ).map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        variant={scope === value ? "default" : "outline"}
                        size="sm"
                        data-testid={`data-status-scope-toggle-${value}`}
                        data-selected={scope === value}
                        onClick={() => setScope(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Venue Filter - appears when exactly one category is selected */}
              {selectedCategories.length === 1 && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-default)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <Label className="text-xs font-medium text-[var(--color-text-muted)]">
                      Filter by Venue
                      {selectedVenues.length > 0 && (
                        <span className="ml-2 text-[var(--color-accent-cyan)]">({selectedVenues.length} selected)</span>
                      )}
                    </Label>
                    {selectedVenues.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedVenues([])} className="ml-auto">
                        Clear
                      </Button>
                    )}
                  </div>
                  {venuesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading venues...
                    </div>
                  ) : availableVenues.length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                      {availableVenues.map((venue) => (
                        <Button
                          key={venue}
                          type="button"
                          variant={selectedVenues.includes(venue) ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSelectedVenues((prev) =>
                              prev.includes(venue) ? prev.filter((v) => v !== venue) : [...prev, venue],
                            );
                          }}
                        >
                          {venue}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      No venues available for {selectedCategories[0]}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Filtering by venue reduces GCS scan scope for faster results
                  </p>
                </div>
              )}

              {/* Venue-specific Filters - appear when exactly one venue is selected */}
              {selectedVenues.length === 1 && selectedCategories.length === 1 && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-default)]">
                  {venueFiltersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading filters for {selectedVenues[0]}...
                    </div>
                  ) : (
                    <>
                      {/* Instrument Type (Folder) Filter */}
                      {venueAvailableFolders.length > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Filter className="h-4 w-4 text-[var(--color-text-muted)]" />
                            <Label className="text-xs font-medium text-[var(--color-text-muted)]">
                              Filter by Instrument Type
                              {selectedFolders.length > 0 && (
                                <span className="ml-2 text-[var(--color-accent-green)]">
                                  ({selectedFolders.length} selected)
                                </span>
                              )}
                            </Label>
                            {selectedFolders.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedFolders([])}
                                className="ml-auto"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {venueAvailableFolders.map((f) => (
                              <Button
                                key={f}
                                type="button"
                                variant={selectedFolders.includes(f) ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  setSelectedFolders((prev) =>
                                    prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
                                  );
                                }}
                              >
                                {f}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Data Type Filter */}
                      {venueAvailableDataTypes.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Filter className="h-4 w-4 text-[var(--color-text-muted)]" />
                            <Label className="text-xs font-medium text-[var(--color-text-muted)]">
                              Filter by Data Type
                              {selectedDataTypes.length > 0 && (
                                <span className="ml-2 text-[var(--color-accent-orange)]">
                                  ({selectedDataTypes.length} selected)
                                </span>
                              )}
                            </Label>
                            {selectedDataTypes.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDataTypes([])}
                                className="ml-auto"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {venueAvailableDataTypes.map((dt) => (
                              <Button
                                key={dt}
                                type="button"
                                variant={selectedDataTypes.includes(dt) ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  setSelectedDataTypes((prev) =>
                                    prev.includes(dt) ? prev.filter((x) => x !== dt) : [...prev, dt],
                                  );
                                }}
                              >
                                {dt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-[var(--color-text-muted)] mt-3">
                        Filters for {selectedVenues[0]} ({selectedCategories[0]})
                      </p>

                      {/* List Files Button - appears when all filters are specified */}
                      {selectedFolders.length === 1 && selectedDataTypes.length === 1 && (
                        <div className="mt-4 pt-3 border-t border-[var(--color-border-default)]">
                          {/* Timeframe selector for market-data-processing-service */}
                          {serviceName === "market-data-processing-service" && (
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Label className="text-xs font-medium text-[var(--color-text-muted)]">
                                  Select Timeframe
                                </Label>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {availableTimeframes.map((tf) => (
                                  <Button
                                    key={tf}
                                    type="button"
                                    variant={selectedTimeframe === tf ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedTimeframe(tf)}
                                  >
                                    {tf}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}

                          <Button
                            variant="default"
                            onClick={fetchFileListing}
                            disabled={fileListingLoading}
                            className="w-full justify-center"
                          >
                            {fileListingLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Listing files...
                              </>
                            ) : (
                              <>
                                <FileText className="h-4 w-4" />
                                List Files in GCS
                              </>
                            )}
                          </Button>
                          <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">
                            Query GCS to see actual parquet files for this path
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* First Day of Month Filter - for TARDIS free tier (no API key needed) */}
              {serviceName === "market-tick-data-service" && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-default)]">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="first-day-of-month"
                      checked={firstDayOfMonthOnly}
                      onCheckedChange={(checked) => setFirstDayOfMonthOnly(checked === true)}
                    />
                    <Label
                      htmlFor="first-day-of-month"
                      className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                    >
                      <Calendar className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                      First day of each month only
                    </Label>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 ml-7">
                    TARDIS free tier: no API key required for first-day-of-month data. Check and deploy only 1st of each
                    month dates.
                  </p>
                </div>
              )}

              {/* Instrument-Level Search - check availability for specific instruments */}
              {selectedCategories.length === 1 &&
                ["market-tick-data-service", "market-data-processing-service"].includes(serviceName) && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-border-default)]">
                    <div className="flex items-center gap-3 mb-3">
                      <Checkbox
                        id="instrument-search-mode"
                        checked={instrumentSearchMode}
                        onCheckedChange={(checked) => setInstrumentSearchMode(checked === true)}
                      />
                      <Label
                        htmlFor="instrument-search-mode"
                        className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                      >
                        <Database className="h-4 w-4 text-[var(--color-accent-purple)]" />
                        Instrument-Level Search
                      </Label>
                    </div>

                    {instrumentSearchMode && (
                      <div className="ml-7 space-y-3">
                        {/* Instrument Search Input */}
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="Search instrument by ID (e.g., BTC-USDT, AAPL)"
                            value={instrumentSearchQuery}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setInstrumentSearchQuery(newValue);
                              // Clear selection if user is typing (searching for new instrument)
                              if (selectedInstrument && newValue !== selectedInstrument.instrument_key) {
                                setSelectedInstrument(null);
                                setInstrumentAvailability(null);
                                setInstrumentSearchResults([]);
                                fetchInstruments(newValue);
                              } else if (!selectedInstrument) {
                                // Only fetch if no instrument is selected
                                fetchInstruments(newValue);
                              }
                            }}
                            onFocus={() => {
                              // Only show dropdown if no instrument selected and we have results
                              if (!selectedInstrument && instrumentSearchResults.length > 0) {
                                setShowInstrumentDropdown(true);
                              }
                            }}
                            className="w-full"
                          />
                          {instrumentSearchLoading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
                          )}

                          {/* Dropdown Results */}
                          {showInstrumentDropdown && instrumentSearchResults.length > 0 && !selectedInstrument && (
                            <div className="absolute z-50 w-full mt-1 max-h-64 overflow-auto bg-[var(--color-bg-primary)] border border-[var(--color-border-default)] rounded-lg shadow-lg">
                              {instrumentSearchResults.map((instrument) => (
                                <Button
                                  key={instrument.instrument_key}
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // Cancel any pending searches
                                    if (searchInstrumentsDebounceRef.current) {
                                      clearTimeout(searchInstrumentsDebounceRef.current);
                                      searchInstrumentsDebounceRef.current = null;
                                    }
                                    setSelectedInstrument(instrument);
                                    setInstrumentSearchQuery(instrument.instrument_key);
                                    setShowInstrumentDropdown(false);
                                    setInstrumentSearchResults([]); // Clear results to prevent dropdown flash
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-secondary)] transition-colors h-auto"
                                >
                                  <div className="font-medium">{instrument.instrument_key}</div>
                                  <div className="text-xs text-[var(--color-text-muted)]">
                                    {instrument.venue} • {instrument.instrument_type}
                                    {instrument.symbol && ` • ${instrument.symbol}`}
                                  </div>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Selected Instrument Info */}
                        {selectedInstrument && (
                          <div className="p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">{selectedInstrument.instrument_key}</div>
                                <div className="text-xs text-[var(--color-text-muted)] mt-1">
                                  <span className="text-[var(--color-accent-purple)]">{selectedInstrument.venue}</span>
                                  {" • "}
                                  <span className="text-[var(--color-accent-cyan)]">
                                    {selectedInstrument.instrument_type}
                                  </span>
                                  {selectedInstrument.data_types && (
                                    <>
                                      {" • "}
                                      <span>
                                        {Array.isArray(selectedInstrument.data_types)
                                          ? selectedInstrument.data_types.join(", ")
                                          : String(selectedInstrument.data_types)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {/* Instrument Availability Window */}
                                {(selectedInstrument.available_from_datetime ||
                                  selectedInstrument.available_to_datetime) && (
                                  <div className="text-xs text-[var(--color-text-muted)] mt-1">
                                    <span className="text-[var(--color-accent-amber)]">Available: </span>
                                    {selectedInstrument.available_from_datetime
                                      ? selectedInstrument.available_from_datetime.split("T")[0]
                                      : "..."}
                                    {" → "}
                                    {selectedInstrument.available_to_datetime
                                      ? selectedInstrument.available_to_datetime.split("T")[0]
                                      : "ongoing"}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                onClick={fetchInstrumentAvailability}
                                disabled={instrumentAvailabilityLoading}
                                className="bg-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/80"
                              >
                                {instrumentAvailabilityLoading ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Checking...
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Check Availability
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Availability Results */}
                        {instrumentAvailabilityError && (
                          <div className="flex items-center gap-2 text-sm text-[var(--color-accent-red)]">
                            <AlertCircle className="h-4 w-4" />
                            {instrumentAvailabilityError}
                          </div>
                        )}

                        {instrumentAvailability && (
                          <div className="space-y-3">
                            {/* Overall Summary */}
                            <div className="p-3 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border-default)]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Overall Availability</span>
                                <Badge
                                  className={getCompletionBadgeClass(instrumentAvailability.overall.completion_pct)}
                                >
                                  {instrumentAvailability.overall.completion_pct.toFixed(1)}%
                                </Badge>
                              </div>
                              <div className="w-full bg-[var(--color-bg-secondary)] rounded-full h-2 mb-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-300"
                                  style={{
                                    width: `${Math.min(instrumentAvailability.overall.completion_pct, 100)}%`,
                                    backgroundColor: getCompletionColor(instrumentAvailability.overall.completion_pct),
                                  }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                                <span>
                                  Found:{" "}
                                  <span className="text-[var(--color-accent-green)]">
                                    {instrumentAvailability.overall.found}
                                  </span>
                                </span>
                                <span>
                                  Missing:{" "}
                                  <span className="text-[var(--color-accent-red)]">
                                    {instrumentAvailability.overall.missing}
                                  </span>
                                </span>
                                <span>Expected: {instrumentAvailability.overall.expected}</span>
                              </div>
                              <div className="text-xs text-[var(--color-text-muted)] mt-2">
                                {/* Show effective date range (intersection of user range and instrument availability) */}
                                {instrumentAvailability.availability_window ? (
                                  <>
                                    <span className="text-[var(--color-accent-amber)]">Effective: </span>
                                    {instrumentAvailability.availability_window.effective_start} to{" "}
                                    {instrumentAvailability.availability_window.effective_end}
                                    {" • "}
                                    {instrumentAvailability.availability_window.dates_in_window} dates
                                    {instrumentAvailability.availability_window.instrument_from && (
                                      <span className="block mt-1">
                                        <span className="text-[var(--color-text-muted)]">Instrument available: </span>
                                        {instrumentAvailability.availability_window.instrument_from.split("T")[0]}
                                        {" → "}
                                        {instrumentAvailability.availability_window.instrument_to
                                          ? instrumentAvailability.availability_window.instrument_to.split("T")[0]
                                          : "ongoing"}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {instrumentAvailability.date_range.start} to {instrumentAvailability.date_range.end}
                                    {" • "}
                                    {instrumentAvailability.date_range.total_dates} dates
                                  </>
                                )}
                                {instrumentAvailability.date_range.first_day_of_month_only && (
                                  <span className="text-[var(--color-accent-cyan)]"> (first day of month only)</span>
                                )}
                              </div>
                            </div>

                            {/* Deploy Missing for Instrument */}
                            {instrumentAvailability.overall.missing > 0 && onDeployMissing && (
                              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)]">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                                  <span className="text-sm">
                                    {instrumentAvailability.overall.missing} missing across{" "}
                                    {
                                      Object.entries(instrumentAvailability.by_data_type).filter(
                                        ([, s]) => s.dates_missing > 0,
                                      ).length
                                    }{" "}
                                    data type(s)
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={handleInstrumentDeployMissing}
                                  className="bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80"
                                >
                                  <Rocket className="h-4 w-4 mr-2" />
                                  Deploy Missing
                                </Button>
                              </div>
                            )}

                            {/* Per Data Type Breakdown */}
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-[var(--color-text-muted)]">By Data Type</div>
                              {Object.entries(instrumentAvailability.by_data_type).map(([dataType, stats]) => (
                                <div
                                  key={dataType}
                                  className="p-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm">{dataType}</span>
                                    <span
                                      className={cn(
                                        "text-xs font-medium",
                                        stats.completion_pct >= 100
                                          ? "text-[var(--color-accent-green)]"
                                          : stats.completion_pct >= 50
                                            ? "text-[var(--color-accent-amber)]"
                                            : "text-[var(--color-accent-red)]",
                                      )}
                                    >
                                      {stats.completion_pct.toFixed(1)}% ({stats.dates_found}/
                                      {stats.dates_found + stats.dates_missing})
                                    </span>
                                  </div>
                                  <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-1.5">
                                    <div
                                      className="h-1.5 rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(stats.completion_pct, 100)}%`,
                                        backgroundColor: getCompletionColor(stats.completion_pct),
                                      }}
                                    />
                                  </div>
                                  {/* Expandable date lists */}
                                  <div className="mt-2 space-y-2">
                                    {/* Found dates dropdown (green) */}
                                    {stats.dates_found > 0 &&
                                      stats.dates_found_list &&
                                      stats.dates_found_list.length > 0 && (
                                        <details className="w-full">
                                          <summary className="text-[10px] text-[var(--color-accent-green)] cursor-pointer hover:underline font-medium">
                                            ▸ {stats.dates_found} available shards (click to expand)
                                          </summary>
                                          <div className="mt-1 pl-2 border-l-2 border-[var(--color-status-success-border-strong)]">
                                            <div className="flex flex-wrap gap-1 max-h-64 overflow-y-auto">
                                              {stats.dates_found_list.map((date: string) => (
                                                <span
                                                  key={date}
                                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)]"
                                                >
                                                  {date}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </details>
                                      )}
                                    {/* Missing dates dropdown (red) */}
                                    {stats.dates_missing > 0 &&
                                      stats.dates_missing_list &&
                                      stats.dates_missing_list.length > 0 && (
                                        <details className="w-full">
                                          <summary className="text-[10px] text-[var(--color-accent-red)] cursor-pointer hover:underline font-medium">
                                            ▸ {stats.dates_missing} missing shards (click to expand)
                                          </summary>
                                          <div className="mt-1 pl-2 border-l-2 border-[var(--color-status-error-border-strong)]">
                                            <div className="flex flex-wrap gap-1 max-h-64 overflow-y-auto">
                                              {stats.dates_missing_list.map((date: string) => (
                                                <span
                                                  key={date}
                                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
                                                >
                                                  {date}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </details>
                                      )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Parsed Instrument Info */}
                            <div className="text-xs text-[var(--color-text-muted)]">
                              Parsed: {instrumentAvailability.parsed.asset_group} /{" "}
                              {instrumentAvailability.parsed.venue} /{instrumentAvailability.parsed.folder} /{" "}
                              {instrumentAvailability.parsed.instrument_type}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-[var(--color-text-muted)]">
                          Search for a specific instrument to check its data availability across all data types and
                          dates. This uses the aggregated instruments file for {selectedCategories[0]}.
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {/* Check Data Types Toggle - DISABLED: turbo mode shows data_types by default in breakdown */}
              {/* Feature removed - checkDataTypes is hardcoded to false, turbo mode handles this automatically */}
            </CardContent>
          </Card>

          {/* View Toggle - available for all modes (except turbo which has its own simpler view) */}
          {(data || venueCheckData) && !turboData && !loading && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">View:</span>
              <div className="flex items-center bg-[var(--color-bg-tertiary)] rounded-lg p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                    viewMode === "table"
                      ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
                  )}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Table
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("calendar")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                    viewMode === "calendar"
                      ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendar
                </Button>
              </div>
            </div>
          )}

          {/* Status/Error */}
          {loading && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent-cyan)]" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {checkVenues
                      ? "Deep scanning parquet files for venue coverage..."
                      : checkDataTypes
                        ? "Validating per data_type completion..."
                        : useManifestMode
                          ? `MANIFEST mode: Reading index for ${serviceName}...`
                          : useTurboMode
                            ? `TURBO mode: Scanning ${serviceName} data...`
                            : `Checking ${serviceName} data status...`}
                  </p>
                  {checkVenues && <p className="text-xs text-[var(--color-text-muted)]">This may take 20-30 seconds</p>}
                  {checkDataTypes && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      This may take 60-90 seconds for detailed validation
                    </p>
                  )}
                  {!checkVenues && !checkDataTypes && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {startDate} to {endDate}
                      {(useManifestMode || useTurboMode) &&
                        (() => {
                          // Calculate months for ETA estimate
                          // Local: ~1.2s per month, Cloud Run: ~0.5s per month
                          const start = new Date(startDate);
                          const end = new Date(endDate);
                          const months = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
                          const etaSeconds = months > 6 ? Math.ceil(months * 1.2) : Math.ceil(months * 3);
                          return ` • Optimized scan (~${etaSeconds}s for ${months} months)`;
                        })()}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelQuery}
                    className="mt-4 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Query
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-3 text-[var(--color-accent-red)]">
                  <AlertCircle className="h-5 w-5" />
                  <span>{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Venue Check Results */}
          {venueCheckData &&
            checkVenues &&
            venueCheckData.start_date === startDate &&
            venueCheckData.end_date === endDate && (
              <>
                {/* Venue Check Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl font-mono flex items-center gap-2">
                          <Eye className="h-5 w-5 text-[var(--color-accent-purple)]" />
                          Venue Coverage Check
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {venueCheckData.start_date} to {venueCheckData.end_date} • Deep scan of parquet files
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(venueCheckData.asset_groups).map(([catName, catData]) => {
                        const datesWithIssues = catData.dates_with_missing_venues.length;
                        const totalDates = catData.total_dates;
                        const isClean = datesWithIssues === 0;
                        const isExpanded = expandedCategories.has(catName);

                        return (
                          <div
                            key={catName}
                            className="border border-[var(--color-border-subtle)] rounded-lg overflow-hidden"
                          >
                            {/* Category Header */}
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategory(catName)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors h-auto"
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                                )}
                                <span className="font-medium">{catName}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {isClean ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]"
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    All venues present
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)]"
                                  >
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {datesWithIssues} / {totalDates} dates have missing venues
                                  </Badge>
                                )}
                              </div>
                            </Button>

                            {/* Expanded: Dates with missing venues */}
                            {isExpanded && datesWithIssues > 0 && (
                              <div className="bg-[var(--color-bg-secondary)] px-4 py-3 space-y-2">
                                {catData.dates_with_missing_venues.map((dateInfo) => {
                                  const dateKey = `${catName}-${dateInfo.date}`;
                                  const isDateExpanded = expandedDates.has(dateKey);

                                  return (
                                    <div
                                      key={dateInfo.date}
                                      className="border border-[var(--color-border-subtle)] rounded bg-[var(--color-bg-primary)]"
                                    >
                                      <Button
                                        variant="ghost"
                                        onClick={() => toggleDate(dateKey)}
                                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--color-bg-tertiary)] transition-colors h-auto"
                                      >
                                        <div className="flex items-center gap-2">
                                          {isDateExpanded ? (
                                            <ChevronDown className="h-3 w-3 text-[var(--color-text-muted)]" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />
                                          )}
                                          <Calendar className="h-3 w-3 text-[var(--color-text-muted)]" />
                                          <span className="font-mono text-sm">{dateInfo.date}</span>
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className="text-xs bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)]"
                                        >
                                          {dateInfo.missing.length} missing
                                        </Badge>
                                      </Button>

                                      {isDateExpanded && (
                                        <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)]">
                                          <div className="text-xs text-[var(--color-text-muted)] mb-2">
                                            Missing venues:
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {dateInfo.missing.map((venue) => (
                                              <Badge
                                                key={venue}
                                                variant="outline"
                                                className="text-xs font-mono bg-[var(--color-status-error-bg-subtle)] text-[var(--color-accent-red)] border-[var(--color-status-error-border)]"
                                              >
                                                {venue}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {isExpanded && datesWithIssues === 0 && (
                              <div className="bg-[var(--color-bg-secondary)] px-4 py-6 text-center">
                                <CheckCircle2 className="h-8 w-8 text-[var(--color-accent-green)] mx-auto mb-2" />
                                <p className="text-sm text-[var(--color-text-muted)]">
                                  All {totalDates} dates have complete venue coverage
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Deploy Missing from Venue Check */}
                    {Object.values(venueCheckData.asset_groups).some((c) => c.dates_with_missing_venues.length > 0) &&
                      onDeployMissing && (
                        <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)]">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                            <span className="text-sm">
                              Re-run dates with missing venues to regenerate parquet files
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={handleOpenDeployMissingModal}
                            className="bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80"
                          >
                            <Rocket className="h-4 w-4 mr-2" />
                            Re-deploy Affected Dates
                          </Button>
                        </div>
                      )}
                  </CardContent>
                </Card>

                {/* Calendar View for Venue Check Mode */}
                {viewMode === "calendar" && heatmapData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Coverage Calendar</CardTitle>
                      <CardDescription>Visual overview of venue coverage by day</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <HeatmapCalendar
                        data={heatmapData}
                        startDate={startDate}
                        endDate={endDate}
                        onDateClick={(date) => setSelectedCalendarDate(date)}
                        selectedDate={selectedCalendarDate || undefined}
                      />

                      {/* Selected Date Details */}
                      {selectedCalendarDate && (
                        <div className="mt-4 p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-default)]">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">
                              {new Date(selectedCalendarDate).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCalendarDate(null)}
                              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] h-auto p-0"
                            >
                              ✕ Close
                            </Button>
                          </div>
                          {heatmapData.find((d) => d.date === selectedCalendarDate)?.tooltip && (
                            <p className="text-sm text-[var(--color-text-secondary)]">
                              {heatmapData.find((d) => d.date === selectedCalendarDate)?.tooltip}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

          {/* Data Type Check Results */}
          {dataTypeCheckData &&
            checkDataTypes &&
            dataTypeCheckData.start_date === startDate &&
            dataTypeCheckData.end_date === endDate && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl font-mono flex items-center gap-2">
                          <Database className="h-5 w-5 text-[var(--color-accent-green)]" />
                          Data Type Validation
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {dataTypeCheckData.start_date} to {dataTypeCheckData.end_date} • Per data_type validation
                          (TRADFI)
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-3xl font-mono font-bold"
                          style={{
                            color: getCompletionColor(dataTypeCheckData.overall_completion),
                          }}
                        >
                          {dataTypeCheckData.overall_completion.toFixed(1)}%
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {dataTypeCheckData.overall_complete} / {dataTypeCheckData.overall_total} data_type × date
                          combinations
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Progress bar */}
                    <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden mb-6">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${dataTypeCheckData.overall_completion}%`,
                          backgroundColor: getCompletionColor(dataTypeCheckData.overall_completion),
                        }}
                      />
                    </div>

                    {/* Venue Breakdown with Data Types */}
                    <div className="space-y-3">
                      {dataTypeCheckData.venues &&
                        Object.entries(dataTypeCheckData.venues).map(([venueName, venueData]) => {
                          const isExpanded = expandedVenues.has(venueName);
                          const isComplete = venueData.completion_percent === 100;

                          return (
                            <div
                              key={venueName}
                              className="border border-[var(--color-border-subtle)] rounded-lg overflow-hidden"
                            >
                              <Button
                                variant="ghost"
                                onClick={() => toggleVenue(venueName)}
                                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors h-auto"
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                                  )}
                                  <span className="font-medium">{venueName}</span>
                                  <span className="text-xs text-[var(--color-text-muted)]">
                                    ({Object.keys(venueData.data_types || {}).length} data types)
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      isComplete
                                        ? "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]"
                                        : "bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)]",
                                    )}
                                  >
                                    {isComplete ? (
                                      <>
                                        <CheckCircle2 className="h-3 w-3 mr-1" />{" "}
                                        {venueData.completion_percent.toFixed(0)}%
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="h-3 w-3 mr-1" />{" "}
                                        {venueData.completion_percent.toFixed(0)}%
                                      </>
                                    )}
                                  </Badge>
                                  <span className="text-xs text-[var(--color-text-muted)] font-mono">
                                    {venueData.complete}/{venueData.total}
                                  </span>
                                </div>
                              </Button>

                              {/* Expanded: Data type breakdown */}
                              {isExpanded && venueData.data_types && (
                                <div className="bg-[var(--color-bg-secondary)] px-4 py-3">
                                  <div className="grid gap-2">
                                    {Object.entries(venueData.data_types).map(([dataType, typeData]) => {
                                      const typeComplete = typeData.completion_percent === 100;
                                      return (
                                        <div
                                          key={dataType}
                                          className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-subtle)]"
                                        >
                                          <div className="flex items-center gap-2">
                                            {typeComplete ? (
                                              <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
                                            ) : (
                                              <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                                            )}
                                            <span className="font-mono text-sm">{dataType}</span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span
                                              className="text-sm font-medium"
                                              style={{
                                                color: getCompletionColor(typeData.completion_percent),
                                              }}
                                            >
                                              {typeData.completion_percent.toFixed(0)}%
                                            </span>
                                            <span className="text-xs text-[var(--color-text-muted)] font-mono">
                                              {typeData.found}/{typeData.expected}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Expanded: Feature-FAMILY breakdown (Phase 8B
                              of features_repo_consolidation_2026_05_08.plan).
                              Prefer the API-rolled feature_families map; if
                              absent, group the flat feature_groups by their
                              embedded feature_family axis client-side. The
                              existing feature_groups block below stays as a
                              fallback for legacy / non-features rows. */}
                              {isExpanded &&
                                venueData.feature_families &&
                                Object.keys(venueData.feature_families || {}).length > 0 && (
                                  <FeatureFamilyBreakdown feature_families={venueData.feature_families} />
                                )}
                              {isExpanded &&
                                !venueData.feature_families &&
                                venueData.feature_groups &&
                                Object.values(venueData.feature_groups).some((fg) => Boolean(fg.feature_family)) && (
                                  <FeatureFamilyBreakdown
                                    feature_families={groupFeatureGroupsByFamily(venueData.feature_groups)}
                                  />
                                )}

                              {/* Expanded: Feature-group breakdown (features-* services).
                              Renders when feature_groups exist but no
                              feature_family axis is populated — preserves the
                              pre-Phase-8B view for legacy rows. */}
                              {isExpanded &&
                                venueData.feature_groups &&
                                Object.keys(venueData.feature_groups || {}).length > 0 &&
                                !venueData.feature_families &&
                                !Object.values(venueData.feature_groups).some((fg) => Boolean(fg.feature_family)) && (
                                  <div className="bg-[var(--color-bg-secondary)] px-4 py-3 border-t border-[var(--color-border-subtle)]">
                                    <div className="text-xs text-[var(--color-text-muted)] mb-2 font-semibold uppercase tracking-wide">
                                      Feature Groups
                                    </div>
                                    <div className="grid gap-2">
                                      {Object.entries(venueData.feature_groups || {}).map(([fgName, fgData]) => {
                                        const fgComplete = fgData.completion_pct === 100;
                                        return (
                                          <div
                                            key={fgName}
                                            className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-subtle)]"
                                          >
                                            <div className="flex items-center gap-2">
                                              {fgComplete ? (
                                                <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
                                              ) : (
                                                <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                                              )}
                                              <span className="font-mono text-sm">{fgName}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span
                                                className="text-sm font-medium"
                                                style={{
                                                  color: getCompletionColor(fgData.completion_pct),
                                                }}
                                              >
                                                {fgData.completion_pct.toFixed(0)}%
                                              </span>
                                              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                                                {fgData.dates_found}/{fgData.dates_expected}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                              {/* Expanded: Timeframe breakdown (features-* services). */}
                              {isExpanded &&
                                venueData.timeframes &&
                                Object.keys(venueData.timeframes || {}).length > 0 && (
                                  <div className="bg-[var(--color-bg-secondary)] px-4 py-3 border-t border-[var(--color-border-subtle)]">
                                    <div className="text-xs text-[var(--color-text-muted)] mb-2 font-semibold uppercase tracking-wide">
                                      Timeframes
                                    </div>
                                    <div className="grid gap-2">
                                      {Object.entries(venueData.timeframes || {}).map(([tfName, tfData]) => {
                                        const tfComplete = tfData.completion_pct === 100;
                                        return (
                                          <div
                                            key={tfName}
                                            className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-subtle)]"
                                          >
                                            <div className="flex items-center gap-2">
                                              {tfComplete ? (
                                                <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
                                              ) : (
                                                <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                                              )}
                                              <span className="font-mono text-sm">{tfName}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span
                                                className="text-sm font-medium"
                                                style={{
                                                  color: getCompletionColor(tfData.completion_pct),
                                                }}
                                              >
                                                {tfData.completion_pct.toFixed(0)}%
                                              </span>
                                              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                                                {tfData.dates_found}/{tfData.dates_expected}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Info about tick windows - TRADFI specific */}
                    <div className="mt-4 p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                      <p className="text-xs text-[var(--color-text-muted)]">
                        <strong>Tick Windows (TRADFI only):</strong> May 2023 and July 2024 expect 3 data types (trades,
                        ohlcv_1m, tbbo) for backtesting. Other dates expect only ohlcv_1m for cost optimization.
                        DEFI/CEFI always expect all data types.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

          {/* TURBO Mode Results (fast mode for market-tick-data-service) */}
          {/* Manifest secondary-axis filter banner — surfaces the active filter
          set from the BreakdownsAccordion so the operator can clear it.
          Phase 3 of data_status_multi_axis_shard_propagation. */}
          {manifestFilter && (
            <div
              className="rounded border border-[var(--color-accent-cyan)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs flex items-center justify-between gap-3"
              data-testid="manifest-filter-banner"
            >
              <span className="font-mono">
                <span className="text-[var(--color-text-muted)]">Filter active:</span>{" "}
                <strong>{manifestFilter.axis}</strong>
                <span className="text-[var(--color-text-muted)]">=</span>
                <strong>{manifestFilter.value}</strong>
                <span className="text-[var(--color-text-muted)] ml-2">· cell grid scoped to this value</span>
              </span>
              <button
                type="button"
                onClick={() => setManifestFilter(null)}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] hover:bg-[var(--color-bg-hover)]"
                data-testid="manifest-filter-clear"
              >
                Clear filter
              </button>
            </div>
          )}
          {turboData && turboData.date_range && !checkVenues && !checkDataTypes && (
            <>
              {/* Needs Attention — cross-cutting triage panel, ranked failures >
                  gaps > stale, ABOVE the per-category drilldown so the worst
                  problems are visible without expanding anything. */}
              <NeedsAttention items={needsAttentionItems} onSelect={handleNeedsAttentionSelect} />

              {/* Summary Card */}
              <Card ref={dataCoverageCardRef}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl font-mono flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Data Coverage
                        <Badge
                          variant="outline"
                          className="ml-2 bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]"
                        >
                          TURBO
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {turboData.date_range.start} to {turboData.date_range.end} ({turboData.date_range.days || "?"}{" "}
                        days)
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      {/* CAPTURED = could-exist cells that actually have data (the strict
                          "do we have the data" metric). Falls back to the legacy
                          overall_completion_pct (same value) until the backend field deploys. */}
                      <div
                        className="text-3xl font-mono font-bold"
                        style={{
                          color: getCompletionColor(
                            turboData.overall_capture_coverage_pct ?? turboData.overall_completion_pct,
                          ),
                        }}
                        title="Captured coverage — fraction of could-exist cells (genesis/launch-clipped) that actually have data."
                      >
                        {(turboData.overall_capture_coverage_pct ?? turboData.overall_completion_pct).toFixed(1)}%
                        <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">captured</span>
                      </div>
                      {/* ATTEMPTED = could-exist cells we have an HONEST answer for (data OR
                          confirmed-empty). empty_confirmed counts as covered here — this is the
                          "are we missing anything we should have" number. */}
                      {turboData.overall_attempt_coverage_pct != null && (
                        <div
                          className="text-sm font-mono text-[var(--color-text-muted)]"
                          title="Attempt coverage — could-exist cells we have an honest answer for (captured OR confirmed-empty). Empty confirmations count as covered."
                        >
                          {turboData.overall_attempt_coverage_pct.toFixed(1)}%
                          <span className="ml-1 text-xs font-normal">attempted</span>
                        </div>
                      )}
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {turboData.overall_shards_found ?? turboData.overall_dates_found} /{" "}
                        {turboData.overall_shards_expected ?? turboData.overall_dates_expected} shards
                      </div>
                      {turboData.overall_dates_found_asset_group !== undefined && (
                        <div className="text-xs text-[var(--color-text-muted)] opacity-70">
                          ({turboData.overall_dates_found_asset_group} / {turboData.overall_dates_expected_asset_group}{" "}
                          dates)
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Progress bar */}
                  <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${turboData.overall_completion_pct}%`,
                        backgroundColor: getCompletionColor(turboData.overall_completion_pct),
                      }}
                    />
                  </div>

                  {/* Deploy Missing Button - shows only expected missing (dates >= venue start) */}
                  {totalMissing > 0 && onDeployMissing && (
                    <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)]">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                        <span className="text-sm">
                          <strong>{totalMissing}</strong> missing shards
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleOpenDeployMissingModal}
                        className="bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80"
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy Missing
                      </Button>
                    </div>
                  )}

                  {/* All data complete message */}
                  {totalMissing === 0 && (
                    <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-[var(--color-status-success-bg)] border border-[var(--color-status-success-border)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)] mr-2" />
                      <span className="text-sm text-[var(--color-accent-green)]">All expected data present</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Categories Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Asset group breakdown</CardTitle>
                    {/* Phase C: scope to shards with failure_rate > 0 */}
                    <label
                      className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer"
                      data-testid="show-only-failures-label"
                    >
                      <Checkbox
                        id="show-only-failures"
                        data-testid="show-only-failures-toggle"
                        checked={showOnlyFailures}
                        onCheckedChange={(checked) => setShowOnlyFailures(checked === true)}
                      />
                      Show only failures
                    </label>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const allEntries = Object.entries(turboData.asset_groups || {});
                    const hasFailureData = allEntries.some(([, c]) => {
                      const fr = (c as { failure_rate?: number }).failure_rate;
                      return typeof fr === "number" && fr > 0;
                    });
                    const visibleEntries =
                      showOnlyFailures && hasFailureData
                        ? allEntries.filter(([, c]) => {
                            const fr = (c as { failure_rate?: number }).failure_rate;
                            return typeof fr === "number" && fr > 0;
                          })
                        : allEntries;
                    if (showOnlyFailures && hasFailureData && visibleEntries.length === 0) {
                      return (
                        <p
                          className="text-sm text-[var(--color-text-muted)] italic"
                          data-testid="show-only-failures-empty"
                        >
                          No shards with failures in the selected range.
                        </p>
                      );
                    }
                    if (showOnlyFailures && !hasFailureData) {
                      return (
                        <p
                          className="text-xs text-[var(--color-text-muted)] italic mb-3"
                          data-testid="show-only-failures-no-data"
                        >
                          No failure_rate data yet — showing all categories. Phase B adapters emit ADAPTER_FETCH_FAILED
                          rows into the manifest.
                        </p>
                      );
                    }
                    return null;
                  })()}
                  <div className="space-y-4">
                    {Object.entries(turboData.asset_groups || {})
                      .filter(([, catData]) => {
                        if (!showOnlyFailures) return true;
                        const fr = (catData as { failure_rate?: number }).failure_rate;
                        // When no failure data exists anywhere, preserve the full
                        // list so the user isn't staring at an empty page.
                        const anyFailures = Object.values(turboData.asset_groups || {}).some((c) => {
                          const f = (c as { failure_rate?: number }).failure_rate;
                          return typeof f === "number" && f > 0;
                        });
                        if (!anyFailures) return true;
                        return typeof fr === "number" && fr > 0;
                      })
                      .map(([catName, catData]) => {
                        const isComplete = catData.completion_pct >= 100;

                        return (
                          <div key={catName} className="space-y-2">
                            <div
                              className="flex items-center justify-between cursor-pointer hover:bg-[var(--color-bg-secondary)] rounded px-1 -mx-1 transition-colors"
                              onClick={() => setSelectedCategories([catName])}
                              title={`Filter to ${catName}`}
                            >
                              <div className="flex items-center gap-2">
                                {isComplete ? (
                                  <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
                                ) : catData.error ? (
                                  <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                                ) : (
                                  <Database className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                                )}
                                <span className="font-medium">{catName}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {catData.error ? (
                                  <span className="text-sm text-[var(--color-accent-red)]">{catData.error}</span>
                                ) : catData.coverage_semantics === "event_driven" ? (
                                  (() => {
                                    const eventLabel = formatEventDrivenCoverageLabel(
                                      catData.attempt_coverage_pct,
                                      catData.capture_coverage_pct,
                                      catData.empty_rate_estimate ?? null,
                                    );
                                    return (
                                      <>
                                        <span className="text-sm text-[var(--color-text-muted)]">
                                          {catData.overall_shards_found ??
                                            catData.venue_dates_found ??
                                            catData.dates_found}{" "}
                                          /{" "}
                                          {catData.overall_shards_expected ??
                                            catData.venue_dates_expected ??
                                            catData.dates_expected}{" "}
                                          shards
                                        </span>
                                        <span
                                          className="text-sm font-mono font-medium"
                                          style={{
                                            // Event-driven row colour follows
                                            // captured% (real data on disk),
                                            // not attempted%. Pre-2026-04-29
                                            // this used completion_pct which
                                            // for SPORTS aliases to attempted%
                                            // and made the row look healthier
                                            // than reality.
                                            color: getCompletionColor(
                                              catData.capture_coverage_pct ?? catData.completion_pct,
                                            ),
                                          }}
                                          title={eventLabel.tooltip}
                                          data-testid={`event-driven-label-${catName}`}
                                        >
                                          {eventLabel.text}
                                        </span>
                                      </>
                                    );
                                  })()
                                ) : (
                                  <>
                                    <span className="text-sm text-[var(--color-text-muted)]">
                                      {catData.overall_shards_found ?? catData.venue_dates_found ?? catData.dates_found}{" "}
                                      /{" "}
                                      {catData.overall_shards_expected ??
                                        catData.venue_dates_expected ??
                                        catData.dates_expected}{" "}
                                      shards
                                    </span>
                                    <span
                                      className="text-sm font-mono font-medium"
                                      style={{
                                        color: getCompletionColor(catData.completion_pct),
                                      }}
                                    >
                                      {catData.completion_pct.toFixed(1)}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            {!catData.error && (
                              <div className="h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                                <div
                                  className="h-full transition-all duration-500"
                                  style={{
                                    // Bar reflects captured% (real data) for
                                    // event-driven categories so the visual
                                    // matches the headline. Dense categories
                                    // fall through to completion_pct since
                                    // captured == attempted there.
                                    width: `${
                                      catData.coverage_semantics === "event_driven"
                                        ? (catData.capture_coverage_pct ?? catData.completion_pct)
                                        : catData.completion_pct
                                    }%`,
                                    backgroundColor: getCompletionColor(
                                      catData.coverage_semantics === "event_driven"
                                        ? (catData.capture_coverage_pct ?? catData.completion_pct)
                                        : catData.completion_pct,
                                    ),
                                  }}
                                />
                              </div>
                            )}
                            {catData.dates_missing > 0 && !catData.error && !catData.bulk_service && (
                              <p className="text-xs text-[var(--color-text-muted)]">
                                {catData.dates_missing} date
                                {catData.dates_missing !== 1 ? "s" : ""} missing
                                {Array.isArray(catData.missing_dates) && catData.missing_dates.length > 0 && (
                                  <span className="ml-1">
                                    (e.g., {catData.missing_dates.slice(0, 3).join(", ")}
                                    {catData.missing_dates.length > 3 ? "..." : ""})
                                  </span>
                                )}
                              </p>
                            )}
                            {catData.bulk_service && (
                              <p className="text-xs text-[var(--color-text-muted)] italic">
                                Bulk download service — {catData.dates_found} of {catData.dates_expected} dates have
                                data.
                                {catData.dates_missing > 0 && " Run the service to populate all dates."}
                              </p>
                            )}

                            {/* Category-level date dropdowns (for services without sub-dimensions) */}
                            {!getSubDimensionData(catData).data && !catData.error && (
                              <div className="flex gap-4 mt-2">
                                {/* Available dates dropdown (green) */}
                                {catData.dates_found_list && catData.dates_found_list.length > 0 && (
                                  <details className="flex-1">
                                    <summary className="text-xs text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                      {catData.dates_found ?? catData.dates_found_list.length} available shards
                                    </summary>
                                    <div className="mt-1 pl-2 border-l-2 border-[var(--color-status-success-border-strong)]">
                                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                        {catData.dates_found_list?.map((date: string) => (
                                          <span
                                            key={date}
                                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)]"
                                          >
                                            {date}
                                          </span>
                                        ))}
                                        {catData.dates_found_truncated && (
                                          <>
                                            <span className="text-[9px] text-[var(--color-text-muted)]">...</span>
                                            {catData.dates_found_list_tail?.map((date: string) => (
                                              <span
                                                key={date}
                                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)]"
                                              >
                                                {date}
                                              </span>
                                            ))}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </details>
                                )}
                                {/* Missing dates dropdown (red) */}
                                {catData.dates_missing_list && catData.dates_missing_list.length > 0 && (
                                  <details className="flex-1">
                                    <summary className="text-xs text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                      {catData.dates_missing ?? catData.dates_missing_list.length} missing shards
                                    </summary>
                                    <div className="mt-1 pl-2 border-l-2 border-[var(--color-status-error-border-strong)]">
                                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                        {catData.dates_missing_list?.map((date: string) => (
                                          <span
                                            key={date}
                                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
                                          >
                                            {date}
                                          </span>
                                        ))}
                                        {catData.dates_missing_truncated && (
                                          <>
                                            <span className="text-[9px] text-[var(--color-text-muted)]">...</span>
                                            {catData.dates_missing_list_tail?.map((date: string) => (
                                              <span
                                                key={date}
                                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
                                              >
                                                {date}
                                              </span>
                                            ))}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}

                            {/* Sub-dimension breakdown (venues, data_types, feature_groups, strategies, models, etc.) */}
                            {getSubDimensionData(catData).data && (
                              <div className="mt-3 pl-6 space-y-3 border-l-2 border-[var(--color-border)]">
                                {/* Folders/Instrument Types section - own bordered container */}
                                {catData.folders && Object.keys(catData.folders).length > 0 && (
                                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                                    <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">
                                      Instrument Types (Folders)
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                      {Object.entries(catData.folders).map(([folderName, folderData]) => (
                                        <div key={folderName} className="bg-[var(--color-bg-tertiary)] rounded p-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-mono truncate" title={folderName}>
                                              {folderName}
                                            </span>
                                            <span
                                              className="text-xs font-mono font-medium ml-1"
                                              style={{
                                                color: getCompletionColor(folderData.completion_pct),
                                              }}
                                            >
                                              {folderData.completion_pct.toFixed(0)}%
                                            </span>
                                          </div>
                                          <div className="h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden mt-1">
                                            <div
                                              className="h-full"
                                              style={{
                                                width: `${folderData.completion_pct}%`,
                                                backgroundColor: getCompletionColor(folderData.completion_pct),
                                              }}
                                            />
                                          </div>
                                          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                            {folderData.dates_found}/{folderData.dates_expected} shards
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Chain breakdown for DeFi (v4) — replaces flat venue list. PREDICTION uses the same chains structure but labels it "Venues" since Polymarket/Kalshi are venues, not chains */}
                                {catData.chains && Object.keys(catData.chains).length > 0 && (
                                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                                    <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">
                                      {catName === "PREDICTION" ? "Venues" : "Chains"}
                                    </p>
                                    <div className="space-y-0.5">
                                      {Object.entries(catData.chains).map(([chainName, chainData]) => {
                                        const cd = chainData as {
                                          dates_found: number;
                                          dates_expected: number;
                                          completion_pct: number;
                                          venues: string[];
                                          venue_count: number;
                                          shards_found?: number;
                                          shards_expected?: number;
                                        };
                                        // Get per-venue data for venues in this chain
                                        const venueData = getSubDimensionData(catData).data || {};
                                        return (
                                          <details key={chainName} className="group/chain">
                                            <summary className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                              <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/chain:rotate-90" />
                                              <span className="text-xs font-mono font-medium">{chainName}</span>
                                              <span className="text-[9px] text-[var(--color-text-muted)]">
                                                ({cd.venue_count} protocols)
                                              </span>
                                              <div className="flex-1" />
                                              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                {cd.shards_found ?? cd.dates_found}/
                                                {cd.shards_expected ?? cd.dates_expected}
                                              </span>
                                              <div className="w-16 h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                                                <div
                                                  className="h-full"
                                                  style={{
                                                    width: `${cd.completion_pct}%`,
                                                    backgroundColor: getCompletionColor(cd.completion_pct),
                                                  }}
                                                />
                                              </div>
                                              <span
                                                className="text-xs font-mono font-medium w-10 text-right"
                                                style={{
                                                  color: getCompletionColor(cd.completion_pct),
                                                }}
                                              >
                                                {formatPct(cd.completion_pct)}%
                                              </span>
                                            </summary>
                                            <div className="ml-5 pl-3 border-l-2 border-[var(--color-border-subtle)] py-1 space-y-0.5">
                                              {cd.venues.map((v: string) => {
                                                const vd = venueData[v];
                                                if (!vd) {
                                                  return (
                                                    <div key={v} className="flex items-center gap-2 py-0.5 px-1.5">
                                                      <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                                                        {v}
                                                      </span>
                                                    </div>
                                                  );
                                                }
                                                const vdTyped = vd as TurboSubDimension;
                                                // ``v`` is the composite "<PROTOCOL>-<CHAIN>" (e.g.
                                                // ``EIGENLAYER-ETHEREUM``). We strip the trailing
                                                // ``-{chainName}`` to recover the protocol — the
                                                // /api/data-status/pools/breakdown endpoint expects
                                                // ``venue`` (protocol) + ``chain`` separately.
                                                const defiProtocol = v.endsWith(`-${chainName}`)
                                                  ? v.slice(0, v.length - chainName.length - 1)
                                                  : v;
                                                // Pick the most-recent day with data — last entry of
                                                // ``dates_found_list_tail`` (most-recent slice) or
                                                // ``dates_found_list``. Falls back to undefined when
                                                // the venue has zero captured days; the button is
                                                // hidden in that case.
                                                const defiPoolsDay =
                                                  vdTyped.dates_found_list_tail?.[
                                                    (vdTyped.dates_found_list_tail?.length ?? 0) - 1
                                                  ] ??
                                                  vdTyped.dates_found_list?.[
                                                    (vdTyped.dates_found_list?.length ?? 0) - 1
                                                  ];
                                                return (
                                                  <details key={v} className="group/cv">
                                                    <summary className="flex items-center gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                                      <ChevronRight className="h-2.5 w-2.5 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/cv:rotate-90" />
                                                      <span className="text-[10px] font-mono">{v}</span>
                                                      {vdTyped.venue_start_date && (
                                                        <span
                                                          className="text-[8px] text-[var(--color-text-muted)] opacity-70 hidden sm:inline"
                                                          title={`Data starts: ${vdTyped.venue_start_date}`}
                                                        >
                                                          from {String(vdTyped.venue_start_date).substring(0, 7)}
                                                        </span>
                                                      )}
                                                      <div className="flex-1" />
                                                      <span className="text-[9px] text-[var(--color-text-muted)] font-mono">
                                                        {vdTyped.dates_found}/
                                                        {vdTyped.dates_expected_venue || vdTyped.dates_expected}
                                                      </span>
                                                      <div className="w-10 h-1 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                                                        <div
                                                          className="h-full"
                                                          style={{
                                                            width: `${vdTyped.completion_pct}%`,
                                                            backgroundColor: getCompletionColor(vdTyped.completion_pct),
                                                          }}
                                                        />
                                                      </div>
                                                      <span
                                                        className="text-[9px] font-mono w-8 text-right"
                                                        style={{
                                                          color: getCompletionColor(vdTyped.completion_pct),
                                                        }}
                                                      >
                                                        {formatPct(vdTyped.completion_pct)}%
                                                      </span>
                                                      {defiPoolsDay && (
                                                        <button
                                                          type="button"
                                                          className="text-[9px] text-[var(--color-accent-cyan)] hover:underline shrink-0"
                                                          title={`View per-pool coverage breakdown for ${v} on ${defiPoolsDay}`}
                                                          data-testid={`defi-pools-button-${v}`}
                                                          onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setPoolBreakdownModal({
                                                              venue: defiProtocol,
                                                              chain: chainName,
                                                              day: defiPoolsDay,
                                                            });
                                                          }}
                                                        >
                                                          breakdown
                                                        </button>
                                                      )}
                                                    </summary>
                                                    <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5 space-y-1">
                                                      {/* Data types breakdown */}
                                                      {vdTyped.data_types &&
                                                        Object.keys(vdTyped.data_types).length > 0 && (
                                                          <div className="space-y-0.5">
                                                            {Object.entries(vdTyped.data_types).map(
                                                              ([dtName, dtData]) => (
                                                                <div
                                                                  key={dtName}
                                                                  className="flex items-center gap-2 py-0.5 px-1"
                                                                >
                                                                  <span
                                                                    className="text-[9px] font-mono"
                                                                    style={{
                                                                      color: getCompletionColor(dtData.completion_pct),
                                                                    }}
                                                                  >
                                                                    {dtName}
                                                                  </span>
                                                                  <div className="flex-1" />
                                                                  <span className="text-[8px] text-[var(--color-text-muted)] font-mono">
                                                                    {dtData.dates_found}/{dtData.dates_expected}
                                                                  </span>
                                                                  <span
                                                                    className="text-[8px] font-mono w-7 text-right"
                                                                    style={{
                                                                      color: getCompletionColor(dtData.completion_pct),
                                                                    }}
                                                                  >
                                                                    {formatPct(dtData.completion_pct)}%
                                                                  </span>
                                                                </div>
                                                              ),
                                                            )}
                                                          </div>
                                                        )}
                                                      {/* Available / missing dates — clickable for DeFi chain→protocol. */}
                                                      {(() => {
                                                        const cvFoundList: string[] = vdTyped.dates_found_list ?? [];
                                                        const cvMissingList: string[] =
                                                          vdTyped.missing_dates ?? vdTyped.dates_missing_list ?? [];
                                                        const cvMissingCount =
                                                          vdTyped.dates_missing ?? cvMissingList.length;
                                                        if (cvFoundList.length === 0 && cvMissingList.length === 0)
                                                          return null;
                                                        // For DeFi the composite venue is "<PROTOCOL>-<CHAIN>" (e.g. AAVE_V3-ETHEREUM).
                                                        // We reach this branch under catData.chains → protocol tree so ``v`` is the
                                                        // composite. ``data_type`` is the first known data_type for this protocol;
                                                        // ``instrument_type`` is left as ``"AUTO"`` so the deployment-api resolves
                                                        // it from the UAC SchemaContract registry (the click site doesn't have
                                                        // ``instrument_type`` in scope, only ``data_type``).
                                                        const firstDt = vdTyped.data_types
                                                          ? Object.keys(vdTyped.data_types)[0]
                                                          : undefined;
                                                        const dataTypeHint =
                                                          firstDt ??
                                                          (serviceName === "instruments-service"
                                                            ? "INSTRUMENTS"
                                                            : "AUTO_DETECT_FAIL");
                                                        const makeOnClick = (date: string) => () =>
                                                          openShardDetail({
                                                            service: serviceName,
                                                            asset_group: catName,
                                                            instrument_type: "AUTO",
                                                            data_type: dataTypeHint,
                                                            day: date,
                                                            venue: v,
                                                          });
                                                        return (
                                                          <div className="flex gap-3 pt-0.5 border-t border-[var(--color-border-subtle)]">
                                                            {cvFoundList.length > 0 && (
                                                              <details>
                                                                <summary className="text-[8px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                                  {vdTyped.dates_found} available dates
                                                                </summary>
                                                                <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-24 overflow-y-auto">
                                                                  <DateList
                                                                    dates={cvFoundList}
                                                                    btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:brightness-110 focus:outline-none"
                                                                    testIdPrefix={`defi-date-found-${v}`}
                                                                    onClickDate={makeOnClick}
                                                                    downloadUrl={(date) =>
                                                                      buildShardDownloadUrl({
                                                                        service: serviceName,
                                                                        asset_group: catName,
                                                                        venue: v,
                                                                        date,
                                                                        data_type:
                                                                          dataTypeHint !== "AUTO_DETECT_FAIL"
                                                                            ? dataTypeHint
                                                                            : undefined,
                                                                      })
                                                                    }
                                                                    downloadTitle={(date) =>
                                                                      `Download manifest catalog CSV for ${v} on ${date}`
                                                                    }
                                                                  />
                                                                  {vdTyped.dates_found > cvFoundList.length && (
                                                                    <span className="text-[7px] text-[var(--color-text-muted)]">
                                                                      +{vdTyped.dates_found - cvFoundList.length} more
                                                                    </span>
                                                                  )}
                                                                </div>
                                                              </details>
                                                            )}
                                                            {cvMissingList.length > 0 && (
                                                              <details>
                                                                <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                  {cvMissingCount} missing dates
                                                                </summary>
                                                                <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-24 overflow-y-auto">
                                                                  <DateList
                                                                    dates={cvMissingList}
                                                                    btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                                    testIdPrefix={`defi-date-missing-${v}`}
                                                                    onClickDate={makeOnClick}
                                                                  />
                                                                  {cvMissingCount > cvMissingList.length && (
                                                                    <span className="text-[7px] text-[var(--color-text-muted)]">
                                                                      +{cvMissingCount - cvMissingList.length} more
                                                                    </span>
                                                                  )}
                                                                </div>
                                                              </details>
                                                            )}
                                                          </div>
                                                        );
                                                      })()}
                                                      {/* Instrument breakdown link — renders inline under this protocol */}
                                                      <div className="pt-0.5">
                                                        <span
                                                          className="text-[8px] text-[var(--color-accent-cyan)] cursor-pointer hover:underline"
                                                          onClick={() => handleVenueClick(catName, v)}
                                                          data-testid={`defi-instrument-breakdown-toggle-${v}`}
                                                        >
                                                          Instrument breakdown
                                                        </span>
                                                      </div>
                                                      {venueDetailKey === `${catName}:${v}` && (
                                                        <div className="mt-1">
                                                          <VenueDetailPanel
                                                            loading={venueDetailLoading}
                                                            data={venueDetailData}
                                                          />
                                                        </div>
                                                      )}
                                                    </div>
                                                  </details>
                                                );
                                              })}
                                            </div>
                                          </details>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Prediction 3-level hierarchical drill-down:
                                    canonical_question_group → cadence → day.
                                    Replaces the flat "Markets" data_type list for PREDICTION.
                                    Per-shard parquet download and Deploy-Missing wired via
                                    HierarchicalShardDrilldown leaf controls.
                                    Matches the sports + tradfi hierarchical pattern. */}
                                {isPredictionCqgAxis(catData) && (
                                  <div
                                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
                                    data-testid="prediction-hierarchical-drilldown"
                                  >
                                    <LazyDrilldownDetails
                                      service={serviceName}
                                      assetGroup={catName.toLowerCase()}
                                      startDate={startDate}
                                      endDate={endDate}
                                      className=""
                                      summaryLabel="Hierarchical drill-down (canonical_question_group → cadence → day)"
                                      summaryClassName="text-[10px] text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)] uppercase tracking-wide font-medium"
                                      onOpenLeafSchema={setLeafSchemaCoord}
                                    />
                                  </div>
                                )}

                                {/* Feature group breakdown (v4) */}
                                {catData.feature_groups && Object.keys(catData.feature_groups).length > 0 && (
                                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                                    <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">
                                      Feature Groups
                                    </p>
                                    <div className="space-y-0.5">
                                      {Object.entries(catData.feature_groups).map(([fgName, fgData]) => {
                                        const fg = fgData as {
                                          dates_found: number;
                                          dates_expected: number;
                                          completion_pct: number;
                                          timeframes?: Record<
                                            string,
                                            {
                                              dates_found: number;
                                              dates_expected: number;
                                              completion_pct: number;
                                            }
                                          >;
                                        };
                                        return (
                                          <details key={fgName} className="group/fg">
                                            <summary className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                              <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/fg:rotate-90" />
                                              <span className="text-xs font-mono">{fgName}</span>
                                              <div className="flex-1" />
                                              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                {fg.dates_found}/{fg.dates_expected}
                                              </span>
                                              <div className="w-16 h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                                                <div
                                                  className="h-full"
                                                  style={{
                                                    width: `${fg.completion_pct}%`,
                                                    backgroundColor: getCompletionColor(fg.completion_pct),
                                                  }}
                                                />
                                              </div>
                                              <span
                                                className="text-xs font-mono font-medium w-10 text-right"
                                                style={{
                                                  color: getCompletionColor(fg.completion_pct),
                                                }}
                                              >
                                                {formatPct(fg.completion_pct)}%
                                              </span>
                                            </summary>
                                            {fg.timeframes && Object.keys(fg.timeframes).length > 0 && (
                                              <div className="ml-5 pl-3 border-l border-[var(--color-border-subtle)] py-1 space-y-0.5">
                                                {Object.entries(fg.timeframes).map(([tf, tfData]) => (
                                                  <div key={tf} className="flex items-center gap-2 py-0.5 px-1.5">
                                                    <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                                                      {tf}
                                                    </span>
                                                    <div className="flex-1" />
                                                    <span className="text-[9px] text-[var(--color-text-muted)] font-mono">
                                                      {tfData.dates_found}/{tfData.dates_expected}
                                                    </span>
                                                    <div className="w-12 h-1 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                                                      <div
                                                        className="h-full"
                                                        style={{
                                                          width: `${tfData.completion_pct}%`,
                                                          backgroundColor: getCompletionColor(tfData.completion_pct),
                                                        }}
                                                      />
                                                    </div>
                                                    <span
                                                      className="text-[9px] font-mono w-8 text-right"
                                                      style={{
                                                        color: getCompletionColor(tfData.completion_pct),
                                                      }}
                                                    >
                                                      {formatPct(tfData.completion_pct)}%
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </details>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Sub-dimension section - own bordered container. Hidden only when chains
                                    are present AND fully cover every venue (e.g. DeFi, where ~every venue has
                                    an on-chain home) — otherwise chains are additive, not a replacement, or a
                                    mixed category like CEFI (2 on-chain CLOB venues out of 24) silently drops
                                    every non-chain venue from this card. Found 2026-07-07 via a live UI check. */}
                                {getUncoveredVenueNames(catData).length > 0 && (
                                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide">
                                        {getSubDimensionData(catData).label}
                                      </p>
                                      {/* Venue Summary Badges */}
                                      {catData.venue_summary && (
                                        <div className="flex items-center gap-2 text-xs">
                                          {catData.venue_summary.expected_coverage_pct === 100 ? (
                                            <Badge
                                              variant="outline"
                                              className="bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]"
                                            >
                                              <CheckCircle2 className="h-3 w-3 mr-1" />
                                              All {catData.venue_summary.expected_count} expected
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="outline"
                                              className="bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)] cursor-help"
                                              title={`Missing: ${catData.venue_summary.expected_but_missing.join(", ")}`}
                                            >
                                              <XCircle className="h-3 w-3 mr-1" />
                                              {catData.venue_summary.expected_but_missing.length} expected missing
                                            </Badge>
                                          )}
                                          {catData.venue_summary.unexpected_but_found.length > 0 && (
                                            <Badge
                                              variant="outline"
                                              className="bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border-[var(--color-status-warning-border)]"
                                            >
                                              +{catData.venue_summary.unexpected_but_found.length} bonus
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {/* Show missing venues inline */}
                                    {catData.venue_summary && catData.venue_summary.expected_but_missing.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                                          Missing:
                                        </span>
                                        {catData.venue_summary.expected_but_missing.map((venue: string) => (
                                          <span
                                            key={venue}
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg-alt)] text-[var(--color-accent-red)] border border-[var(--color-status-error-border-strong)]"
                                          >
                                            {venue}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    <div className="space-y-0.5">
                                      {(() => {
                                        const uncovered = new Set(getUncoveredVenueNames(catData));
                                        return Object.entries(getSubDimensionData(catData).data || {}).filter(
                                          ([name]) => uncovered.has(name),
                                        );
                                      })().map(([name, subData]) => {
                                        const expectedDates = subData.dates_expected_venue || subData.dates_expected;
                                        const venueStartDate = subData.venue_start_date;
                                        const foundList = subData.dates_found_list ?? [];
                                        const missingList = subData.missing_dates ?? subData.dates_missing_list ?? [];
                                        const missingCount =
                                          subData.dates_missing ?? subData.dates_missing_count ?? missingList.length;
                                        const hasDataTypes =
                                          subData.data_types && Object.keys(subData.data_types).length > 0;
                                        const hasInstrumentTypes =
                                          subData.instrument_types && Object.keys(subData.instrument_types).length > 0;
                                        const hasLeagues = subData.leagues && Object.keys(subData.leagues).length > 0;
                                        // MTDS honest-coverage — deployment-api's `_apply_mtds_honest_coverage`
                                        // emits `missing_data_types` / `expected_data_types` / `honest_data_types`
                                        // per venue. These are UAC-declared data types this venue should
                                        // publish but where we observed zero shards, independent of day-level
                                        // coverage. Absent for non-MTDS services.
                                        const missingDataTypes = subData.missing_data_types ?? [];
                                        const expectedDataTypes = subData.expected_data_types ?? [];
                                        const honestDataTypes = subData.honest_data_types ?? {};
                                        const honestDataTypeEntries = Object.entries(honestDataTypes);
                                        const hasMissingDataTypes = missingDataTypes.length > 0;
                                        const hasHonestDataTypes = honestDataTypeEntries.length > 0;
                                        // Phase-1 four-state aggregation across this venue's data_types
                                        // (deployment-api commit c73c732). Blocked-on-raw counts are
                                        // non-actionable for this row (the fix is upstream raw); the
                                        // out-of-scope flag lets us gray rows where every dt is
                                        // EXPECTED_COVERAGE-omitted (e.g. NASDAQ trades on TradFi).
                                        const dtEntries = Object.entries(subData.data_types ?? {});
                                        const blockedOnRawTotal = dtEntries.reduce(
                                          (acc, [, dt]) => acc + (dt.dates_blocked_on_raw ?? 0),
                                          0,
                                        );
                                        // OTHER is a legitimate catch-all bucket for PREDICTION CQG axis — never
                                        // treat it as out-of-scope even if the backend marks its inner
                                        // data_types as out_of_scope (it IS in scope by design).
                                        const allOutOfScope =
                                          dtEntries.length > 0 &&
                                          dtEntries.every(([, dt]) => dt.out_of_scope === true) &&
                                          !(isPredictionCqgAxis(catData) && name === "OTHER");
                                        const hasBlockedOnRaw = blockedOnRawTotal > 0;

                                        return (
                                          <details
                                            key={name}
                                            className="group/venue rounded bg-[var(--color-bg-tertiary)]"
                                          >
                                            <summary
                                              className={cn(
                                                "flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors select-none list-none [&::-webkit-details-marker]:hidden",
                                                subData.status === "bonus" &&
                                                  "opacity-60 border border-dashed border-[var(--color-border)]",
                                                allOutOfScope && "opacity-50 grayscale",
                                              )}
                                            >
                                              <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/venue:rotate-90" />
                                              <span
                                                className="text-xs font-mono truncate min-w-0"
                                                title={
                                                  isPredictionCqgAxis(catData) && name === "OTHER"
                                                    ? "Markets not yet mapped to a curated canonical question group — review event stream + promote recurring patterns to first-class groups."
                                                    : name
                                                }
                                              >
                                                {name}
                                              </span>
                                              {subData.status === "bonus" && (
                                                <span className="text-[9px] text-[var(--color-accent-amber)] font-medium shrink-0">
                                                  bonus
                                                </span>
                                              )}
                                              {allOutOfScope && (
                                                <span
                                                  className="text-[9px] font-medium shrink-0 px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                                                  title="Not in EXPECTED_COVERAGE_BY_ASSET_GROUP — excluded from denominator"
                                                  data-testid="out-of-scope-badge"
                                                >
                                                  out of scope
                                                </span>
                                              )}
                                              {hasMissingDataTypes && (
                                                <span
                                                  className="text-[9px] font-medium shrink-0 px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border border-[var(--color-status-error-border-strong)]"
                                                  title={`Missing (UAC-declared but zero shards found): ${missingDataTypes.join(", ")}`}
                                                  data-testid="missing-data-types-badge"
                                                >
                                                  {missingDataTypes.length} data{" "}
                                                  {missingDataTypes.length === 1 ? "type" : "types"} missing
                                                </span>
                                              )}
                                              {hasBlockedOnRaw && (
                                                <span
                                                  className="text-[9px] font-medium shrink-0 px-1.5 py-0.5 rounded bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border border-[var(--color-status-warning-border-strong)]"
                                                  title="Processed shards absent because the underlying raw shard is also absent — fix raw upstream first"
                                                  data-testid="blocked-on-raw-badge"
                                                >
                                                  {blockedOnRawTotal} blocked on raw
                                                </span>
                                              )}
                                              {/* Writegate Phase 4.B — typed-reason badges (failure_pillars +
                                                empty_reasons closed taxonomies) + failure-pillar stacked
                                                bar. Both auto-suppress when every count is zero so the
                                                summary line stays compact for healthy venues. Click on a
                                                badge mounts the LeafSchemaModal for the venue's
                                                representative leaf parquet (most-recent captured day,
                                                first data_type, AUTO instrument_type — deployment-api's
                                                /leaf-stats resolves via _gcs_path_for_shard). */}
                                              <TypedReasonBadges
                                                emptyReasons={subData.empty_reasons}
                                                failurePillars={subData.failure_pillars}
                                                testIdPrefix={`venue-${name}`}
                                                onBadgeClick={() => {
                                                  const firstDt = subData.data_types
                                                    ? Object.keys(subData.data_types)[0]
                                                    : undefined;
                                                  const anchorDay =
                                                    foundList.length > 0 ? foundList[foundList.length - 1] : null;
                                                  if (!firstDt || !anchorDay) return;
                                                  setLeafSchemaCoord({
                                                    service: serviceName,
                                                    asset_group: catName,
                                                    instrument_type: "AUTO",
                                                    data_type: firstDt,
                                                    day: anchorDay,
                                                    venue: name,
                                                  });
                                                }}
                                              />
                                              <FailurePillarStack
                                                failurePillars={subData.failure_pillars}
                                                testIdPrefix={`venue-${name}`}
                                              />
                                              {/* Bucket counts annotation — Polymarket-style venues with named + OTHER buckets */}
                                              {(() => {
                                                const firstDt =
                                                  subData.data_types && Object.keys(subData.data_types)[0];
                                                const anchorDay =
                                                  (foundList.length > 0 ? foundList[foundList.length - 1] : null) ??
                                                  null;
                                                if (!firstDt || !anchorDay) return null;
                                                return (
                                                  <BucketCountsBadge
                                                    service={serviceName}
                                                    asset_group={catName}
                                                    venue={name}
                                                    day={anchorDay}
                                                    data_type={firstDt}
                                                  />
                                                );
                                              })()}
                                              {/* Prediction v9 source badge — shown for cqg-axis entries */}
                                              {isPredictionCqgAxis(catData) && subData.source && (
                                                <span
                                                  className="text-[8px] font-mono px-1 py-px rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] shrink-0"
                                                  title={`Source API: ${subData.source}`}
                                                  data-testid="prediction-cqg-row-source"
                                                >
                                                  {subData.source}
                                                </span>
                                              )}
                                              <div className="flex-1" />
                                              <div className="flex items-center gap-2 shrink-0">
                                                {venueStartDate && (
                                                  <span
                                                    className="text-[9px] text-[var(--color-text-muted)] opacity-70 hidden sm:inline"
                                                    title={`Data starts: ${venueStartDate}`}
                                                  >
                                                    from {venueStartDate.substring(0, 7)}
                                                  </span>
                                                )}
                                                {(() => {
                                                  const isRate = isRateMetricRow(subData.dates_found, expectedDates);
                                                  if (isRate) {
                                                    // Numerator is row count; denominator is day count.
                                                    // Show rate-per-day instead of a bogus 100% bar.
                                                    return (
                                                      <>
                                                        <span
                                                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                                                          title={`${subData.dates_found} rows across ${expectedDates} days — rate metric, not a coverage percentage`}
                                                        >
                                                          {subData.dates_found.toLocaleString()} rows / {expectedDates}{" "}
                                                          days
                                                        </span>
                                                        <div
                                                          className="w-16 h-1.5 rounded-full overflow-hidden"
                                                          style={{
                                                            backgroundImage:
                                                              "repeating-linear-gradient(45deg, var(--color-bg-secondary) 0 4px, var(--color-border-subtle) 4px 8px)",
                                                          }}
                                                          data-rate-metric="true"
                                                        />
                                                        <span
                                                          className="text-xs font-mono font-medium w-14 text-right"
                                                          style={{
                                                            color: getRateMetricColor(),
                                                          }}
                                                          data-rate-metric="true"
                                                        >
                                                          {formatRatePerDay(subData.dates_found, expectedDates)}
                                                        </span>
                                                      </>
                                                    );
                                                  }
                                                  return (
                                                    <>
                                                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                        {subData.dates_found}/{expectedDates}
                                                      </span>
                                                      <div className="w-16 h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                                                        <div
                                                          className="h-full"
                                                          style={{
                                                            width: `${subData.completion_pct}%`,
                                                            backgroundColor: getCompletionColor(subData.completion_pct),
                                                          }}
                                                        />
                                                      </div>
                                                      <span
                                                        className="text-xs font-mono font-medium w-10 text-right"
                                                        style={{
                                                          color: getCompletionColor(subData.completion_pct),
                                                        }}
                                                      >
                                                        {formatPct(subData.completion_pct)}%
                                                      </span>
                                                    </>
                                                  );
                                                })()}
                                                {(() => {
                                                  const firstDt = subData.data_types
                                                    ? Object.keys(subData.data_types)[0]
                                                    : undefined;
                                                  // Empty data_type triggers the backend's
                                                  // ``instrument_catalogue`` synthesis branch for
                                                  // instruments-service so the venue-level click
                                                  // resolves to the registered
                                                  // ``CONTRACT_REGISTRY[("tradfi",
                                                  // "instrument_catalogue", "instrument_catalogue")]``
                                                  // contract. The previous "AUTO" placeholder
                                                  // literal broke the synthesis and made every
                                                  // instruments-service venue schema view return
                                                  // "no schema yet".
                                                  const schemaDt = catName === "SPORTS" ? name : (firstDt ?? "");
                                                  const schemaVenue = catName === "SPORTS" ? "" : name;
                                                  return (
                                                    <button
                                                      type="button"
                                                      className="text-[9px] text-[var(--color-accent-cyan)] hover:underline shrink-0"
                                                      title={
                                                        catName === "SPORTS"
                                                          ? `View ${name} schema`
                                                          : firstDt
                                                            ? `View ${name} schema (${firstDt})`
                                                            : `View ${name} schema`
                                                      }
                                                      onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSchemaModal({
                                                          service: serviceName,
                                                          asset_group: catName,
                                                          venue: schemaVenue,
                                                          instrument_type: "",
                                                          data_type: schemaDt,
                                                        });
                                                      }}
                                                    >
                                                      schema
                                                    </button>
                                                  );
                                                })()}
                                              </div>
                                            </summary>

                                            {/* Expanded: hierarchical sub-breakdown */}
                                            <div className="ml-5 pl-3 pr-2 pb-2 border-l-2 border-[var(--color-border-subtle)] space-y-1">
                                              {/* MTDS honest-coverage per-data-type panel (deployment-api 9d21ac8):
                                            lists declared data types with zero found shards + a
                                            per-data-type table showing found/expected shards and
                                            completion. Additive — does not replace the legacy
                                            `data_types` block below. */}
                                              {(hasMissingDataTypes || hasHonestDataTypes) && (
                                                <div
                                                  className="space-y-1 pt-1 pb-1 border-b border-[var(--color-border-subtle)]"
                                                  data-testid="honest-coverage-panel"
                                                >
                                                  <div className="flex items-baseline gap-2">
                                                    <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                      Honest coverage (data types)
                                                    </span>
                                                    {subData.honest_axis && (
                                                      <span
                                                        className="text-[8px] text-[var(--color-text-muted)] font-mono opacity-70"
                                                        title={`Shards are counted along ${subData.honest_axis}`}
                                                      >
                                                        {subData.honest_axis}
                                                      </span>
                                                    )}
                                                    {expectedDataTypes.length > 0 && (
                                                      <span
                                                        className="text-[8px] text-[var(--color-text-muted)] opacity-70"
                                                        title={`UAC-declared data types for this venue: ${expectedDataTypes.join(", ")}`}
                                                      >
                                                        {expectedDataTypes.length} declared
                                                      </span>
                                                    )}
                                                  </div>
                                                  {hasMissingDataTypes && (
                                                    <div
                                                      className="flex flex-wrap items-center gap-1"
                                                      data-testid="missing-data-types-list"
                                                    >
                                                      <span className="text-[9px] text-[var(--color-accent-red)]">
                                                        Missing ({missingDataTypes.length}):
                                                      </span>
                                                      {missingDataTypes.map((dt) => (
                                                        <span
                                                          key={dt}
                                                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border border-[var(--color-status-error-border-strong)]"
                                                          title={`UAC-declared data type '${dt}' has zero found shards for ${name}`}
                                                        >
                                                          {dt}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  )}
                                                  {hasHonestDataTypes && (
                                                    <div className="space-y-0.5" data-testid="honest-data-types-table">
                                                      {honestDataTypeEntries.map(([dtName, dtData]) => {
                                                        const found = dtData.found_shards;
                                                        const expected = dtData.expected_shards;
                                                        const pct = dtData.completion_pct;
                                                        // Phase 8H: unit discriminator — distinguishes
                                                        // per-instrument Tier-3 shards from venue-level
                                                        // shards and legacy pre-Phase-8C denominators.
                                                        const rawUnit = dtData.unit ?? "shard_days";
                                                        const isPerInstrument = rawUnit === "shard_instrument_days";
                                                        const isLegacy = rawUnit === "shard_days_legacy";
                                                        const unitLabel = isPerInstrument
                                                          ? "per-instrument"
                                                          : isLegacy
                                                            ? "legacy"
                                                            : "venue-level";
                                                        const unitBadgeClass = isPerInstrument
                                                          ? "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border-strong)]"
                                                          : isLegacy
                                                            ? "bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border-[var(--color-status-warning-border)]"
                                                            : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)]";
                                                        const unitBadgeTitle = isLegacy
                                                          ? "pre-Phase-8C manifest — migration in progress (denominator degraded to venue-level shard_days until ManifestWriter backfills instrument_id)"
                                                          : isPerInstrument
                                                            ? `Tier-3 per-instrument data_type — shards counted per (venue, instrument, date)${typeof dtData.legacy_row_count === "number" ? ` (legacy_row_count=${dtData.legacy_row_count})` : ""}`
                                                            : "Venue-level data_type — shards counted per (venue, date)";
                                                        const missingInstruments = dtData.missing_instruments ?? [];
                                                        const expectedInstruments = dtData.expected_instruments ?? [];
                                                        const perInstrument = dtData.per_instrument;
                                                        const perInstrumentEntries = perInstrument
                                                          ? Object.entries(perInstrument)
                                                          : [];
                                                        const hasMissingInstruments = missingInstruments.length > 0;
                                                        const hasPerInstrument = perInstrumentEntries.length > 0;
                                                        const hasPhase8Detail =
                                                          hasMissingInstruments || hasPerInstrument;
                                                        const dtRowCore = (
                                                          <div className="flex items-center gap-2 py-0.5 px-1.5 rounded">
                                                            <span
                                                              className="text-[10px] font-mono truncate min-w-0"
                                                              style={{
                                                                color: getCompletionColor(pct),
                                                              }}
                                                              title={dtName}
                                                            >
                                                              {dtName}
                                                            </span>
                                                            <span
                                                              className={cn(
                                                                "text-[8px] font-mono px-1 py-px rounded border shrink-0",
                                                                unitBadgeClass,
                                                              )}
                                                              title={unitBadgeTitle}
                                                              data-testid="honest-dt-unit-badge"
                                                              data-unit={rawUnit}
                                                            >
                                                              {unitLabel}
                                                            </span>
                                                            {hasMissingInstruments && (
                                                              <span
                                                                className="text-[8px] font-mono px-1 py-px rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border border-[var(--color-status-error-border-strong)] shrink-0"
                                                                title={`Instruments with zero captured shards: ${missingInstruments.join(", ")}`}
                                                                data-testid="honest-dt-missing-instruments-badge"
                                                              >
                                                                {missingInstruments.length}{" "}
                                                                {missingInstruments.length === 1
                                                                  ? "instrument"
                                                                  : "instruments"}{" "}
                                                                missing
                                                              </span>
                                                            )}
                                                            <div className="flex-1" />
                                                            <span
                                                              className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0"
                                                              title={
                                                                expectedInstruments.length > 0
                                                                  ? `Denominator: ${expectedInstruments.length} instrument(s) × window`
                                                                  : undefined
                                                              }
                                                            >
                                                              {found}/{expected} {rawUnit}
                                                            </span>
                                                            <div className="w-12 h-1 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden shrink-0">
                                                              <div
                                                                className="h-full"
                                                                style={{
                                                                  width: `${pct}%`,
                                                                  backgroundColor: getCompletionColor(pct),
                                                                }}
                                                              />
                                                            </div>
                                                            <span
                                                              className="text-[9px] font-mono font-medium w-8 text-right shrink-0"
                                                              style={{
                                                                color: getCompletionColor(pct),
                                                              }}
                                                            >
                                                              {formatPct(pct)}%
                                                            </span>
                                                          </div>
                                                        );
                                                        if (!hasPhase8Detail) {
                                                          return (
                                                            <div
                                                              key={dtName}
                                                              data-testid="honest-dt-row"
                                                              data-dt={dtName}
                                                            >
                                                              {dtRowCore}
                                                            </div>
                                                          );
                                                        }
                                                        return (
                                                          <details
                                                            key={dtName}
                                                            className="group/dt"
                                                            data-testid="honest-dt-row"
                                                            data-dt={dtName}
                                                          >
                                                            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                                              {dtRowCore}
                                                            </summary>
                                                            <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5 space-y-0.5">
                                                              {hasMissingInstruments && (
                                                                <div
                                                                  className="flex flex-wrap items-center gap-1 py-0.5 px-1"
                                                                  data-testid="honest-dt-missing-instruments-list"
                                                                >
                                                                  <span className="text-[9px] text-[var(--color-accent-red)] shrink-0">
                                                                    Missing ({missingInstruments.length}
                                                                    ):
                                                                  </span>
                                                                  {missingInstruments.map((iid) => (
                                                                    <span
                                                                      key={iid}
                                                                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border border-[var(--color-status-error-border-strong)]"
                                                                      title={`Instrument '${iid}' has zero captured shards in window`}
                                                                    >
                                                                      {iid}
                                                                    </span>
                                                                  ))}
                                                                </div>
                                                              )}
                                                              {hasPerInstrument && (
                                                                <div
                                                                  className="space-y-0.5"
                                                                  data-testid="honest-dt-per-instrument-table"
                                                                >
                                                                  {perInstrumentEntries.map(([iid, idata]) => {
                                                                    const instMissing = idata.missing_dates ?? [];
                                                                    const instHasMissing = instMissing.length > 0;
                                                                    const instRowCore = (
                                                                      <div className="flex items-center gap-2 py-0.5 px-1.5">
                                                                        <span
                                                                          className="text-[9px] font-mono truncate min-w-0"
                                                                          style={{
                                                                            color: getCompletionColor(
                                                                              idata.completion_pct,
                                                                            ),
                                                                          }}
                                                                          title={iid}
                                                                        >
                                                                          {iid}
                                                                        </span>
                                                                        <div className="flex-1" />
                                                                        <span className="text-[8px] text-[var(--color-text-muted)] font-mono shrink-0">
                                                                          {idata.found_shards}/{idata.expected_shards}
                                                                        </span>
                                                                        <div className="w-10 h-1 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden shrink-0">
                                                                          <div
                                                                            className="h-full"
                                                                            style={{
                                                                              width: `${idata.completion_pct}%`,
                                                                              backgroundColor: getCompletionColor(
                                                                                idata.completion_pct,
                                                                              ),
                                                                            }}
                                                                          />
                                                                        </div>
                                                                        <span
                                                                          className="text-[8px] font-mono font-medium w-8 text-right shrink-0"
                                                                          style={{
                                                                            color: getCompletionColor(
                                                                              idata.completion_pct,
                                                                            ),
                                                                          }}
                                                                        >
                                                                          {formatPct(idata.completion_pct)}%
                                                                        </span>
                                                                      </div>
                                                                    );
                                                                    if (!instHasMissing) {
                                                                      return (
                                                                        <div
                                                                          key={iid}
                                                                          data-testid="honest-dt-per-instrument-row"
                                                                          data-instrument={iid}
                                                                        >
                                                                          {instRowCore}
                                                                        </div>
                                                                      );
                                                                    }
                                                                    return (
                                                                      <details
                                                                        key={iid}
                                                                        data-testid="honest-dt-per-instrument-row"
                                                                        data-instrument={iid}
                                                                      >
                                                                        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                                                          {instRowCore}
                                                                        </summary>
                                                                        <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5">
                                                                          <details>
                                                                            <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                              {instMissing.length} missing dates
                                                                            </summary>
                                                                            <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                              <DateList
                                                                                dates={instMissing}
                                                                                btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                                                testIdPrefix={`honest-inst-missing-${name}-${dtName}-${iid}`}
                                                                                onClickDate={(date) =>
                                                                                  openShardDetail({
                                                                                    service: serviceName,
                                                                                    asset_group: catName,
                                                                                    venue: name,
                                                                                    day: date,
                                                                                    instrument_type: "AUTO",
                                                                                    data_type: dtName,
                                                                                    instrument_id: iid,
                                                                                  })
                                                                                }
                                                                              />
                                                                            </div>
                                                                          </details>
                                                                          {idata.found_shards > 0 && (
                                                                            <a
                                                                              href={
                                                                                buildShardDownloadUrl({
                                                                                  service: serviceName,
                                                                                  asset_group: catName,
                                                                                  venue: name,
                                                                                  date: "ALL",
                                                                                  data_type: dtName,
                                                                                  instrument_type: "AUTO",
                                                                                }) +
                                                                                `&instrument_ids=${encodeURIComponent(iid)}`
                                                                              }
                                                                              className="inline-flex items-center gap-1 mt-0.5 text-[8px] px-1 py-0.5 rounded border border-[var(--color-accent-cyan)] text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)] hover:text-[var(--color-bg-primary)]"
                                                                              title={`Download ${dtName} CSV for ${iid} across the full window`}
                                                                              download
                                                                              data-testid={`honest-inst-download-${name}-${dtName}-${iid}`}
                                                                            >
                                                                              <Download className="h-3 w-3" />
                                                                              <span className="font-mono">
                                                                                {iid} all-window CSV
                                                                              </span>
                                                                            </a>
                                                                          )}
                                                                        </div>
                                                                      </details>
                                                                    );
                                                                  })}
                                                                </div>
                                                              )}
                                                            </div>
                                                          </details>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {/* Instrument type breakdown (CEFI / TRADFI — v4) */}
                                              {hasInstrumentTypes && (
                                                <div className="space-y-0.5 pt-1">
                                                  <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                    Instrument Types
                                                  </span>
                                                  {Object.entries(subData.instrument_types!).map(([itName, itData]) => {
                                                    const it = itData as {
                                                      dates_found: number;
                                                      dates_expected: number;
                                                      completion_pct: number;
                                                      dates_missing?: number;
                                                      missing_dates?: string[];
                                                      dates_found_list?: string[];
                                                      data_types?: Record<
                                                        string,
                                                        {
                                                          dates_found: number;
                                                          dates_expected: number;
                                                          completion_pct: number;
                                                        }
                                                      >;
                                                      underlyings?: Record<
                                                        string,
                                                        {
                                                          dates_found: number;
                                                          dates_expected: number;
                                                          completion_pct: number;
                                                          dates_missing?: number;
                                                          missing_dates?: string[];
                                                          dates_found_list?: string[];
                                                          data_types?: Record<
                                                            string,
                                                            {
                                                              dates_found: number;
                                                              dates_expected: number;
                                                              completion_pct: number;
                                                            }
                                                          >;
                                                        }
                                                      >;
                                                    };
                                                    const itFoundList = it.dates_found_list ?? [];
                                                    const itMissingList = it.missing_dates ?? [];
                                                    const itHasDates =
                                                      itFoundList.length > 0 || itMissingList.length > 0;
                                                    return (
                                                      <details key={itName} className="group/itype">
                                                        <summary className="flex items-center gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                                          <ChevronRight className="h-2.5 w-2.5 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/itype:rotate-90" />
                                                          <span className="text-[10px] font-mono truncate">
                                                            {itName}
                                                          </span>
                                                          <div className="flex-1" />
                                                          <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                                                            {it.dates_found}/{it.dates_expected}
                                                          </span>
                                                          <div className="w-12 h-1 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden shrink-0">
                                                            <div
                                                              className="h-full"
                                                              style={{
                                                                width: `${it.completion_pct}%`,
                                                                backgroundColor: getCompletionColor(it.completion_pct),
                                                              }}
                                                            />
                                                          </div>
                                                          <span
                                                            className="text-[9px] font-mono font-medium w-8 text-right shrink-0"
                                                            style={{
                                                              color: getCompletionColor(it.completion_pct),
                                                            }}
                                                          >
                                                            {formatPct(it.completion_pct)}%
                                                          </span>
                                                        </summary>
                                                        {itHasDates && (
                                                          <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5">
                                                            <div className="flex gap-3">
                                                              {itFoundList.length > 0 && (
                                                                <details>
                                                                  <summary className="text-[8px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                                    {it.dates_found} available — click a day to drill
                                                                    down
                                                                  </summary>
                                                                  <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                    <DateList
                                                                      dates={itFoundList}
                                                                      btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:brightness-110 focus:outline-none"
                                                                      testIdPrefix={`itype-date-found-${name}-${itName}`}
                                                                      onClickDate={(date) =>
                                                                        openShardDetail({
                                                                          service: serviceName,
                                                                          asset_group: catName,
                                                                          venue: name,
                                                                          day: date,
                                                                          instrument_type: itName,
                                                                          data_type: "",
                                                                        })
                                                                      }
                                                                    />
                                                                  </div>
                                                                </details>
                                                              )}
                                                              {itMissingList.length > 0 && (
                                                                <details>
                                                                  <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                    {itMissingList.length} missing
                                                                  </summary>
                                                                  <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                    <DateList
                                                                      dates={itMissingList}
                                                                      btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                                      testIdPrefix={`itype-date-missing-${name}-${itName}`}
                                                                      onClickDate={(date) =>
                                                                        openShardDetail({
                                                                          service: serviceName,
                                                                          asset_group: catName,
                                                                          venue: name,
                                                                          day: date,
                                                                          instrument_type: itName,
                                                                          data_type: "",
                                                                        })
                                                                      }
                                                                    />
                                                                  </div>
                                                                </details>
                                                              )}
                                                            </div>
                                                          </div>
                                                        )}
                                                        {/* Per-underlying breakdown (options_chain / futures_chain) */}
                                                        {it.underlyings && Object.keys(it.underlyings).length > 0 && (
                                                          <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5 space-y-0.5">
                                                            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                              Underlyings
                                                            </span>
                                                            {Object.entries(it.underlyings).map(([ulName, ulData]) => {
                                                              const ulFoundList = ulData.dates_found_list ?? [];
                                                              const ulMissingList = ulData.missing_dates ?? [];
                                                              const ulHasDates =
                                                                ulFoundList.length > 0 || ulMissingList.length > 0;
                                                              return (
                                                                <details key={ulName} className="group/ul">
                                                                  <summary className="flex items-center gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                                                    <ChevronRight className="h-2.5 w-2.5 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/ul:rotate-90" />
                                                                    <span className="text-[10px] font-mono truncate">
                                                                      {ulName}
                                                                    </span>
                                                                    <div className="flex-1" />
                                                                    <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                                                                      {ulData.dates_found}/{ulData.dates_expected}
                                                                    </span>
                                                                    <div className="w-10 h-1 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden shrink-0">
                                                                      <div
                                                                        className="h-full"
                                                                        style={{
                                                                          width: `${ulData.completion_pct}%`,
                                                                          backgroundColor: getCompletionColor(
                                                                            ulData.completion_pct,
                                                                          ),
                                                                        }}
                                                                      />
                                                                    </div>
                                                                    <span
                                                                      className="text-[9px] font-mono w-8 text-right shrink-0"
                                                                      style={{
                                                                        color: getCompletionColor(
                                                                          ulData.completion_pct,
                                                                        ),
                                                                      }}
                                                                    >
                                                                      {formatPct(ulData.completion_pct)}%
                                                                    </span>
                                                                  </summary>
                                                                  {ulHasDates && (
                                                                    <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5">
                                                                      <div className="flex gap-3">
                                                                        {ulFoundList.length > 0 && (
                                                                          <details>
                                                                            <summary className="text-[8px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                                              {ulData.dates_found} available — click a
                                                                              day to drill down
                                                                            </summary>
                                                                            <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                              <DateList
                                                                                dates={ulFoundList}
                                                                                btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:brightness-110 focus:outline-none"
                                                                                testIdPrefix={`underlying-date-found-${name}-${itName}-${ulName}`}
                                                                                onClickDate={(date) =>
                                                                                  openShardDetail({
                                                                                    service: serviceName,
                                                                                    asset_group: catName,
                                                                                    venue: name,
                                                                                    day: date,
                                                                                    instrument_type: itName,
                                                                                    data_type: "",
                                                                                    underlying: ulName,
                                                                                  })
                                                                                }
                                                                              />
                                                                            </div>
                                                                          </details>
                                                                        )}
                                                                        {ulMissingList.length > 0 && (
                                                                          <details>
                                                                            <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                              {ulMissingList.length} missing
                                                                            </summary>
                                                                            <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                              <DateList
                                                                                dates={ulMissingList}
                                                                                btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                                                testIdPrefix={`underlying-date-missing-${name}-${itName}-${ulName}`}
                                                                                onClickDate={(date) =>
                                                                                  openShardDetail({
                                                                                    service: serviceName,
                                                                                    asset_group: catName,
                                                                                    venue: name,
                                                                                    day: date,
                                                                                    instrument_type: itName,
                                                                                    data_type: "",
                                                                                    underlying: ulName,
                                                                                  })
                                                                                }
                                                                              />
                                                                            </div>
                                                                          </details>
                                                                        )}
                                                                      </div>
                                                                    </div>
                                                                  )}
                                                                  {ulData.data_types &&
                                                                    Object.keys(ulData.data_types).length > 0 && (
                                                                      <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5 space-y-0.5">
                                                                        {Object.entries(ulData.data_types).map(
                                                                          ([dtName, dtData]) => (
                                                                            <div
                                                                              key={dtName}
                                                                              className="flex items-center gap-2 py-0.5 px-1.5"
                                                                            >
                                                                              <span
                                                                                className="text-[9px] font-mono text-[var(--color-text-secondary)]"
                                                                                style={{
                                                                                  color: getCompletionColor(
                                                                                    dtData.completion_pct,
                                                                                  ),
                                                                                }}
                                                                              >
                                                                                {dtName}
                                                                              </span>
                                                                              <div className="flex-1" />
                                                                              <span className="text-[8px] text-[var(--color-text-muted)] font-mono">
                                                                                {dtData.dates_found}/
                                                                                {dtData.dates_expected}
                                                                              </span>
                                                                              <span
                                                                                className="text-[8px] font-mono w-7 text-right"
                                                                                style={{
                                                                                  color: getCompletionColor(
                                                                                    dtData.completion_pct,
                                                                                  ),
                                                                                }}
                                                                              >
                                                                                {formatPct(dtData.completion_pct)}%
                                                                              </span>
                                                                            </div>
                                                                          ),
                                                                        )}
                                                                      </div>
                                                                    )}
                                                                </details>
                                                              );
                                                            })}
                                                          </div>
                                                        )}
                                                        {/* Direct data_types (when no underlyings) */}
                                                        {it.data_types &&
                                                          Object.keys(it.data_types).length > 0 &&
                                                          !(
                                                            it.underlyings && Object.keys(it.underlyings).length > 0
                                                          ) && (
                                                            <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5 space-y-0.5">
                                                              {Object.entries(it.data_types).map(([dtName, dtData]) => (
                                                                <div
                                                                  key={dtName}
                                                                  className="flex items-center gap-2 py-0.5 px-1.5"
                                                                >
                                                                  <span
                                                                    className="text-[9px] font-mono text-[var(--color-text-secondary)]"
                                                                    style={{
                                                                      color: getCompletionColor(dtData.completion_pct),
                                                                    }}
                                                                  >
                                                                    {dtName}
                                                                  </span>
                                                                  <div className="flex-1" />
                                                                  <span className="text-[8px] text-[var(--color-text-muted)] font-mono">
                                                                    {dtData.dates_found}/{dtData.dates_expected}
                                                                  </span>
                                                                  <span
                                                                    className="text-[8px] font-mono w-7 text-right"
                                                                    style={{
                                                                      color: getCompletionColor(dtData.completion_pct),
                                                                    }}
                                                                  >
                                                                    {formatPct(dtData.completion_pct)}%
                                                                  </span>
                                                                </div>
                                                              ))}
                                                            </div>
                                                          )}
                                                      </details>
                                                    );
                                                  })}
                                                </div>
                                              )}

                                              {/* Data types / Markets breakdown — expandable with date lists.
                                                    Gated with `!hasHonestDataTypes` so it does NOT double-render
                                                    alongside the MTDS honest-coverage panel above (which is keyed by the
                                                    same MARKET-DATA data types). PREDICTION is EXEMPT: this block is its
                                                    primary "Markets"/CQG drilldown (not an MTDS duplicate), so it must
                                                    always render even when honest_data_types is present (regression:
                                                    prediction_v9_breakdown smoke). Non-MTDS services lack the honest
                                                    panel, so the legacy per-day drill block still renders. */}
                                              {hasDataTypes &&
                                                !hasInstrumentTypes &&
                                                (!hasHonestDataTypes || catName === "PREDICTION") && (
                                                  <div className="space-y-0.5 pt-1">
                                                    <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                      {catName === "PREDICTION" ? "Markets" : "Data Types"}
                                                    </span>
                                                    {Object.entries(subData.data_types!).map(([dtName, dtData]) => {
                                                      const dtFoundList: string[] =
                                                        ((dtData as unknown as Record<string, unknown>)
                                                          .dates_found_list as string[]) ?? [];
                                                      const dtMissingList: string[] =
                                                        ((dtData as unknown as Record<string, unknown>)
                                                          .missing_dates as string[]) ?? [];
                                                      const hasDates =
                                                        dtFoundList.length > 0 || dtMissingList.length > 0;
                                                      return (
                                                        <details key={dtName} className="group/dt">
                                                          <summary className="flex items-center gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                                            <ChevronRight className="h-2.5 w-2.5 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/dt:rotate-90" />
                                                            <span
                                                              className="text-[10px] font-mono truncate min-w-0"
                                                              style={{
                                                                color: getCompletionColor(dtData.completion_pct),
                                                              }}
                                                            >
                                                              {dtName}
                                                            </span>
                                                            <div className="flex-1" />
                                                            <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                                                              {dtData.dates_found}/{dtData.dates_expected}
                                                            </span>
                                                            <div className="w-12 h-1 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden shrink-0">
                                                              <div
                                                                className="h-full"
                                                                style={{
                                                                  width: `${dtData.completion_pct}%`,
                                                                  backgroundColor: getCompletionColor(
                                                                    dtData.completion_pct,
                                                                  ),
                                                                }}
                                                              />
                                                            </div>
                                                            <span
                                                              className="text-[9px] font-mono font-medium w-8 text-right shrink-0"
                                                              style={{
                                                                color: getCompletionColor(dtData.completion_pct),
                                                              }}
                                                            >
                                                              {formatPct(dtData.completion_pct)}%
                                                            </span>
                                                            <button
                                                              type="button"
                                                              className="text-[8px] text-[var(--color-accent-cyan)] hover:underline shrink-0"
                                                              title={`View schema for ${name} / ${dtName}`}
                                                              onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setSchemaModal({
                                                                  service: serviceName,
                                                                  asset_group: catName,
                                                                  venue: name,
                                                                  instrument_type: "",
                                                                  data_type: dtName,
                                                                });
                                                              }}
                                                            >
                                                              schema
                                                            </button>
                                                          </summary>
                                                          {hasDates && (
                                                            <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5">
                                                              <div className="flex gap-3">
                                                                {dtFoundList.length > 0 && (
                                                                  <details>
                                                                    <summary className="text-[8px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                                      {dtData.dates_found} available — click a day to
                                                                      drill down
                                                                    </summary>
                                                                    <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                      <DateList
                                                                        dates={dtFoundList}
                                                                        btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:brightness-110 focus:outline-none"
                                                                        testIdPrefix={`cefi-date-found-${name}-${dtName}`}
                                                                        onClickDate={(date) => {
                                                                          const itGuess =
                                                                            name.toUpperCase() === "POLYMARKET"
                                                                              ? "OTHER"
                                                                              : "AUTO";
                                                                          openShardDetail({
                                                                            service: serviceName,
                                                                            asset_group: catName,
                                                                            venue: name,
                                                                            day: date,
                                                                            instrument_type: itGuess,
                                                                            data_type: dtName,
                                                                          });
                                                                        }}
                                                                        downloadUrl={(date) =>
                                                                          buildShardDownloadUrl({
                                                                            service: serviceName,
                                                                            asset_group: catName,
                                                                            venue: name,
                                                                            date,
                                                                            data_type: dtName,
                                                                          })
                                                                        }
                                                                        downloadTitle={(date) =>
                                                                          `Download ${dtName} CSV for ${name} on ${date}`
                                                                        }
                                                                      />
                                                                    </div>
                                                                  </details>
                                                                )}
                                                                {dtMissingList.length > 0 && (
                                                                  <details>
                                                                    <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                      {dtMissingList.length} missing
                                                                    </summary>
                                                                    <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                      <DateList
                                                                        dates={dtMissingList}
                                                                        btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                                        testIdPrefix={`cefi-date-missing-${name}-${dtName}`}
                                                                        onClickDate={(date) => {
                                                                          const itGuess =
                                                                            name.toUpperCase() === "POLYMARKET"
                                                                              ? "OTHER"
                                                                              : "AUTO";
                                                                          openShardDetail({
                                                                            service: serviceName,
                                                                            asset_group: catName,
                                                                            venue: name,
                                                                            day: date,
                                                                            instrument_type: itGuess,
                                                                            data_type: dtName,
                                                                          });
                                                                        }}
                                                                      />
                                                                    </div>
                                                                  </details>
                                                                )}
                                                              </div>
                                                            </div>
                                                          )}
                                                        </details>
                                                      );
                                                    })}
                                                  </div>
                                                )}

                                              {/* Prediction v9 — per-market cluster drilldown.
                                            Shown for PREDICTION asset groups using the
                                            canonical_question_group breakdown_axis (post-v9
                                            bundled-atom). Each cqg group row carries
                                            `observed_clusters` = {conditionId: row_count}
                                            from the manifest `record_captured_from_counts`
                                            call, and `source` = the data-source API
                                            (polymarket_clob / polymarket_gamma_api / kalshi_*).
                                            This replaces the old flat `venues` table for PREDICTION. */}
                                              {isPredictionCqgAxis(catData) &&
                                                subData.observed_clusters &&
                                                Object.keys(subData.observed_clusters).length > 0 && (
                                                  <div
                                                    className="space-y-0.5 pt-1"
                                                    data-testid="prediction-cqg-clusters"
                                                  >
                                                    <div className="flex items-center gap-2 mb-1">
                                                      <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                        Markets (conditionId clusters)
                                                      </span>
                                                      {subData.source && (
                                                        <span
                                                          className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]"
                                                          title={`Data source API: ${subData.source}`}
                                                          data-testid="prediction-cqg-source-badge"
                                                        >
                                                          {subData.source}
                                                        </span>
                                                      )}
                                                      <span className="text-[8px] text-[var(--color-text-muted)] ml-auto font-mono">
                                                        {Object.keys(subData.observed_clusters).length} markets
                                                      </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                                      {Object.entries(subData.observed_clusters)
                                                        .sort(([, a], [, b]) => b - a)
                                                        .map(([conditionId, rowCount]) => (
                                                          <span
                                                            key={conditionId}
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] font-mono"
                                                            title={`conditionId: ${conditionId} — ${rowCount.toLocaleString()} rows`}
                                                            data-testid={`prediction-cluster-${conditionId}`}
                                                          >
                                                            {conditionId.length > 12
                                                              ? `${conditionId.slice(0, 6)}…${conditionId.slice(-4)}`
                                                              : conditionId}
                                                            <strong>{rowCount.toLocaleString()}</strong>
                                                          </span>
                                                        ))}
                                                    </div>
                                                  </div>
                                                )}

                                              {/* Leagues breakdown (SPORTS / PREDICTION) */}
                                              {hasLeagues && (
                                                <div className="space-y-0.5 pt-1">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">
                                                      {catName === "PREDICTION" ? "Markets" : "Leagues"}
                                                    </span>
                                                    {catName === "SPORTS" && name === "FIXTURES" && (
                                                      <button
                                                        type="button"
                                                        className="text-[9px] text-[var(--color-accent-cyan)] hover:underline"
                                                        title="View the FIXTURES parquet schema from unified-api-contracts — date-independent"
                                                        onClick={() =>
                                                          setSchemaModal({
                                                            service: "instruments-service",
                                                            asset_group: "SPORTS",
                                                            venue: "",
                                                            instrument_type: "",
                                                            data_type: "FIXTURES",
                                                          })
                                                        }
                                                      >
                                                        View schema
                                                      </button>
                                                    )}
                                                  </div>
                                                  {Object.entries(subData.leagues!).map(([leagueName, leagueData]) => {
                                                    const ld = leagueData as TurboLeagueStatus;
                                                    // v5 honest-coverage fields are canonical; legacy `dates_*` kept as fallback.
                                                    const foundCount = ld.found_shards ?? ld.dates_found;
                                                    const expectedCount = ld.expected_shards ?? ld.dates_expected;
                                                    const missingCount =
                                                      ld.missing_count ??
                                                      ld.missing_shards ??
                                                      ld.dates_missing ??
                                                      ld.missing_dates?.length;
                                                    const foundDatesList =
                                                      ld.found_dates_list ?? ld.dates_found_list ?? [];
                                                    const missingDatesList = ld.missing_dates ?? [];
                                                    const missingIsSample =
                                                      missingCount !== undefined &&
                                                      missingDatesList.length > 0 &&
                                                      missingDatesList.length < missingCount;
                                                    const unitLabel = formatUnitLabel(ld.unit);
                                                    const countDisplay =
                                                      foundCount === undefined || expectedCount === undefined
                                                        ? "—"
                                                        : `${foundCount}/${expectedCount} ${unitLabel}`;
                                                    if (ld.not_applicable) {
                                                      return (
                                                        <div
                                                          key={leagueName}
                                                          className="flex items-center gap-2 py-0.5 px-1.5 rounded opacity-50"
                                                        >
                                                          <span className="h-2.5 w-2.5 shrink-0" />
                                                          <span
                                                            className="text-[10px] font-mono truncate min-w-0 text-[var(--color-text-muted)]"
                                                            title={leagueName}
                                                          >
                                                            {leagueName}
                                                          </span>
                                                          <div className="flex-1" />
                                                          <span className="text-[9px] font-mono text-[var(--color-text-muted)] shrink-0 italic">
                                                            N/A
                                                          </span>
                                                        </div>
                                                      );
                                                    }
                                                    return (
                                                      <details key={leagueName} className="group/league">
                                                        <summary className="flex items-center gap-2 py-0.5 px-1.5 rounded cursor-pointer hover:bg-[var(--color-bg-hover)] select-none list-none [&::-webkit-details-marker]:hidden">
                                                          <ChevronRight className="h-2.5 w-2.5 text-[var(--color-text-muted)] shrink-0 transition-transform group-open/league:rotate-90" />
                                                          <span
                                                            className="text-[10px] font-mono truncate min-w-0"
                                                            title={leagueName}
                                                          >
                                                            {leagueName}
                                                          </span>
                                                          <div className="flex-1" />
                                                          <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0">
                                                            {countDisplay}
                                                          </span>
                                                          <div className="w-12 h-1 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden shrink-0">
                                                            <div
                                                              className="h-full"
                                                              style={{
                                                                width: `${ld.completion_pct}%`,
                                                                backgroundColor: getCompletionColor(ld.completion_pct),
                                                              }}
                                                            />
                                                          </div>
                                                          <span
                                                            className="text-[9px] font-mono font-medium w-8 text-right shrink-0"
                                                            style={{
                                                              color: getCompletionColor(ld.completion_pct),
                                                            }}
                                                          >
                                                            {formatPct(ld.completion_pct)}%
                                                          </span>
                                                        </summary>
                                                        {/* League date details */}
                                                        <div className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-0.5">
                                                          <div className="flex gap-3">
                                                            {foundDatesList.length > 0 && (
                                                              <details>
                                                                <summary className="text-[8px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                                  {foundCount ?? foundDatesList.length} available
                                                                  {catName === "SPORTS" && name === "FIXTURES" && (
                                                                    <span className="ml-1 text-[var(--color-text-muted)]">
                                                                      · click date to expand fixtures · CSV icon
                                                                      downloads league-day CSV
                                                                    </span>
                                                                  )}
                                                                </summary>
                                                                <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                  {catName === "SPORTS" && name === "FIXTURES" ? (
                                                                    <DateList
                                                                      dates={foundDatesList}
                                                                      btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:underline hover:bg-[var(--color-status-success-border-strong)]"
                                                                      testIdPrefix={`fixture-date-toggle-${leagueName}`}
                                                                      onClickDate={(date) =>
                                                                        toggleFixtureBreakdown(date, leagueName, false)
                                                                      }
                                                                      downloadUrl={(date) =>
                                                                        buildFixturesCsvDownloadUrl({
                                                                          day: date,
                                                                          league_id: leagueName,
                                                                        })
                                                                      }
                                                                      downloadTitle={(date) =>
                                                                        `Download league-day FIXTURES CSV for ${leagueName} on ${date}`
                                                                      }
                                                                    />
                                                                  ) : (
                                                                    foundDatesList.map((date: string) => (
                                                                      <span
                                                                        key={date}
                                                                        className="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)]"
                                                                      >
                                                                        {date}
                                                                      </span>
                                                                    ))
                                                                  )}
                                                                </div>
                                                              </details>
                                                            )}
                                                            {missingDatesList.length > 0 && (
                                                              <details>
                                                                <summary className="text-[8px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                                  {missingCount ?? missingDatesList.length} missing
                                                                  {missingIsSample && (
                                                                    <span className="ml-1 text-[var(--color-text-muted)]">
                                                                      (sample of {missingDatesList.length})
                                                                    </span>
                                                                  )}
                                                                  {catName === "SPORTS" && name === "FIXTURES" && (
                                                                    <span className="ml-1 text-[var(--color-text-muted)]">
                                                                      · click to see expected fixtures (read-only)
                                                                    </span>
                                                                  )}
                                                                </summary>
                                                                <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-20 overflow-y-auto">
                                                                  {catName === "SPORTS" && name === "FIXTURES" ? (
                                                                    <DateList
                                                                      dates={missingDatesList}
                                                                      btnClassName="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:underline"
                                                                      testIdPrefix={`fixture-date-toggle-missing-${leagueName}`}
                                                                      onClickDate={(date) =>
                                                                        toggleFixtureBreakdown(date, leagueName, true)
                                                                      }
                                                                    />
                                                                  ) : (
                                                                    missingDatesList.map((date: string) => (
                                                                      <span
                                                                        key={date}
                                                                        className="text-[7px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
                                                                      >
                                                                        {date}
                                                                      </span>
                                                                    ))
                                                                  )}
                                                                </div>
                                                              </details>
                                                            )}
                                                            {catName === "SPORTS" &&
                                                              name === "FIXTURES" &&
                                                              fixtureBreakdownKey &&
                                                              fixtureBreakdownKey.league_id === leagueName && (
                                                                <FixtureBreakdown
                                                                  day={fixtureBreakdownKey.day}
                                                                  league_id={fixtureBreakdownKey.league_id}
                                                                  readOnly={fixtureBreakdownKey.readOnly}
                                                                />
                                                              )}
                                                          </div>
                                                        </div>
                                                      </details>
                                                    );
                                                  })}
                                                </div>
                                              )}

                                              {/* P8 honest-absence affordance: genuinely-global sports reference
                                                  data_types (LEAGUES, VENUES) carry a `global_*` axis and have NO
                                                  per-league breakdown BY DESIGN. Silently omitting the Leagues
                                                  section makes "no per-league dimension" indistinguishable from
                                                  "not captured yet" — render an explicit row instead. TEAMS is now
                                                  per-league (P8), so it renders the real leagues drilldown above and
                                                  never hits this branch. Plan
                                                  data_status_page_ux_and_canonicalisation_2026_07_16 P8. */}
                                              {showsGlobalReferenceAffordance(catName, !!hasLeagues, subData.axis) && (
                                                <div className="pt-1">
                                                  <span
                                                    className="text-[9px] italic text-[var(--color-text-muted)]"
                                                    data-testid="global-reference-entity-affordance"
                                                  >
                                                    Global reference entity — no per-league breakdown (axis:{" "}
                                                    {subData.axis})
                                                  </span>
                                                </div>
                                              )}

                                              {/* P8 UI-P2 — deep-drill parity: the per-fixture drill-down
                                                  (date→fixture expansion) and CSV downloads are wired ONLY for
                                                  FIXTURES (see the `catName === "SPORTS" && name === "FIXTURES"`
                                                  gates above). Rather than fabricate a generalized breakdown for
                                                  other sports data_types, render an explicit honest note instead.
                                                  Plan data_status_page_ux_and_canonicalisation_2026_07_16
                                                  P8 UI-P2. */}
                                              {showsFixturesOnlyDrillNote(catName, name) && (
                                                <div className="pt-1">
                                                  <span
                                                    className="text-[9px] italic text-[var(--color-text-muted)]"
                                                    data-testid="fixtures-only-drilldown-note"
                                                  >
                                                    Per-fixture drill-down and downloads are available for FIXTURES
                                                    only.
                                                  </span>
                                                </div>
                                              )}

                                              {/* Venue-level available/missing dates */}
                                              {(missingList.length > 0 || foundList.length > 0) && (
                                                <div
                                                  className={cn(
                                                    "flex gap-3 pt-0.5",
                                                    (hasDataTypes || hasLeagues) &&
                                                      "mt-1 border-t border-[var(--color-border-subtle)]",
                                                  )}
                                                >
                                                  {foundList.length > 0 && (
                                                    <details>
                                                      <summary className="text-[9px] text-[var(--color-accent-green)] cursor-pointer hover:underline">
                                                        {subData.dates_found} available{" "}
                                                        {catName === "SPORTS" ? "fixtures" : "dates"}
                                                      </summary>
                                                      <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-24 overflow-y-auto">
                                                        <DateList
                                                          dates={foundList}
                                                          btnClassName="text-[8px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:brightness-110 focus:outline-none"
                                                          testIdPrefix={`shard-csv-date-found-${name}`}
                                                          onClickDate={(date) =>
                                                            openShardDetail({
                                                              service: serviceName,
                                                              asset_group: catName,
                                                              instrument_type: "AUTO",
                                                              data_type: "AUTO",
                                                              day: date,
                                                              venue: name,
                                                            })
                                                          }
                                                          downloadUrl={(date) =>
                                                            buildShardDownloadUrl({
                                                              service: serviceName,
                                                              asset_group: catName,
                                                              venue: name,
                                                              date,
                                                            })
                                                          }
                                                          downloadTitle={(date) =>
                                                            serviceName === "market-tick-data-service" ||
                                                            serviceName === "market-data-processing-service"
                                                              ? `Download availability catalog CSV for ${name} on ${date}`
                                                              : `Download shard CSV for ${name} on ${date}`
                                                          }
                                                        />
                                                      </div>
                                                    </details>
                                                  )}
                                                  {missingList.length > 0 && (
                                                    <details>
                                                      <summary className="text-[9px] text-[var(--color-accent-red)] cursor-pointer hover:underline">
                                                        {missingCount} missing{" "}
                                                        {catName === "SPORTS" ? "fixtures" : "dates"}
                                                      </summary>
                                                      <div className="mt-0.5 flex flex-wrap gap-0.5 max-h-24 overflow-y-auto">
                                                        <DateList
                                                          dates={missingList}
                                                          btnClassName="text-[8px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] hover:brightness-110 focus:outline-none"
                                                          testIdPrefix={`shard-csv-date-missing-${name}`}
                                                          onClickDate={(date) =>
                                                            openShardDetail({
                                                              service: serviceName,
                                                              asset_group: catName,
                                                              instrument_type: "AUTO",
                                                              data_type: "AUTO",
                                                              day: date,
                                                              venue: name,
                                                            })
                                                          }
                                                        />
                                                        {missingCount > missingList.length && (
                                                          <span className="text-[8px] text-[var(--color-text-muted)]">
                                                            +{missingCount - missingList.length} more
                                                          </span>
                                                        )}
                                                      </div>
                                                    </details>
                                                  )}
                                                </div>
                                              )}

                                              {/* Venue detail drill-down (instrument breakdown from instruments-service) */}
                                              <div className="pt-0.5">
                                                <span
                                                  className="text-[9px] text-[var(--color-accent-cyan)] cursor-pointer hover:underline"
                                                  onClick={() => handleVenueClick(catName, name)}
                                                >
                                                  Instrument breakdown
                                                </span>
                                              </div>
                                              {venueDetailKey === `${catName}:${name}` && (
                                                <VenueDetailPanel loading={venueDetailLoading} data={venueDetailData} />
                                              )}
                                            </div>
                                          </details>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Regular Data Status Results */}
          {data && !checkVenues && !checkDataTypes && (
            <>
              {/* Summary Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl font-mono flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Data Coverage
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {startDate} to {endDate}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-3xl font-mono font-bold"
                        style={{
                          color: getCompletionColor(data.overall_completion),
                        }}
                      >
                        {data.overall_completion.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {data.overall_complete} / {data.overall_total} files
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Progress bar */}
                  <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${data.overall_completion}%`,
                        backgroundColor: getCompletionColor(data.overall_completion),
                      }}
                    />
                  </div>

                  {/* Deploy Missing Button */}
                  {totalMissing > 0 && onDeployMissing && (
                    <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error-border)]">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                        <span className="text-sm">
                          <strong>{totalMissing}</strong> missing data points
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleOpenDeployMissingModal}
                        className="bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80"
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy Missing
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Calendar View */}
              {viewMode === "calendar" && heatmapData.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Coverage Calendar</CardTitle>
                    <CardDescription>Visual overview of data coverage by day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HeatmapCalendar
                      data={heatmapData}
                      startDate={startDate}
                      endDate={endDate}
                      onDateClick={(date) => setSelectedCalendarDate(date)}
                      selectedDate={selectedCalendarDate || undefined}
                    />

                    {/* Selected Date Details */}
                    {selectedCalendarDate && (
                      <div className="mt-4 p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-default)]">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">
                            {new Date(selectedCalendarDate).toLocaleDateString("en-US", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCalendarDate(null)}
                            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] h-auto p-0"
                          >
                            ✕ Close
                          </Button>
                        </div>
                        {heatmapData.find((d) => d.date === selectedCalendarDate)?.tooltip && (
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {heatmapData.find((d) => d.date === selectedCalendarDate)?.tooltip}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Asset group breakdown table */}
              {viewMode === "table" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Asset group breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {Object.entries(data.asset_groups).map(([catName, catData]) => {
                        const completion = getCategoryCompletion(catData);
                        const missing = getMissingCount(catData);
                        const isExpanded = expandedCategories.has(catName);

                        return (
                          <div key={catName}>
                            {/* Category Row */}
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategory(catName)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors h-auto"
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                                )}
                                <span className="font-medium">{catName}</span>
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  ({Object.keys(catData.venues || {}).length} venues)
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                {missing > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border-strong)]"
                                  >
                                    {missing} missing
                                  </Badge>
                                )}
                                <Badge variant="outline" className={getCompletionBadgeClass(completion)}>
                                  {completion.toFixed(1)}%
                                </Badge>
                                <div className="w-24 h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full transition-all"
                                    style={{
                                      width: `${completion}%`,
                                      backgroundColor: getCompletionColor(completion),
                                    }}
                                  />
                                </div>
                              </div>
                            </Button>

                            {/* Expanded Venue Table */}
                            {isExpanded && (
                              <div className="bg-[var(--color-bg-secondary)] px-4 py-2">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-[var(--color-text-muted)]">
                                      <th className="text-left py-2 font-medium">Venue</th>
                                      <th className="text-right py-2 font-medium">Complete</th>
                                      <th className="text-right py-2 font-medium">Total</th>
                                      <th className="text-right py-2 font-medium">Coverage</th>
                                      <th className="text-right py-2 font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                                    {Object.entries(catData.venues).map(([venueName, venueData]) => {
                                      const venuePct = venueData.completion_percent;
                                      const venueMissing = venueData.total - venueData.complete;

                                      return (
                                        <tr key={venueName} className="hover:bg-[var(--color-bg-tertiary)]">
                                          <td className="py-2 font-mono text-xs">{venueName}</td>
                                          <td className="py-2 text-right font-mono">{venueData.complete}</td>
                                          <td className="py-2 text-right font-mono text-[var(--color-text-muted)]">
                                            {venueData.total}
                                          </td>
                                          <td className="py-2 text-right">
                                            <span
                                              className="font-mono"
                                              style={{
                                                color: getCompletionColor(venuePct),
                                              }}
                                            >
                                              {venuePct.toFixed(1)}%
                                            </span>
                                          </td>
                                          <td className="py-2 text-right">
                                            {venueMissing === 0 ? (
                                              <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)] inline" />
                                            ) : (
                                              <span className="text-xs text-[var(--color-accent-red)]">
                                                {venueMissing} missing
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Deploy Missing Modal */}
          <Dialog open={deployMissingModalOpen} onClose={() => setDeployMissingModalOpen(false)} className="max-w-lg">
            <DialogHeader onClose={() => setDeployMissingModalOpen(false)}>
              <DialogTitle>Deploy Missing Data</DialogTitle>
            </DialogHeader>
            <DialogContent>
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-[var(--color-accent-yellow)]" />
                    <span>
                      <strong>{totalMissing}</strong> missing data points
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Date range: {startDate} to {endDate}
                    {firstDayOfMonthOnly && (
                      <span className="ml-2 text-[var(--color-accent-cyan)]">(first day of month only)</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">Categories: </span>
                    <span className="text-[var(--color-accent-cyan)] font-medium">
                      {effectiveDeployCategories.length > 0
                        ? effectiveDeployCategories.join(", ")
                        : "All categories with missing data"}
                    </span>
                  </div>
                  {selectedVenues.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="text-[var(--color-text-muted)]">Venues: </span>
                      <span className="text-[var(--color-accent-purple)] font-medium">{selectedVenues.join(", ")}</span>
                    </div>
                  )}
                  {selectedFolders.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="text-[var(--color-text-muted)]">Instrument Types: </span>
                      <span className="text-[var(--color-accent-green)] font-medium">{selectedFolders.join(", ")}</span>
                    </div>
                  )}
                  {selectedDataTypes.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="text-[var(--color-text-muted)]">Data Types: </span>
                      <span className="text-[var(--color-accent-amber)] font-medium">
                        {selectedDataTypes.join(", ")}
                      </span>
                    </div>
                  )}
                  {selectedCategories.length > 0 && effectiveDeployCategories.length === 0 && (
                    <div className="mt-1 text-xs text-[var(--color-accent-amber)]">
                      ⚠️ Selected categories have no missing data
                    </div>
                  )}
                </div>

                {/* Region (with cross-region egress warning) */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">Region</Label>
                  <Select value={deployMissingRegion} onValueChange={setDeployMissingRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        {
                          value: "asia-northeast1",
                          label: "asia-northeast1 (Tokyo)",
                        },
                        {
                          value: "asia-northeast2",
                          label: "asia-northeast2 (Osaka)",
                        },
                        {
                          value: "asia-southeast1",
                          label: "asia-southeast1 (Singapore)",
                        },
                        { value: "us-central1", label: "us-central1 (Iowa)" },
                        { value: "us-east1", label: "us-east1 (South Carolina)" },
                        { value: "us-west1", label: "us-west1 (Oregon)" },
                        { value: "europe-west1", label: "europe-west1 (Belgium)" },
                        { value: "europe-west2", label: "europe-west2 (London)" },
                      ].map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {showDeployMissingRegionWarning && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <p className="font-semibold">Cross-Region Egress Warning</p>
                          <p className="mt-1">
                            Selected region ({deployMissingRegion}) differs from configured storage region (
                            {backendRegion}). This will incur significant egress costs.
                          </p>
                          <p className="mt-1 font-medium">
                            Recommendation: Use {backendRegion} to avoid egress charges.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Deployment Mode */}
                <div className="space-y-3">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                    Deployment Mode
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="deploy-missing-dry-run"
                      checked={deployMissingDryRun}
                      onCheckedChange={(checked) => setDeployMissingDryRun(checked === true)}
                    />
                    <Label htmlFor="deploy-missing-dry-run" className="text-sm cursor-pointer">
                      <span className="font-medium">Preview only (dry run)</span>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Show what shards would be deployed without actually deploying
                      </p>
                    </Label>
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="deploy-missing-force"
                      checked={deployMissingForce}
                      onCheckedChange={(checked) => setDeployMissingForce(checked === true)}
                    />
                    <Label htmlFor="deploy-missing-force" className="text-sm cursor-pointer">
                      <span className="font-medium">Force re-process (--force)</span>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Regenerate even if data already exists for the venue/date
                      </p>
                    </Label>
                  </div>
                </div>

                {/* Date Granularity */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                    Date Granularity
                  </div>
                  <div className="flex gap-2">
                    {(["daily", "weekly", "monthly", "none"] as const).map((g) => (
                      <Button
                        key={g}
                        type="button"
                        variant={deployMissingDateGranularity === g ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDeployMissingDateGranularity(g)}
                      >
                        {g === "none" ? "None (Bulk)" : g.charAt(0).toUpperCase() + g.slice(1)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {deployMissingDateGranularity === "daily" && "One shard per day (most granular, more shards)"}
                    {deployMissingDateGranularity === "weekly" && "One shard per week (balanced)"}
                    {deployMissingDateGranularity === "monthly" && "One shard per month (fewer shards, larger jobs)"}
                    {deployMissingDateGranularity === "none" &&
                      "Single shard, no date range — service fetches all data in bulk"}
                  </p>
                </div>

                {/* Preview result - shows updated shard count when granularity changes (stays visible in modal) */}
                {(isDeploying || deploymentResult?.dry_run) && (
                  <div className="p-3 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border-subtle)]">
                    {isDeploying ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        Calculating shards for {deployMissingDateGranularity} granularity…
                      </div>
                    ) : deploymentResult?.dry_run && deploymentResult.total_shards !== undefined ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)] shrink-0" />
                        <span>
                          <strong className="font-mono text-[var(--color-accent-cyan)]">
                            {deploymentResult.total_shards.toLocaleString()}
                          </strong>{" "}
                          shards would be deployed
                          {deploymentResult.shards_truncated && (
                            <span className="text-[var(--color-text-muted)]">
                              {" "}
                              (truncated — full list on Deploy tab)
                            </span>
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDeployMissingModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleConfirmDeployMissing(false)}
                    disabled={effectiveDeployCategories.length === 0}
                    className={
                      deployMissingDryRun
                        ? "bg-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)]/80"
                        : "bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80"
                    }
                  >
                    <Rocket className="h-4 w-4 mr-2" />
                    {deployMissingDryRun ? "Preview Shards" : "Deploy Now"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* File Listing Modal */}
          <Dialog open={showFileListing} onClose={() => setShowFileListing(false)} className="max-w-4xl">
            <DialogHeader onClose={() => setShowFileListing(false)}>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                File Listing
                {fileListingData && (
                  <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
                    {fileListingData.venue} / {fileListingData.folder} / {fileListingData.data_type}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <DialogContent>
              <div className="max-h-[60vh] overflow-auto">
                {fileListingLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent-cyan)]" />
                    <span className="ml-3 text-[var(--color-text-muted)]">Querying GCS for files...</span>
                  </div>
                ) : fileListingError ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-8 w-8 text-[var(--color-accent-red)] mx-auto mb-2" />
                    <p className="text-[var(--color-accent-red)]">{fileListingError}</p>
                  </div>
                ) : fileListingData ? (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-[var(--color-text-muted)]">Total Files</div>
                          <div className="font-semibold text-lg">
                            {fileListingData.summary.total_files.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--color-text-muted)]">Total Size</div>
                          <div className="font-semibold text-lg">{fileListingData.summary.total_size_formatted}</div>
                        </div>
                        <div>
                          <div className="text-[var(--color-text-muted)]">Days with Data</div>
                          <div className="font-semibold text-lg text-[var(--color-accent-green)]">
                            {fileListingData.summary.dates_with_data}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--color-text-muted)]">Days Empty</div>
                          <div
                            className={cn(
                              "font-semibold text-lg",
                              fileListingData.summary.dates_empty > 0
                                ? "text-[var(--color-accent-orange)]"
                                : "text-[var(--color-text-muted)]",
                            )}
                          >
                            {fileListingData.summary.dates_empty}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 bg-[var(--color-bg-secondary)] rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-[var(--color-accent-green)] h-full transition-all"
                            style={{
                              width: `${fileListingData.summary.completion_pct}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">{fileListingData.summary.completion_pct}%</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        Bucket: {fileListingData.bucket} | {fileListingData.date_range.start} to{" "}
                        {fileListingData.date_range.end} ({fileListingData.date_range.total_days} days)
                      </p>
                    </div>

                    {/* Files by Date */}
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">Files by Date</h3>
                      <div className="max-h-[300px] overflow-auto border border-[var(--color-border-subtle)] rounded">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--color-bg-tertiary)] sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Date</th>
                              <th className="text-right px-3 py-2 font-medium">Files</th>
                              <th className="text-right px-3 py-2 font-medium">Size</th>
                              <th className="text-left px-3 py-2 font-medium">Last modified</th>
                              <th className="text-left px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fileListingData.by_date.map((dayResult) => (
                              <tr
                                key={dayResult.date}
                                className={cn(
                                  "border-t border-[var(--color-border-subtle)]",
                                  dayResult.file_count === 0 && "bg-[var(--color-accent-red)]/5",
                                )}
                              >
                                <td className="px-3 py-2 font-mono">{dayResult.date}</td>
                                <td className="px-3 py-2 text-right font-mono">{dayResult.file_count}</td>
                                <td className="px-3 py-2 text-right font-mono text-[var(--color-text-muted)]">
                                  {dayResult.total_size_bytes > 0
                                    ? (dayResult.total_size_bytes / (1024 * 1024)).toFixed(1) + " MB"
                                    : "-"}
                                </td>
                                <td className="px-3 py-2 font-mono text-[var(--color-text-muted)] text-xs">
                                  {dayResult.last_modified
                                    ? new Date(dayResult.last_modified).toLocaleString(undefined, {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                      })
                                    : "-"}
                                </td>
                                <td className="px-3 py-2">
                                  {dayResult.error ? (
                                    <span className="text-[var(--color-accent-red)] text-xs">{dayResult.error}</span>
                                  ) : dayResult.file_count > 0 ? (
                                    <span className="text-[var(--color-accent-green)] text-xs flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> OK
                                    </span>
                                  ) : (
                                    <span className="text-[var(--color-accent-orange)] text-xs flex items-center gap-1">
                                      <XCircle className="h-3 w-3" /> Empty
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end pt-4 mt-4 border-t border-[var(--color-border-default)]">
                <Button variant="outline" onClick={() => setShowFileListing(false)}>
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Drill-down modals — schema + CSV download. (Per-day instrument
              browsing now nests inside ShardDetailModal — see its
              `browseInstruments` state.) */}
          {schemaModal && (
            // Schema lookup is venue-level (data_type schema doesn't change per
            // day), so the click sites don't carry a ``day`` -- the modal's
            // ShardCoordinate prop expects one, so inject an empty string at
            // render. SchemaModal's downstream calls treat empty ``day`` as
            // "any day" which matches the venue-level schema semantics.
            <SchemaModal coord={{ ...schemaModal, day: "" }} onClose={() => setSchemaModal(null)} />
          )}
          {poolBreakdownModal && (
            <PoolBreakdownModal
              venue={poolBreakdownModal.venue}
              chain={poolBreakdownModal.chain}
              day={poolBreakdownModal.day}
              onClose={() => setPoolBreakdownModal(null)}
            />
          )}
          {shardDetailCoord && <ShardDetailModal coord={shardDetailCoord} onClose={() => setShardDetailCoord(null)} />}
          {leafSchemaCoord && <LeafSchemaModal coord={leafSchemaCoord} onClose={() => setLeafSchemaCoord(null)} />}
        </>
      )}
    </div>
  );
}

// Exported wrapper component that delegates to specialized components
export function DataStatusTab({ serviceName, deploymentResult, isDeploying, onDeployMissing }: DataStatusTabProps) {
  // Use specialized component for execution-services (different data model)
  if (serviceName === "execution-services") {
    return <ExecutionDataStatus serviceName={serviceName} />;
  }

  // Use standard data status for all other services
  return (
    <DataStatusTabInternal
      serviceName={serviceName}
      deploymentResult={deploymentResult}
      isDeploying={isDeploying}
      onDeployMissing={onDeployMissing}
    />
  );
}
