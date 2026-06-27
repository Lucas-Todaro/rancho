import type { Metadata } from "next";
import LandingPage from "@/app/landing/page";
import { RecoveryRedirect } from "@/app/recovery-redirect";

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  }
};

export default function Home() {
  return (
    <>
      <RecoveryRedirect />
      <LandingPage />
    </>
  );
}
