import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  parseExcel,
  parseDominioPdf,
  parseDominioExcel,
  compare,
  type Movement,
  type DocType,
  type CompareResult,
  fmtMoney,
  getColumns,
} from "@/lib/comparator";
import { ArrowLeft, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Download, Trash2, History, LogOut, Shield, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PatchNotesButton } from "@/components/PatchNotesButton";
import { userHasAnyRole } from "@/lib/roles";
import { toast } from "sonner";

function AdminLink() {
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      return userHasAnyRole(user.id, ["admin"]);
    },
  });
  if (!isAdmin) return null;
  return (
    <Link to="/admin">
      <Button variant="secondary" size="sm">
        <Shield className="h-4 w-4" />
        Admin
      </Button>
    </Link>
  );
}

function TeamLinks() {
  const { data: canSeeTeam } = useQuery({
    queryKey: ["can-see-team"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      return userHasAnyRole(user.id, ["admin", "coordenador", "lider"]);
    },
  });
  if (!canSeeTeam) return null;
  return (
    <>
      <Link to="/dashboard">
        <Button variant="secondary" size="sm">
          <BarChart3 className="h-4 w-4" />
          Dashboard
        </Button>
      </Link>
      <Link to="/team-history">
        <Button variant="secondary" size="sm">
          <History className="h-4 w-4" />
          Equipe
        </Button>
      </Link>
    </>
  );
}



function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}

type HistoricoItem = {
  nota: string;
  fornecedor?: string;
  valor: number;
  origem: "Domínio" | "Cliente";
};

type HistoricoEntry = {
  id: string;
  cliente: string;
  movement: Movement;
  docType: DocType;
  datetime: string;
  diffCount: number;
  diffTotal: number;
  divergencesCount: number;
  classifiedCount: number;
  items: HistoricoItem[];
  classifications: Record<string, string>;
};

const HISTORICO_KEY = "fc_historico_v1";

function loadHistorico(): HistoricoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORICO_KEY);
    return raw ? (JSON.parse(raw) as HistoricoEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistorico(entries: HistoricoEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORICO_KEY, JSON.stringify(entries));
}

async function addHistorico(entry: HistoricoEntry) {
  const list = loadHistorico();
  list.unshift(entry);
  saveHistorico(list.slice(0, 50));
  // Persist to backend so it is available on any device and for the team
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("comparisons").insert({
      id: entry.id,
      user_id: user.id,
      cliente: entry.cliente,
      movement: entry.movement,
      doc_type: entry.docType,
      diff_count: entry.diffCount,
      diff_total: entry.diffTotal,
      divergences_count: entry.divergencesCount,
      classified_count: entry.classifiedCount,
      items: entry.items as any,
      classifications: entry.classifications as any,
      created_at: entry.datetime,
    });
    if (error) throw error;
  } catch (e) {
    console.error("Falha ao salvar comparação no histórico da equipe", e);
    toast.error("Não foi possível salvar a comparação no histórico.");
  }
}

async function fetchHistorico(): Promise<HistoricoEntry[]> {
  const local = loadHistorico();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return local;
    const { data, error } = await supabase
      .from("comparisons")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const remote: HistoricoEntry[] = (data ?? []).map((r: any) => ({
      id: r.id,
      cliente: r.cliente,
      movement: r.movement as Movement,
      docType: r.doc_type as DocType,
      datetime: r.created_at,
      diffCount: r.diff_count,
      diffTotal: Number(r.diff_total),
      divergencesCount: r.divergences_count,
      classifiedCount: r.classified_count,
      items: (r.items ?? []) as HistoricoItem[],
      classifications: (r.classifications ?? {}) as Record<string, string>,
    }));
    const ids = new Set(remote.map((e) => e.id));
    return [...remote, ...local.filter((e) => !ids.has(e.id))].sort((a, b) =>
      a.datetime < b.datetime ? 1 : -1,
    );
  } catch (e) {
    console.error("Falha ao carregar histórico", e);
    return local;
  }
}

async function updateHistoricoClassifications(
  id: string,
  classifications: Record<string, string>,
) {
  const list = loadHistorico();
  const idx = list.findIndex((e) => e.id === id);
  if (idx >= 0) {
    list[idx].classifications = classifications;
    list[idx].classifiedCount = Object.values(classifications).filter(Boolean).length;
    saveHistorico(list);
  }
  const { error } = await supabase
    .from("comparisons")
    .update({
      classifications: classifications as any,
      classified_count: Object.values(classifications).filter(Boolean).length,
    })
    .eq("id", id);
  if (error) {
    console.error("Falha ao atualizar classificações", error);
    toast.error("Não foi possível salvar as classificações.");
  }
}

async function removeHistorico(id: string) {
  saveHistorico(loadHistorico().filter((e) => e.id !== id));
  const { error } = await supabase.from("comparisons").delete().eq("id", id);
  if (error) console.error("Falha ao remover comparação", error);
}



export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Comparador de Notas Fiscais — NFE / NFCe / NFSe / CTE" },
      {
        name: "description",
        content:
          "Compare relatórios de NFS, NFE e CTE entre Jettax, Portal Nacional e Domínio.",
      },
    ],
  }),
  component: Index,
});

type Step = "movement" | "doctype" | "compare";

function Index() {
  const [step, setStep] = useState<Step>("movement");
  const [movement, setMovement] = useState<Movement | null>(null);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [historicoVersion, setHistoricoVersion] = useState(0);

  const reset = () => {
    setStep("movement");
    setMovement(null);
    setDocType(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-accent flex items-center justify-center text-accent-foreground font-bold">
            NF
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">
              Comparador de Notas Fiscais
            </h1>
            <p className="text-xs opacity-80">Jettax · Portal Nacional · Domínio</p>
          </div>
          <TeamLinks />
          <AdminLink />
          <PatchNotesButton />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Stepper step={step} movement={movement} docType={docType} />

            {step === "movement" && (
              <MovementStep
                onPick={(m) => {
                  setMovement(m);
                  setStep("doctype");
                }}
              />
            )}

            {step === "doctype" && movement && (
              <DocTypeStep
                movement={movement}
                onBack={() => setStep("movement")}
                onPick={(d) => {
                  setDocType(d);
                  setStep("compare");
                }}
              />
            )}

            {step === "compare" && movement && docType && (
              <CompareStep
                movement={movement}
                docType={docType}
                onBack={() => setStep("doctype")}
                onReset={reset}
                setHistoricoVersion={setHistoricoVersion}
              />
            )}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <HistoricoPanel version={historicoVersion} onChange={() => setHistoricoVersion((v) => v + 1)} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stepper({
  step,
  movement,
  docType,
}: {
  step: Step;
  movement: Movement | null;
  docType: DocType | null;
}) {
  const items = [
    { key: "movement", label: "Movimentação", value: movement ? (movement === "entrada" ? "Entrada" : "Saída") : "" },
    { key: "doctype", label: "Documento", value: docType ?? "" },
    { key: "compare", label: "Comparar", value: "" },
  ];
  const currentIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="mb-8 flex items-center gap-2 text-sm">
      {items.map((it, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <li key={it.key} className="flex items-center gap-2">
            <span
              className={`h-7 w-7 rounded-full flex items-center justify-center font-medium ${
                active
                  ? "bg-accent text-accent-foreground"
                  : done
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <div className="flex flex-col">
              <span className={active ? "font-semibold" : "text-muted-foreground"}>
                {it.label}
              </span>
              {it.value && <span className="text-xs text-muted-foreground">{it.value}</span>}
            </div>
            {i < items.length - 1 && <span className="mx-2 h-px w-8 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border bg-card p-6 transition hover:border-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <h3 className="text-lg font-semibold text-foreground group-hover:text-accent-foreground">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

function MovementStep({ onPick }: { onPick: (m: Movement) => void }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">Qual o tipo de movimentação?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Selecione para continuar.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ChoiceCard
          title="Entrada"
          description="Notas de entrada (NFE, CTE, NFSe)"
          onClick={() => onPick("entrada")}
        />
        <ChoiceCard
          title="Saída"
          description="Notas de saída (NFE, NFCe, NFSe)"
          onClick={() => onPick("saida")}
        />
      </div>
    </section>
  );
}

function DocTypeStep({
  movement,
  onBack,
  onPick,
}: {
  movement: Movement;
  onBack: () => void;
  onPick: (d: DocType) => void;
}) {
  const options: DocType[] =
    movement === "entrada" ? ["NFE", "CTE", "NFSe"] : ["NFE", "NFCe", "NFSe"];
  return (
    <section>
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <h2 className="text-xl font-semibold">Qual o tipo de documento?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Movimentação: <span className="font-medium text-foreground">{movement === "entrada" ? "Entrada" : "Saída"}</span>
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {options.map((d) => (
          <ChoiceCard
            key={d}
            title={d}
            description={`Comparar relatórios de ${d}`}
            onClick={() => onPick(d)}
          />
        ))}
      </div>
    </section>
  );
}

function FileInput({
  label,
  accept,
  file,
  onChange,
  icon,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="block cursor-pointer rounded-lg border border-dashed bg-card p-5 transition hover:border-accent">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-accent">{icon}</div>
        <div className="flex-1">
          <div className="font-medium text-sm">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {file ? file.name : "Clique para selecionar um arquivo"}
          </div>
        </div>
      </div>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function CompareStep({
  movement,
  docType,
  onBack,
  onReset,
  setHistoricoVersion,
}: {
  movement: Movement;
  docType: DocType;
  onBack: () => void;
  onReset: () => void;
  setHistoricoVersion: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [currentHistoricoId, setCurrentHistoricoId] = useState<string | null>(null);
  const [jettax, setJettax] = useState<File | null>(null);
  const [portal, setPortal] = useState<File | null>(null);
  const [dominio, setDominio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  const cols = getColumns(movement, docType);

  const canCompare = (jettax || portal) && dominio;

  const run = async () => {
    setError(null);
    setResult(null);
    if (!dominio) return;
    setLoading(true);
    try {
      const isExcelDom = /\.xlsx?$/i.test(dominio.name);
      const [jParsed, pParsed, dRecs] = await Promise.all([
        jettax ? parseExcel(jettax, movement, docType) : Promise.resolve({ records: [], clientName: undefined }),
        portal ? parseExcel(portal, movement, docType) : Promise.resolve({ records: [], clientName: undefined }),
        isExcelDom
          ? parseDominioExcel(dominio, movement, docType)
          : parseDominioPdf(dominio, movement, docType),
      ]);
      const res = compare(jParsed.records, pParsed.records, dRecs);
      setResult(res);
      const cliente = jParsed.clientName || pParsed.clientName || "Cliente";
      const id = crypto.randomUUID();
      await addHistorico({
        id,
        cliente,
        movement,
        docType,
        datetime: new Date().toISOString(),
        diffCount: res.diffCount,
        diffTotal: res.diffTotal,
        divergencesCount: res.missingInDominio.length + res.missingInClient.length,
        classifiedCount: 0,
        items: [
          ...res.missingInDominio.map((r) => ({ ...r, origem: "Domínio" as const })),
          ...res.missingInClient.map((r) => ({ ...r, origem: "Cliente" as const })),
        ],
        classifications: {},
      });
      setCurrentHistoricoId(id);
      setHistoricoVersion((v) => v + 1);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Erro ao processar arquivos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">
            Comparar — {movement === "entrada" ? "Entrada" : "Saída"} · {docType}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe as planilhas da empresa e o PDF do Domínio. Pelo menos uma planilha
            (Jettax ou Portal Nacional) é obrigatória.
          </p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
          Colunas Jettax — Nota: <span className="font-mono font-semibold">{cols.nota}</span> · Valor Contábil: <span className="font-mono font-semibold">{cols.valor}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <FileInput
          label="Relatório Cliente (Excel)"
          accept=".xlsx,.xls"
          file={jettax}
          onChange={setJettax}
          icon={<FileSpreadsheet className="h-5 w-5" />}
        />
        <label className="block rounded-lg border border-dashed bg-muted/30 p-5 opacity-60 cursor-not-allowed">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-muted-foreground"><FileSpreadsheet className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-medium text-sm">Relatório Portal Nacional (Excel)</div>
              <div className="mt-1 text-xs text-muted-foreground">Indisponível no momento</div>
            </div>
          </div>
        </label>
        <FileInput
          label="Relatório Domínio (Excel ou PDF)"
          accept=".xlsx,.xls,.pdf"
          file={dominio}
          onChange={setDominio}
          icon={<FileSpreadsheet className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={run} disabled={!canCompare || loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando…
            </>
          ) : (
            "Comparar"
          )}
        </Button>
        <Button variant="outline" onClick={onReset}>
          Nova consulta
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <Results
          result={result}
          historicoId={currentHistoricoId}
          movement={movement}
          onClassificationsChange={() => setHistoricoVersion((v) => v + 1)}
        />
      )}
    </section>
  );
}

function Results({
  result,
  historicoId,
  movement,
  onClassificationsChange,
}: {
  result: CompareResult;
  historicoId: string | null;
  movement: Movement;
  onClassificationsChange: () => void;
}) {
  const countOk = result.combinedClient.count === result.dominio.count;
  const totalOk = Math.abs(result.diffTotal) < 0.01;

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Jettax" count={result.jettax.count} total={result.jettax.total} />
        <SummaryCard title="Portal Nacional" count={result.portal.count} total={result.portal.total} />
        <SummaryCard title="Domínio" count={result.dominio.count} total={result.dominio.total} highlight />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold">Cliente combinado (Jettax + Portal, sem duplicidade)</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <div className="text-muted-foreground">Quantidade de notas</div>
            <div className="text-2xl font-semibold">{result.combinedClient.count}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Valor contábil total</div>
            <div className="text-2xl font-semibold">{fmtMoney(result.combinedClient.total)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Duplicidades removidas</div>
            <div className="text-2xl font-semibold">{result.combinedClient.duplicates}</div>
          </div>
        </div>
      </Card>


      <Card className="p-5">
        <h3 className="font-semibold">Notas ausentes (comparação por número)</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Notas presentes em uma origem e ausentes na outra, considerando apenas o número da nota.
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium mb-2">
              No Domínio, ausentes no Cliente{" "}
              <span className="text-muted-foreground">({result.missingInClient.length})</span>
            </div>
            <div className="max-h-64 overflow-auto rounded border bg-muted/30 p-2 text-sm font-mono">
              {result.missingInClient.length === 0 ? (
                <div className="text-muted-foreground p-2">Nenhuma.</div>
              ) : (
                result.missingInClient.map((r) => (
                  <div key={`d-${r.nota}`} className="px-1 py-0.5">
                    {r.nota}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">
              No Cliente, ausentes no Domínio{" "}
              <span className="text-muted-foreground">({result.missingInDominio.length})</span>
            </div>
            <div className="max-h-64 overflow-auto rounded border bg-muted/30 p-2 text-sm font-mono">
              {result.missingInDominio.length === 0 ? (
                <div className="text-muted-foreground p-2">Nenhuma.</div>
              ) : (
                result.missingInDominio.map((r) => (
                  <div key={`c-${r.nota}`} className="px-1 py-0.5">
                    {r.nota}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>


      <MissingPanel
        title="Notas com diferença"
        emptyLabel="Nenhuma divergência encontrada."
        historicoId={historicoId}
        onClassificationsChange={onClassificationsChange}
        movement={movement}
        items={[
          ...result.missingInDominio.map((r) => ({ ...r, origem: "Domínio" as const })),
          ...result.missingInClient.map((r) => ({ ...r, origem: "Cliente" as const })),
        ].sort((a, b) => a.nota.localeCompare(b.nota))}
      />
    </div>
  );
}

const CLASSIFICACOES = [
  "Emissão mês anterior",
  "Entrada mês seguinte",
  "Recusada",
  "Prefeitura Não Vinculada ao Portal",
  "MEI",
  "Notas de Entrada Própria",
] as const;

function MissingPanel({
  title,
  emptyLabel,
  items,
  historicoId,
  onClassificationsChange,
  movement,
}: {
  title: string;
  emptyLabel: string;
  items: { nota: string; fornecedor?: string; valor: number; origem: "Domínio" | "Cliente" }[];
  historicoId: string | null;
  onClassificationsChange: () => void;
  movement: Movement;
}) {
  const fornecedorLabel = movement === "saida" ? "Cliente" : "Fornecedor";
  const ROW_H = 36;
  const VISIBLE = 10;

  const [classificacoes, setClassificacoes] = useState<Record<string, string>>({});
  const [salvas, setSalvas] = useState<Record<string, string>>({});
  const [mostrarClassificadas, setMostrarClassificadas] = useState(false);
  const keyFor = (it: { nota: string; origem: string }, i: number) =>
    `${it.nota}-${it.origem}-${i}`;

  const allItems = items.map((it, i) => ({ it, i, k: keyFor(it, i) }));
  const visibleItems = mostrarClassificadas
    ? allItems
    : allItems.filter(({ k }) => !salvas[k]);
  const total = visibleItems.reduce((s, { it }) => s + it.valor, 0);
  const classifiedCount = Object.keys(salvas).length;

  const persist = (nextSalvas: Record<string, string>) => {
    if (historicoId) {
      void updateHistoricoClassifications(historicoId, nextSalvas);
      onClassificationsChange();
    }
  };

  const salvar = () => {
    const next = { ...salvas };
    for (const [k, v] of Object.entries(classificacoes)) {
      if (v) next[k] = v;
    }
    setSalvas(next);
    setClassificacoes({});
    persist(next);
  };

  const alterarClassificada = (k: string, value: string) => {
    const next = { ...salvas };
    if (value) next[k] = value;
    else delete next[k];
    setSalvas(next);
    persist(next);
  };

  const pendentesParaSalvar = Object.values(classificacoes).filter(Boolean).length;

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = items.map((it, i) => {
      const k = keyFor(it, i);
      return {
        Nota: it.nota,
        [fornecedorLabel]: it.fornecedor || "",
        "Valor Contábil": it.valor,
        "Diferença no": it.origem,
        Classificação: salvas[k] || classificacoes[k] || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [
            {
              Nota: "",
              [fornecedorLabel]: "",
              "Valor Contábil": "",
              "Diferença no": "",
              Classificação: "Nenhuma divergência encontrada",
            },
          ],
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");
    const safe = title.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    XLSX.writeFile(wb, `${safe}.xlsx`);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {visibleItems.length} {visibleItems.length === 1 ? "nota" : "notas"} · {fmtMoney(total)}
            {classifiedCount > 0 && !mostrarClassificadas && (
              <span className="ml-1">({classifiedCount} classificadas)</span>
            )}
          </div>
          {classifiedCount > 0 && (
            <Button
              size="sm"
              onClick={() => setMostrarClassificadas((v) => !v)}
              className="bg-yellow-400 text-yellow-950 hover:bg-yellow-400/90 border border-yellow-500"
            >
              {mostrarClassificadas
                ? `Ocultar Classificadas (${classifiedCount})`
                : `Mostrar Classificadas (${classifiedCount})`}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportXlsx}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Exportar XLSX
          </Button>

        </div>
      </div>
      {visibleItems.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {items.length === 0 ? emptyLabel : "Todas as notas foram classificadas."}
        </p>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1.5fr] gap-0 text-xs uppercase tracking-wide text-muted-foreground border-b">
            <div className="py-2 pr-4 font-medium">Nota</div>
            <div className="py-2 pr-4 font-medium">{fornecedorLabel}</div>
            <div className="py-2 pr-2 font-medium text-right">Valor Contábil</div>
            <div className="py-2 px-4 font-medium">Diferença no</div>
            <div className="py-2 pl-4 font-medium">Classificação</div>
          </div>
          <div
            className="overflow-y-auto"
            style={{ maxHeight: visibleItems.length > VISIBLE ? ROW_H * VISIBLE : undefined }}
          >
            <div className="text-sm">
              {visibleItems.map(({ it, k }) => {
                const isSalva = !!salvas[k];
                return (
                  <div
                    key={k}
                    className={`grid grid-cols-[1fr_2fr_1fr_1fr_1.5fr] gap-0 border-b last:border-0 items-center ${
                      isSalva ? "bg-muted/40" : ""
                    }`}
                  >
                    <div className="py-2 pr-4 font-mono">{it.nota}</div>
                    <div className="py-2 pr-4">
                      {it.fornecedor || <span className="text-muted-foreground">—</span>}
                    </div>
                    <div className="py-2 pr-2 text-right font-medium">{fmtMoney(it.valor)}</div>
                    <div className="py-2 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          it.origem === "Domínio"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent/20 text-accent-foreground"
                        }`}
                      >
                        {it.origem}
                      </span>
                    </div>
                    <div className="py-1 pl-4">
                      <select
                        value={isSalva ? salvas[k] : classificacoes[k] || ""}
                        onChange={(e) => {
                          if (isSalva) {
                            alterarClassificada(k, e.target.value);
                          } else {
                            setClassificacoes((prev) => ({ ...prev, [k]: e.target.value }));
                          }
                        }}
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="">—</option>
                        {CLASSIFICACOES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={salvar}
              disabled={pendentesParaSalvar === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Salvar Classificação
              {pendentesParaSalvar > 0 && ` (${pendentesParaSalvar})`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function HistoricoPanel({ version, onChange }: { version: number; onChange: () => void }) {
  const [entries, setEntries] = useState<HistoricoEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchHistorico().then((list) => {
      if (alive) setEntries(list);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  const baixar = async (entry: HistoricoEntry) => {
    const XLSX = await import("xlsx");
    const rows = entry.items.map((it, i) => {
      const k = `${it.nota}-${it.origem}-${i}`;
      return {
        Nota: it.nota,
        Fornecedor: it.fornecedor || "",
        "Valor Contábil": it.valor,
        "Diferença no": it.origem,
        Classificação: entry.classifications[k] || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");
    const safeCli = entry.cliente.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 40);
    const dt = entry.datetime.replace(/[:.]/g, "-").slice(0, 19);
    XLSX.writeFile(wb, `notas_diferenca_${safeCli}_${dt}.xlsx`);
  };

  const remover = (id: string) => {
    void removeHistorico(id);
    onChange();
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Histórico de comparações</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma comparação realizada ainda.
        </p>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rounded-md border bg-card p-3 text-xs space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm leading-tight truncate" title={e.cliente}>
                  {e.cliente}
                </div>
                <button
                  onClick={() => remover(e.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {e.movement === "entrada" ? "Entrada" : "Saída"} · {e.docType} · {fmtDate(e.datetime)}
              </div>
              <div className="grid grid-cols-2 gap-1 pt-1">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Divergentes</div>
                  <div className="font-semibold">{e.divergencesCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Classificadas</div>
                  <div className="font-semibold">{e.classifiedCount}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Dif. Valor Contábil</div>
                  <div className={`font-semibold ${Math.abs(e.diffTotal) < 0.01 ? "" : "text-destructive"}`}>
                    {fmtMoney(e.diffTotal)}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => baixar(e)}
                disabled={e.items.length === 0}
              >
                <Download className="mr-1 h-3 w-3" /> Baixar relatório
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SummaryCard({
  title,
  count,
  total,
  highlight,
}: {
  title: string;
  count: number;
  total: number;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-5 ${highlight ? "border-accent" : ""}`}>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{count} <span className="text-sm font-normal text-muted-foreground">notas</span></div>
      <div className="mt-1 text-sm">{fmtMoney(total)}</div>
    </Card>
  );
}

function ResultRow({
  ok,
  label,
  client,
  dominio,
  diff,
}: {
  ok: boolean;
  label: string;
  client: string;
  dominio: string;
  diff: string;
}) {
  return (
    <div className={`rounded-md border p-4 ${ok ? "border-accent/60 bg-accent/10" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        )}
        <div className="font-medium">{label}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Cliente</div>
          <div className="font-semibold">{client}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Domínio</div>
          <div className="font-semibold">{dominio}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Diferença</div>
          <div className={`font-semibold ${ok ? "" : "text-destructive"}`}>{diff}</div>
        </div>
      </div>
    </div>
  );
}
