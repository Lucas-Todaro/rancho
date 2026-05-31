import {
  BarChart3,
  Bot,
  ClipboardList,
  Droplets,
  Home,
  Layers3,
  LifeBuoy,
  PackageOpen,
  PawPrint,
  Settings,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home }
    ]
  },
  {
    label: "Rebanho",
    items: [
      { href: "/lotes", label: "Lotes", icon: Layers3 },
      { href: "/rebanho", label: "Rebanho", icon: PawPrint },
      { href: "/eventos", label: "Eventos", icon: ClipboardList },
      { href: "/producao", label: "Produção", icon: Droplets }
    ]
  },
  {
    label: "Estoque",
    items: [
      { href: "/estoque", label: "Visão do estoque", icon: PackageOpen }
    ]
  },
  {
    label: "Financeiro",
    items: [
      { href: "/financeiro", label: "Transações", icon: Wallet },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 }
    ]
  },
  {
    label: "Equipe",
    items: [
      { href: "/funcionarios", label: "Funcionários", icon: Users },
    ]
  },
  {
    label: "Atendimento",
    items: [
      { href: "/whatsapp", label: "WhatsApp", icon: Bot }
    ]
  },
  {
    label: "Sistema",
    items: [
      { href: "/suporte", label: "Suporte", icon: LifeBuoy },
      { href: "/configuracoes", label: "Configurações", icon: Settings }
    ]
  }
];
