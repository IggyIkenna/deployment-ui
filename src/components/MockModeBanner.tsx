import { AlertCircle } from "lucide-react";
import { MOCK_MODE } from "../lib/mock-api";

export function MockModeBanner() {
  if (!MOCK_MODE) return null;
  
  return (
    <div className="bg-[var(--color-accent-amber)]/10 border-b border-[var(--color-accent-amber)]/20 px-4 py-2">
      <div className="container mx-auto max-w-[1600px] flex items-center gap-2 text-sm text-[var(--color-accent-amber)]">
        <AlertCircle className="h-4 w-4" />
        <span className="font-medium">Mock Mode Active</span>
        <span className="text-[var(--color-text-secondary)]">— API responses are simulated</span>
      </div>
    </div>
  );
}
