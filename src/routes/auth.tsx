import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithExternalBase } from "@/lib/external-auth.functions";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Login — Comparador de Notas Fiscais" },
      {
        name: "description",
        content: "Acesse o comparador fiscal com seu e-mail e senha.",
      },
      { property: "og:title", content: "Login — Comparador de Notas Fiscais" },
      {
        property: "og:description",
        content: "Acesse o comparador fiscal com seu e-mail e senha.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const signIn = useServerFn(signInWithExternalBase);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Token vindo na URL (hash ou query) — login automático
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.substring(1)
        : "";
      const hashParams = new URLSearchParams(hash);
      const queryParams = new URLSearchParams(window.location.search);
      const access_token =
        hashParams.get("access_token") ?? queryParams.get("access_token");
      const refresh_token =
        hashParams.get("refresh_token") ?? queryParams.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (!error) {
          if (!cancelled) navigate({ to: "/" });
          return;
        }
      }

      // 2) Sessão já existente
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/" });
        return;
      }

      // 3) Sem token: exibe o formulário
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token_hash } = await signIn({ data: { email, password } });
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: "magiclink",
      });
      if (error) throw error;
      toast.success("Login realizado com sucesso");
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="animate-spin" />
          Verificando acesso...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mx-auto mb-3 h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
          NF
        </div>
        <h1 className="text-center text-xl font-semibold">Comparador de Notas Fiscais</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Entre com seu e-mail e senha para acessar o comparador.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}

