import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/app-client";

// Anexa o token da sessão da base do escritório em todas as chamadas de servidor.
export const attachOfficeAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      token = undefined;
    }
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
