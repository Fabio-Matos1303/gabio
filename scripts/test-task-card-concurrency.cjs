// Synthetic integration test; intentionally restricted to the isolated container.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const assert = require("node:assert/strict");
const run = promisify(execFile);
const container = "gabio-card-test-db";
const sql = (statement) =>
  run("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-Atc",
    statement,
  ]);
const users = [
  "a1000000-0000-4000-8000-000000000001",
  "a1000000-0000-4000-8000-000000000002",
];
const houses = [
  "a2000000-0000-4000-8000-000000000001",
  "a2000000-0000-4000-8000-000000000002",
];
const tasks = [
  "a3000000-0000-4000-8000-000000000001",
  "a3000000-0000-4000-8000-000000000002",
];
const listId = "a4000000-0000-4000-8000-000000000001";
const command = (actor, taskId, type, fields) =>
  sql(
    `set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false); select public.execute_task_card_command(gen_random_uuid(),'${JSON.stringify({ type, payload: { taskId, expectedVersion: 0, ...fields } })}'::jsonb);`,
  );
function assertSingleWinner(results) {
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.match(rejected.reason.stderr, /40001/);
}
(async () => {
  for (let index = 0; index < 2; index++) {
    await sql(`insert into auth.users(id,email,raw_user_meta_data) values('${users[index]}','race-${index}@example.test','{}');
      insert into public.households(id,name,created_by) values('${houses[index]}','Casa sintética concorrente ${index}','${users[index]}');
      insert into public.household_members(household_id,user_id,role) values('${houses[index]}','${users[index]}','owner');
      insert into public.tasks(id,household_id,owner_user_id,created_by,title,visibility,idempotency_key)
        values('${tasks[index]}','${houses[index]}','${users[index]}','${users[index]}','Tarefa sintética ${index}','household',gen_random_uuid());`);
  }
  await sql(`create function public.card_test_insert_pause() returns trigger language plpgsql as $$ begin perform pg_sleep(1); return new; end $$;
    create trigger card_test_insert_pause before insert on public.task_checklists for each row when (new.id='${listId}'::uuid) execute function public.card_test_insert_pause();`);
  try {
    const race = await Promise.allSettled(
      users.map((user, index) =>
        command(user, tasks[index], "save_checklist", {
          checklistId: listId,
          title: `Lista sintética ${index}`,
          items: [],
        }),
      ),
    );
    assertSingleWinner(race);
    const winner = race.findIndex((r) => r.status === "fulfilled");
    const rows = await sql(
      `select task_id::text||'|'||title from public.task_checklists where id='${listId}';`,
    );
    assert.equal(
      rows.stdout.trim(),
      `${tasks[winner]}|Lista sintética ${winner}`,
    );
    const versions = await Promise.allSettled(
      ["A", "B"].map((notes) =>
        command(users[0], tasks[0], "save_notes", {
          notes: `Nota sintética ${notes}`,
        }),
      ),
    );
    assertSingleWinner(versions);
    const version = await sql(
      `select version from public.task_card_notes where task_id='${tasks[0]}';`,
    );
    assert.equal(version.stdout.trim(), "1");
    console.log(
      "PASS: cross-household UUID race preserves ownership; concurrent notes produce one success and one version conflict.",
    );
  } finally {
    await sql(
      "drop trigger card_test_insert_pause on public.task_checklists; drop function public.card_test_insert_pause();",
    );
    for (const house of houses)
      await sql(`delete from public.households where id='${house}';`);
    for (const user of users)
      await sql(`delete from auth.users where id='${user}';`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
