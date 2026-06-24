/**
 * VmControls — operator pause / resume / stop for a live deployment VM.
 *
 * Wires the EXISTING deployment-api endpoints (`POST /api/vm/admin/{vm}/(pause|resume|cancel)`,
 * 202): pause writes a cooperative pause-signal blob the VM polls; resume deletes it; stop
 * (cancel) marks the deployment terminal → archive. Protective actions are safe-by-default;
 * STOP gets a confirm dialog (it is destructive — the VM won't come back without a relaunch).
 * "Restart" = stop + relaunch-from-same-image via the Deploy console (the relaunch is operator
 * -driven; a one-call restart is a tracked backend follow-up).
 *
 * Rendered chrome-less in the cockpit Live tab rows (+ the live drill). Reuse-first — no new
 * deploy/admin backend, just the buttons.
 */

import { useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { cancelVm, pauseVm, resumeVm } from "../api/client";

type Action = "pause" | "resume" | "stop";

const ACTION_FN: Record<Action, (vm: string) => Promise<{ status: string; message: string }>> = {
  pause: pauseVm,
  resume: resumeVm,
  stop: cancelVm,
};

/** A live VM is controllable while it is running / stale / pending — terminal states are inert. */
function isControllable(status: string): boolean {
  return status === "running" || status === "stale" || status === "pending";
}

export function VmControls({ vmName, status }: { vmName: string; status: string }): React.ReactElement {
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const run = async (action: Action): Promise<void> => {
    setBusy(action);
    setResult(null);
    try {
      const r = await ACTION_FN[action](vmName);
      setResult(r.message || r.status || "ok");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "action failed");
    } finally {
      setBusy(null);
    }
  };

  if (!isControllable(status)) {
    return <span className="text-[10px] text-[var(--color-text-muted)]">—</span>;
  }

  return (
    <div className="flex items-center gap-1" data-testid={`vm-controls-${vmName}`}>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("pause")}
        title="Pause (cooperative — the VM stops claiming new work)"
        data-testid={`vm-pause-${vmName}`}
      >
        <Pause className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("resume")}
        title="Resume"
        data-testid={`vm-resume-${vmName}`}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        onClick={() => setConfirmStop(true)}
        title="Stop (cancel → terminal/archive)"
        data-testid={`vm-stop-${vmName}`}
      >
        <Square className="h-3.5 w-3.5 text-red-400" />
      </Button>
      {result ? (
        <span className="text-[10px] text-[var(--color-text-muted)]" data-testid={`vm-controls-result-${vmName}`}>
          {result}
        </span>
      ) : null}

      <Dialog open={confirmStop} onClose={() => setConfirmStop(false)}>
        <DialogHeader>
          <DialogTitle>Stop deployment?</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-[var(--color-text-secondary)]" data-testid={`vm-stop-confirm-body-${vmName}`}>
            Stop <code className="font-mono">{vmName}</code>? This marks the deployment terminal (cancelled → archived).
            It will not come back without a relaunch. To bring it back, use <strong>Restart</strong> below or the Deploy
            console.
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmStop(false)}
              data-testid={`vm-stop-cancel-${vmName}`}
            >
              Keep running
            </Button>
            <Link
              to="/cockpit?tab=deploy"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              onClick={() => {
                setConfirmStop(false);
                void run("stop");
              }}
              data-testid={`vm-restart-${vmName}`}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart (stop + relaunch)
            </Link>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmStop(false);
                void run("stop");
              }}
              data-testid={`vm-stop-confirm-${vmName}`}
            >
              Stop
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
