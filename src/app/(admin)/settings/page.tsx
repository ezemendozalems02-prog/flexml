import { requireSession } from "@/lib/auth/session";
import { branding } from "@/config/branding";
import { EditNameForm } from "@/components/profile/edit-name-form";

export const metadata = { title: "Configuración" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">
        {value ?? <span className="font-normal text-slate-400">No disponible</span>}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await requireSession();
  const org = session.organization;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-slate-500">Datos de la empresa transportista.</p>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold">Empresa</h2>
        <Row label="Nombre comercial" value={org.name} />
        <Row label="Razón social" value={org.legal_name} />
        <Row label="CUIT" value={org.tax_id} />
        <Row label="Correo" value={org.email} />
        <Row label="Teléfono" value={org.phone} />
        <Row label="Zona horaria" value={org.timezone} />
        <Row label="Moneda" value={org.currency} />
        <Row label="País" value={org.country} />
        <Row label="Plan" value={org.status} />
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold">Tu usuario</h2>
        <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 text-sm">
          <span className="shrink-0 text-slate-500">Nombre</span>
          <div className="w-full max-w-xs">
            <EditNameForm key={session.fullName} currentName={session.fullName} />
          </div>
        </div>
        <Row label="Correo" value={session.email} />
        <Row label="Rol" value={session.membership.role} />
      </section>

      <p className="text-xs text-slate-400">
        {branding.name} · La edición de la empresa y la gestión de usuarios e invitaciones se
        habilitan en la próxima iteración del panel.
      </p>
    </div>
  );
}
