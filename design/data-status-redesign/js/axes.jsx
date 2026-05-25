// Axis matrix — authoritative SSOT mirrored from docs/shard-axis-matrix.json.
// Keys are "service|asset_group" (lowercase ag). See docs/SHARD_AXIS_REFERENCE.md
// for what each axis kind means in the UI.

const SHARD_AXIS_MATRIX = {
  shard_axes: {
    "instruments-service|cefi": ["venue"],
    "instruments-service|tradfi": ["venue"],
    "instruments-service|defi": ["venue", "chain"],
    "instruments-service|sports": ["data_type", "league_id"],
    "instruments-service|prediction": ["venue", "canonical_question_group"],
    "market-tick-data-service|cefi": ["venue", "data_type", "instrument_type", "instrument_id"],
    "market-tick-data-service|tradfi": ["venue", "data_type", "instrument_type", "instrument_id"],
    "market-tick-data-service|defi": ["venue", "chain", "data_type", "instrument_id"],
    "market-tick-data-service|sports": ["data_type", "league_id"],
    "market-tick-data-service|prediction": ["venue", "canonical_question_group", "data_type"],
    "market-data-processing-service|cefi": ["venue", "data_type", "instrument_type", "instrument_id"],
    "market-data-processing-service|tradfi": ["venue", "data_type", "instrument_type", "instrument_id"],
    "market-data-processing-service|defi": ["venue", "chain", "data_type", "instrument_id"],
    "market-data-processing-service|sports": ["data_type", "league_id"],
    "market-data-processing-service|prediction": ["venue", "canonical_question_group", "data_type"],
    "features-service|cefi": ["venue", "feature_group", "timeframe", "instrument_id"],
    "features-service|tradfi": ["venue", "feature_group", "timeframe", "instrument_id"],
    "features-service|defi": ["venue", "chain", "feature_group", "timeframe", "instrument_id"],
    "features-service|sports": ["feature_group", "league_id"],
    "features-service|shared": ["feature_group", "timeframe"],
    "features-service|prediction": ["venue", "canonical_question_group", "feature_group", "timeframe"],
    "ml-training-service|shared": ["model_family", "training_period", "job_id"],
    "ml-inference-service|shared": ["model_family", "job_id"],
    "strategy-service|cefi": ["strategy_id", "job_id"],
    "strategy-service|tradfi": ["strategy_id", "job_id"],
    "strategy-service|defi": ["strategy_id", "job_id"],
    "strategy-service|sports": ["strategy_id", "job_id"],
    "strategy-service|prediction": ["strategy_id", "job_id"],
    "execution-service|cefi": ["strategy_id", "instruction_type", "job_id"],
    "execution-service|tradfi": ["strategy_id", "instruction_type", "job_id"],
    "execution-service|defi": ["strategy_id", "instruction_type", "job_id"],
    "execution-service|sports": ["strategy_id", "instruction_type", "job_id"],
    "execution-service|prediction": ["strategy_id", "instruction_type", "job_id"],
  },
  primary_axis: {
    "instruments-service|cefi": "venue",       "instruments-service|tradfi": "venue",
    "instruments-service|defi": "venue",       "instruments-service|sports": "data_type",
    "instruments-service|prediction": "venue",
    "market-tick-data-service|cefi": "venue",  "market-tick-data-service|tradfi": "venue",
    "market-tick-data-service|defi": "venue",  "market-tick-data-service|sports": "data_type",
    "market-tick-data-service|prediction": "venue",
    "market-data-processing-service|cefi": "venue", "market-data-processing-service|tradfi": "venue",
    "market-data-processing-service|defi": "venue", "market-data-processing-service|sports": "data_type",
    "market-data-processing-service|prediction": "venue",
    "features-service|cefi": "venue",      "features-service|tradfi": "venue",
    "features-service|defi": "venue",      "features-service|sports": "feature_group",
    "features-service|shared": "feature_group",
    "features-service|prediction": "venue",
    "ml-training-service|shared": "model_family",
    "ml-inference-service|shared": "model_family",
    "strategy-service|cefi": "strategy_id",  "strategy-service|tradfi": "strategy_id",
    "strategy-service|defi": "strategy_id",  "strategy-service|sports": "strategy_id",
    "strategy-service|prediction": "strategy_id",
    "execution-service|cefi": "instruction_type", "execution-service|tradfi": "instruction_type",
    "execution-service|defi": "instruction_type", "execution-service|sports": "instruction_type",
    "execution-service|prediction": "instruction_type",
  },
  breakdown_axes: {
    "instruments-service|cefi": ["instrument_type", "data_type"],
    "instruments-service|tradfi": ["instrument_type", "data_type"],
    "instruments-service|defi": ["chain", "instrument_type", "data_type"],
    "instruments-service|sports": ["league_id", "source"],
    "instruments-service|prediction": ["canonical_question_group", "data_type"],
    "market-tick-data-service|cefi": ["data_type", "instrument_type", "instrument_id"],
    "market-tick-data-service|tradfi": ["data_type", "instrument_type", "instrument_id"],
    "market-tick-data-service|defi": ["chain", "data_type", "instrument_id", "instrument_type"],
    "market-tick-data-service|sports": ["league_id", "source", "fixture_id"],
    "market-tick-data-service|prediction": ["canonical_question_group", "data_type"],
    "market-data-processing-service|cefi": ["data_type", "instrument_type", "instrument_id"],
    "market-data-processing-service|tradfi": ["data_type", "instrument_type", "instrument_id"],
    "market-data-processing-service|defi": ["chain", "data_type", "instrument_id", "instrument_type"],
    "market-data-processing-service|sports": ["league_id", "source", "fixture_id"],
    "market-data-processing-service|prediction": ["canonical_question_group", "data_type"],
    "features-service|cefi": ["feature_group", "timeframe", "instrument_id", "instrument_type"],
    "features-service|tradfi": ["feature_group", "timeframe", "instrument_id", "instrument_type"],
    "features-service|defi": ["chain", "feature_group", "timeframe", "instrument_id", "instrument_type"],
    "features-service|sports": ["league_id", "source", "data_type"],
    "features-service|shared": ["timeframe"],
    "features-service|prediction": ["canonical_question_group", "feature_group", "timeframe"],
    "ml-training-service|shared": ["training_period", "job_id", "client_id", "asset_group"],
    "ml-inference-service|shared": ["job_id", "client_id", "asset_group"],
    "strategy-service|cefi": ["job_id", "archetype", "client_id"],
    "strategy-service|tradfi": ["job_id", "archetype", "client_id"],
    "strategy-service|defi": ["job_id", "archetype", "client_id"],
    "strategy-service|sports": ["job_id", "archetype", "client_id"],
    "strategy-service|prediction": ["job_id", "archetype", "client_id"],
    "execution-service|cefi": ["strategy_id", "job_id", "venue", "client_id"],
    "execution-service|tradfi": ["strategy_id", "job_id", "venue", "client_id"],
    "execution-service|defi": ["strategy_id", "job_id", "venue", "client_id"],
    "execution-service|sports": ["strategy_id", "job_id", "venue", "client_id"],
    "execution-service|prediction": ["strategy_id", "job_id", "venue", "client_id"],
  },
};

/** Which (service, asset_group) pairs exist. */
const SERVICE_AG_PAIRS = Object.keys(SHARD_AXIS_MATRIX.shard_axes).map(k => {
  const [service, ag] = k.split("|");
  return { service, ag };
});

const AGS_FOR_SERVICE = (() => {
  const o = {};
  for (const { service, ag } of SERVICE_AG_PAIRS) (o[service] ||= []).push(ag);
  return o;
})();

/* ───────── illustrative axis values (for realistic mocks, not exhaustive) ───────── */

const VENUES_BY_AG_LC = {
  cefi:       ["binance", "bybit", "okx", "deribit", "hyperliquid", "aster", "kraken", "coinbase"],
  tradfi:     ["nyse", "nasdaq", "cme", "ice", "eurex"],
  defi:       ["uniswap_v3", "curve", "balancer", "sushiswap", "pancakeswap", "phoenix", "orca", "raydium", "drift"],
  sports:     [], // sports primary axis is data_type, not venue
  prediction: ["polymarket", "kalshi"],
  shared:     [],
};

const CHAINS = ["ethereum", "arbitrum", "base", "polygon", "optimism", "solana", "bsc"];

const DATA_TYPES_BY_AG_LC = {
  cefi:       ["trades", "quotes", "funding_rate", "open_interest", "liquidations", "klines", "mark_price"],
  tradfi:     ["trades", "quotes", "level2", "imbalances", "auctions"],
  defi:       ["swaps", "pool_state", "lending_rates", "lst_apr"],
  sports:     ["fixtures", "odds", "results", "lineups"],
  prediction: ["markets", "trades", "orderbook"],
};

const INSTRUMENT_TYPES_BY_AG_LC = {
  cefi:       ["spot", "perpetual", "future", "option"],
  tradfi:     ["equity", "future", "option"],
  defi:       ["pool", "lending", "lst"],
  sports:     [],
  prediction: [],
};

// Top-N instruments per venue+instrument_type — kept small enough that mocks
// stay snappy but large enough that drilldowns feel real. Names are illustrative.
const INSTRUMENTS_SAMPLE = {
  cefi_spot:       ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "MATICUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT", "ARBUSDT", "OPUSDT", "ATOMUSDT", "TRXUSDT", "INJUSDT", "SUIUSDT", "APTUSDT", "NEARUSDT"],
  cefi_perpetual:  ["BTCUSDT-PERP", "ETHUSDT-PERP", "SOLUSDT-PERP", "BNBUSDT-PERP", "XRPUSDT-PERP", "DOGEUSDT-PERP", "ADAUSDT-PERP", "AVAXUSDT-PERP", "MATICUSDT-PERP", "LINKUSDT-PERP", "ARBUSDT-PERP", "OPUSDT-PERP", "INJUSDT-PERP", "SUIUSDT-PERP", "APTUSDT-PERP"],
  cefi_future:     ["BTCUSDT-26DEC25", "BTCUSDT-27MAR26", "ETHUSDT-26DEC25", "ETHUSDT-27MAR26"],
  cefi_option:     ["BTC-26DEC25-90000-C", "BTC-26DEC25-90000-P", "BTC-26DEC25-100000-C", "ETH-26DEC25-3500-C"],
  tradfi_equity:   ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "SPY", "QQQ", "IWM", "VOO", "JPM", "BAC", "WMT"],
  tradfi_future:   ["ES-Z25", "NQ-Z25", "CL-Z25", "GC-Z25"],
  tradfi_option:   ["SPX-26DEC25-5800-C"],
  defi_pool:       ["USDC/WETH-0.05%", "WBTC/WETH-0.3%", "USDC/USDT-0.01%", "DAI/USDC-0.01%", "WETH/wstETH-0.01%", "USDC/DAI-0.05%"],
  defi_lending:    ["USDC-aave-v3", "WETH-aave-v3", "WBTC-aave-v3", "DAI-aave-v3"],
  defi_lst:        ["stETH-lido", "rETH-rocketpool", "cbETH-coinbase"],
};

function instrumentsFor(ag, venue, instrument_type) {
  // For defi/sports/prediction we don't always have instrument_type — fall back.
  if (ag === "cefi")   return INSTRUMENTS_SAMPLE["cefi_" + (instrument_type || "spot")] || INSTRUMENTS_SAMPLE.cefi_spot;
  if (ag === "tradfi") return INSTRUMENTS_SAMPLE["tradfi_" + (instrument_type || "equity")] || INSTRUMENTS_SAMPLE.tradfi_equity;
  if (ag === "defi")   return INSTRUMENTS_SAMPLE["defi_" + (instrument_type || "pool")] || INSTRUMENTS_SAMPLE.defi_pool;
  return [];
}

const FEATURE_GROUPS = ["delta_one", "volatility", "onchain", "calendar", "microstructure"];
const TIMEFRAMES    = ["1m", "5m", "15m", "1h", "4h", "1d"];
const LEAGUES       = ["EPL", "NBA", "NFL", "MLB", "LaLiga", "NHL", "UCL"];
const SOURCES       = ["betfair", "pinnacle", "draftkings"];
const MODEL_FAMILY  = ["xgboost", "lstm", "transformer"];
const TRAINING_PERIOD = ["d30", "d60", "d90", "d180"];
const STRATEGIES    = ["carry_staked_basis", "arbitrage_price_dispersion", "momentum_xs_xv", "vol_carry_funding", "ls_basis"];
const INSTRUCTION_TYPES = ["twap", "vwap", "passive", "aggressive", "iceberg"];
const ARCHETYPES    = ["carry_staked_basis", "arbitrage_price_dispersion"];
const CANONICAL_Q_GROUPS = ["us_elections", "fed_policy", "crypto_price_targets", "sports_outcomes"];

/** Map shard-axis key → list of possible values for a given (ag, context). */
function axisValues(axis, ag, ctx = {}) {
  switch (axis) {
    case "venue":            return VENUES_BY_AG_LC[ag] || [];
    case "chain":            return CHAINS;
    case "data_type":        return DATA_TYPES_BY_AG_LC[ag] || [];
    case "instrument_type":  return INSTRUMENT_TYPES_BY_AG_LC[ag] || [];
    case "instrument_id":    return instrumentsFor(ag, ctx.venue, ctx.instrument_type);
    case "feature_group":    return FEATURE_GROUPS;
    case "timeframe":        return TIMEFRAMES;
    case "league_id":        return LEAGUES;
    case "source":           return SOURCES;
    case "model_family":     return MODEL_FAMILY;
    case "training_period":  return TRAINING_PERIOD;
    case "strategy_id":      return STRATEGIES;
    case "instruction_type": return INSTRUCTION_TYPES;
    case "archetype":        return ARCHETYPES;
    case "canonical_question_group": return CANONICAL_Q_GROUPS;
    case "job_id":           return [];  // huge UUIDs — handled separately
    case "client_id":        return ["acme", "beta-cap", "northwind"];
    case "fixture_id":       return [];  // per-league
    default:                 return [];
  }
}

/** Service mode helpers */
function getShardAxes(service, ag)    { return SHARD_AXIS_MATRIX.shard_axes[`${service}|${ag}`]; }
function getPrimaryAxis(service, ag)  { return SHARD_AXIS_MATRIX.primary_axis[`${service}|${ag}`]; }
function getBreakdownAxes(service, ag){ return SHARD_AXIS_MATRIX.breakdown_axes[`${service}|${ag}`] || []; }

/** Human-readable axis label. */
const AXIS_LABEL = {
  venue: "Venue", chain: "Chain", data_type: "Data type",
  instrument_type: "Inst. type", instrument_id: "Instrument",
  feature_group: "Feature group", timeframe: "Timeframe",
  league_id: "League", source: "Source", fixture_id: "Fixture",
  model_family: "Model family", training_period: "Training period",
  strategy_id: "Strategy", instruction_type: "Instruction",
  archetype: "Archetype", canonical_question_group: "Question group",
  job_id: "Job", client_id: "Client", asset_group: "Asset group",
};
const axisLabel = (a) => AXIS_LABEL[a] || a;

Object.assign(window, {
  SHARD_AXIS_MATRIX, SERVICE_AG_PAIRS, AGS_FOR_SERVICE,
  VENUES_BY_AG_LC, CHAINS, DATA_TYPES_BY_AG_LC, INSTRUMENT_TYPES_BY_AG_LC,
  FEATURE_GROUPS, TIMEFRAMES, LEAGUES, SOURCES, MODEL_FAMILY, TRAINING_PERIOD,
  STRATEGIES, INSTRUCTION_TYPES, ARCHETYPES, CANONICAL_Q_GROUPS,
  axisValues, instrumentsFor,
  getShardAxes, getPrimaryAxis, getBreakdownAxes,
  AXIS_LABEL, axisLabel,
});
