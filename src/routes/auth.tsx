import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { signInWithExternalBase } from "@/lib/external-auth.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(1, "Informe a senha").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

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
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { token_hash } = await signInWithExternalBase({
        data: { email: parsed.data.email, password: parsed.data.password },
      });
      const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash });
      if (error) throw error;
      toast.success("Bem-vindo!");
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(
        msg.includes("Invalid login credentials") ? "E-mail ou senha inválidos" : msg,
      );
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
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
          NF
        </div>
        <h1 className="text-xl font-semibold">Comparador de Notas Fiscais</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O acesso a este app é feito pelo sistema principal. Nenhuma sessão válida foi
          encontrada — retorne ao sistema e acesse novamente pelo link do app.
        </p>
      </Card>
    </div>
  );
}

