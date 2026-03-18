import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";

export type TabsVariant = "default" | "pill";

const Tabs = TabsPrimitive.Root;

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: TabsVariant;
}

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center text-[var(--color-text-secondary)]",
      variant === "default" &&
        "h-9 rounded-lg bg-[var(--color-bg-tertiary)] p-1",
      variant === "pill" &&
        "h-10 gap-1 rounded-lg bg-[var(--color-bg-secondary)] p-1 border border-[var(--color-border)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  variant?: TabsVariant;
}

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-[var(--color-bg-primary)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      variant === "default" &&
        "data-[state=active]:bg-[var(--color-bg-secondary)] data-[state=active]:text-[var(--color-text-primary)] data-[state=active]:shadow",
      variant === "pill" &&
        "data-[state=active]:bg-[var(--color-bg-tertiary)] data-[state=active]:text-[var(--color-text-primary)]",
      className
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
      "mt-2 ring-offset-[var(--color-bg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
