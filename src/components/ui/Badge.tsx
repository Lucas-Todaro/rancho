import { cn } from "@/lib/utils";

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
  };

  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", tones[tone])}>{children}</span>;
}
