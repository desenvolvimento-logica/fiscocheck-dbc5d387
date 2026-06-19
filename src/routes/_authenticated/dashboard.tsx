import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard da Equipe — Comparador de Notas" }],
  }),
  component: DashboardPage,
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
  created_at: string;
};

type Profile = { id: string; display_name: string | null; email: string | null };

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DashboardPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState("30");

  // Gate: lider OR coordenador only (admin also allowed)
  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ["dashboard-access"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const checks = await Promise.all(
        (["admin", "coordenador", "lider"] as const).map((r) =>
          supabase.rpc("has_role", { _user_id: user.id, _role: r })
        )
      );
      return checks.some((c) => !!c.data);
    },
  });

  useEffect(() => {
    if (!accessLoading && access === false) {
      navigate({ to: "/", replace: true });
    }
  }, [access, accessLoading, navigate]);

  const { data: comparisons = [], isLoading } = useQuery({
    queryKey: ["dashboard-comparisons"],
    enabled: !!access,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comparisons")
        .select("id,user_id,author_role,cliente,movement,doc_type,diff_count,diff_total,divergences_count,classified_count,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Comparison[];
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set(comparisons.map((c) => c.user_id))),
    [comparisons]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ["dashboard-profiles", userIds],
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
    if (days === "all") return comparisons;
    const cutoff = Date.now() - parseInt(days) * 24 * 60 * 60 * 1000;
    return comparisons.filter((c) => new Date(c.created_at).getTime() >= cutoff);
  }, [comparisons, days]);

  // KPIs
  const kpis = useMemo(() => {
    const totalComparisons = filtered.length;
    const totalDivergences = filtered.reduce((s, c) => s + c.divergences_count, 0);
    const totalDiff = filtered.reduce((s, c) => s + Number(c.diff_total || 0), 0);
    const totalClassified = filtered.reduce((s, c) => s + c.classified_count, 0);
    const classifiedPct = totalDivergences > 0 ? (totalClassified / totalDivergences) * 100 : 0;
    const avgDiv = totalComparisons > 0 ? totalDivergences / totalComparisons : 0;
    const activeUsers = new Set(filtered.map((c) => c.user_id)).size;
    return { totalComparisons, totalDivergences, totalDiff, classifiedPct, avgDiv, activeUsers };
  }, [filtered]);

  // Daily trend
  const trend = useMemo(() => {
    const map = new Map<string, { date: string; comparacoes: number; divergencias: number }>();
    filtered.forEach((c) => {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(key) ?? { date: key, comparacoes: 0, divergencias: 0 };
      cur.comparacoes += 1;
      cur.divergencias += c.divergences_count;
      map.set(key, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: d.date.slice(5).replace("-", "/"),
      }));
  }, [filtered]);

  // By doc type
  const byDoc = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(c.doc_type, (map.get(c.doc_type) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Top clientes by divergence
  const topClientes = useMemo(() => {
    const map = new Map<string, { cliente: string; divergencias: number; diff: number }>();
    filtered.forEach((c) => {
      const cur = map.get(c.cliente) ?? { cliente: c.cliente, divergencias: 0, diff: 0 };
      cur.divergencias += c.divergences_count;
      cur.diff += Number(c.diff_total || 0);
      map.set(c.cliente, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.divergencias - a.divergencias)
      .slice(0, 8);
  }, [filtered]);

  // Top users
  const topUsers = useMemo(() => {
    const map = new Map<string, { user_id: string; comparacoes: number; divergencias: number }>();
    filtered.forEach((c) => {
      const cur = map.get(c.user_id) ?? { user_id: c.user_id, comparacoes: 0, divergencias: 0 };
      cur.comparacoes += 1;
      cur.divergencias += c.divergences_count;
      map.set(c.user_id, cur);
    });
    return Array.from(map.values())
      .map((u) => ({
        ...u,
        name: profileById.get(u.user_id)?.display_name || profileById.get(u.user_id)?.email || "—",
      }))
      .sort((a, b) => b.comparacoes - a.comparacoes)
      .slice(0, 8);
  }, [filtered, profileById]);

  if (accessLoading || !access) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

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
            <BarChart3 className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Dashboard da Equipe</h1>
          </div>
          <div className="w-44">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="bg-primary-foreground text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Carregando dados...</div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard icon={<FileSpreadsheet className="h-5 w-5" />} label="Comparações" value={kpis.totalComparisons.toLocaleString("pt-BR")} />
              <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Divergências" value={kpis.totalDivergences.toLocaleString("pt-BR")} />
              <KpiCard icon={<BarChart3 className="h-5 w-5" />} label="Diferença total" value={fmtMoney(kpis.totalDiff)} />
              <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Classificadas" value={`${kpis.classifiedPct.toFixed(1)}%`} />
              <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Média divergências/comparação" value={kpis.avgDiv.toFixed(1)} />
              <KpiCard icon={<Users className="h-5 w-5" />} label="Usuários ativos" value={kpis.activeUsers.toLocaleString("pt-BR")} />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold mb-3">Comparações e divergências por dia</h3>
                <div className="h-72">
                  {trend.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                        <Line type="monotone" dataKey="comparacoes" name="Comparações" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="divergencias" name="Divergências" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Por tipo de documento</h3>
                <div className="h-72">
                  {byDoc.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byDoc} dataKey="value" nameKey="name" outerRadius={90} label>
                          {byDoc.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Top clientes com mais divergências</h3>
                <div className="h-80">
                  {topClientes.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topClientes} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis type="category" dataKey="cliente" width={140} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                        <Bar dataKey="divergencias" name="Divergências" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Top usuários da equipe</h3>
                <div className="h-80 overflow-y-auto">
                  {topUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground border-b">
                        <tr>
                          <th className="text-left py-2">Usuário</th>
                          <th className="text-right">Comparações</th>
                          <th className="text-right">Divergências</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topUsers.map((u) => (
                          <tr key={u.user_id} className="border-b last:border-0">
                            <td className="py-2 truncate max-w-[200px]" title={u.name}>{u.name}</td>
                            <td className="text-right">{u.comparacoes}</td>
                            <td className="text-right">{u.divergencias}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Sem dados no período.
    </div>
  );
}
