import { LifecyclePrefetchProvider } from "../../contexts/LifecyclePrefetchContext";
import { DeploymentHistory } from "../DeploymentHistory";

export function BackfillMonitorSubTab() {
  return (
    <LifecyclePrefetchProvider>
      <DeploymentHistory serviceName="" />
    </LifecyclePrefetchProvider>
  );
}
