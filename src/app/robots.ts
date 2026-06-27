import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/icon.svg", "/landing/screenshots/"],
        disallow: [
          "/api/",
          "/admin-interno",
          "/login",
          "/register",
          "/signup",
          "/cadastro",
          "/criar-conta",
          "/aceitar-convite",
          "/redefinir-senha",
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
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/landing", "/icon.svg", "/landing/screenshots/"],
        disallow: [
          "/api/",
          "/admin-interno",
          "/login",
          "/register",
          "/signup",
          "/cadastro",
          "/criar-conta",
          "/aceitar-convite",
          "/redefinir-senha",
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
    sitemap: [absoluteSiteUrl("/sitemap.xml"), absoluteSiteUrl("/image-sitemap.xml")]
  };
}
