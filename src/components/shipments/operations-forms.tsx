"use client";

import { useActionState } from "react";
import { assignDriverAction, setZoneAction } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/auth/actions";
import { FormError } from "@/components/ui/form";
import { useFormStatus } from "react-dom";

function SmallSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

export function AssignDriverForm({
  shipmentId,
  currentDriverId,
  drivers,
}: {
  shipmentId: string;
  currentDriverId: string | null;
  drivers: Array<{ id: string; first_name: string; last_name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(assignDriverAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="flex gap-2">
        <select
          name="driverId"
          defaultValue={currentDriverId ?? ""}
          required
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Elegir repartidor…
          </option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.first_name} {d.last_name}
            </option>
          ))}
        </select>
        <SmallSubmit>{currentDriverId ? "Reasignar" : "Asignar"}</SmallSubmit>
      </div>
      <FormError error={state.error} />
    </form>
  );
}

export function SetZoneForm({
  shipmentId,
  currentZoneId,
  zones,
}: {
  shipmentId: string;
  currentZoneId: string | null;
  zones: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(setZoneAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="flex gap-2">
        <select
          name="zoneId"
          defaultValue={currentZoneId ?? ""}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Sin zona</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <SmallSubmit>Cambiar zona</SmallSubmit>
      </div>
      <FormError error={state.error} />
    </form>
  );
}
