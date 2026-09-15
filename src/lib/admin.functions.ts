import { createServerFn } from "@tanstack/react-start";
import { requireOfficeAuth } from "./office-auth-middleware";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user" | "lider" | "coordenador";
  must_change_password: boolean;
  created_at: string;
};

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireOfficeAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, must_change_password, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const roleMap = new Map<string, "admin" | "user" | "lider" | "coordenador">();
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

export const DEFAULT_FIRST_ACCESS_PASSWORD = "Logica@2026";

type CreateUserInput = {
  email: string;
  password?: string;
  display_name: string;
  role: "admin" | "user" | "lider" | "coordenador";
};

type CreateOfficeUserInput = CreateUserInput & { accessToken: string };

async function authenticateOfficeAdmin(accessToken: string) {
  if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente pelo Luz.IA.");
  const { officeUserClient } = await import("./office-supabase.server");
  const supabase = officeUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Sua sessão expirou. Entre novamente pelo Luz.IA.");
  }
  await ensureAdmin(supabase, data.user.id);
}

async function createOneUser(input: CreateUserInput) {
  const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();
  const email = input.email.trim().toLowerCase();
  const password = input.password && input.password.length > 0 ? input.password : DEFAULT_FIRST_ACCESS_PASSWORD;
  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(listError.message);

  const existingUser = existingUsers.users.find(
    (user) => user.email?.trim().toLowerCase() === email,
  );

  let uid: string | undefined;
  if (existingUser) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        display_name: input.display_name,
        must_change_password: true,
      },
    });
    if (error) throw new Error(error.message);
    uid = data.user?.id;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: input.display_name,
        must_change_password: true,
      },
    });
    if (error) throw new Error(error.message);
    uid = data.user?.id;
  }

  if (!uid) throw new Error("A base não retornou o identificador do novo usuário");

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

// Nome dedicado para evitar que clientes antigos reutilizem o identificador
// de função que ficou armazenado durante a troca da base de autenticação.
export const createOfficeUser = createServerFn({ method: "POST" })
  .inputValidator((d: CreateOfficeUserInput) => d)
  .handler(async ({ data }) => {
    await authenticateOfficeAdmin(data.accessToken);
    const id = await createOneUser(data);
    return { id };
  });

// Compatibilidade com abas que ainda carregaram a versão anterior do painel.
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
  .inputValidator((d: CreateUserInput) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const id = await createOneUser(data);
    return { id };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("Não é possível excluir o próprio usuário");
    const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "user" | "lider" | "coordenador" }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function generateTempPassword(): string {
  // 16-char password with letters, digits, and a symbol — meets strong password rules
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 12; i++) chars.push(pick(all));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
  .inputValidator((d: { user_id: string; password?: string; must_change_password?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();
    const password = data.password && data.password.length > 0 ? data.password : generateTempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: data.must_change_password ?? false })
      .eq("id", data.user_id);
    // Only return the generated password when the admin did NOT supply one
    return { ok: true, password: data.password ? undefined : password };
  });


type ImportRow = CreateUserInput;
type ImportResult = { email: string; ok: boolean; error?: string };

export const importUsersCsv = createServerFn({ method: "POST" })
  .middleware([requireOfficeAuth])
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
  .middleware([requireOfficeAuth])
  .handler(async ({ context }) => {
    const { officeAdminClient } = await import("./office-supabase.server");
  const supabaseAdmin = officeAdminClient();
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    return { ok: true };
  });
