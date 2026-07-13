"use client";

import { useActionState } from "react";
import { createClientAction } from "@/lib/actions/clients";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export function CreateClientForm() {
  const [state, action] = useActionState<ActionResult, FormData>(createClientAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <Field label="Nombre del comercio" name="name" required />
      <Field label="Responsable" name="contactName" />
      <Field label="Correo" name="email" type="email" />
      <Field label="Teléfono" name="phone" type="tel" />
      <Field label="Dirección de retiro" name="pickupAddress" />
      <Field label="Localidad" name="pickupCity" />
      <Field label="Código postal" name="pickupZip" />
      <Field label="Notas" name="notes" />
      <div className="md:col-span-2">
        <FormError error={state.error} />
      </div>
      <div className="md:col-span-2">
        <SubmitButton>Crear cliente</SubmitButton>
      </div>
    </form>
  );
}
