import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://rancho-seven.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/login", "/criar-conta", "/aceitar-convite", "/redefinir-senha"],
        disallow: [
          "/api/",
          "/admin-interno",
          "/dashboard",
          "/rebanho",
          "/producao",
          "/estoque",
          "/financeiro",
          "/funcionarios",
          "/ponto",
          "/folha",
          "/genealogia",
          "/reproducao",
          "/relatorios",
          "/configuracoes",
          "/whatsapp",
          "/eventos",
          "/suporte",
          "/lotes"
        ]
      }
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString()
  };
}
