// Synthetic preview only. Simulates VisualViewport keyboard resize while keeping
// the layout viewport unchanged; this is not a physical Android/iPad keyboard test.
/* global document, window, innerWidth, innerHeight, requestAnimationFrame, URL, Event, EventTarget */
const { chromium } = require(
  process.env.GABIO_PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  const previewUrl = process.env.GABIO_PREVIEW_URL || "http://localhost:5182";
  await fs.mkdir("test-results/keyboard-viewport", { recursive: true });
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
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) =>
        ["localhost", "127.0.0.1"].includes(
          new URL(route.request().url()).hostname,
        )
          ? route.continue()
          : route.abort(),
      );
      await page.addInitScript(() => {
        const viewport = Object.assign(new EventTarget(), {
          height: innerHeight,
          offsetTop: 0,
          scale: 1,
        });
        Object.defineProperty(window, "visualViewport", { value: viewport });
        window.keyboardViewport = viewport;
      });
      await page.goto(`${previewUrl}/#tarefas`);
      const settle = () =>
        page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
      const resize = async (available, top = 0) => {
        await page.evaluate(
          ({ available, top }) => {
            Object.assign(window.keyboardViewport, {
              height: available,
              offsetTop: top,
            });
            window.keyboardViewport.dispatchEvent(new Event("resize"));
            window.keyboardViewport.dispatchEvent(new Event("scroll"));
          },
          { available, top },
        );
        await settle();
      };
      const assertVisible = async (field) => {
        await field.focus();
        await settle();
        const geometry = await field.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const dialog = element.closest("dialog");
          const d = dialog?.getBoundingClientRect();
          const header = dialog
            ?.querySelector(".task-dialog-heading")
            ?.getBoundingClientRect();
          const footer = dialog
            ?.querySelector(".task-dialog-actions")
            ?.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            start: Math.max(
              window.keyboardViewport.offsetTop,
              header?.bottom ?? 0,
            ),
            end: Math.min(
              window.keyboardViewport.offsetTop +
                window.keyboardViewport.height,
              footer?.top ?? Infinity,
            ),
            dialogTop: d?.top,
            dialogBottom: d?.bottom,
            overflow: document.documentElement.scrollWidth > innerWidth,
            focused: document.activeElement === element,
          };
        });
        assert.ok(
          geometry.top >= geometry.start - 1 &&
            geometry.bottom <= geometry.end + 1,
          JSON.stringify(geometry),
        );
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.focused, true);
        return geometry;
      };
      await page
        .getByRole("button", { name: "Adicionar tarefa", exact: true })
        .click();
      const create = page.getByRole("dialog", { name: "Nova tarefa" });
      await assertVisible(create.locator('input[name="title"]'));
      const available = height - (width === 768 ? 420 : 340);
      await resize(available);
      const creation = await assertVisible(
        create.locator('input[name="title"]'),
      );
      await create
        .getByText("Prazo, responsável e outras opções", { exact: true })
        .click();
      const fields = create.locator(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
      );
      let count = 0;
      for (const field of await fields.all()) {
        if ((await field.isVisible()) && (await field.isEnabled())) {
          await assertVisible(field);
          count++;
        }
      }
      await resize(available - 40, 40);
      await assertVisible(create.locator('input[name="title"]'));
      await resize(height);
      await assertVisible(create.locator('input[name="title"]'));
      await create
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Abrir cartão: Organizar a lista de compras da semana",
        })
        .click();
      const details = page.getByRole("dialog", { name: "Editar tarefa" });
      await details
        .getByRole("button", { name: "Editar título", exact: true })
        .click();
      await resize(available);
      await assertVisible(
        page
          .getByRole("dialog", { name: "Editar título", exact: true })
          .locator('input[name="title"]'),
      );
      await page.screenshot({
        path: `test-results/keyboard-viewport/${width}-title.png`,
      });
      // Reload the synthetic state to discard the unsaved title editor.
      await page.reload();
      await page
        .getByRole("button", {
          name: "Abrir cartão: Organizar a lista de compras da semana",
        })
        .click();
      await details
        .getByRole("region", { name: "Observações", exact: true })
        .getByRole("button")
        .click();
      const notes = page
        .getByRole("dialog", { name: "Editar observações", exact: true })
        .getByRole("textbox", {
          name: "Observações",
          exact: true,
        });
      await notes.fill("Linha de exemplo\n".repeat(60));
      await notes.evaluate((element) => {
        element.style.height = "600px";
        element.setSelectionRange(element.value.length, element.value.length);
      });
      await resize(available);
      const observations = await assertVisible(notes);
      await notes.press("Control+End");
      await notes.press("x");
      await settle();
      assert.ok(await notes.evaluate((element) => element.scrollTop > 0));
      await page.screenshot({
        path: `test-results/keyboard-viewport/${width}-notes.png`,
      });
      await resize(height);
      await assertVisible(notes);
      await page.reload();
      await page
        .getByRole("button", { name: "Buscar tarefas e eventos", exact: true })
        .click();
      const search = page.getByRole("dialog", {
        name: "Buscar tarefas e eventos",
      });
      await resize(available);
      await assertVisible(search.locator('input[name="search"]'));
      await search.getByRole("button", { name: "Mostrar resultados" }).click();
      await resize(height);
      await page
        .getByRole("button", { name: "Mais ações", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Gerenciar tags", exact: true })
        .click();
      const tags = page.getByRole("dialog", { name: "Gerenciar tags" });
      await resize(available);
      await assertVisible(tags.locator('input[type="search"]').first());
      await tags.getByRole("button", { name: /Editar tag Casa/ }).click();
      for (const field of await tags.getByRole("textbox").all())
        await assertVisible(field);
      await page.reload();
      await page
        .getByRole("button", {
          name: "Abrir cartão: Organizar a lista de compras da semana",
        })
        .click();
      await details
        .getByRole("button", {
          name: "Editar checklist Preparar a compra",
          exact: true,
        })
        .click();
      await resize(available);
      const checklistFields = page
        .getByRole("dialog", { name: "Editar checklist", exact: true })
        .locator("input:not([type=hidden]), textarea");
      for (const field of await checklistFields.all())
        await assertVisible(field);
      assert.ok((await checklistFields.count()) > 1);
      await page.goto(`${previewUrl}/#configuracoes`);
      await resize(available);
      const profile = page.getByRole("textbox", { name: "Nome de exibição" });
      await assertVisible(profile);
      await page.screenshot({
        path: `test-results/keyboard-viewport/${width}-profile.png`,
      });
      await resize(height);
      await assertVisible(profile);
      results.push({
        width,
        height,
        simulatedKeyboard: true,
        creation,
        creationFields: count,
        observations,
        otherForms: [
          "search",
          "tag-search",
          "tag-name",
          "checklist-name",
          "checklist-items",
          "profile",
        ],
        errors,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
    await fs.writeFile(
      "test-results/keyboard-viewport/report.json",
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
