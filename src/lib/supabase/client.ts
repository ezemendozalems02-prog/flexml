"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente de Supabase para componentes de navegador (usa la anon key + RLS). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
