import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  listUsers,
  createUser,
  deleteUser,
  updateUserRole,
  resetUserPassword,
  importUsersCsv,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { strongPasswordSchema, passwordRulesText } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Trash2, KeyRound, Upload, UserPlus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (error || !data) {
      throw new Error("Forbidden");
    }
  },
  component: AdminPage,
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Card className="p-8 text-center max-w-md">
        <h1 className="text-xl font-semibold mb-2">Acesso negado</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Você não tem permissão para acessar o painel de administração.
        </p>
        <Link to="/"><Button>Voltar</Button></Link>
      </Card>
    </div>
  ),
});

type Row = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user" | "lider" | "coordenador";
  must_change_password: boolean;
  created_at: string;
};

function parseCsv(text: string): Array<{ display_name: string; email: string; role: string; password: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = {
    name: header.findIndex((h) => ["nome", "name", "display_name"].includes(h)),
    email: header.findIndex((h) => ["email", "e-mail", "e_mail"].includes(h)),
    role: header.findIndex((h) => ["perfil", "role"].includes(h)),
    pw: header.findIndex((h) => ["senha", "password", "senha_provisoria", "senha provisória"].includes(h)),
  };
  if (idx.email < 0 || idx.pw < 0) {
    throw new Error("CSV precisa ter colunas: nome, email, perfil, senha");
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    return {
      display_name: idx.name >= 0 ? cols[idx.name] ?? "" : "",
      email: cols[idx.email] ?? "",
      role: idx.role >= 0 ? cols[idx.role] ?? "user" : "user",
      password: cols[idx.pw] ?? "",
    };
  });
}

function AdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const remove = useServerFn(deleteUser);
  const setRole = useServerFn(updateUserRole);
  const resetPw = useServerFn(resetUserPassword);
  const importCsv = useServerFn(importUsersCsv);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list({}),
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; password: string; display_name: string; role: "admin" | "user" | "lider" | "coordenador" }) =>
      create({ data: input }),
    onSuccess: () => {
      toast.success("Usuário criado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (user_id: string) => remove({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "user" | "lider" | "coordenador" }) => setRole({ data: v }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (v: { user_id: string; password: string; must_change_password?: boolean }) =>
      resetPw({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(
        v.must_change_password
          ? "Senha redefinida. O usuário precisará alterá-la no próximo acesso."
          : "Senha redefinida.",
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // create form state
  const [openCreate, setOpenCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<"admin" | "user" | "lider" | "coordenador">("user");
  const [cPassword, setCPassword] = useState("");

  // reset state
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [resetPwVal, setResetPwVal] = useState("");

  // import
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  async function onImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const cleaned = rows
        .filter((r) => r.email && r.password)
        .map((r) => ({
          email: r.email,
          password: r.password,
          display_name: r.display_name || r.email.split("@")[0],
          role: (["admin", "lider", "coordenador", "user"].includes(r.role.toLowerCase())
            ? (r.role.toLowerCase() as "admin" | "user" | "lider" | "coordenador")
            : "user"),

        }));
      if (cleaned.length === 0) {
        toast.error("Nenhuma linha válida no CSV");
        return;
      }
      const { results } = await importCsv({ data: { rows: cleaned } });
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      toast.success(`${ok} importado(s)${fail ? `, ${fail} com erro` : ""}`);
      results.filter((r) => !r.ok).forEach((r) => toast.error(`${r.email}: ${r.error}`));
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = strongPasswordSchema.safeParse(cPassword);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    createMut.mutate(
      { email: cEmail.trim(), password: cPassword, display_name: cName.trim(), role: cRole },
      {
        onSuccess: () => {
          setOpenCreate(false);
          setCName("");
          setCEmail("");
          setCRole("user");
          setCPassword("");
        },
      },
    );
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    const parsed = strongPasswordSchema.safeParse(resetPwVal);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    resetMut.mutate(
      { user_id: resetFor.id, password: resetPwVal, must_change_password: false },
      {
        onSuccess: () => {
          setResetFor(null);
          setResetPwVal("");
        },
      },
    );

  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <h1 className="text-2xl font-semibold mt-2">Administração de Usuários</h1>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar CSV
            </Button>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4" /> Novo usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo usuário</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={cName} onChange={(e) => setCName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select value={cRole} onValueChange={(v) => setCRole(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuário</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="coordenador">Coordenador</SelectItem>
                          <SelectItem value="lider">Líder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Senha provisória</Label>
                    <Input
                      type="text"
                      value={cPassword}
                      onChange={(e) => setCPassword(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">{passwordRulesText()}</p>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createMut.isPending}>
                      {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Criar
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-3">
            CSV esperado (com cabeçalho): <code>nome,email,perfil,senha</code>. Perfil = <code>admin</code> ou <code>user</code>.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: Row) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.display_name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          roleMut.mutate({ user_id: u.id, role: v as "admin" | "user" | "lider" | "coordenador" })
                        }
                      >
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="coordenador">Coordenador</SelectItem>
                          <SelectItem value="lider">Líder</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.must_change_password ? (
                        <Badge variant="outline">Senha pendente</Badge>
                      ) : (
                        <Badge>Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetFor(u)}
                      >
                        <KeyRound className="h-4 w-4" /> Senha
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Excluir ${u.email}?`)) delMut.mutate(u.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum usuário
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {resetFor?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha provisória</Label>
              <Input
                type="text"
                value={resetPwVal}
                onChange={(e) => setResetPwVal(e.target.value)}
                placeholder="Digite uma senha ou use a padrão"
              />
              <p className="text-xs text-muted-foreground">{passwordRulesText()}</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={resetMut.isPending}
                onClick={() => {
                  if (!resetFor) return;
                  resetMut.mutate(
                    { user_id: resetFor.id, password: "Logica@2026", must_change_password: true },
                    {
                      onSuccess: () => {
                        setResetFor(null);
                        setResetPwVal("");
                      },
                    },
                  );

                }}
              >
                Usar senha padrão
              </Button>
              <Button type="submit" disabled={resetMut.isPending || !resetPwVal}>
                {resetMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Redefinir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
