"use client";

import { useActionState } from "react";
import { createOrganization, type ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { branding } from "@/config/branding";
import { Truck } from "lucide-react";

export default function OnboardingPage() {
  const [state, action] = useActionState<ActionResult, FormData>(createOrganization, {});

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
          <Truck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{branding.name}</h1>
        <p className="text-sm text-slate-500">Paso 1 de 6 · Datos de tu empresa transportista</p>
      </div>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-6 text-lg font-semibold">Crear empresa</h2>
        <form action={action} className="space-y-4">
          <Field label="Nombre comercial" name="name" required placeholder="Ej: Logística Norte" />
          <Field label="Razón social" name="legalName" placeholder="Opcional" />
          <Field label="CUIT" name="taxId" placeholder="Opcional" />
          <Field label="Teléfono" name="phone" type="tel" placeholder="Opcional" />
          <FormError error={state.error} />
          <SubmitButton>Crear empresa y continuar</SubmitButton>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Después vas a poder cargar clientes, conectar cuentas de Mercado Libre, crear
          repartidores y zonas desde el panel.
        </p>
      </div>
    </div>
  );
}
