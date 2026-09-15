import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Base do escritório (mesma do Luz.IA)
export const OFFICE_SUPABASE_URL = "https://olyvjnqmrzkziirzbmhi.supabase.co";
export const OFFICE_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seXZqbnFtcnpremlpcnpibWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjY4NDUsImV4cCI6MjEwMjIwMjg0NX0.3_OyS_gB7ZeDY9fMcYBSqeypGYO0aW57vfEne-XB97w";

export function officeUserClient(token: string): SupabaseClient {
  return createClient(OFFICE_SUPABASE_URL, OFFICE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export function officeAdminClient(): SupabaseClient {
  const key = process.env["OFFICE_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) {
    throw new Error("Chave administrativa da base do escritório não configurada");
  }
  return createClient(OFFICE_SUPABASE_URL, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
