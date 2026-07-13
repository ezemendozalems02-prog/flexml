import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { branding } from "@/config/branding";
import { Home, Flag, LogOut } from "lucide-react";

/**
 * Portal de autoservicio del vendedor (§17): interfaz simplificada, sin
 * dashboard financiero. El rol client solo ve datos de SU comercio (RLS +
 * validación backend) y nunca importes.
 */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["client", "owner", "admin"]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="font-bold text-slate-900">{branding.name}</span>
            <nav className="flex items-center gap-1">
              <Link
                href="/seller"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <Home className="h-4 w-4" /> Mis envíos
              </Link>
              <Link
                href="/seller/issues"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <Flag className="h-4 w-4" /> Mis reportes
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">
              {session.fullName ?? session.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
