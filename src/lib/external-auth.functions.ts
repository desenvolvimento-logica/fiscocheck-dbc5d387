import { createServerFn } from "@tanstack/react-start";

type SignInInput = { email: string; password: string };

export const signInWithExternalBase = createServerFn({ method: "POST" })
  .inputValidator((d: SignInInput) => d)
  .handler(async ({ data }): Promise<{ token_hash: string }> => {
    const email = data.email.trim().toLowerCase();
    const password = data.password;
    if (!email || !password) throw new Error("Informe e-mail e senha");

    const { createClient } = await import("@supabase/supabase-js");
    const { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } = await import(
      "./external-auth.server"
    );

    // 1) Valida as credenciais na base externa
    const external = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: extAuth, error: extErr } = await external.auth.signInWithPassword({
      email,
      password,
    });
    if (extErr || !extAuth.user) {
      throw new Error("E-mail ou senha inválidos");
    }
    // Não mantemos sessão da base externa
    await external.auth.signOut().catch(() => {});

    const displayName =
      (extAuth.user.user_metadata?.display_name as string | undefined) ??
      email.split("@")[0];

    // 2) Garante o usuário correspondente na base do app
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let localUserId = profile?.id as string | undefined;

    if (!localUserId) {
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID() + crypto.randomUUID(),
          user_metadata: { display_name: displayName, must_change_password: false },
        });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Não foi possível criar o usuário");
      }
      localUserId = created.user.id;

      await supabaseAdmin
        .from("profiles")
        .upsert(
          { id: localUserId, email, display_name: displayName, must_change_password: false },
          { onConflict: "id" },
        );
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: localUserId, role: "user" }, { onConflict: "user_id,role" });
    } else {
      // A senha passa a ser gerenciada pela base externa
      await supabaseAdmin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", localUserId);
    }

    // 3) Emite um token de sessão para a base do app (sem enviar e-mail)
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "Não foi possível iniciar a sessão");
    }

    return { token_hash: link.properties.hashed_token };
  });
