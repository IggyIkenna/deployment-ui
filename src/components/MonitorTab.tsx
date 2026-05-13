import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Zap, FlaskConical, Radio, CalendarClock } from "lucide-react";
import { BackfillMonitorSubTab } from "./monitor/BackfillMonitorSubTab";
import { ExperimentsSubTab } from "./monitor/ExperimentsSubTab";
import { LiveClusterSubTab } from "./monitor/LiveClusterSubTab";
import { ScheduledSubTab } from "./monitor/ScheduledSubTab";

export function MonitorTab() {
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
        <BackfillMonitorSubTab />
      </TabsContent>

      <TabsContent value="experiments" className="mt-4">
        <ExperimentsSubTab />
      </TabsContent>

      <TabsContent value="live" className="mt-4">
        <LiveClusterSubTab />
      </TabsContent>

      <TabsContent value="scheduled" className="mt-4">
        <ScheduledSubTab />
      </TabsContent>
    </Tabs>
  );
}
