/**
 * Icon set for the redesigned Data Status tab.
 *
 * The prototype (`design/data-status-redesign/js/util.jsx`) used inline SVGs
 * under an `Icons.<Name>` namespace. Here we map those names to the app's
 * existing `lucide-react` dependency so the visuals share one icon source.
 * Same call shape as the prototype: `<Icons.X size={12} className="muted"/>`.
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Filter,
  Hash,
  Info,
  Layers,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  X,
  type LucideProps,
} from "lucide-react";

export type IconComponent = (props: LucideProps) => React.ReactElement;

export const Icons = {
  // Visual switcher
  Grid: LayoutGrid as IconComponent,
  BarChart: BarChart3 as IconComponent,
  ChartCal: CalendarRange as IconComponent,
  Layers: Layers as IconComponent,
  // Actions / chrome
  Search: Search as IconComponent,
  Download: Download as IconComponent,
  ChevronRight: ChevronRight as IconComponent,
  ChevronLeft: ChevronLeft as IconComponent,
  ChevronDown: ChevronDown as IconComponent,
  X: X as IconComponent,
  AlertTri: AlertTriangle as IconComponent,
  Refresh: RefreshCw as IconComponent,
  Eye: Eye as IconComponent,
  Rocket: Rocket as IconComponent,
  Clock: Clock as IconComponent,
  Calendar: Calendar as IconComponent,
  Activity: Activity as IconComponent,
  Hash: Hash as IconComponent,
  Filter: Filter as IconComponent,
  ListFilter: ListFilter as IconComponent,
  Check: Check as IconComponent,
  Sparkles: Sparkles as IconComponent,
  Info: Info as IconComponent,
  Trash: Trash2 as IconComponent,
} as const;
