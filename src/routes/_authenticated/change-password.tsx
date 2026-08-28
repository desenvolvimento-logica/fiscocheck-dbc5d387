import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { markPasswordChanged } from "@/lib/admin.functions";
import { strongPasswordSchema, passwordRulesText } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/change-password")({
  ssr: false,
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const mark = useServerFn(markPasswordChanged);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = strongPasswordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await mark({});
      toast.success("Senha alterada com sucesso");
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold mb-2">Defina uma nova senha</h1>
        <p className="text-sm text-muted-foreground mb-6">{passwordRulesText()}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw">Nova senha</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf">Confirme a senha</Label>
            <Input
              id="cf"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Alterar senha
          </Button>
        </form>
      </Card>
    </div>
  );
}
