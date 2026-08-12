"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { branding } from "@/config/branding";
import { NAV } from "./sidebar";

/** Menú hamburguesa para celular: el <Sidebar> fijo solo se muestra desde
 *  el breakpoint lg (ver hidden/lg:flex ahí), así que en mobile no había
 *  forma de llegar a Configuración, Repartidores, etc. */
export function MobileNav({ orgName, isDemo }: { orgName: string; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-64 flex-col bg-slate-900 text-slate-300 shadow-xl">
            <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-800 px-5">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">{branding.name}</span>
                {isDemo && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                    Demo
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
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
        </div>
      )}
    </div>
  );
}
