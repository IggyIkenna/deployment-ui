/**
 * VenueDetailPanel — inline drilldown for a venue click.
 *
 * Unified panel that renders either the CeFi v1 response shape
 * (``instrument_types`` + ``top_instruments``) or the v2 DeFi-aware shape
 * (``chain`` / ``protocol`` / ``protocols[]`` / ``pools[]``).  The caller
 * (``DataStatusTab``) is responsible for picking the right endpoint — this
 * component just narrows on the response shape and renders accordingly.
 *
 * Relocating the render here lets the DeFi chain→protocol tree inline the
 * panel right under the clicked protocol, rather than forcing the user to
 * hunt for the CeFi venue-level render block.
 */

import type {
  VenueDetailResult,
  VenueDetailV2Response,
} from "../api/client";

type AnyVenueDetail = VenueDetailResult | VenueDetailV2Response;

function isV2(d: AnyVenueDetail): d is VenueDetailV2Response {
  return "chain" in d;
}

function isCompositeDefi(d: VenueDetailV2Response): boolean {
  // Composite (PROTOCOL-CHAIN) responses carry ``pools`` or a populated
  // ``protocol`` + ``total_pools > 0`` path.  Chain-only responses populate
  // ``protocols`` and leave ``protocol`` as null.
  return d.protocol !== null && d.protocol !== "";
}

export function VenueDetailPanel({
  loading,
  data,
}: {
  loading: boolean;
  data: AnyVenueDetail | null;
}) {
  if (loading) {
    return (
      <div
        className="p-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
        data-testid="venue-detail-panel-loading"
      >
        <span className="text-[9px] text-[var(--color-text-muted)]">
          Loading…
        </span>
      </div>
    );
  }
  if (!data) {
    return (
      <div
        className="p-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
        data-testid="venue-detail-panel-error"
      >
        <span className="text-[9px] text-[var(--color-accent-red)]">
          Failed to load
        </span>
      </div>
    );
  }

  // ---------- v2 (DeFi-aware) branch ----------
  if (isV2(data) && data.asset_group === "DEFI") {
    if (isCompositeDefi(data)) {
      return (
        <div
          className="p-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
          data-testid="venue-detail-panel-defi-pools"
        >
          <div className="text-[9px] text-[var(--color-text-muted)] mb-1">
            {data.protocol} on {data.chain ?? "?"} · {data.total_pools} pools ·{" "}
            {data.total_tokens} tokens
          </div>
          {data.pools.length === 0 ? (
            <span className="text-[9px] italic text-[var(--color-text-muted)]">
              No pools found.
            </span>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {data.pools.slice(0, 50).map((pool, i) => {
                const address = String(pool.address ?? pool.id ?? `pool-${i}`);
                const token0 = String(pool.token0 ?? "?");
                const token1 = String(pool.token1 ?? "?");
                const feeTier = pool.fee_tier ?? pool.fee ?? "?";
                const tvl = pool.tvl_usd ?? pool.tvlUSD ?? null;
                return (
                  <div
                    key={address}
                    className="flex gap-2 text-[8px] font-mono items-center"
                    data-testid={`defi-pool-row-${address}`}
                  >
                    <span
                      className="truncate max-w-[160px]"
                      title={address}
                    >
                      {address}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      {token0}/{token1}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      {String(feeTier)}
                    </span>
                    <div className="flex-1" />
                    {tvl !== null && (
                      <span className="text-[var(--color-text-muted)]">
                        $
                        {typeof tvl === "number"
                          ? tvl.toLocaleString()
                          : String(tvl)}
                      </span>
                    )}
                  </div>
                );
              })}
              {data.pools.length > 50 && (
                <div className="text-[7px] text-[var(--color-text-muted)]">
                  +{data.pools.length - 50} more pools
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    // Chain-only DeFi branch — protocols list
    return (
      <div
        className="p-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
        data-testid="venue-detail-panel-defi-protocols"
      >
        <div className="text-[9px] text-[var(--color-text-muted)] mb-1">
          {data.chain ?? data.venue} · {data.protocols.length} protocols ·{" "}
          {data.total_pools} pools · {data.total_tokens} tokens
        </div>
        {data.protocols.length === 0 ? (
          <span className="text-[9px] italic text-[var(--color-text-muted)]">
            No protocols.
          </span>
        ) : (
          <div className="space-y-0.5">
            {data.protocols.map((proto, i) => {
              const name = String(proto.name ?? `protocol-${i}`);
              const poolCount = proto.pool_count ?? 0;
              const tokenCount = proto.token_count ?? 0;
              return (
                <div
                  key={name}
                  className="flex gap-2 text-[9px] font-mono items-center"
                  data-testid={`defi-protocol-row-${name}`}
                >
                  <span>{name}</span>
                  <div className="flex-1" />
                  <span className="text-[var(--color-text-muted)]">
                    {String(poolCount)} pools
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {String(tokenCount)} tokens
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------- v1 (CeFi / legacy) branch ----------
  const v1 = data as VenueDetailResult;
  return (
    <div
      className="p-1.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
      data-testid="venue-detail-panel-cefi"
    >
      <div className="space-y-1">
        <div className="text-[9px] text-[var(--color-text-muted)]">
          {v1.total_instruments} instruments (as of {v1.date})
        </div>
        {v1.instrument_types && (
          <div className="space-y-0.5">
            <span className="text-[9px] font-medium text-[var(--color-accent-cyan)]">
              Instrument Types
            </span>
            {Object.entries(v1.instrument_types).map(([type, count]) => (
              <div key={type} className="flex justify-between text-[9px]">
                <span className="text-[var(--color-text-secondary)] font-mono">
                  {type}
                </span>
                <span className="text-[var(--color-text-muted)] font-mono">
                  {count as number}
                </span>
              </div>
            ))}
          </div>
        )}
        {v1.top_instruments && v1.top_instruments.length > 0 && (
          <details className="mt-0.5">
            <summary className="text-[9px] text-[var(--color-accent-cyan)] cursor-pointer hover:underline">
              Top {v1.top_instruments.length} instruments
            </summary>
            <div className="mt-0.5 space-y-0.5 max-h-48 overflow-y-auto">
              {v1.top_instruments.map((inst) => (
                <div
                  key={inst.key}
                  className="flex justify-between text-[8px] font-mono"
                >
                  <span
                    className="text-[var(--color-text-secondary)] truncate mr-2"
                    title={inst.key}
                  >
                    {inst.key}
                  </span>
                  <span className="text-[var(--color-text-muted)] shrink-0">
                    {inst.type}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
