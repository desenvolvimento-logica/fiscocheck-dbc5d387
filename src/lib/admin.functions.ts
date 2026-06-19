import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user";
  must_change_password: boolean;
  created_at: string;
};

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, must_change_password, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const roleMap = new Map<string, "admin" | "user">();
    for (const r of roles ?? []) roleMap.set(r.user_id, r.role as any);

    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email ?? "",
      display_name: p.display_name,
      role: roleMap.get(p.id) ?? "user",
      must_change_password: p.must_change_password,
      created_at: p.created_at,
    }));
  });

type CreateUserInput = {
  email: string;
  password: string;
  display_name: string;
  role: "admin" | "user";
};

async function createOneUser(input: CreateUserInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: input.display_name,
      must_change_password: true,
    },
  });
  if (error) throw new Error(error.message);
  const uid = data.user!.id;

  await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: uid,
        email,
        display_name: input.display_name,
        must_change_password: true,
      },
      { onConflict: "id" },
    );

  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: uid, role: input.role }, { onConflict: "user_id,role" });

  return uid;
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateUserInput) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const id = await createOneUser(data);
    return { id };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("Não é possível excluir o próprio usuário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "user" }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; password: string; must_change_password?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: data.must_change_password ?? false })
      .eq("id", data.user_id);
    return { ok: true };
  });


type ImportRow = CreateUserInput;
type ImportResult = { email: string; ok: boolean; error?: string };

export const importUsersCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: ImportRow[] }) => d)
  .handler(async ({ data, context }): Promise<{ results: ImportResult[] }> => {
    await ensureAdmin(context.supabase, context.userId);
    const results: ImportResult[] = [];
    for (const row of data.rows) {
      try {
        await createOneUser(row);
        results.push({ email: row.email, ok: true });
      } catch (e) {
        results.push({
          email: row.email,
          ok: false,
          error: e instanceof Error ? e.message : "Erro",
        });
      }
    }
    return { results };
  });

export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    return { ok: true };
  });
