import type { Metadata } from "next";
import { RootProviders } from "@/app/providers";
import { LANDING_DESCRIPTION, LANDING_TITLE, SEO_KEYWORDS, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: LANDING_TITLE,
    template: `%s | ${SITE_NAME}`
  },
  description: LANDING_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/landing/screenshots/dashboard.png",
        width: 1200,
        height: 630,
        alt: "Dashboard do Rancho para gestão agropecuária"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    images: ["/landing/screenshots/dashboard.png"]
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  },
  category: "Agriculture software"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body><RootProviders>{children}</RootProviders></body>
    </html>
  );
}
