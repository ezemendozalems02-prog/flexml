"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export default function RegisterPage() {
  const [state, action] = useActionState<ActionResult, FormData>(signUp, {});

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Crear cuenta</h2>
      <p className="mb-6 text-sm text-slate-500">
        Creá tu usuario y después configurá tu empresa transportista.
      </p>
      <form action={action} className="space-y-4">
        <Field label="Nombre completo" name="fullName" required autoComplete="name" />
        <Field label="Correo" name="email" type="email" required autoComplete="email" />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />
        <FormError error={state.error} />
        <SubmitButton>Crear cuenta</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
