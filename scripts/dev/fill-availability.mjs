// Sends availability, with notes, for everyone on the demo team, in the period that is collecting it. Each
// person answers like a real one would (Wendy prefers openings, Lili is away one Saturday, and so on), and every
// shift ends up with enough people free, at least one of them level 3, so Generate always has a full answer.
//
//   node scripts/dev/fill-availability.mjs     (the app must be running, and a period open)
//
// People who already sent theirs keep it. Local only: never run it against a real server.
import { pathToFileURL } from "node:url";
import { demoWorkplace, signIn, team } from "./demo.mjs";

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
const label = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * How each person answers. `chance` is how likely they are free for a shift, `never` the shifts they cannot work
 * (what their note says), `notes` their general notes and `shiftNote` a note on some of the shifts they pick.
 */
function answers(shifts) {
  const firstDay = shifts[0].date;
  const week = (shift) =>
    Math.floor(
      (Date.parse(shift.date) - Date.parse(firstDay)) / (7 * 86_400_000),
    ) + 1;
  const firstSaturday = shifts.find((x) => weekday(x.date) === 6)?.date;
  return {
    Cecilia: {
      chance: () => 0.85,
      notes: [
        "Leaving on vacation soon, give me as many shifts as possible please!",
      ],
    },
    Wendy: {
      chance: (x) => (x.opening ? 0.8 : 0.15),
      notes: ["I prefer opening shifts if possible."],
    },
    Joseph: {
      chance: (x) => (x.opening ? 0.7 : 0.2),
      notes: ["Max 2 shifts a week please, busy with school."],
    },
    Emilie: {
      never: (x) => x.closing && weekday(x.date) === 5,
      notes: ["Can't close on Fridays, I have a class until 9."],
    },
    Lili: firstSaturday
      ? {
          never: (x) => x.date === firstSaturday,
          notes: [`Away ${label(firstSaturday)} for a family event.`],
        }
      : {},
    Jay: {
      never: (x) =>
        week(x) === 1 &&
        x.opening &&
        weekday(x.date) >= 1 &&
        weekday(x.date) <= 5,
      notes: ["Exams the first week: evenings only on weekdays."],
    },
    Selma: { shiftNote: (x) => (x.opening ? "Can only start at 11" : null) },
    Tony: {
      shiftNote: (x) => (x.closing ? "Je peux rester jusqu’à 22 h max" : null),
    },
    "Kym-Anh": {
      shiftNote: (x) =>
        x.closing && weekday(x.date) === 0
          ? "Pas après 21 h le dimanche"
          : null,
    },
  };
}

export async function fillAvailability() {
  const owner = await signIn(team.find((x) => x.owner).email);
  const workplace = await demoWorkplace(owner);
  const next = (await owner.get(`${workplace}/periods/current`)).next;
  if (!next || next.period.locked) {
    throw new Error(
      "No period is collecting availability. As Philippe: Schedule → Open the next period. Then run this again.",
    );
  }
  const period = next.period;
  const availability = `${workplace}/periods/${period.id}/availability/me`;

  // Every shift of the period that came from the generator rules, with what it needs.
  const shifts = (
    await owner.get(`${workplace}/periods/${period.id}/shifts`)
  ).shifts
    .filter((x) => !x.addedByHand && !x.started)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  if (shifts.length === 0)
    throw new Error("The open period has no shifts to answer for.");
  for (const shift of shifts) {
    const day = shifts
      .filter((x) => x.date === shift.date)
      .map((x) => x.start)
      .sort();
    shift.opening = shift.start === day[0];
    shift.closing = shift.start === day.at(-1);
    shift.level3 = shift.requirements
      .filter((x) => x.level === 3)
      .reduce((sum, x) => sum + x.minCount, 0);
  }
  const how = answers(shifts);

  // Who answers: everyone who works shifts and has not sent theirs yet.
  const people = [];
  for (const person of team) {
    const browser = person.owner ? owner : await signIn(person.email);
    let mine;
    try {
      mine = await browser.get(availability);
    } catch (error) {
      if (error.status === 403 || error.status === 404) continue; // does not work shifts, or not in the workplace
      throw error;
    }
    if (mine.status === "sent") {
      console.log(`  ${person.fullName}: already sent, kept as is`);
      continue;
    }
    const off = new Set(
      mine.shifts.filter((x) => x.timeOff || x.busyElsewhere).map((x) => x.id),
    );
    const rule = how[person.fullName] ?? {};
    const can = (shift) => !off.has(shift.id) && !rule.never?.(shift);
    const picks = new Set(
      shifts
        .filter((x) => can(x) && Math.random() < (rule.chance?.(x) ?? 0.5))
        .map((x) => x.id),
    );
    people.push({ ...person, browser, mine, rule, can, picks });
  }
  if (people.length === 0) {
    console.log("Everyone has already sent their availability.");
    return;
  }

  // Enough people free on every shift (two more than it needs), and enough of them level 3.
  for (const shift of shifts) {
    const free = () => people.filter((x) => x.picks.has(shift.id));
    const add = (who) => {
      const candidates = people
        .filter((x) => who(x) && x.can(shift) && !x.picks.has(shift.id))
        .sort(() => Math.random() - 0.5);
      if (candidates[0]) candidates[0].picks.add(shift.id);
      return Boolean(candidates[0]);
    };
    while (
      free().filter((x) => x.level === 3).length < shift.level3 + 1 &&
      add((x) => x.level === 3)
    );
    while (free().length < shift.headcount + 2 && add(() => true));
  }

  for (const person of people) {
    const shiftIds = shifts
      .filter((x) => person.picks.has(x.id))
      .map((x) => x.id);
    const shiftNotes = shifts
      .filter((x) => person.picks.has(x.id))
      .map((x) => ({ shiftId: x.id, note: person.rule.shiftNote?.(x) }))
      .filter((x) => x.note)
      .slice(0, 3);
    await person.browser.post(`${availability}/send`, {
      shiftIds,
      desiredWeeklyHours: person.mine.desiredWeeklyHours ?? person.hours,
      shiftNotes,
    });
    for (const body of person.rule.notes ?? []) {
      if (!person.mine.notes.some((x) => x.body === body))
        await person.browser.post(`${availability}/notes`, { body });
    }
    const extra = [
      person.rule.notes?.length && "note",
      shiftNotes.length && `${shiftNotes.length} shift notes`,
    ].filter(Boolean);
    console.log(
      `  ${person.fullName}: free for ${shiftIds.length} of ${shifts.length} shifts${extra.length ? ` (${extra.join(", ")})` : ""}`,
    );
  }
  console.log(
    `\nSent for ${people.length} people, period starting ${period.startDate}. As Philippe: Schedule → Generate schedule.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Sending availability for the demo team…");
  try {
    await fillAvailability();
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}
