import type { Metadata } from "next";
import { RootProviders } from "@/app/providers";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://rancho-seven.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Rancho",
  title: {
    default: "Rancho | Gestao agropecuaria para fazendas",
    template: "%s | Rancho"
  },
  description: "Sistema de gestao agropecuaria para rebanho, producao de leite, estoque, financeiro, funcionarios e registros pelo WhatsApp.",
  keywords: [
    "gestao agropecuaria",
    "gestao de fazenda",
    "software para fazenda",
    "controle de rebanho",
    "controle leiteiro",
    "controle de estoque rural",
    "financeiro rural",
    "bot WhatsApp fazenda",
    "Rancho"
  ],
  authors: [{ name: "Rancho" }],
  creator: "Rancho",
  publisher: "Rancho",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Rancho | Gestao agropecuaria para fazendas",
    description: "Controle rebanho, producao, estoque, financeiro, equipe e registros pelo WhatsApp em uma plataforma para fazendas.",
    url: "/",
    siteName: "Rancho",
    locale: "pt_BR",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Rancho | Gestao agropecuaria para fazendas",
    description: "Gestao agropecuaria com rebanho, leite, estoque, financeiro e bot de WhatsApp."
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body><RootProviders>{children}</RootProviders></body>
    </html>
  );
}
