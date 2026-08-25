import { createServerFn } from "@tanstack/react-start";

type SignInInput = { email: string; password: string };
type TokenInput = { access_token: string };
type SignInResult =
  | { ok: true; token_hash: string }
  | { ok: false; message: string };

export const signInWithExternalBase = createServerFn({ method: "POST" })
  .inputValidator((d: SignInInput) => d)
  .handler(async ({ data }): Promise<SignInResult> => {
    try {
      const { signInWithExternalPassword } = await import("./external-auth.server");
      return await signInWithExternalPassword(data.email, data.password);
    } catch {
      return { ok: false, message: "Não foi possível validar o acesso" };
    }
  });

export const signInWithExternalToken = createServerFn({ method: "POST" })
  .inputValidator((d: TokenInput) => d)
  .handler(async ({ data }): Promise<SignInResult> => {
    try {
      const { signInWithExternalAccessToken } = await import("./external-auth.server");
      return await signInWithExternalAccessToken(data.access_token);
    } catch {
      return { ok: false, message: "Não foi possível validar o token de acesso" };
    }
  });
