import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { CalendarClock } from "lucide-react";

export function ScheduledSubTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          Scheduler Registry
        </CardTitle>
        <CardDescription>
          Coming in Phase D — View and manage scheduled pipeline runs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">
          This feature will display all scheduled backfill jobs, their next run
          times, and allow you to manage the scheduler configuration.
        </p>
      </CardContent>
    </Card>
  );
}
