import { requireSession } from "@/lib/auth/session";
import { Scanner } from "@/components/driver/scanner";

export const metadata = { title: "Escanear" };

export default async function DriverScanPage() {
  const session = await requireSession();

  if (!session.membership.driver_id) {
    return (
      <div className="rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="font-medium text-slate-800">
          Tu usuario todavía no está vinculado a un repartidor.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Pedile al administrador de tu empresa que te vincule desde el panel.
        </p>
      </div>
    );
  }

  return <Scanner />;
}
