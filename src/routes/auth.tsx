import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { signInWithExternalToken } from "@/lib/external-auth.functions";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const HUB_URL = "https://hub-ivory-eta.vercel.app";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso — Comparador de Notas Fiscais" },
      {
        name: "description",
        content: "Acesso ao comparador fiscal via token de autenticação do Luz.IA.",
      },
      { property: "og:title", content: "Acesso — Comparador de Notas Fiscais" },
      {
        property: "og:description",
        content: "Acesso ao comparador fiscal via token de autenticação do Luz.IA.",
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
  const signInByExternalToken = useServerFn(signInWithExternalToken);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!password) {
        toast.error("Informe a senha ou entre pelo Luz.IA");
        return;
      }

      // Login direto na base do escritório (mesma base da sessão do Luz.IA)
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        toast.error("E-mail ou senha inválidos");
        return;
      }
      window.location.href = "/";
    } catch {
      toast.error("Não foi possível validar o acesso");
    } finally {
      setSubmitting(false);
    }
  }

  // Sessão aplicada pelo hub (postMessage) enquanto a tela está aberta
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        window.location.href = "/";
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.substring(1)
        : "";
      const hashParams = new URLSearchParams(hash);
      const queryParams = new URLSearchParams(window.location.search);
      const access_token =
        hashParams.get("access_token") ?? queryParams.get("access_token");
      const refresh_token =
        hashParams.get("refresh_token") ?? queryParams.get("refresh_token");

      if (access_token) {
        if (refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (!error) {
            window.history.replaceState(null, "", window.location.pathname);
            if (!cancelled) {
              await router.invalidate();
              navigate({ to: "/" });
            }
            return;
          }
        }

        const result = await signInByExternalToken({ data: { access_token } });
        window.history.replaceState(null, "", window.location.pathname);
        if (result.ok) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: result.token_hash,
            type: "magiclink",
          });
          if (!error) {
            if (!cancelled) {
              await router.invalidate();
              navigate({ to: "/" });
            }
            return;
          }
        } else if (!cancelled) {
          toast.error(result.message);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/" });
        return;
      }

      // Sem token: aguarda alguns instantes a sessão enviada pelo hub
      setTimeout(() => {
        if (!cancelled) setChecking(false);
      }, 2500);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, router, signInByExternalToken]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="animate-spin" />
          Validando token de acesso...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-center">Entrar</h1>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          Use seu e-mail e senha do Luz.IA para acessar o comparador.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <Button asChild variant="outline" className="mt-4 w-full">
          <a href={HUB_URL}>Entrar pelo Luz.IA</a>
        </Button>
      </Card>
    </div>
  );
}
