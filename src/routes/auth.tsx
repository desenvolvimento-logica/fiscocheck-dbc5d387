import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { signInWithExternalToken } from "@/lib/external-auth.functions";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";

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
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O acesso a este aplicativo é feito exclusivamente pelo token de
          autenticação do Luz.IA. Abra o comparador a partir do portal Luz.IA
          para continuar.
        </p>
        <Button asChild className="mt-6 w-full">
          <a href={HUB_URL}>Ir para o Luz.IA</a>
        </Button>
      </Card>
    </div>
  );
}
