"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Plug,
  Bike,
  Map,
  MapPin,
  Tag,
  Flag,
  CircleDollarSign,
  Receipt,
  FileBarChart,
  Settings,
} from "lucide-react";
import { branding } from "@/config/branding";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Envíos", icon: Package },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/connections", label: "Cuentas Mercado Libre", icon: Plug },
  { href: "/drivers", label: "Repartidores", icon: Bike },
  { href: "/labels", label: "Etiquetas Flex", icon: Tag },
  { href: "/label-issues", label: "Problemas de etiquetas", icon: Flag },
  { href: "/zones", label: "Zonas", icon: Map },
  { href: "/locations", label: "Localidades", icon: MapPin },
  { href: "/rates", label: "Tarifas", icon: CircleDollarSign },
  { href: "/settlements", label: "Liquidaciones", icon: Receipt },
  { href: "/reports", label: "Reportes", icon: FileBarChart },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar({ orgName, isDemo }: { orgName: string; isDemo: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
        <span className="text-lg font-bold text-white">{branding.name}</span>
        {isDemo && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
            Demo
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-slate-800 text-white"
                  : "hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-5 py-4">
        <p className="truncate text-xs font-medium text-slate-400">{orgName}</p>
      </div>
    </aside>
  );
}
