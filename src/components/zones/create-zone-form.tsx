"use client";

import { useActionState } from "react";
import { createZoneAction } from "@/lib/actions/zones";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export function CreateZoneForm() {
  const [state, action] = useActionState<ActionResult, FormData>(createZoneAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <Field label="Nombre de la zona" name="name" required placeholder="Ej: Zona Norte" />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Color</span>
        <input
          type="color"
          name="color"
          defaultValue="#3b82f6"
          className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-1"
        />
      </label>
      <Field
        label="Códigos postales (separados por coma)"
        name="zips"
        placeholder="1642, 1638, 1648"
      />
      <Field
        label="Localidades (separadas por coma)"
        name="cities"
        placeholder="San Isidro, Tigre"
      />
      <div className="md:col-span-2">
        <FormError error={state.error} />
      </div>
      <div className="md:col-span-2">
        <SubmitButton>Crear zona</SubmitButton>
      </div>
    </form>
  );
}
