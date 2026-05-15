import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type Movement = "entrada" | "saida";
export type DocType = "NFE" | "CTE" | "NFSe" | "NFCe";

// Column letters per spec for Jettax (and assumed same for Portal Nacional)
const COLS: Record<string, { nota: string; valor: string; fornecedor?: string }> = {
  "entrada-NFE": { nota: "D", valor: "T", fornecedor: "I" },
  "entrada-CTE": { nota: "C", valor: "BI", fornecedor: "M" },
  "entrada-NFSe": { nota: "A", valor: "L", fornecedor: "F" },
  "saida-NFE": { nota: "D", valor: "T", fornecedor: "N" },
  "saida-NFCe": { nota: "D", valor: "T" },
  "saida-NFSe": { nota: "A", valor: "L", fornecedor: "AA" },
};

export function getColumns(mov: Movement, doc: DocType) {
  return COLS[`${mov}-${doc}`];
}

function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function normalizeNota(v: any): string {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  // remove non-alphanumeric to handle formatting differences
  s = s.replace(/\D+/g, "");
  // strip leading zeros
  s = s.replace(/^0+/, "");
  return s;
}

function parseNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  s = s.replace(/[R$\s]/g, "");
  // Brazilian: 1.234,56 -> 1234.56
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export type ParsedRecord = { nota: string; valor: number; fornecedor?: string };

export async function parseExcel(
  file: File,
  mov: Movement,
  doc: DocType,
): Promise<ParsedRecord[]> {
  const cols = getColumns(mov, doc);
  if (!cols) return [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const records: ParsedRecord[] = [];
  const notaIdx = colLetterToIndex(cols.nota);
  const valorIdx = colLetterToIndex(cols.valor);
  const fornIdx = cols.fornecedor ? colLetterToIndex(cols.fornecedor) : -1;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    for (const row of rows) {
      if (!row) continue;
      const notaRaw = row[notaIdx];
      const valorRaw = row[valorIdx];
      const nota = normalizeNota(notaRaw);
      if (!nota || nota.length < 1) continue;
      const valor = parseNumber(valorRaw);
      const fornecedor =
        fornIdx >= 0 && row[fornIdx] != null ? String(row[fornIdx]).trim() : undefined;
      records.push({ nota, valor, fornecedor });
    }
  }
  return records;
}

export type DominioRecord = ParsedRecord;

const ESPECIE_FILTER: Record<string, string[]> = {
  "entrada-NFE": ["36"],
  "entrada-CTE": ["38"],
  "entrada-NFSe": ["39", "67"],
  "saida-NFE": ["36"],
  "saida-NFCe": ["65"],
  "saida-NFSe": ["39"],
};

export function getEspecieCodes(mov: Movement, doc: DocType): string[] {
  return ESPECIE_FILTER[`${mov}-${doc}`] ?? [];
}

export async function parseDominioPdf(
  file: File,
  mov: Movement,
  doc: DocType,
): Promise<DominioRecord[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;

  const allowedEspecies = new Set(getEspecieCodes(mov, doc));
  const records: DominioRecord[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items as any[];

    // Group items by row using y coordinate (rounded)
    const rowsMap = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const str = (it.str ?? "").toString();
      if (!str.trim()) continue;
      // bucket within 2px
      let key = y;
      for (const k of rowsMap.keys()) {
        if (Math.abs(k - y) <= 2) {
          key = k;
          break;
        }
      }
      if (!rowsMap.has(key)) rowsMap.set(key, []);
      rowsMap.get(key)!.push({ x, str });
    }

    const sortedRows = [...rowsMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x));

    // Find header row containing "Nota" and "Valor Contábil"
    let notaX: number | null = null;
    let notaNextX: number | null = null;
    let valorX: number | null = null;
    let nextValorX: number | null = null;
    let especieX: number | null = null;
    let especieNextX: number | null = null;
    let fornecedorX: number | null = null;
    let fornecedorNextX: number | null = null;

    for (const row of sortedRows) {
      const joined = row.map((r) => r.str).join(" ").toLowerCase();
      if (joined.includes("nota") && joined.includes("contábil")) {
        for (let i = 0; i < row.length; i++) {
          const s = row[i].str.toLowerCase().trim();
          if (s === "nota" || s.startsWith("nota")) {
            notaX = row[i].x;
            if (i + 1 < row.length) notaNextX = row[i + 1].x;
          }
          if (s.includes("contábil") || s.includes("contabil")) {
            valorX = row[i].x;
            if (i + 1 < row.length) nextValorX = row[i + 1].x;
          }
          if (s.includes("espécie") || s.includes("especie")) {
            especieX = row[i].x;
            if (i + 1 < row.length) especieNextX = row[i + 1].x;
          }
          if (s.includes("fornecedor") || s.includes("participante")) {
            fornecedorX = row[i].x;
            if (i + 1 < row.length) fornecedorNextX = row[i + 1].x;
          }
        }
        if (notaX !== null && valorX !== null) {
          const headerIdx = sortedRows.indexOf(row);
          for (let r = headerIdx + 1; r < sortedRows.length; r++) {
            const dataRow = sortedRows[r];
            // Collect all items inside the Nota column (between notaX and next column header x)
            const notaItems = dataRow.filter((it) => {
              if (notaNextX !== null) {
                return it.x >= notaX! - 10 && it.x < notaNextX - 5;
              }
              return Math.abs(it.x - notaX!) < 40;
            });
            const notaItem = notaItems.length
              ? { x: notaItems[0].x, str: notaItems.map((v) => v.str).join("") }
              : null;
            const valorItems = dataRow.filter((it) => {
              if (nextValorX !== null) {
                return it.x >= valorX! - 10 && it.x < nextValorX - 5;
              }
              return Math.abs(it.x - valorX!) < 60;
            });

            if (!notaItem) continue;
            let notaStr = normalizeNota(notaItem.str);
            if (!notaStr) continue;
            // Remove o último dígito (pertence à coluna Série, não Nota)
            if (notaStr.length > 1) notaStr = notaStr.slice(0, -1);

            // Filter by Espécie when column is found
            if (especieX !== null && allowedEspecies.size > 0) {
              const especieItems = dataRow.filter((it) => {
                if (especieNextX !== null) {
                  return it.x >= especieX! - 10 && it.x < especieNextX - 5;
                }
                return Math.abs(it.x - especieX!) < 40;
              });
              const especieStr = especieItems
                .map((v) => v.str)
                .join("")
                .replace(/\D+/g, "");
              if (!allowedEspecies.has(especieStr)) continue;
            }

            let fornecedor: string | undefined;
            if (fornecedorX !== null) {
              const fornItems = dataRow.filter((it) => {
                if (fornecedorNextX !== null) {
                  return it.x >= fornecedorX! - 10 && it.x < fornecedorNextX - 5;
                }
                return it.x >= fornecedorX! - 10 && it.x < fornecedorX! + 200;
              });
              fornecedor = fornItems
                .map((v) => v.str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              if (!fornecedor) fornecedor = undefined;
            }

            const valorStr = valorItems.map((v) => v.str).join("");
            const valor = parseNumber(valorStr);
            records.push({ nota: notaStr, valor, fornecedor });
          }
          break;
        }
      }
    }
  }

  return records;
}

export type MissingRecord = { nota: string; fornecedor?: string; valor: number };

export type CompareResult = {
  jettax: { count: number; total: number };
  portal: { count: number; total: number };
  combinedClient: { count: number; total: number; duplicates: number };
  dominio: { count: number; total: number };
  diffCount: number;
  diffTotal: number;
  missingInDominio: MissingRecord[]; // no cliente, ausentes no Domínio
  missingInClient: MissingRecord[]; // no Domínio, ausentes no cliente
};

export function compare(
  jettax: ParsedRecord[],
  portal: ParsedRecord[],
  dominio: DominioRecord[],
): CompareResult {
  const sumValid = (arr: ParsedRecord[]) => {
    const map = new Map<string, number>();
    for (const r of arr) {
      if (!map.has(r.nota)) map.set(r.nota, r.valor);
    }
    let total = 0;
    map.forEach((v) => (total += v));
    return { count: map.size, total };
  };

  const jStat = sumValid(jettax);
  const pStat = sumValid(portal);

  // Combine deduplicating across both files (preservar fornecedor)
  const combined = new Map<string, MissingRecord>();
  let duplicates = 0;
  for (const r of jettax) {
    if (!combined.has(r.nota))
      combined.set(r.nota, { nota: r.nota, valor: r.valor, fornecedor: r.fornecedor });
  }
  for (const r of portal) {
    if (combined.has(r.nota)) {
      duplicates++;
    } else {
      combined.set(r.nota, { nota: r.nota, valor: r.valor, fornecedor: r.fornecedor });
    }
  }
  let combinedTotal = 0;
  combined.forEach((v) => (combinedTotal += v.valor));

  const dMap = new Map<string, MissingRecord>();
  for (const r of dominio) {
    if (!dMap.has(r.nota))
      dMap.set(r.nota, { nota: r.nota, valor: r.valor, fornecedor: r.fornecedor });
  }
  let dTotal = 0;
  for (const r of dominio) dTotal += r.valor;

  const missingInDominio: MissingRecord[] = [];
  combined.forEach((rec, nota) => {
    if (!dMap.has(nota)) missingInDominio.push(rec);
  });
  const missingInClient: MissingRecord[] = [];
  dMap.forEach((rec, nota) => {
    if (!combined.has(nota)) missingInClient.push(rec);
  });

  const byNota = (a: MissingRecord, b: MissingRecord) => a.nota.localeCompare(b.nota);
  missingInDominio.sort(byNota);
  missingInClient.sort(byNota);

  return {
    jettax: jStat,
    portal: pStat,
    combinedClient: {
      count: combined.size,
      total: combinedTotal,
      duplicates,
    },
    dominio: { count: dMap.size, total: dTotal },
    diffCount: combined.size - dMap.size,
    diffTotal: combinedTotal - dTotal,
    missingInDominio,
    missingInClient,
  };
}

export const fmtMoney = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
