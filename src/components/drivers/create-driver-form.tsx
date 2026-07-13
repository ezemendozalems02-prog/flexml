"use client";

import { useActionState } from "react";
import { createDriverAction } from "@/lib/actions/drivers";
import type { ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export function CreateDriverForm() {
  const [state, action] = useActionState<ActionResult, FormData>(createDriverAction, {});
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <Field label="Nombre" name="firstName" required />
      <Field label="Apellido" name="lastName" required />
      <Field label="Teléfono" name="phone" type="tel" />
      <Field label="Correo" name="email" type="email" />
      <Field label="DNI" name="nationalId" />
      <div className="md:col-span-2">
        <FormError error={state.error} />
      </div>
      <div className="md:col-span-2">
        <SubmitButton>Crear repartidor</SubmitButton>
      </div>
    </form>
  );
}
