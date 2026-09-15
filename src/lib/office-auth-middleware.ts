import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Valida o token de sessão emitido pela base do escritório (Luz.IA).
export const requireOfficeAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: sessão não encontrada");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) throw new Error("Unauthorized: sessão não encontrada");

    const { officeUserClient } = await import("./office-supabase.server");
    const supabase = officeUserClient(token);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Error("Unauthorized: sessão inválida ou expirada");
    }

    return next({ context: { supabase, userId: data.user.id, user: data.user } });
  },
);
