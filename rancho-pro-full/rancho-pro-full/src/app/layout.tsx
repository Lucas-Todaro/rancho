import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rancho Pro",
  description: "Sistema completo de gestão agropecuária com Supabase e WhatsApp"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
