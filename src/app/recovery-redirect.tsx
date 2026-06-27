"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    if (hashParams.get("type") === "recovery" && hashParams.get("access_token")) {
      router.replace(`/redefinir-senha${hash}`);
    }
  }, [router]);

  return null;
}
