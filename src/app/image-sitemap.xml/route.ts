import { absoluteSiteUrl } from "@/lib/seo";

const landingImages = [
  {
    url: "/landing/screenshots/dashboard.png",
    caption: "Dashboard do Rancho para gestão agropecuária"
  },
  {
    url: "/landing/screenshots/rebanho.png",
    caption: "Tela de controle de rebanho bovino no Rancho"
  },
  {
    url: "/landing/screenshots/producao.png",
    caption: "Tela de produção de leite e ordenhas no Rancho"
  },
  {
    url: "/landing/screenshots/estoque.png",
    caption: "Tela de controle de estoque rural no Rancho"
  },
  {
    url: "/landing/screenshots/financeiro.png",
    caption: "Tela de financeiro rural no Rancho"
  },
  {
    url: "/landing/screenshots/whatsapp.png",
    caption: "Tela do bot de WhatsApp para registros da fazenda"
  }
];

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const images = landingImages
    .map((image) => [
      "    <image:image>",
      `      <image:loc>${xmlEscape(absoluteSiteUrl(image.url))}</image:loc>`,
      `      <image:caption>${xmlEscape(image.caption)}</image:caption>`,
      "    </image:image>"
    ].join("\n"))
    .join("\n");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    "  <url>",
    `    <loc>${xmlEscape(absoluteSiteUrl("/"))}</loc>`,
    images,
    "  </url>",
    "</urlset>"
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400"
    }
  });
}
