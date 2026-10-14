import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import type { Schemas } from '../../lib/api/client';
import { LabPage } from './LabPage';

const scenario: Schemas['LabScenario'] = {
  name: 'Presotea Montmorency',
  people: [
    { id: 'p1', name: 'Philippe Nguyen' },
    { id: 'p2', name: 'Marc-Olivier Roy' },
    { id: 'p3', name: 'Diego Alvarez' },
  ],
  input: {
    shifts: [
      {
        id: 'mon-open',
        blockId: 'opening',
        date: '2026-10-05',
        start: '10:00:00',
        end: '16:00:00',
        headcount: 2,
        levelRequirements: [{ level: 3, minCount: 1 }],
      },
      {
        id: 'mon-close',
        blockId: 'closing',
        date: '2026-10-05',
        start: '16:00:00',
        end: '23:00:00',
        headcount: 2,
        levelRequirements: [],
      },
    ],
    members: [
      { id: 'p1', level: 3, desiredWeeklyHours: 20, maxWeeklyHours: null },
      { id: 'p2', level: 3, desiredWeeklyHours: 18, maxWeeklyHours: null },
      { id: 'p3', level: 1, desiredWeeklyHours: 8, maxWeeklyHours: null },
    ],
    availability: [
      { memberId: 'p1', submitted: true, shiftIds: ['mon-open', 'mon-close'] },
      { memberId: 'p2', submitted: true, shiftIds: ['mon-open'] },
      { memberId: 'p3', submitted: false, shiftIds: [] },
    ],
    busyTimes: [],
    lockedAssignments: [],
    conflictPairs: [],
    rules: { maxConsecutiveShifts: 3, openingFairness: true, closingFairness: true },
    seed: 1,
  },
};

const result: Schemas['GeneratorResult'] = {
  assignments: [
    { shiftId: 'mon-open', memberId: 'p1' },
    { shiftId: 'mon-open', memberId: 'p2' },
    { shiftId: 'mon-close', memberId: 'p1' },
  ],
  issues: [
    {
      code: 'issue.below_headcount',
      shiftIds: ['mon-close'],
      memberIds: [],
      parameters: { assigned: '1', headcount: '2' },
      hardRule: false,
    },
    {
      code: 'issue.double_shift',
      shiftIds: ['mon-open', 'mon-close'],
      memberIds: ['p1'],
      parameters: { date: '2026-10-05', count: '2' },
      hardRule: false,
    },
  ],
  score: -1050,
  seed: 1,
  members: [
    {
      memberId: 'p1',
      hours: 13,
      targetHours: 20,
      weeklyHours: [13],
      openings: 1,
      expectedOpenings: 1,
      closings: 1,
      expectedClosings: 1,
    },
    {
      memberId: 'p2',
      hours: 6,
      targetHours: 18,
      weeklyHours: [6],
      openings: 1,
      expectedOpenings: 1,
      closings: 0,
      expectedClosings: 0,
    },
    {
      memberId: 'p3',
      hours: 0,
      targetHours: 8,
      weeklyHours: [0],
      openings: 0,
      expectedOpenings: 0,
      closings: 0,
      expectedClosings: 0,
    },
  ],
  constructionScore: -2100,
};

// The lab's generate endpoint answers with the result and how long the server took (M1-08).
function generated(generatorResult: Schemas['GeneratorResult'] = result): Schemas['LabGeneration'] {
  return { result: generatorResult, milliseconds: 42 };
}

type Answer = { status: number; body: unknown };

// Answers each API path with its own response, and remembers what was posted.
function serve(answers: Record<string, Answer>) {
  const fetch = vi.fn(async (request: Request) => {
    const answer = answers[new URL(request.url).pathname] ?? {
      status: 404,
      body: { code: 'common.not_found' },
    };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'Content-Type': answer.status < 400 ? 'application/json' : 'application/problem+json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function openScenario(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: en.lab.tabs.scenario }));
}

async function lastPosted(fetch: ReturnType<typeof serve>): Promise<typeof scenario.input> {
  const posted = fetch.mock.calls.map(([request]) => request).filter((request) => request.method === 'POST');
  return (await posted.at(-1)?.json()) as typeof scenario.input;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LabPage />
    </QueryClientProvider>,
  );
}

describe('LabPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('summarises the sample and shows its empty grid before generating', async () => {
    serve({ '/api/lab/scenarios/presotea': { status: 200, body: scenario } });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Presotea Montmorency' })).toBeInTheDocument();
    expect(screen.getByText('3 people · 2 shifts · Oct 5')).toBeInTheDocument();
    expect(screen.getByText(en.lab.notSent)).toBeInTheDocument();
    expect(screen.getByText('Diego A.')).toBeInTheDocument();
    expect(screen.getAllByText('0 of 2 people')).toHaveLength(2);
  });

  it('generates and fills the grid with the people the generator chose', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('3 of 4 places filled')).toBeInTheDocument();
    expect(screen.getByText('Hard rules: 0 violations')).toBeInTheDocument();
    expect(screen.getByText('Seed #1')).toBeInTheDocument();
    expect(screen.getAllByText(en.scheduling.grid.open)).toHaveLength(1);
    const monday = screen.getByRole('region', { name: 'Monday · Oct 5' });
    expect(within(monday).getAllByText('Philippe N.')).toHaveLength(2);
    expect(within(monday).getByText('Marc-Olivier R.')).toBeInTheDocument();
    const posted = fetch.mock.calls.map(([request]) => request).find((request) => request.method === 'POST');
    expect(await posted?.json()).toEqual(scenario.input);
  });

  it('counts the hard rules a lock broke', async () => {
    const user = userEvent.setup();
    const unavailable = {
      code: 'issue.unavailable',
      shiftIds: ['mon-close'],
      memberIds: ['p2'],
      parameters: {},
      hardRule: true,
    };
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': {
        status: 200,
        body: generated({ ...result, issues: [...result.issues, unavailable] }),
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('Hard rules: 1 violation')).toBeInTheDocument();
  });

  it('generates with the seed in the field, and Generate again picks a new one (FR-122)', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    const seed = await screen.findByRole('spinbutton', { name: en.lab.seedLabel });
    expect(seed).toHaveValue(1);

    await user.clear(seed);
    await user.type(seed, '42');
    await user.click(screen.getByRole('button', { name: en.lab.generate }));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(screen.getByRole('button', { name: en.lab.generateAgain }));

    const posted = fetch.mock.calls
      .map(([request]) => request)
      .filter((request) => request.method === 'POST');
    const seeds = await Promise.all(
      posted.map(async (request) => ((await request.json()) as { seed: number }).seed),
    );
    expect(seeds).toEqual([42, 1073741824]);
    expect(screen.getByRole('spinbutton', { name: en.lab.seedLabel })).toHaveValue(1073741824);
  });

  it('will not generate with a seed that is not a whole number', async () => {
    const user = userEvent.setup();
    serve({ '/api/lab/scenarios/presotea': { status: 200, body: scenario } });
    renderPage();
    const seed = await screen.findByRole('spinbutton', { name: en.lab.seedLabel });

    await user.clear(seed);

    expect(screen.getByText(en.lab.seedInvalid)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.lab.generate })).toBeDisabled();
  });

  it('shows hours per person as assigned/desired, per week and over the period', async () => {
    const user = userEvent.setup();
    const under = {
      code: 'issue.under_hours',
      shiftIds: [],
      memberIds: ['p1'],
      parameters: { hours: '13', target: '20' },
      hardRule: false,
    };
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated({ ...result, issues: [...result.issues, under] }) },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    const table = await screen.findByRole('table');
    const philippe = within(table).getByRole('row', { name: /Philippe N\./ });
    expect(
      within(philippe)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['13/20', `13/20${en.lab.hours.under}`, '1/1', '1/1']);
    // Diego never sent availability: the evaluator does not report his hours, so neither does the table.
    const diego = within(table).getByRole('row', { name: /Diego A\./ });
    expect(within(diego).queryByText(en.lab.hours.under)).not.toBeInTheDocument();
  });

  it('shows how long the generation took next to the score (M1-08)', async () => {
    const user = userEvent.setup();
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('· generated in 42 ms', { exact: false })).toBeInTheDocument();
  });

  it('shows the score before and after local search (M1-05)', async () => {
    const user = userEvent.setup();
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('Score: -1,050')).toBeInTheDocument();
    expect(screen.getByText('Before local search: -2,100')).toBeInTheDocument();
  });

  it('turns opening and closing fairness on and off independently (BR-020)', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await openScenario(user);

    await user.click(screen.getByRole('switch', { name: new RegExp(en.lab.rules.openingFairness) }));
    expect(screen.getByRole('switch', { name: new RegExp(en.lab.rules.closingFairness) })).toBeChecked();
    await user.click(screen.getByRole('button', { name: en.lab.generate }));

    expect((await lastPosted(fetch)).rules).toEqual({
      maxConsecutiveShifts: 3,
      openingFairness: false,
      closingFairness: true,
    });
    expect(screen.queryByText(en.lab.changedSinceRun)).not.toBeInTheDocument();

    await openScenario(user);
    await user.click(screen.getByRole('switch', { name: new RegExp(en.lab.rules.closingFairness) }));

    expect(await screen.findByText(en.lab.changedSinceRun)).toBeInTheDocument();
  });

  it('edits a person in a sheet and generates with the change (M1-06)', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await openScenario(user);

    await user.click(screen.getByRole('button', { name: 'Edit Marc-Olivier Roy' }));
    const sheet = await screen.findByRole('dialog', { name: en.lab.team.sheetTitle });
    await user.click(within(sheet).getByRole('radio', { name: 'Level 1' }));
    const max = within(sheet).getByRole('spinbutton', { name: en.lab.team.max });
    await user.type(max, '12');
    await user.click(within(sheet).getByRole('button', { name: en.lab.team.save }));
    await user.click(screen.getByRole('button', { name: en.lab.generate }));

    expect((await lastPosted(fetch)).members[1]).toEqual({
      id: 'p2',
      level: 1,
      desiredWeeklyHours: 18,
      maxWeeklyHours: 12,
    });
  });

  it('adds and removes people, and their availability goes with them', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await openScenario(user);

    await user.click(screen.getByRole('button', { name: en.lab.team.add }));
    const sheet = await screen.findByRole('dialog', { name: en.lab.team.sheetTitle });
    await user.clear(within(sheet).getByRole('textbox', { name: en.lab.team.name }));
    await user.type(within(sheet).getByRole('textbox', { name: en.lab.team.name }), 'Zoé Gagnon');
    await user.click(within(sheet).getByRole('button', { name: en.lab.team.save }));
    await user.click(screen.getByRole('button', { name: 'Edit Philippe Nguyen' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: en.lab.team.remove }),
    );
    await user.click(screen.getByRole('button', { name: en.lab.generate }));

    const input = await lastPosted(fetch);
    expect(input.members.map((member) => member.id)).toEqual(['p2', 'p3', 'p4']);
    expect(input.availability.map((entry) => entry.memberId)).toEqual(['p2', 'p3', 'p4']);
  });

  it('taps shifts to mark availability for the chosen person', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await openScenario(user);

    await user.selectOptions(screen.getByRole('combobox', { name: en.lab.availability.person }), 'p2');
    const closing = screen.getByRole('button', { name: /Closing/, pressed: false });
    await user.click(closing);
    expect(screen.getByRole('button', { name: /Closing/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.lab.generate }));

    expect((await lastPosted(fetch)).availability[1]).toEqual({
      memberId: 'p2',
      submitted: true,
      shiftIds: ['mon-open', 'mon-close'],
    });
  });

  it('sets the limit of shifts in a row and a pair who cannot work together', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await openScenario(user);

    await user.click(screen.getByRole('radio', { name: en.lab.rules.noLimit }));
    await user.selectOptions(screen.getByRole('combobox', { name: en.lab.rules.second }), 'p2');
    await user.click(screen.getByRole('button', { name: en.lab.rules.addPair }));
    // "Every shift" adds the pair to each block, as "Apply to all" does (1k5).
    expect(screen.getAllByText('Philippe N. cannot work with Marc-Olivier R.')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: en.lab.generate }));

    const input = await lastPosted(fetch);
    expect(input.rules.maxConsecutiveShifts).toBeNull();
    expect(input.conflictPairs).toEqual([
      { blockId: 'opening', memberA: 'p1', memberB: 'p2' },
      { blockId: 'closing', memberA: 'p1', memberB: 'p2' },
    ]);
  });

  it('imports a counterexample pasted as JSON, with people named by their ids', async () => {
    const user = userEvent.setup();
    serve({ '/api/lab/scenarios/presotea': { status: 200, body: scenario } });
    renderPage();
    await openScenario(user);
    const counterexample = { ...scenario.input, members: [scenario.input.members[0]] };

    await user.click(screen.getByRole('textbox', { name: en.lab.file.paste }));
    await user.paste(JSON.stringify(counterexample));
    await user.click(screen.getByRole('button', { name: en.lab.file.import }));

    expect(await screen.findByText(`Imported “${en.lab.file.importedName}”.`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en.lab.file.importedName })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit p1' })).toBeInTheDocument();
  });

  it('says what is wrong with pasted text that is not a scenario', async () => {
    const user = userEvent.setup();
    serve({ '/api/lab/scenarios/presotea': { status: 200, body: scenario } });
    renderPage();
    await openScenario(user);

    await user.click(screen.getByRole('textbox', { name: en.lab.file.paste }));
    await user.paste('{ nope');
    await user.click(screen.getByRole('button', { name: en.lab.file.import }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en.lab.file.invalid_json);
  });

  it('lists the problems the server found, translated, with the person they concern', async () => {
    const user = userEvent.setup();
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': {
        status: 400,
        body: {
          code: 'common.validation',
          traceId: 'abc',
          status: 400,
          errors: [
            { code: 'generator.out_of_range', path: 'members[1].maxWeeklyHours' },
            { code: 'lab.too_many_people', path: 'members' },
          ],
        },
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Marc-Olivier Roy · maxWeeklyHours: out of range')).toBeInTheDocument();
    expect(within(alert).getByText('members: more than 60 people')).toBeInTheDocument();
  });

  it('marks a shift missing its level on the grid, as "No level 3" (1l)', async () => {
    const user = userEvent.setup();
    const missing = {
      code: 'issue.missing_level',
      shiftIds: ['mon-open'],
      memberIds: [],
      parameters: { level: '3', required: '1', present: '0' },
      hardRule: false,
    };
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': {
        status: 200,
        body: generated({ ...result, issues: [...result.issues, missing] }),
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('No level 3')).toBeInTheDocument();
  });

  it('keeps a person on a shift with a tap, and generating again sends the lock (M1-07)', async () => {
    const user = userEvent.setup();
    const fetch = serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    const keep = (await screen.findAllByRole('button', { name: 'Keep Marc-Olivier R. on this shift' }))[0]!;
    expect(keep).toHaveAttribute('aria-pressed', 'false');
    await user.click(keep);

    expect(keep).toHaveAttribute('aria-pressed', 'true');
    expect(within(keep).getByText(en.scheduling.grid.kept)).toBeInTheDocument();
    expect(screen.getByText('1 person kept')).toBeInTheDocument();
    expect(screen.queryByText(en.lab.changedSinceRun)).not.toBeInTheDocument();

    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    await user.click(screen.getByRole('button', { name: en.lab.generateAgain }));
    expect((await lastPosted(fetch)).lockedAssignments).toEqual([{ shiftId: 'mon-open', memberId: 'p2' }]);

    await user.click(screen.getByRole('button', { name: en.lab.locks.release }));
    expect(screen.queryByText(en.scheduling.grid.kept)).not.toBeInTheDocument();
  });

  it('says so when the lab is off on this server', async () => {
    serve({});

    renderPage();

    expect(await screen.findByText(en.lab.offTitle)).toBeInTheDocument();
  });

  it('explains a refused generation with a translated message', async () => {
    const user = userEvent.setup();
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': {
        status: 429,
        body: { code: 'common.too_many_requests', traceId: 'abc123', status: 429 },
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.errors.common.too_many_requests);
    expect(alert).toHaveTextContent('abc123');
  });

  it('lists the issues with the score, and points at the shifts of an issue on the grid', async () => {
    const user = userEvent.setup();
    serve({
      '/api/lab/scenarios/presotea': { status: 200, body: scenario },
      '/api/lab/generate': { status: 200, body: generated() },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('Score: -1,050')).toBeInTheDocument();
    expect(screen.getByText('2 issues')).toBeInTheDocument();
    expect(screen.queryByText(en.scheduling.grid.highlighted)).not.toBeInTheDocument();

    await user.click(screen.getByText(en.issues.double_shift.title));
    await user.click(screen.getByRole('button', { name: 'Philippe N. works 2 shifts on Mon, Oct 5' }));

    expect(screen.getAllByText(en.scheduling.grid.highlighted)).toHaveLength(2);
  });
});
