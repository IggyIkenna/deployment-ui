import { LiveFreshnessPanel } from "../LiveFreshnessPanel";
import { LifecyclePrefetchProvider } from "../../contexts/LifecyclePrefetchContext";

export function LiveClusterSubTab() {
  return (
    <LifecyclePrefetchProvider>
      <LiveFreshnessPanel />
    </LifecyclePrefetchProvider>
  );
}
