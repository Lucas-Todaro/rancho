import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md bg-slate-300/90 shadow-[inset_0_0_0_1px_rgba(100,116,139,0.08)] dark:bg-slate-800/80 dark:shadow-none", className)}
    />
  );
}
