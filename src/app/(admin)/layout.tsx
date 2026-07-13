import { requireRole } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { signOut } from "@/lib/auth/actions";
import { LogOut } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El rol vendedor (client) usa el portal /seller; el repartidor, /driver
  const session = await requireRole(["owner", "admin", "operator"]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar orgName={session.organization.name} isDemo={session.organization.is_demo} />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <div className="text-sm text-slate-500">{session.organization.name}</div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 sm:block">
              {session.fullName ?? session.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
