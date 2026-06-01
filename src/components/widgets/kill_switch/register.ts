/**
 * Kill-switch widget registry — DR plan Phase 7.B registration.
 *
 * Exports the three kill-switch widgets (KillSwitchTab + KillSwitchPanel +
 * AuditLogViewer) at canonical widget-registry shape.
 */

import { AuditLogViewer } from "./AuditLogViewer";
import { KillSwitchPanel } from "./KillSwitchPanel";
import { KillSwitchTab } from "./KillSwitchTab";

export interface WidgetRegistration {
  id: string;
  label: string;
  component: React.ComponentType<unknown>;
}

export const KILL_SWITCH_WIDGETS: readonly WidgetRegistration[] = [
  {
    id: "kill-switch-tab",
    label: "Kill Switch",
    component: KillSwitchTab as React.ComponentType<unknown>,
  },
  {
    id: "kill-switch-panel",
    label: "Kill Switch: Active Switches",
    component: KillSwitchPanel as React.ComponentType<unknown>,
  },
  {
    id: "kill-switch-audit-log",
    label: "Kill Switch: Audit Log",
    component: AuditLogViewer as React.ComponentType<unknown>,
  },
] as const;

export { KillSwitchTab, KillSwitchPanel, AuditLogViewer };
