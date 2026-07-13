"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addAliasAction,
  assignLocationZoneAction,
  createLocationAction,
} from "@/lib/actions/billing";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

function InlineSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "…" : children}
    </button>
  );
}

export function CreateLocationForm({
  zones,
  defaultName,
}: {
  zones: Array<{ id: string; name: string }>;
  defaultName?: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createLocationAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <Field label="Nombre de la localidad" name="name" required defaultValue={defaultName} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Zona</span>
        <select name="zoneId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Sin zona (asignar después)</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Provincia" name="province" />
      <Field label="Partido / departamento" name="district" />
      <Field label="Código postal" name="zip" />
      <Field
        label="Alias (separados por coma)"
        name="aliases"
        placeholder="San Martin, Gral. San Martín, Partido de San Martín"
      />
      <div className="md:col-span-2">
        <FormError error={state.error} />
      </div>
      <div className="md:col-span-2">
        <SubmitButton>Crear localidad</SubmitButton>
      </div>
    </form>
  );
}

export function AssignZoneInline({
  locationId,
  currentZoneId,
  zones,
}: {
  locationId: string;
  currentZoneId: string | null;
  zones: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(assignLocationZoneAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="locationId" value={locationId} />
      <select
        name="zoneId"
        defaultValue={currentZoneId ?? ""}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      >
        <option value="">Sin zona</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
      <InlineSubmit>Guardar</InlineSubmit>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function AddAliasInline({ locationId }: { locationId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(addAliasAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="locationId" value={locationId} />
      <input
        name="alias"
        placeholder="Agregar alias…"
        className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
      />
      <InlineSubmit>+</InlineSubmit>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
