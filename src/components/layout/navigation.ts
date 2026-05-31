import {
  BarChart3,
  Bot,
  ClipboardList,
  Clock3,
  Droplets,
  Home,
  Layers3,
  PackageOpen,
  PawPrint,
  Receipt,
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
      { href: "/ponto", label: "Ponto", icon: Clock3 },
      { href: "/folha", label: "Folha", icon: Receipt }
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
      { href: "/configuracoes", label: "Configurações", icon: Settings }
    ]
  }
];
