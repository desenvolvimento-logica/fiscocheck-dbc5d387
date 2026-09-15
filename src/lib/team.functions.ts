import { createServerFn } from "@tanstack/react-start";
import { requireOfficeAuth } from "./office-auth-middleware";

export type AuthorInfo = {
  id: string;
  display_name: string | null;
  email: string | null;
};

// Retorna nome/e-mail dos autores das comparações.
// Usa a chave administrativa porque as políticas da tabela de perfis só
// permitem que cada usuário leia o próprio registro — líderes e coordenadores
// ficariam sem os dados do autor.
export const getComparisonAuthors = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
  .inputValidator((d: { userIds: string[] }) => d)
  .handler(async ({ data, context }): Promise<AuthorInfo[]> => {
    const ids = Array.from(new Set((data.userIds ?? []).filter(Boolean))).slice(0, 1000);
    if (ids.length === 0) return [];

    const { data: roles, error: rErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rErr) throw new Error(rErr.message);

    const allowed = (roles ?? []).some((r: any) =>
      ["admin", "coordenador", "lider"].includes(r.role),
    );
    if (!allowed) {
      return ids
        .filter((id) => id === context.userId)
        .map((id) => ({ id, display_name: null, email: null }));
    }

    const { officeAdminClient } = await import("./office-supabase.server");
    const supabaseAdmin = officeAdminClient();

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const found = new Map<string, AuthorInfo>();
    for (const p of profiles ?? []) {
      found.set(p.id, { id: p.id, display_name: p.display_name, email: p.email });
    }

    // Completa quem ainda não tem perfil criado, buscando na autenticação.
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) {
        if (!missing.includes(u.id)) continue;
        found.set(u.id, {
          id: u.id,
          display_name:
            (u.user_metadata?.display_name as string | undefined) ??
            (u.email ? u.email.split("@")[0] : null),
          email: u.email ?? null,
        });
      }
    }

    return ids.map((id) => found.get(id) ?? { id, display_name: null, email: null });
  });
