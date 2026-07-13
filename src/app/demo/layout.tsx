import Link from "next/link";
import { branding } from "@/config/branding";
import {
  LayoutDashboard,
  Package,
  Tag,
  Receipt,
  Smartphone,
  ArrowLeft,
} from "lucide-react";

const NAV = [
  { href: "/demo/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demo/shipments", label: "Envíos", icon: Package },
  { href: "/demo/labels", label: "Etiquetas Flex", icon: Tag },
  { href: "/demo/settlement", label: "Liquidación semanal", icon: Receipt },
  { href: "/demo/driver", label: "App repartidor", icon: Smartphone },
];

export const metadata = { title: "Modo demostración" };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <span className="text-lg font-bold text-white">{branding.name}</span>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
            Demo
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-800/60 hover:text-white"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-3 py-4">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Salir del modo demo
          </Link>
        </div>
      </aside>
      <div className="lg:pl-60">
        <div className="sticky top-0 z-20 border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm font-medium text-amber-800">
          🧪 Modo demostración — datos ficticios, sin conexión a base de datos. Nada de lo
          que veas acá es real ni se guarda.
        </div>
        {/* Navegación mobile */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              {label}
            </Link>
          ))}
        </div>
        <main className="px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
