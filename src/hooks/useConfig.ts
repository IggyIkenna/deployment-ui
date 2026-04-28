import { useCallback, useEffect, useState } from "react";
import * as api from "../api/client";
import type { AssetGroupVenuesResponse, StartDatesResponse } from "../types";

export function useVenuesByAssetGroup(assetGroup: string | null) {
  const [venues, setVenues] = useState<AssetGroupVenuesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetGroup) {
      setVenues(null);
      return;
    }

    const agName = assetGroup;
    async function fetchVenues() {
      try {
        setLoading(true);
        const response = await api.getVenuesByAssetGroup(agName);
        setVenues(response);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch venues");
      } finally {
        setLoading(false);
      }
    }
    fetchVenues();
  }, [assetGroup]);

  return { venues, loading, error };
}

/**
 * Fetch venues for multiple asset groups and return the total count across all.
 * Used for accurate shard estimation when multiple asset groups are selected.
 */
export function useVenueCountByAssetGroups(assetGroups: string[]) {
  const [totalVenueCount, setTotalVenueCount] = useState(0);
  const [venuesByAssetGroup, setVenuesByAssetGroup] = useState<
    Record<string, string[]>
  >({});
  const [loading, setLoading] = useState(false);

  // Stable key to avoid re-fetching when array reference changes but content is same
  const assetGroupsKey = assetGroups.slice().sort().join(",");

  useEffect(() => {
    if (!assetGroupsKey) {
      setTotalVenueCount(0);
      setVenuesByAssetGroup({});
      return;
    }

    const groups = assetGroupsKey.split(",").filter(Boolean);
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      try {
        const results = await Promise.all(
          groups.map((ag) => api.getVenuesByAssetGroup(ag).catch(() => null)),
        );
        if (cancelled) return;

        let total = 0;
        const byAg: Record<string, string[]> = {};
        for (let i = 0; i < groups.length; i++) {
          const venueList = results[i]?.venues ?? [];
          byAg[groups[i]] = venueList;
          total += venueList.length;
        }
        setTotalVenueCount(total);
        setVenuesByAssetGroup(byAg);
      } catch {
        // Fallback: don't crash estimation
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [assetGroupsKey]);

  return { totalVenueCount, venuesByAssetGroup, loading };
}

export function useStartDates(serviceName: string | null) {
  const [startDates, setStartDates] = useState<StartDatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceName) {
      setStartDates(null);
      return;
    }

    const svcName = serviceName;
    async function fetchStartDates() {
      try {
        setLoading(true);
        const response = await api.getStartDates(svcName);
        setStartDates(response);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch start dates",
        );
      } finally {
        setLoading(false);
      }
    }
    fetchStartDates();
  }, [serviceName]);

  // Helper to get earliest valid date for a venue
  const getVenueStartDate = useCallback(
    (assetGroup: string, venue?: string): string | null => {
      if (!startDates) return null;

      const agDates = startDates.start_dates[assetGroup];
      if (!agDates) return null;

      // If venue specified, try to get venue-specific date
      if (venue && agDates.venues?.[venue]) {
        return agDates.venues[venue];
      }

      // Fall back to asset-group start date
      return agDates.asset_group_start || null;
    },
    [startDates],
  );

  // Validate a date against venue constraints
  const validateDate = useCallback(
    (
      date: string,
      assetGroup: string,
      venue?: string,
    ): { valid: boolean; message?: string; earliestDate?: string } => {
      const earliestDate = getVenueStartDate(assetGroup, venue);

      if (!earliestDate) {
        return { valid: true }; // No constraint found
      }

      if (date < earliestDate) {
        return {
          valid: false,
          message: venue
            ? `${venue} data only available from ${earliestDate}`
            : `${assetGroup} data only available from ${earliestDate}`,
          earliestDate,
        };
      }

      return { valid: true };
    },
    [getVenueStartDate],
  );

  return { startDates, loading, error, getVenueStartDate, validateDate };
}
