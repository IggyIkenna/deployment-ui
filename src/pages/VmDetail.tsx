import { useParams } from "react-router-dom";
import { Server } from "lucide-react";
import { VmEventsTimeline } from "../components/VmEventsTimeline";
import { VmHealthBadge } from "../components/VmHealthBadge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

export function VmDetail() {
  const { vmName } = useParams<{ vmName: string }>();

  if (!vmName) {
    return (
      <main className="mx-auto px-4 py-6 max-w-[1280px]">
        <p className="text-sm text-[var(--color-text-muted)]">
          No VM name specified.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1280px] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-[var(--color-accent-cyan)]" />
          <h1
            data-testid="vm-detail-title"
            className="text-xl font-semibold font-mono text-[var(--color-text-primary)]"
          >
            {vmName}
          </h1>
        </div>
        <div className="sm:ml-auto">
          <VmHealthBadge vmName={vmName} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <VmEventsTimeline vmName={vmName} limit={200} />
        </CardContent>
      </Card>
    </main>
  );
}
