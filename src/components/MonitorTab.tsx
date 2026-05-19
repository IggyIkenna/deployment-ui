import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Skeleton } from "./ui/skeleton";
import { Zap, FlaskConical, Radio, CalendarClock } from "lucide-react";
import { BackfillMonitorSubTab } from "./monitor/BackfillMonitorSubTab";
import { ExperimentsSubTab } from "./monitor/ExperimentsSubTab";
import { LiveClusterSubTab } from "./monitor/LiveClusterSubTab";
import { ScheduledSubTab } from "./monitor/ScheduledSubTab";
import { useCloudProvider } from "../contexts/CloudProviderContext";

function CloudSwitchingSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-label="Loading cloud data">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-5/6" />
    </div>
  );
}

export function MonitorTab() {
  const { switching } = useCloudProvider();

  return (
    <Tabs defaultValue="backfill" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="backfill" className="flex items-center gap-2">
          <Zap className="w-4 h-4" />
          <span className="hidden sm:inline">Backfill</span>
        </TabsTrigger>
        <TabsTrigger value="experiments" className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          <span className="hidden sm:inline">Experiments</span>
        </TabsTrigger>
        <TabsTrigger value="live" className="flex items-center gap-2">
          <Radio className="w-4 h-4" />
          <span className="hidden sm:inline">Live</span>
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          <span className="hidden sm:inline">Scheduled</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="backfill" className="mt-4">
        {switching ? <CloudSwitchingSkeleton /> : <BackfillMonitorSubTab />}
      </TabsContent>

      <TabsContent value="experiments" className="mt-4">
        {switching ? <CloudSwitchingSkeleton /> : <ExperimentsSubTab />}
      </TabsContent>

      <TabsContent value="live" className="mt-4">
        {switching ? <CloudSwitchingSkeleton /> : <LiveClusterSubTab />}
      </TabsContent>

      <TabsContent value="scheduled" className="mt-4">
        {switching ? <CloudSwitchingSkeleton /> : <ScheduledSubTab />}
      </TabsContent>
    </Tabs>
  );
}
