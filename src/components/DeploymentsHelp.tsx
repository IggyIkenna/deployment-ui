import { type ReactNode, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

/**
 * In-page "quick guide" for the full-estate Deployments cockpit — what the page shows and how to read
 * every column + chip vocabulary. Deliberately short and scannable (a reference someone will actually
 * read, not a manual). Self-contained: owns its own open state, so the page just drops in
 * <DeploymentsHelpButton /> next to the refresh control.
 *
 * The health / launched-by legends use emoji dots rather than the real Chip components on purpose —
 * it keeps this doc a zero-dependency leaf (no import cycle with Deployments.tsx) and sidesteps the
 * no-hardcoded-colours gate, while still mapping each word to its tone at a glance.
 */

/** One "term — meaning" line. Inline (not a fixed-width grid) so nothing clips as labels vary. */
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="py-0.5 text-[var(--color-text-muted)]">
      <span className="font-medium text-[var(--color-text-primary)]">{term}</span> — {children}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </h3>
  );
}

export function DeploymentsHelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About this page"
        title="About this page"
        data-testid="deployments-help"
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle>Deployments — quick guide</DialogTitle>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">What this page shows and how to read it.</p>
        </DialogHeader>
        <DialogContent>
          <div className="text-sm leading-relaxed" data-testid="deployments-help-body">
            <p className="text-[var(--color-text-primary)]">
              Every compute resource across our <strong>GCP and AWS</strong> accounts — VMs, Cloud Run jobs &amp;
              services, Cloud Functions, Lambdas, ECS/Fargate, Cloud Scheduler crons, even orphaned disks &amp; IPs — as
              one row each, <strong>whether or not we launched it</strong>. Use it to catch anything running that nobody
              registered, resources leaking cost, and scheduled jobs that missed their window.
            </p>

            <Heading>Columns</Heading>
            <Row term="Mode">
              purpose — LIVE (real trading) · BATCH (backfills) · PAPER · EXPERIMENT (ML/backtests) · — (plain infra)
            </Row>
            <Row term="Kind">
              type — vm · run-job · run-svc · fn · lambda · ecs-svc · scheduler · disk / static-ip (orphaned)
            </Row>
            <Row term="Launched by">who started it — see below</Row>
            <Row term="Status">running · succeeded · failed · stale (heartbeat too old) · stopped · pending</Row>
            <Row term="Last run / up">
              a job&apos;s last run, or a service/VM&apos;s uptime. Lambda shows last-modified (its last-run isn&apos;t
              knowable)
            </Row>
            <Row term="Cost/day">
              estimated daily cost — inferred from machine size, never an exact bill (shown as &ldquo;est&rdquo;)
            </Row>
            <Row term="Resources">
              a red leaked badge = cost left behind (e.g. a stopped VM still holding a disk / static IP) + est. monthly
              waste
            </Row>
            <Row term="Health">the &ldquo;is it actually working?&rdquo; verdict — see below</Row>
            <Row term="Others">
              Target (name — click a row for detail) · Cloud · Service · Asset group (market) · Progress (% captured) ·
              Exit (code) · Controls
            </Row>

            <Heading>Launched by — provenance</Heading>
            <Row term="🟢 deployment-api">we launched it through our own tooling. Expected.</Row>
            <Row term="🔵 control-plane">managed infra with no registry entry (e.g. a Cloud Run service). Normal.</Row>
            <Row term="🟡 adhoc">running, but nobody registered it. Worth a look.</Row>
            <Row term="⚪ unknown">no provenance signal (AWS).</Row>

            <Heading>Health — is it working?</Heading>
            <Row term="🟢 Fine">working · serving · on-time</Row>
            <Row term="🟡 Watch">stalled · degraded · oom-risk</Row>
            <Row term="🔴 Broken now">hung · workload-dead · disk-full · overdue (scheduler missed its window)</Row>
            <Row term="⚪ Idle / no signal">dead · scaled-to-zero · paused · unknown</Row>

            <Heading>What to act on</Heading>
            <ul className="list-disc space-y-0.5 pl-5 text-[var(--color-text-muted)]">
              <li>
                The <strong>stranded-cost total</strong> up top = estimated monthly $ across all leaked / orphaned
                resources — money spent on nothing.
              </li>
              <li>
                Any <strong>adhoc</strong> row, any <strong>red</strong> health, any <strong>overdue</strong> scheduler.
              </li>
              <li>
                Rows sort running-first, then leaked, so problems float up. Filter by mode / cloud / status /
                launched-by to narrow.
              </li>
            </ul>

            <p className="mt-4 text-xs text-[var(--color-text-muted)]">
              All costs are estimates for spotting waste, not billing figures. For a resource&apos;s full health vector
              and run history, click its row.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
