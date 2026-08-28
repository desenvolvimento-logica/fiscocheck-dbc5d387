import { supabase } from "@/integrations/supabase/app-client";

export type AppRole = "admin" | "user" | "lider" | "coordenador";

export async function userHasAnyRole(userId: string, roles: AppRole[]): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles);
  if (error) return false;
  return (data ?? []).length > 0;
}
