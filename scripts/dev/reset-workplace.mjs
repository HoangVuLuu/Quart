// Takes the demo workplace back to "no period yet": every period goes, with its availability, notes, shifts,
// drafts and published schedules, plus give-aways, trades and alerts. The people, their levels, the generator
// rules and the settings stay, and so does time off.
//
//   node scripts/dev/reset-workplace.mjs                    the demo workplace (Presotea Montmorency)
//   node scripts/dev/reset-workplace.mjs "Other name"       another workplace on this computer
//
// It talks straight to the database in Docker (docker compose), so it only ever touches your own computer.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { workplaceName } from "./demo.mjs";

const sql = `
\\set ON_ERROR_STOP on
\\set QUIET on
begin;
create temp table _w on commit drop as select id from workplaces.workplace where name = :'name';
select set_config('quart.name', :'name', true) as _ \\gset
do $$ begin
  if not exists (select 1 from _w) then
    raise exception 'No workplace named "%" on this computer. Nothing was changed.', current_setting('quart.name');
  end if;
end $$;
create temp table _p on commit drop as select id from scheduling.period where workplace_id in (select id from _w);
delete from marketplace.claim where workplace_id in (select id from _w);
delete from marketplace.give_away where workplace_id in (select id from _w);
delete from marketplace.trade where workplace_id in (select id from _w);
delete from marketplace.seen_item where membership_id in (select id from workplaces.membership where workplace_id in (select id from _w));
delete from notifications.notification where workplace_id in (select id from _w);
delete from jobs.scheduled_job where workplace_id in (select id from _w) and status <> 'Running';
delete from scheduling.generation_run where period_id in (select id from _p);
delete from scheduling.schedule_version where period_id in (select id from _p);
-- Shifts, assignments, availability and its notes go with their period.
delete from scheduling.period where id in (select id from _p);
select (select count(*) from _p) as periods_removed \\gset
commit;
\\echo 'Removed' :periods_removed 'period(s).'
`;

export function resetWorkplace(name = workplaceName) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "quart",
      "-d",
      "quart",
      "-q",
      "-v",
      `name=${name}`,
    ],
    { input: sql, encoding: "utf8", cwd: new URL("../..", import.meta.url) },
  );
  if (result.error)
    throw new Error(
      "Docker is not available. Open Docker Desktop, then run scripts/dev/start.sh.",
    );
  process.stdout.write(result.stdout);
  if (result.status !== 0) {
    const said = /ERROR:\s*(.*)/.exec(result.stderr)?.[1];
    throw new Error(
      said ??
        `Could not reach the database. Is the app running? scripts/dev/start.sh\n${result.stderr.trim()}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const name = process.argv[2] ?? workplaceName;
  console.log(`Resetting ${name}…`);
  try {
    resetWorkplace(name);
    console.log(
      "Done. People, levels, generator rules and settings are kept. Reload the app.",
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
