import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ExternalAuthResult =
  | { ok: true; token_hash: string }
  | { ok: false; message: string };

// Configuração da base externa usada APENAS para validar as credenciais/tokens de login.
const EXTERNAL_SUPABASE_URL = "https://olyvjnqmrzkziirzbmhi.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seXZqbnFtcnpremlpcnpibWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjY4NDUsImV4cCI6MjEwMjIwMjg0NX0.3_OyS_gB7ZeDY9fMcYBSqeypGYO0aW57vfEne-XB97w";

function createExternalClient() {
  return createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function displayNameFromUser(user: User, email: string) {
  const metadataName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined);
  return metadataName?.trim() || email.split("@")[0];
}

async function issueLocalSessionForExternalUser(
  externalUser: User,
  fallbackEmail?: string,
): Promise<ExternalAuthResult> {
  const email = (externalUser.email ?? fallbackEmail ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Não foi possível identificar o e-mail do usuário" };

  const displayName = displayNameFromUser(externalUser, email);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    return { ok: false, message: "Não foi possível consultar o usuário" };
  }

  let localUserId = profile?.id as string | undefined;

  if (!localUserId) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { display_name: displayName, must_change_password: false },
    });

    if (createErr || !created.user) {
      return { ok: false, message: createErr?.message ?? "Não foi possível criar o usuário" };
    }

    localUserId = created.user.id;

    const { error: upsertProfileError } = await supabaseAdmin.from("profiles").upsert(
      { id: localUserId, email, display_name: displayName, must_change_password: false },
      { onConflict: "id" },
    );
    if (upsertProfileError) {
      return { ok: false, message: "Não foi possível atualizar o perfil" };
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: localUserId, role: "user" }, { onConflict: "user_id,role" });
    if (roleError) {
      return { ok: false, message: "Não foi possível configurar o acesso" };
    }
  } else {
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", localUserId);
    if (updateError) {
      return { ok: false, message: "Não foi possível atualizar o perfil" };
    }
  }

  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    return { ok: false, message: linkErr?.message ?? "Não foi possível iniciar a sessão" };
  }

  return { ok: true, token_hash: link.properties.hashed_token };
}

export async function signInWithExternalPassword(
  email: string,
  password: string,
): Promise<ExternalAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { ok: false, message: "Informe e-mail e senha" };
  }

  const external = createExternalClient();
  const { data: extAuth, error: extErr } = await external.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (extErr || !extAuth.user) {
    return { ok: false, message: "E-mail ou senha inválidos" };
  }

  return issueLocalSessionForExternalUser(extAuth.user, normalizedEmail);
}

export async function signInWithExternalAccessToken(
  accessToken: string,
): Promise<ExternalAuthResult> {
  if (!accessToken.trim()) {
    return { ok: false, message: "Token de acesso não informado" };
  }

  const external = createExternalClient();
  const { data, error } = await external.auth.getUser(accessToken);

  if (error || !data.user) {
    return { ok: false, message: "Token de acesso inválido ou expirado" };
  }

  return issueLocalSessionForExternalUser(data.user);
}