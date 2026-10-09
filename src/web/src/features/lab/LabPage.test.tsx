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
  issues: [],
  score: 0,
  seed: 1,
};

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
      '/api/lab/generate': { status: 200, body: result },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: en.lab.generate }));

    expect(await screen.findByText('3 of 4 places filled')).toBeInTheDocument();
    expect(screen.getByText('Seed #1')).toBeInTheDocument();
    const monday = screen.getByRole('region', { name: 'Monday · Oct 5' });
    expect(within(monday).getAllByText('Philippe N.')).toHaveLength(2);
    expect(within(monday).getByText('Marc-Olivier R.')).toBeInTheDocument();
    const posted = fetch.mock.calls.map(([request]) => request).find((request) => request.method === 'POST');
    expect(await posted?.json()).toEqual(scenario.input);
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
});
