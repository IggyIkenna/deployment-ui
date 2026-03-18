import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-accent-blue)] text-white shadow",
        secondary:
          "border-transparent bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
        destructive:
          "border-transparent bg-[var(--color-accent-red)] text-white shadow",
        outline: "text-[var(--color-text-primary)] border-[var(--color-border)]",
        success:
          "border-transparent bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-status-success-border)]",
        warning:
          "border-transparent bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border-[var(--color-status-warning-border)]",
        error:
          "border-transparent bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-status-error-border)]",
        info:
          "border-transparent bg-[var(--color-status-info-bg)] text-[var(--color-accent-blue)] border-[var(--color-status-info-border)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
