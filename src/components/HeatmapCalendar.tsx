import { useMemo } from "react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export type HeatmapStatus =
  | "complete"
  | "partial"
  | "missing"
  | "future"
  | "no_expectation"
  | "empty_confirmed"
  | "attempted_failed";

interface DayData {
  date: string;
  status: HeatmapStatus;
  coverage?: number; // 0-100 percentage
  tooltip?: string;
  errorReason?: string;
}

interface HeatmapCalendarProps {
  data: DayData[];
  startDate: string;
  endDate: string;
  onDateClick?: (date: string) => void;
  selectedDate?: string;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getStatusColor(status: DayData["status"], coverage?: number): string {
  switch (status) {
    case "complete":
      return "var(--color-accent-green)";
    case "partial":
      // Gradient based on coverage
      if (coverage !== undefined) {
        if (coverage >= 75) return "var(--color-accent-green)";
        if (coverage >= 50) return "var(--color-accent-amber)";
        if (coverage >= 25) return "var(--color-accent-orange)";
        return "var(--color-accent-red)";
      }
      return "var(--color-accent-amber)";
    case "missing":
      return "var(--color-accent-red)";
    case "empty_confirmed":
      // Honest-coverage Phase C: attempted, zero rows returned legitimately.
      // Distinct from "missing" (no attempt recorded) — renders as a muted grey
      // with a hatched overlay (see getStatusBackgroundImage).
      return "var(--color-bg-tertiary)";
    case "attempted_failed":
      // Honest-coverage Phase C: attempted, adapter raised. Solid red base
      // with diagonal hatch overlay distinguishes from "missing" (no attempt).
      return "var(--color-accent-red)";
    case "future":
      return "var(--color-bg-tertiary)";
    case "no_expectation":
    default:
      return "var(--color-bg-secondary)";
  }
}

function getStatusOpacity(status: DayData["status"]): number {
  switch (status) {
    case "complete":
      return 0.9;
    case "partial":
      return 0.7;
    case "missing":
      return 0.8;
    case "empty_confirmed":
      return 0.65;
    case "attempted_failed":
      return 0.95;
    case "future":
    case "no_expectation":
    default:
      return 0.3;
  }
}

// Diagonal-hash / cross-hatch overlays — makes the two "attempted" states
// (empty_confirmed + attempted_failed) visually distinct from plain fills
// even in monochrome / high-contrast modes, satisfying WCAG shape-not-colour.
function getStatusBackgroundImage(
  status: DayData["status"],
): string | undefined {
  switch (status) {
    case "empty_confirmed":
      // Grey cross-hatch: attempted, confirmed empty.
      return (
        "repeating-linear-gradient(135deg, " +
        "var(--color-stripe-light) 0 2px, transparent 2px 5px)"
      );
    case "attempted_failed":
      // Red diagonal hash: attempted, raised.
      return (
        "repeating-linear-gradient(45deg, " +
        "var(--color-stripe-dark) 0 2px, transparent 2px 5px)"
      );
    default:
      return undefined;
  }
}

function getStatusAriaLabel(day: DayData): string {
  const pct = day.coverage !== undefined ? ` (${day.coverage}%)` : "";
  const err = day.errorReason ? ` — error: ${day.errorReason}` : "";
  const statusHuman: Record<DayData["status"], string> = {
    complete: "captured",
    partial: "partial coverage",
    missing: "missing — not attempted",
    empty_confirmed: "attempted, confirmed empty",
    attempted_failed: "attempted, failed",
    future: "future (not yet expected)",
    no_expectation: "no shard expected",
  };
  return `${day.date}: ${statusHuman[day.status]}${pct}${err}`;
}

export function HeatmapCalendar({
  data,
  startDate,
  endDate,
  onDateClick,
  selectedDate,
}: HeatmapCalendarProps) {
  // Build a map of date -> data for quick lookup
  const dataMap = useMemo(() => {
    const map = new Map<string, DayData>();
    data.forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  // Generate calendar grid for the date range
  const calendarData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group by month
    const months: {
      year: number;
      month: number;
      weeks: (DayData | null)[][];
    }[] = [];

    const currentDate = new Date(start);
    // Start from the beginning of the week containing start date
    currentDate.setDate(currentDate.getDate() - currentDate.getDay());

    let currentMonth = -1;
    let currentWeek: (DayData | null)[] = [];

    while (currentDate <= end || currentWeek.length > 0) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const dateStr = currentDate.toISOString().split("T")[0];

      // Check if we're starting a new month
      if (month !== currentMonth) {
        if (currentWeek.length > 0) {
          // Pad the last week of previous month
          while (currentWeek.length < 7) {
            currentWeek.push(null);
          }
          if (months.length > 0) {
            months[months.length - 1].weeks.push(currentWeek);
          }
          currentWeek = [];
        }

        months.push({
          year,
          month,
          weeks: [],
        });
        currentMonth = month;

        // Pad the first week if needed
        const dayOfWeek = currentDate.getDay();
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push(null);
        }
      }

      // Determine day status
      const isInRange = currentDate >= start && currentDate <= end;
      const isFuture = currentDate > today;

      let dayData: DayData | null = null;

      if (isInRange) {
        const existingData = dataMap.get(dateStr);
        if (existingData) {
          dayData = existingData;
        } else if (isFuture) {
          dayData = { date: dateStr, status: "future" };
        } else {
          dayData = { date: dateStr, status: "missing" };
        }
      }

      currentWeek.push(dayData);

      // Check if week is complete
      if (currentWeek.length === 7) {
        months[months.length - 1].weeks.push(currentWeek);
        currentWeek = [];
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);

      // Break if we've gone past end date and completed the week
      if (currentDate > end && currentWeek.length === 0) {
        break;
      }
    }

    return months;
  }, [startDate, endDate, dataMap]);

  return (
    <div className="space-y-6">
      {/* Legend — 4-state honest-coverage (Phase C) */}
      <div
        className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-muted)]"
        data-testid="heatmap-legend"
      >
        <span>Coverage:</span>
        <div className="flex items-center gap-1" data-legend-state="captured">
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: "var(--color-accent-green)",
              opacity: 0.9,
            }}
          />
          <span>Captured</span>
        </div>
        <div
          className="flex items-center gap-1"
          data-legend-state="empty_confirmed"
        >
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              backgroundImage: getStatusBackgroundImage("empty_confirmed"),
              opacity: 0.65,
            }}
          />
          <span>Empty (attempted, 0 rows)</span>
        </div>
        <div
          className="flex items-center gap-1"
          data-legend-state="attempted_failed"
        >
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: "var(--color-accent-red)",
              backgroundImage: getStatusBackgroundImage("attempted_failed"),
              opacity: 0.95,
            }}
          />
          <span>Failed (attempted, error)</span>
        </div>
        <div className="flex items-center gap-1" data-legend-state="missing">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "var(--color-accent-red)", opacity: 0.8 }}
          />
          <span>Missing (not attempted)</span>
        </div>
        <div className="flex items-center gap-1" data-legend-state="partial">
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: "var(--color-accent-amber)",
              opacity: 0.7,
            }}
          />
          <span>Partial</span>
        </div>
        <div className="flex items-center gap-1" data-legend-state="future">
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              opacity: 0.3,
            }}
          />
          <span>Future / N/A</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex flex-wrap gap-6">
        {calendarData.map(
          (monthData: {
            year: number;
            month: number;
            weeks: (DayData | null)[][];
          }) => (
            <div
              key={`${monthData.year}-${monthData.month}`}
              className="flex-shrink-0"
            >
              {/* Month header */}
              <div className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                {MONTHS[monthData.month]} {monthData.year}
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="text-[10px] text-[var(--color-text-muted)] text-center w-6"
                  >
                    {day[0]}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              <div className="space-y-1">
                {monthData.weeks.map(
                  (week: (DayData | null)[], weekIdx: number) => (
                    <div key={weekIdx} className="grid grid-cols-7 gap-1">
                      {week.map((day: DayData | null, dayIdx: number) => {
                        if (!day) {
                          return <div key={dayIdx} className="w-6 h-6" />;
                        }

                        const isSelected = selectedDate === day.date;
                        const dayNum = new Date(day.date).getDate();

                        const bgImage = getStatusBackgroundImage(day.status);
                        return (
                          <Button
                            key={day.date}
                            variant="ghost"
                            data-testid={`heatmap-day-${day.date}`}
                            data-status={day.status}
                            aria-label={getStatusAriaLabel(day)}
                            onClick={() => onDateClick?.(day.date)}
                            className={cn(
                              "w-6 h-6 rounded-sm text-[10px] font-mono relative p-0",
                              "hover:ring-1 hover:ring-[var(--color-accent-cyan)] transition-all",
                              isSelected &&
                                "ring-2 ring-[var(--color-accent-cyan)]",
                            )}
                            style={{
                              backgroundColor: getStatusColor(
                                day.status,
                                day.coverage,
                              ),
                              backgroundImage: bgImage,
                              opacity: getStatusOpacity(day.status),
                            }}
                            title={day.tooltip || getStatusAriaLabel(day)}
                          >
                            <span className="absolute inset-0 flex items-center justify-center text-white mix-blend-difference">
                              {dayNum}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  ),
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {/* Summary Stats (4-state) */}
      <div
        className="flex flex-wrap items-center gap-4 text-xs border-t border-[var(--color-border-subtle)] pt-4"
        data-testid="heatmap-summary"
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Total days:</span>
          <span className="font-mono font-medium">{data.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Captured:</span>
          <span className="font-mono font-medium text-[var(--color-accent-green)]">
            {data.filter((d) => d.status === "complete").length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Empty:</span>
          <span className="font-mono font-medium">
            {data.filter((d) => d.status === "empty_confirmed").length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Failed:</span>
          <span
            className="font-mono font-medium text-[var(--color-accent-red)]"
            data-testid="heatmap-failed-count"
          >
            {data.filter((d) => d.status === "attempted_failed").length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Partial:</span>
          <span className="font-mono font-medium text-[var(--color-accent-amber)]">
            {data.filter((d) => d.status === "partial").length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Missing:</span>
          <span className="font-mono font-medium text-[var(--color-accent-red)]">
            {data.filter((d) => d.status === "missing").length}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to convert API response to HeatmapCalendar data format (shared with data status views)
export function convertDataStatusToHeatmap(
  categories: Record<
    string,
    {
      coverage_pct: number;
      dates?: Record<string, boolean>;
    }
  >,
  startDate: string,
  endDate: string,
): DayData[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: DayData[] = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const isFuture = currentDate > today;

    if (isFuture) {
      result.push({ date: dateStr, status: "future" });
    } else {
      // Check if data exists for this date across all categories
      let hasData = false;
      let totalCategories = 0;
      let categoriesWithData = 0;

      for (const [, catData] of Object.entries(categories)) {
        totalCategories++;
        if (catData.dates && catData.dates[dateStr]) {
          categoriesWithData++;
          hasData = true;
        }
      }

      if (!hasData) {
        result.push({ date: dateStr, status: "missing" });
      } else if (categoriesWithData === totalCategories) {
        result.push({
          date: dateStr,
          status: "complete",
          coverage: 100,
          tooltip: `${dateStr}: All ${totalCategories} categories complete`,
        });
      } else {
        const coverage = Math.round(
          (categoriesWithData / totalCategories) * 100,
        );
        result.push({
          date: dateStr,
          status: "partial",
          coverage,
          tooltip: `${dateStr}: ${categoriesWithData}/${totalCategories} categories (${coverage}%)`,
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return result;
}
