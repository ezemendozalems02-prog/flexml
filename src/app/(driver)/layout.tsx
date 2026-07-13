import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Home, History, LogOut, User } from "lucide-react";
import { branding } from "@/config/branding";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-slate-900 px-4 text-white">
        <span className="font-bold">{branding.name}</span>
        <span className="max-w-[50%] truncate text-sm text-slate-300">
          {session.fullName ?? session.email}
        </span>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch justify-around border-t border-slate-200 bg-white">
        <Link
          href="/driver"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <Home className="h-5 w-5" />
          Hoy
        </Link>
        <Link
          href="/driver/history"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <History className="h-5 w-5" />
          Historial
        </Link>
        <Link
          href="/driver/profile"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <User className="h-5 w-5" />
          Perfil
        </Link>
        <form action={signOut} className="flex flex-1">
          <button
            type="submit"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <LogOut className="h-5 w-5" />
            Salir
          </button>
        </form>
      </nav>
    </div>
  );
}
