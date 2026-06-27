import type { Metadata } from "next";

export const SITE_NAME = "Rancho";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://rancho-seven.vercel.app";
export const SUPPORT_EMAIL = "projeto.fazenda00@gmail.com";

export const LANDING_TITLE = "Rancho | Software de gestão agropecuária e controle de rebanho";
export const LANDING_DESCRIPTION =
  "Software de gestão agropecuária para fazendas: controle de rebanho, produção de leite, estoque, financeiro, funcionários, genealogia e bot de WhatsApp.";

export const SEO_KEYWORDS = [
  "software de gestão agropecuária",
  "sistema de gestão agropecuária",
  "software para fazenda",
  "sistema para fazenda",
  "gestão de fazenda",
  "controle de fazenda",
  "controle de rebanho",
  "controle de rebanho bovino",
  "gestão de gado leiteiro",
  "controle leiteiro",
  "produção de leite",
  "controle de ordenha",
  "genealogia bovina",
  "reprodução bovina",
  "controle de partos",
  "controle de estoque rural",
  "estoque de ração e medicamentos",
  "financeiro rural",
  "gestão de funcionários rurais",
  "bot WhatsApp fazenda",
  "chatbot para fazenda",
  "Rancho"
];

export function absoluteSiteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export const landingMetadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  keywords: SEO_KEYWORDS,
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  category: "Agriculture software"
};

export function landingStructuredData() {
  const url = absoluteSiteUrl("/");
  const contactUrl = `mailto:${SUPPORT_EMAIL}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url,
      email: SUPPORT_EMAIL,
      logo: absoluteSiteUrl("/icon.svg"),
      sameAs: []
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url,
      inLanguage: "pt-BR",
      description: LANDING_DESCRIPTION,
      publisher: {
        "@type": "Organization",
        name: SITE_NAME
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url,
      description: LANDING_DESCRIPTION,
      inLanguage: "pt-BR",
      featureList: [
        "Controle de rebanho bovino",
        "Gestão de produção de leite",
        "Controle de estoque rural",
        "Financeiro rural",
        "Gestão de funcionários e ponto",
        "Genealogia e reprodução bovina",
        "Bot de WhatsApp para registros da fazenda"
      ],
      audience: {
        "@type": "Audience",
        audienceType: "Produtores rurais, fazendas de leite e pecuaristas"
      },
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        url: contactUrl
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "O Rancho serve para controlar rebanho e produção de leite?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. O Rancho organiza animais, lotes, genealogia, reprodução, ordenhas, produção de leite, estoque, financeiro e relatórios em uma plataforma web."
          }
        },
        {
          "@type": "Question",
          name: "O sistema registra dados da fazenda pelo WhatsApp?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sim. O bot de WhatsApp interpreta mensagens da rotina da fazenda, mostra uma confirmação e salva o registro no módulo correto do sistema."
          }
        },
        {
          "@type": "Question",
          name: "O Rancho substitui planilhas e cadernos da fazenda?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "O Rancho foi criado para centralizar informações que normalmente ficam em cadernos, planilhas e conversas, facilitando o acompanhamento da operação."
          }
        }
      ]
    }
  ];
}
