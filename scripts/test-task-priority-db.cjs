// Disposable synthetic database only; never connects to a running user database.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const container = "gabio-priority-qa-v1";
const docker = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const sql = (input) =>
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-At",
      "-h",
      "127.0.0.1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input },
  );
(async () => {
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--label",
    "gabio.qa=task-priority",
    "-e",
    "POSTGRES_PASSWORD=synthetic-test-only",
    "public.ecr.aws/supabase/postgres:17.6.1.167",
  ]);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        sql("select 1;");
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!ready) throw new Error("Synthetic database did not start");
    // The standalone image has the older Auth bootstrap; fixtures need this
    // metadata column. Full Auth service migrations are validated by CI.
    sql(
      "alter table auth.users add column if not exists email_confirmed_at timestamptz;",
    );
    for (const file of fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      sql(
        fs
          .readFileSync(path.join("supabase/migrations", file), "utf8")
          .replace(/\r\n/g, "\n"),
      );
    }
    let assertions = 0;
    let suites = 0;
    for (const file of fs
      .readdirSync("supabase/tests")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const result = sql(
        fs
          .readFileSync(path.join("supabase/tests", file), "utf8")
          .replace(/\r\n/g, "\n"),
      );
      const count = (result.match(/^ok \d+/gm) || []).length;
      const plan = result.match(/^1\.\.(\d+)$/m);
      if (/^not ok\b/m.test(result) || !plan || count !== Number(plan[1])) {
        process.stdout.write(result);
        throw new Error(`SQL suite failed: ${file}`);
      }
      assertions += count;
      suites++;
      process.stdout.write(`${file}: ${count} assertions passed\n`);
    }
    process.stdout.write(
      `${suites} SQL suites, ${assertions} assertions passed\n`,
    );
  } finally {
    docker(["rm", "--force", container]);
  }
})().catch((error) => {
  if (error.stdout) process.stderr.write(error.stdout);
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
