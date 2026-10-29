const fs = require("fs");
(async () => {
  let targets;
  for (let n = 0; n < 40; n++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9227/json/list")).json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!targets) throw new Error("QA browser startup timeout");
  const page = targets.find(
    (x) =>
      x.type === "page" &&
      (x.url === "about:blank" ||
        x.url.startsWith("http://localhost:5181/") ||
        x.url.startsWith("http://localhost:5182/")),
  );
  if (!page) throw new Error("QA browser page not found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const calls = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const c = calls.get(m.id);
      calls.delete(m.id);
      if (m.error) c.reject(new Error(JSON.stringify(m.error)));
      else c.resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      calls.set(key, { resolve, reject });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const search = "?qa=" + Date.now();
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: "http://localhost:5182/" + search });
  for (let n = 0; n < 40; n++) {
    if (
      await evaluate(
        'document.readyState==="complete" && document.querySelectorAll(".task-card").length >= 4 && location.search===' +
          JSON.stringify(search),
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(
    JSON.stringify(
      await evaluate(
        '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,taskCards:document.querySelectorAll(".task-card").length,text:document.body.innerText.slice(0,1500)})',
      ),
    ),
  );
  fs.writeFileSync(
    "test-results/task-mobile-390-cdp.png",
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  const measurements = [];
  for (const width of [320, 390, 768, 1280]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await new Promise((r) => setTimeout(r, 250));
    const measurement = await evaluate(
      '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cards:document.querySelectorAll(".task-card").length})',
    );
    measurements.push(measurement);
    if (measurement.scrollWidth > measurement.width)
      throw new Error("Page overflow at " + width);
    fs.writeFileSync(
      "test-results/task-width-" + width + ".png",
      Buffer.from(
        (await send("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate('document.querySelector(".task-card button").click()');
  await new Promise((r) => setTimeout(r, 250));
  await evaluate(
    'Array.from(document.querySelectorAll("section")).find(x=>x.getAttribute("aria-label")==="Editar tarefa").scrollIntoView()',
  );
  console.log(
    JSON.stringify(
      await evaluate(
        '({editorClass:document.querySelector(".task-editor")?.className,inputHeight:document.querySelector(".task-editor input")?.getBoundingClientRect().height})',
      ),
    ),
  );
  fs.writeFileSync(
    "test-results/task-edit-mobile.png",
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  fs.writeFileSync(
    "test-results/mobile-layout.json",
    JSON.stringify(measurements, null, 2),
  );
  console.log(JSON.stringify(measurements));
  ws.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
