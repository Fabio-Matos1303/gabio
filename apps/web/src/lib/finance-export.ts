import { z } from "zod";

const exportRowSchema = z
  .object({
    date: z.string().date(),
    description: z.string().max(500),
    account: z.string().max(120),
    category: z.string().max(120).nullable(),
    direction: z.enum(["income", "expense"]),
    amountMinor: z.union([z.bigint(), z.number().int().safe()]),
    currencyCode: z.literal("BRL"),
    visibility: z.enum(["household", "private"]),
    status: z.enum(["posted", "reversed"]),
  })
  .strict();

const financeExportDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    currencyUnit: z.literal("minor"),
    exportedAt: z.string().datetime({ offset: true }),
    data: z.array(
      exportRowSchema.omit({ amountMinor: true }).extend({
        amountMinor: z.string().regex(/^\d+$/),
      }),
    ),
  })
  .strict();

export type FinanceExportRow = z.infer<typeof exportRowSchema>;

function validatedRows(rows: FinanceExportRow[]) {
  return z.array(exportRowSchema).parse(rows);
}

function amountString(amount: bigint | number) {
  return typeof amount === "bigint" ? amount.toString() : String(amount);
}

function protectSpreadsheetCell(value: string) {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string) {
  return `"${protectSpreadsheetCell(value).replaceAll('"', '""')}"`;
}

export function financeExportJson(rows: FinanceExportRow[]) {
  const data = validatedRows(rows).map((row) => ({
    ...row,
    amountMinor: amountString(row.amountMinor),
  }));
  return JSON.stringify(
    {
      schemaVersion: 1,
      currencyUnit: "minor",
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
}

export function parseFinanceExportJson(input: string): FinanceExportRow[] {
  const document = financeExportDocumentSchema.parse(JSON.parse(input));
  return document.data.map((row) => ({
    ...row,
    amountMinor: BigInt(row.amountMinor),
  }));
}

export function financeExportCsv(rows: FinanceExportRow[]) {
  const header = [
    "data",
    "descrição",
    "conta",
    "categoria",
    "tipo",
    "valor_centavos",
    "moeda",
    "visibilidade",
    "status",
  ];
  const lines = validatedRows(rows).map((row) =>
    [
      row.date,
      row.description,
      row.account,
      row.category ?? "",
      row.direction,
      amountString(row.amountMinor),
      row.currencyCode,
      row.visibility,
      row.status,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function downloadFinanceExport(
  format: "json" | "csv",
  rows: FinanceExportRow[],
) {
  const content =
    format === "json" ? financeExportJson(rows) : financeExportCsv(rows);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gabio-financas.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
