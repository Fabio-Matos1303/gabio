// Run against the synthetic preview only. Install Playwright outside the repo or
// set GABIO_PLAYWRIGHT_MODULE to an existing module directory.
/* global document, innerWidth, innerHeight, getComputedStyle, axe */
const { chromium } = require(
  process.env.GABIO_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { URL } = require("node:url");
const previewUrl = new URL(
  process.env.GABIO_QA_URL || "http://localhost:5182/#tarefas",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(previewUrl.hostname),
  "QA must use a local synthetic preview",
);

function contrast(a, b) {
  const luminance = (rgb) =>
    rgb
      .map((c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (total, channel, index) =>
          total + channel * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

(async () => {
  const output = path.resolve("test-results/task-card-content");
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const report = { viewports: [], errors: [] };
  try {
    for (const [width, height] of [
      [360, 800],
      [768, 1024],
      [1366, 768],
      [1920, 1080],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(error.message));
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return ["localhost", "127.0.0.1"].includes(host)
          ? route.continue()
          : route.abort();
      });
      await page.goto(previewUrl.toString());
      await page
        .getByRole("button", {
          name: "Abrir cartão: Organizar a lista de compras da semana",
        })
        .click();
      const dialog = page.getByRole("dialog", { name: "Editar tarefa" });
      await dialog.getByText("1 de 3 concluídos", { exact: true }).waitFor();
      let accessibility = null;
      if (process.env.GABIO_AXE_MODULE) {
        const axeModule = require(process.env.GABIO_AXE_MODULE);
        await page.addScriptTag({ content: axeModule.source });
        accessibility = await page.evaluate(async () => {
          const result = await axe.run(document.querySelector("dialog[open]"), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          });
          return {
            violations: result.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
            incomplete: result.incomplete.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
          };
        });
        assert.deepEqual(accessibility.violations, []);
      }
      const geometry = await page.evaluate(() => {
        const d = document.querySelector("dialog[open]");
        const scroll = document.querySelector(".task-details-scroll");
        const rect = d.getBoundingClientRect();
        return {
          viewport: [innerWidth, innerHeight],
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          dialogOverflow: scroll.scrollWidth > scroll.clientWidth,
          bounds: {
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
          },
          columns: getComputedStyle(
            document.querySelector(".task-details-layout"),
          ).gridTemplateColumns,
          background: getComputedStyle(document.body).backgroundColor,
        };
      });
      assert.equal(geometry.pageOverflow, false);
      assert.equal(geometry.dialogOverflow, false);
      assert.ok(
        geometry.bounds.x >= 0 &&
          geometry.bounds.right <= width + 1 &&
          geometry.bounds.bottom <= height + 1,
      );
      await page.screenshot({
        path: path.join(output, `${width}x${height}.png`),
      });
      const contrastSamples = [];
      if (process.env.GABIO_PNG_MODULE) {
        const { PNG } = require(process.env.GABIO_PNG_MODULE);
        for (const selector of [
          ".card-detail-header > p",
          ".card-detail-title",
          ".card-notes",
          ".card-property span",
          ".card-property strong",
          ".card-content h3",
          ".card-content h4",
          ".card-section-heading button",
        ]) {
          const element = dialog.locator(selector).first();
          if (!(await element.count())) continue;
          const foreground = await element.evaluate((el) =>
            getComputedStyle(el)
              .color.match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number),
          );
          const png = PNG.sync.read(await element.screenshot());
          const pixels = [];
          for (let i = 0; i < png.data.length; i += 4) {
            pixels.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
          }
          // Glyphs occupy a minority of the crop. A median pixel avoids
          // mistaking a solid glyph for the mode of a subtly varying glass.
          pixels.sort(
            (a, b) =>
              a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0),
          );
          const background = pixels[Math.floor(pixels.length / 2)];
          const ratio = contrast(foreground, background);
          assert.ok(ratio >= 4.5, `${selector}: sampled contrast ${ratio}`);
          contrastSamples.push({
            selector,
            foreground,
            background,
            ratio: Number(ratio.toFixed(2)),
          });
        }
      }
      const editorChecks = [];
      for (const [index, title] of [
        "Agendamento",
        "Agendamento",
        "Editar responsável",
        "Editar tags",
        "Visibilidade do cartão",
      ].entries()) {
        const trigger = dialog.locator(".card-properties > button").nth(index);
        const before = await dialog.locator(".card-properties").boundingBox();
        await trigger.click();
        const editor = page.getByRole("dialog", { name: title, exact: true });
        await editor.waitFor();
        assert.equal(await dialog.locator("form").count(), 0);
        assert.equal(
          await editor.evaluate((el) =>
            document.querySelector(".task-details-dialog").contains(el),
          ),
          false,
        );
        const bounds = await editor.boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= height + 1,
        );
        const overflow = await editor
          .locator(".task-editor-content")
          .evaluate((s) => s.scrollWidth > s.clientWidth);
        assert.equal(overflow, false);
        const footer = editor.locator(".card-editor-actions");
        const cancel = footer.getByRole("button", {
          name: "Cancelar",
          exact: true,
        });
        const save = footer.getByRole("button", {
          name: "Salvar",
          exact: true,
        });
        await save.scrollIntoViewIfNeeded();
        const cancelBounds = await cancel.boundingBox();
        const saveBounds = await save.boundingBox();
        assert.ok(Math.abs(cancelBounds.y - saveBounds.y) < 1);
        assert.ok(saveBounds.x >= cancelBounds.x + cancelBounds.width);
        const footerStyle = await footer.evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          justify: getComputedStyle(el).justifyContent,
        }));
        assert.equal(footerStyle.background, "rgba(0, 0, 0, 0)");
        assert.equal(footerStyle.justify, "flex-end");
        if (index === 3) {
          const legend = await editor
            .locator(".task-tag-fields > legend")
            .boundingBox();
          const selected = await editor.locator(".tag-selected").boundingBox();
          assert.ok(selected.y - (legend.y + legend.height) >= 12);
        }
        const after = await dialog.locator(".card-properties").boundingBox();
        assert.equal(after.height, before.height);
        await page.screenshot({
          path: path.join(output, `${width}x${height}-editor-${index}.png`),
        });
        if (process.env.GABIO_AXE_MODULE) {
          const violations = await page.evaluate(async () =>
            (
              await axe.run(
                document.querySelector(".task-editor-dialog[open]"),
                {
                  runOnly: {
                    type: "tag",
                    values: ["wcag2a", "wcag2aa", "wcag21aa"],
                  },
                },
              )
            ).violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          );
          assert.deepEqual(violations, []);
        }
        await editor
          .getByRole("button", {
            name: "Fechar " + title.toLocaleLowerCase("pt-BR"),
            exact: true,
          })
          .focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await editor.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
        await page.keyboard.press("Escape");
        await editor.waitFor({ state: "hidden" });
        await page.waitForFunction(
          (idx) =>
            document.activeElement ===
            document.querySelectorAll(".card-properties > button")[idx],
          index,
        );
        assert.equal(await dialog.isVisible(), true);
        editorChecks.push({ title, bounds, overflow });
      }
      await dialog.getByRole("button", { name: "Editar observações" }).click();
      const notesEditor = page.getByRole("dialog", {
        name: "Editar observações",
        exact: true,
      });
      await notesEditor
        .getByRole("textbox", { name: "Observações" })
        .fill("Orientação sintética revisada\nConferir todos os materiais.");
      await notesEditor.getByRole("button", { name: "Salvar" }).click();
      await notesEditor.waitFor({ state: "hidden" });
      await dialog
        .getByText("Orientação sintética revisada", { exact: false })
        .waitFor();
      assert.equal(await dialog.isVisible(), true);
      await dialog
        .getByRole("checkbox", { name: "Separar itens de limpeza" })
        .click();
      await dialog.getByText("2 de 3 concluídos", { exact: true }).waitFor();
      await dialog.getByRole("button", { name: "Adicionar checklist" }).click();
      const checklistEditor = page.getByRole("dialog", {
        name: "Nova checklist",
        exact: true,
      });
      await checklistEditor
        .getByRole("textbox", { name: "Nome da checklist" })
        .fill("Conferência sintética");
      await checklistEditor
        .getByRole("button", { name: "Adicionar item", exact: true })
        .click();
      await checklistEditor
        .getByRole("textbox", { name: "Item 1", exact: true })
        .fill("Verificar medidas");
      await checklistEditor
        .getByRole("button", { name: "Adicionar item", exact: true })
        .click();
      await checklistEditor
        .getByRole("textbox", { name: "Item 2", exact: true })
        .fill("Conferir quantidade");
      await checklistEditor
        .getByRole("button", { name: "Mover item 2 para cima" })
        .click();
      await checklistEditor.getByRole("button", { name: "Salvar" }).click();
      await checklistEditor.waitFor({ state: "hidden" });
      await dialog
        .getByRole("heading", { name: "Conferência sintética" })
        .waitFor();
      const added = dialog.getByRole("region", {
        name: "Conferência sintética",
        exact: true,
      });
      assert.equal(
        await added.getByRole("checkbox").first().getAttribute("type"),
        "checkbox",
      );
      assert.match(
        await added.locator("label").first().innerText(),
        /Conferir quantidade/,
      );
      await dialog.getByRole("button", { name: "Editar título" }).click();
      const titleEditor = page.getByRole("dialog", {
        name: "Editar título",
        exact: true,
      });
      await titleEditor
        .getByRole("textbox", { name: "Título", exact: true })
        .fill("Cartão sintético revisado");
      await titleEditor.getByRole("button", { name: "Salvar" }).click();
      await titleEditor.waitFor({ state: "hidden" });
      await dialog
        .getByRole("button", { name: "Editar título" })
        .filter({ hasText: "Cartão sintético revisado" })
        .waitFor();
      await dialog
        .getByRole("button", { name: "Fechar editar tarefa" })
        .click();
      const card = page
        .locator(".task-card")
        .filter({ hasText: "Cartão sintético revisado" });
      await card.getByText("Checklist: 2 de 5", { exact: true }).waitFor();
      let completionAsked = false;
      page.once("dialog", async (confirmation) => {
        completionAsked = /3 item/.test(confirmation.message());
        await confirmation.dismiss();
      });
      await card.getByRole("button", { name: "Concluir", exact: true }).click();
      await page.waitForTimeout(100);
      assert.equal(completionAsked, true);
      await card
        .getByRole("button", {
          name: "Abrir cartão: Cartão sintético revisado",
        })
        .click();
      await dialog
        .getByRole("heading", { name: "Conferência sintética" })
        .waitFor();
      await dialog
        .getByRole("button", { name: "Fechar editar tarefa" })
        .focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
        true,
      );
      await page.addStyleTag({
        content:
          ".glass-surface { backdrop-filter: none !important; background: #faf8f2 !important; }",
      });
      let fallbackAccessibility = null;
      if (process.env.GABIO_AXE_MODULE) {
        fallbackAccessibility = await page.evaluate(async () => {
          const result = await axe.run(document.querySelector("dialog[open]"), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          });
          return {
            violations: result.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
            })),
            incomplete: result.incomplete.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
          };
        });
        assert.deepEqual(fallbackAccessibility.violations, []);
      }
      await page.screenshot({
        path: path.join(output, `${width}x${height}-fallback.png`),
      });
      if (width === 360) {
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
        const overflow = await dialog
          .locator(".task-details-scroll")
          .evaluate((s) => s.scrollWidth > s.clientWidth);
        assert.equal(overflow, false);
        await page.screenshot({ path: path.join(output, "360-text-200.png") });
      }
      report.viewports.push({
        ...geometry,
        editorChecks,
        accessibility,
        fallbackAccessibility,
        contrastSamples,
        flows:
          "notes, checkbox, checklist, order, title, summary, completion guard, keyboard, fallback",
      });
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    await fs.writeFile(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
