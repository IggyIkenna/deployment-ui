import { MOCK_MODE } from "../lib/mock-api";

export function MockModeBanner() {
  if (!MOCK_MODE) return null;
  return (
    <div className="w-full bg-amber-500/20 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
      Mock Mode — using sample data
    </div>
  );
}
