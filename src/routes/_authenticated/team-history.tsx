import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/app-client";

export const Route = createFileRoute("/_authenticated/team-history")({
  head: () => ({
    meta: [{ title: "Histórico da Equipe — Comparador de Notas" }],
  }),
  component: TeamHistoryPage,
});

type Comparison = {
  id: string;
  user_id: string;
  author_role: "admin" | "coordenador" | "lider" | "user";
  cliente: string;
  movement: string;
  doc_type: string;
  diff_count: number;
  diff_total: number;
  divergences_count: number;
  classified_count: number;
  items: Array<{
    nota: string;
    fornecedor?: string;
    valor: number;
    origem: "Domínio" | "Cliente";
  }>;
  classifications: Record<string, string>;
  created_at: string;
};

type Profile = { id: string; display_name: string | null; email: string | null };

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  coordenador: "Coordenador",
  lider: "Líder",
  user: "Usuário",
};

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function TeamHistoryPage() {
  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Comparison | null>(null);

  const { data: comparisons = [], isLoading } = useQuery({
    queryKey: ["team-comparisons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comparisons")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Comparison[];
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set(comparisons.map((c) => c.user_id))),
    [comparisons]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ["team-profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return comparisons.filter((c) => {
      if (authorFilter !== "all" && c.author_role !== authorFilter) return false;
      if (docFilter !== "all" && c.doc_type !== docFilter) return false;
      if (!q) return true;
      const p = profileById.get(c.user_id);
      return (
        c.cliente.toLowerCase().includes(q) ||
        (p?.display_name ?? "").toLowerCase().includes(q) ||
        (p?.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [comparisons, search, authorFilter, docFilter, profileById]);

  const baixar = async (entry: Comparison) => {
    const XLSX = await import("xlsx");
    const rows = entry.items.map((it, i) => {
      const k = `${it.nota}-${it.origem}-${i}`;
      return {
        Nota: it.nota,
        Fornecedor: it.fornecedor || "",
        "Valor Contábil": it.valor,
        "Diferença no": it.origem,
        Classificação: entry.classifications?.[k] || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");
    const safeCli = entry.cliente.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 40);
    const dt = entry.created_at.replace(/[:.]/g, "-").slice(0, 19);
    XLSX.writeFile(wb, `notas_diferenca_${safeCli}_${dt}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center gap-3">
          <Link to="/">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <History className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Histórico da Equipe</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Card className="p-4 mb-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, nome ou e-mail"
                className="pl-8"
              />
            </div>
            <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Perfil do autor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="lider">Líder</SelectItem>
                <SelectItem value="coordenador">Coordenador</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
            <Select value={docFilter} onValueChange={setDocFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os documentos</SelectItem>
                <SelectItem value="NFE">NFE</SelectItem>
                <SelectItem value="NFCe">NFCe</SelectItem>
                <SelectItem value="NFSe">NFSe</SelectItem>
                <SelectItem value="CTE">CTE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Movimentação</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="text-right">Divergências</TableHead>
                <TableHead className="text-right">Diferença total</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma comparação encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const p = profileById.get(c.user_id);
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(c)}
                    >
                      <TableCell className="whitespace-nowrap">{fmtDate(c.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p?.display_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p?.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel[c.author_role] ?? c.author_role}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate" title={c.cliente}>
                        {c.cliente}
                      </TableCell>
                      <TableCell className="capitalize">{c.movement}</TableCell>
                      <TableCell>{c.doc_type}</TableCell>
                      <TableCell className="text-right">{c.divergences_count}</TableCell>
                      <TableCell className="text-right">{fmtMoney(c.diff_total)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => baixar(c)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selected?.cliente}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Autor</div>
                  <div className="font-medium">
                    {profileById.get(selected.user_id)?.display_name || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Data</div>
                  <div className="font-medium">{fmtDate(selected.created_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Documento</div>
                  <div className="font-medium">{selected.movement} · {selected.doc_type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Diferença total</div>
                  <div className="font-medium">{fmtMoney(selected.diff_total)}</div>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nota</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Diferença no</TableHead>
                      <TableHead>Classificação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((it, i) => {
                      const k = `${it.nota}-${it.origem}-${i}`;
                      return (
                        <TableRow key={k}>
                          <TableCell>{it.nota}</TableCell>
                          <TableCell>{it.fornecedor || "—"}</TableCell>
                          <TableCell className="text-right">{fmtMoney(it.valor)}</TableCell>
                          <TableCell>{it.origem}</TableCell>
                          <TableCell>{selected.classifications?.[k] || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
