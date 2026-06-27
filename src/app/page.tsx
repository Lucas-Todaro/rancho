import type { Metadata } from "next";
import LandingPage from "@/app/landing/page";
import { RecoveryRedirect } from "@/app/recovery-redirect";
import { landingMetadata } from "@/lib/seo";

export const metadata: Metadata = landingMetadata;

export default function Home() {
  return (
    <>
      <RecoveryRedirect />
      <LandingPage />
    </>
  );
}
