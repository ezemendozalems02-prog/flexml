import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Membership, Organization } from "@/lib/domain/types";

export interface SessionContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  membership: Membership;
  organization: Organization;
}

/**
 * Contexto de sesión para páginas privadas: usuario + membresía activa +
 * organización. Redirige a /login sin usuario y a /onboarding sin membresía.
 * Cacheado por request.
 */
export const requireSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("*, organizations(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { organizations: organization, ...member } = membership as Membership & {
    organizations: Organization;
  };

  const { data: profile } = await supabase
    .from("platform_users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    membership: member,
    organization,
  };
});

/** Exige uno de los roles dados; redirige al inicio del rol si no cumple. */
export async function requireRole(roles: MemberRole[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!roles.includes(session.membership.role)) {
    const role = session.membership.role;
    redirect(role === "driver" ? "/driver" : role === "client" ? "/seller" : "/dashboard");
  }
  return session;
}
