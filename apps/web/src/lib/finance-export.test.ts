import { describe, expect, it } from "vitest";

import {
  financeExportCsv,
  financeExportJson,
  parseFinanceExportJson,
} from "./finance-export.js";

const row = {
  date: "2026-09-24",
  description: "Compra de teste",
  account: "Conta compartilhada",
  category: "Casa",
  direction: "expense" as const,
  amountMinor: 12345n,
  currencyCode: "BRL" as const,
  visibility: "household" as const,
  status: "posted" as const,
};

describe("finance export", () => {
  it("serializes bigint amounts without precision loss in JSON", () => {
    const parsed = JSON.parse(
      financeExportJson([{ ...row, amountMinor: 9007199254740993n }]),
    );
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      currencyUnit: "minor",
      data: [{ amountMinor: "9007199254740993" }],
    });
  });

  it("validates a JSON export for an isolated restore without precision loss", () => {
    const exported = financeExportJson([
      { ...row, amountMinor: 9007199254740993n },
    ]);
    expect(parseFinanceExportJson(exported)).toEqual([
      { ...row, amountMinor: 9007199254740993n },
    ]);
  });

  it("rejects incompatible restore documents", () => {
    expect(() =>
      parseFinanceExportJson(
        JSON.stringify({ schemaVersion: 2, currencyUnit: "minor", data: [] }),
      ),
    ).toThrow();
  });

  it("neutralizes spreadsheet formulas in CSV", () => {
    const csv = financeExportCsv([
      { ...row, description: '=HYPERLINK("https://example.test")' },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).not.toContain(',"=HYPERLINK');
  });
});
