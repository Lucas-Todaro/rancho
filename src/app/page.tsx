"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    if (hashParams.get("type") === "recovery" && hashParams.get("access_token")) {
      router.replace(`/redefinir-senha${hash}`);
      return;
    }

    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    </main>
  );
}
