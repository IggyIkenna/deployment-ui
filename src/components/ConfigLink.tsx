import { ExternalLink } from "lucide-react";

interface ConfigLinkProps {
  label: string;
  path: string;
  onboardingBaseUrl: string;
}

export function ConfigLink({ label, path, onboardingBaseUrl }: ConfigLinkProps) {
  const href = `${onboardingBaseUrl}${path}`;
  
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="config-link"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent-blue)] hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
