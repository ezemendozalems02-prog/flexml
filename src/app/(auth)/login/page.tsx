"use client";

import Link from "next/link";
import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type ActionResult } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

function RegisteredNotice() {
  const params = useSearchParams();
  if (!params.get("registered")) return null;
  return (
    <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
      Cuenta creada. Revisá tu correo para verificarla y luego ingresá.
    </p>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState<ActionResult, FormData>(signIn, {});

  return (
    <div>
      <h2 className="mb-6 text-lg font-semibold text-slate-900">Iniciar sesión</h2>
      <Suspense>
        <RegisteredNotice />
      </Suspense>
      <form action={action} className="space-y-4">
        <Field label="Correo" name="email" type="email" required autoComplete="email" />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <FormError error={state.error} />
        <SubmitButton>Ingresar</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Tu empresa todavía no tiene cuenta?{" "}
        <Link href="/register" className="font-medium text-blue-600 hover:underline">
          Registrate
        </Link>
      </p>
    </div>
  );
}
