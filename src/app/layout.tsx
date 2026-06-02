import type { Metadata } from "next";
import { RootProviders } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rancho Pro",
  description: "Sistema completo de gestão agropecuária com painel, relatórios e WhatsApp"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body><RootProviders>{children}</RootProviders></body>
    </html>
  );
}
