/**
 * UI string constants — i18n readiness catalog (S15 audit 2026-05-18).
 *
 * All user-visible label and error strings in deployment-ui must be
 * sourced from this module so they are discoverable, auditable, and
 * easy to swap for translated copies in a future i18n pass.
 */

// ---------------------------------------------------------------------------
// Button / action labels
// ---------------------------------------------------------------------------

export const BTN_COMPARE = "Compare";
export const BTN_COMPARING = "Comparing…";
export const BTN_HIDE_DIFF = "Hide Diff";
export const BTN_COMPARE_SHAS = "Compare SHAs";
export const BTN_ROLLBACK = "Rollback";
export const BTN_LOADING = "Loading…";
export const BTN_LOAD = "Load";
export const BTN_REFRESH = "Refresh";
export const BTN_REFRESHING = "Refreshing…";
export const BTN_SUBMIT_REQUEST = "Submit Request";
export const BTN_SUBMITTING = "Submitting…";
export const BTN_DRY_RUN_PREVIEW = "Dry Run Preview";
export const BTN_DEPLOYMENT_STARTED = "Deployment Started";

// ---------------------------------------------------------------------------
// Error fallback messages
// ---------------------------------------------------------------------------

export const ERR_FAILED_TO_LOAD_HISTORY = "Failed to load history";
export const ERR_ROLLBACK_FAILED = "Rollback failed";
export const ERR_FAILED_TO_FETCH_DIFF = "Failed to fetch diff";
export const ERR_FAILED_TO_LOAD_SERVICES = "Failed to load services";
export const ERR_FAILED_TO_LOAD_COST_DATA = "Failed to load cost data";
export const ERR_FAILED_TO_LOAD_DETAILS = "Failed to load deployment details";
export const ERR_LAUNCH_FAILED = "Launch failed";
export const ERR_ML_LAUNCH_FAILED = "ML experiment launch failed";
export const ERR_FAILED_TO_LOAD_BUILDS = "Failed to fetch builds";
export const ERR_FAILED_TO_LOAD_QUOTA = "Failed to load quota info";
export const ERR_FAILED_TO_LOAD_FIXTURES = "Failed to load fixtures";
export const ERR_SOMETHING_WENT_WRONG = "Something went wrong";

// ---------------------------------------------------------------------------
// Status / summary labels
// ---------------------------------------------------------------------------

export const LABEL_TOTAL_SERVICES = "Total Services";
export const LABEL_HEALTHY = "Healthy";
export const LABEL_DEGRADED = "Degraded";
export const LABEL_LAST_DEPLOY = "Last Deploy";
export const LABEL_ALL_GREEN = "All green";
export const LABEL_BELOW_TARGET = "Below target";

// ---------------------------------------------------------------------------
// Deployment detail field labels
// ---------------------------------------------------------------------------

export const FIELD_DEPLOYMENT_ID = "Deployment ID";
export const FIELD_VM_NAME = "VM name";
export const FIELD_ASSET_GROUP = "Asset group";
export const FIELD_TASK = "Task";
export const FIELD_MODE = "Mode";
export const FIELD_DATE_RANGE = "Date range";
export const FIELD_STARTED = "Started";
export const FIELD_LAST_HEARTBEAT = "Last heartbeat";
export const FIELD_COMPLETED = "Completed";
export const FIELD_EXIT_CODE = "Exit code";
export const FIELD_ROWS_IN = "Rows in";
export const FIELD_ROWS_OUT = "Rows out";
export const FIELD_ROWS_ERROR = "Rows error";
export const FIELD_EVENTS_EMITTED = "Events emitted";
export const FIELD_LOG_URI = "Log URI";
export const FIELD_IMAGE_DIGEST = "Image digest";
export const FIELD_GIT_COMMIT = "Git commit";
