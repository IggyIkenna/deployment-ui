import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";

const Tabs = TabsPrimitive.Root;

export type TabsVariant = "underline" | "pill";

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: TabsVariant;
  children?: React.ReactNode;
}

const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant = "underline", ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center",
        // Pill = a segmented control: a bordered frame with a divider between every cell so the
        // triggers read as distinct buttons (not one run-together strip). `[&>*]:rounded-none`
        // squares the shared TabsTrigger inside the frame; the active cell fills edge-to-edge.
        variant === "pill" &&
          "overflow-hidden rounded-lg border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] [&>*]:rounded-none [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-[var(--color-border-emphasis)]",
        variant === "underline" && "border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)]",
        className,
      )}
      {...props}
    />
  ),
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-[var(--color-bg-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--color-bg-secondary)] data-[state=active]:text-[var(--color-text-primary)] data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // No whole-panel focus ring: Radix gives the panel tabIndex=0 for a11y, but a 2px
      // cyan ring around the ENTIRE tab content flashed on every background refresh when
      // focus fell back to the panel (operator 2026-06-22). Keep outline-none; the panel's
      // own interactive children carry their focus indicators.
      "mt-2 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsContent, TabsTrigger };
