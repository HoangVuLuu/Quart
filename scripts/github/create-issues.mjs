#!/usr/bin/env node
// Seeds GitHub labels, milestones and issues from docs/issues/*.md.
//
//   node scripts/github/create-issues.mjs --check                 validate the plan only (no network)
//   node scripts/github/create-issues.mjs --dry-run               show what would be created
//   node scripts/github/create-issues.mjs                         create everything that is missing
//   node scripts/github/create-issues.mjs --milestone M0          only one milestone's issues
//   node scripts/github/create-issues.mjs --update                also rewrite issues that already exist
//
// Repository: --repo owner/name, else $GITHUB_REPOSITORY, else the `origin` git remote.
// Token: $GITHUB_TOKEN, else `gh auth token` if the GitHub CLI is installed. A fine-grained token
// scoped to this one repository with "Issues: read and write" is enough.
//
// Safe to re-run: every issue body carries a hidden marker with its plan ID (for example M2-03), and
// existing issues are found by that marker, so nothing is ever created twice. Zero dependencies.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plansDir = join(root, 'docs', 'issues');
const specPath = join(root, 'docs', 'quart-project-spec.txt');
const statePath = join(root, 'scripts', 'github', '.created-issues.json');
const apiBase = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');

// ---------------------------------------------------------------------------------------------
// Labels. Colours are GitHub hex without '#'. Descriptions are capped at 100 characters by GitHub.
// ---------------------------------------------------------------------------------------------
export const LABELS = {
  'type:feature': ['1D76DB', 'A slice of the product, built front to back'],
  'type:chore': ['C5DEF5', 'Setup, infrastructure, documentation or maintenance'],
  'type:decision': ['FBCA04', 'A decision to make and record before work can continue'],
  'type:bug': ['D73A4A', 'Does not behave the way the spec says'],
  'needs:philippe': ['F9D0C4', 'Blocked on input or approval from the owner'],
  'payslip-readiness': ['5319E7', 'One of the 13 foundations in spec 12.7'],
  'good-first-issue': ['7057FF', 'Small and well defined'],
  'stack:full': ['0E8A16', 'Backend and frontend in the same issue'],
  'stack:backend': ['BFDADC', 'Backend only (rare: most slices are full stack)'],
  'stack:frontend': ['D4C5F9', 'Frontend only'],
  'size:S': ['EDEDED', 'About a day'],
  'size:M': ['D5D5D5', 'A few days'],
  'size:L': ['BDBDBD', 'A week or more; split it if it grows'],
  'area:infra': ['0052CC', 'CI/CD, hosting, database, jobs, monitoring'],
  'area:security': ['B60205', 'Authentication hardening, headers, access control'],
  'area:privacy': ['E99695', 'Personal information, Law 25, retention'],
  'area:auth': ['006B75', 'Accounts, sign-in, sessions, two-factor'],
  'area:workplace': ['0E8A16', 'Workplaces, memberships, permissions, settings'],
  'area:template': ['C2E0C6', 'The weekly shift template'],
  'area:availability': ['BFD4F2', 'Periods and availability'],
  'area:generator': ['FEF2C0', 'The generator, the evaluator and the lab'],
  'area:scheduling': ['F9D0C4', 'Drafts, publishing, schedule views'],
  'area:marketplace': ['D4C5F9', 'Give away, claim, trade, approvals'],
  'area:news': ['FBCA04', 'The News tab'],
  'area:files': ['5319E7', 'Stored files, uploads, download links'],
  'area:notifications': ['C5DEF5', 'In-app, email and push notifications'],
  'area:calendar': ['BFDADC', 'Google Calendar import and calendar feeds'],
  'area:ui': ['E4E669', 'Shell, design system, shared components'],
  'area:i18n': ['0075CA', 'French and English'],
  'area:a11y': ['7057FF', 'Accessibility'],
};

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------
function parseFrontMatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const data = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, value] = kv;
    if (value === '>-' || value === '>') {
      const folded = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) folded.push(lines[++i].trim());
      value = folded.join(' ');
    }
    data[key] = value.trim();
  }
  return { data, rest: text.slice(match[0].length) };
}

const list = (value) =>
  !value || value === '-'
    ? []
    : value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

export function loadPlan(dir = plansDir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();
  const milestones = [];
  const issues = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    const { data, rest } = parseFrontMatter(text, file);
    const milestone = data.milestone === 'none' ? null : data.milestone;
    if (milestone) milestones.push({ title: milestone, description: data.description ?? '' });
    const blocks = rest.split(/^(?=## )/m).filter((b) => b.startsWith('## '));
    for (const block of blocks) {
      const lines = block.split('\n');
      const heading = lines[0].match(/^## (\S+) · (.+)$/);
      if (!heading) throw new Error(`${file}: bad heading "${lines[0]}" (expected "## ID · Title")`);
      const meta = {};
      let i = 1;
      for (; i < lines.length && lines[i].trim() !== ''; i++) {
        const kv = lines[i].match(/^(labels|depends|spec):\s*(.*)$/);
        if (!kv) throw new Error(`${file} ${heading[1]}: unexpected metadata line "${lines[i]}"`);
        meta[kv[1]] = kv[2];
      }
      issues.push({
        id: heading[1],
        title: heading[2].trim(),
        file,
        milestone,
        labels: list(meta.labels),
        depends: list(meta.depends),
        spec: list(meta.spec),
        body: lines.slice(i).join('\n').trim(),
      });
    }
  }
  return { milestones, issues };
}

// ---------------------------------------------------------------------------------------------
// Validation: everything that can be checked without the network
// ---------------------------------------------------------------------------------------------
function expandSpecToken(token) {
  const range = token.match(/^(FR|BR|AD|NFR)-(\d+)\.\.(\d+)$/);
  if (!range) return [token];
  const [, prefix, from, to] = range;
  const width = from.length;
  return [`${prefix}-${from}`, `${prefix}-${to.padStart(width, '0')}`];
}

export function validate({ milestones, issues }, specText = readFileSync(specPath, 'utf8')) {
  const errors = [];
  const seen = new Map();
  const sections = new Set();
  for (const line of specText.split('\n')) {
    const top = line.match(/^(\d+)\. [A-Z]/);
    if (top) sections.add(top[1]);
    const sub = line.match(/^(\d+\.\d+) \S/);
    if (sub) sections.add(sub[1]);
  }
  const milestoneTitles = new Set(milestones.map((m) => m.title));
  if (milestoneTitles.size !== milestones.length) errors.push('duplicate milestone titles');

  issues.forEach((issue, index) => {
    const where = `${issue.file} ${issue.id}`;
    if (seen.has(issue.id)) errors.push(`${where}: duplicate ID (also in ${seen.get(issue.id)})`);
    seen.set(issue.id, issue.file);

    const expectedPrefix = issue.milestone ? issue.milestone.split(' ')[0] + '-' : 'BL-';
    if (!issue.id.startsWith(expectedPrefix)) errors.push(`${where}: ID should start with ${expectedPrefix}`);
    if (`${issue.id} · ${issue.title}`.length > 256) errors.push(`${where}: title too long`);

    const unknown = issue.labels.filter((l) => !(l in LABELS));
    if (unknown.length) errors.push(`${where}: unknown labels ${unknown.join(', ')}`);
    if (issue.labels.filter((l) => l.startsWith('type:')).length !== 1) errors.push(`${where}: needs exactly one type: label`);
    if (issue.labels.filter((l) => l.startsWith('size:')).length !== 1) errors.push(`${where}: needs exactly one size: label`);

    for (const dep of issue.depends) {
      const target = issues.findIndex((other) => other.id === dep);
      if (target === -1) errors.push(`${where}: depends on unknown ${dep}`);
      else if (target >= index) errors.push(`${where}: depends on ${dep}, which comes later (dependencies must point backwards)`);
    }

    for (const token of issue.spec) {
      if (/^(FR|BR|AD|NFR|Q)-/.test(token)) {
        for (const id of expandSpecToken(token)) {
          if (!new RegExp(`\\b${id}\\b`).test(specText)) errors.push(`${where}: spec reference ${id} not found in the spec`);
        }
      } else if (/^\d+(\.\d+)?$/.test(token)) {
        if (!sections.has(token)) errors.push(`${where}: spec section ${token} not found`);
      } else {
        errors.push(`${where}: spec token "${token}" is neither an ID nor a section number`);
      }
    }

    if (issue.milestone && !/\*\*Done when\*\*/.test(issue.body)) errors.push(`${where}: missing a **Done when** section`);
  });
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
const marker = (id) => `<!-- quart-issue-id: ${id} -->`;

export function renderBody(issue, numbers) {
  const deps = issue.depends.map((d) => (numbers.has(d) ? `#${numbers.get(d)}` : d));
  const header = [
    issue.spec.length ? `**Spec:** ${issue.spec.join(', ')}` : null,
    deps.length ? `**Depends on:** ${deps.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    header ? `> ${header}` : null,
    issue.body,
    '---',
    `<sub>Plan ID \`${issue.id}\`, seeded from \`docs/issues/${issue.file}\`. The spec is \`docs/quart-project-spec.txt\`.</sub>`,
    marker(issue.id),
  ]
    .filter((part) => part !== null)
    .join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient(repo, token) {
  async function call(method, path, body, attempt = 1) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'quart-create-issues',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if ((response.status === 403 || response.status === 429) && attempt <= 5) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      const remaining = response.headers.get('x-ratelimit-remaining');
      const waitMs = retryAfter
        ? retryAfter * 1000
        : remaining === '0' && reset
          ? Math.max(0, reset * 1000 - Date.now()) + 1000
          : 60_000 * attempt;
      console.log(`  rate limited, waiting ${Math.round(waitMs / 1000)} s…`);
      await sleep(waitMs);
      return call(method, path, body, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  }
  async function all(path) {
    const items = [];
    for (let page = 1; ; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const batch = await call('GET', `${path}${sep}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }
  return { call, all, base: `/repos/${repo}` };
}

function resolveRepo(args) {
  const flag = args.indexOf('--repo');
  if (flag !== -1 && args[flag + 1]) return args[flag + 1];
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/);
    if (match) return match[1];
  } catch {
    // no git remote; fall through
  }
  throw new Error('Cannot tell which repository to use. Pass --repo owner/name.');
}

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Set GITHUB_TOKEN (a fine-grained token with Issues: read and write) or sign in with `gh auth login`.');
  }
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main(args) {
  const plan = loadPlan();
  const errors = validate(plan);
  const byMilestone = new Map();
  for (const issue of plan.issues) {
    const key = issue.milestone ?? 'Backlog';
    byMilestone.set(key, (byMilestone.get(key) ?? 0) + 1);
  }
  console.log(`Plan: ${plan.issues.length} issues in ${plan.milestones.length} milestones plus backlog.`);
  for (const [title, count] of byMilestone) console.log(`  ${String(count).padStart(3)}  ${title}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) in the plan:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Plan is valid: IDs unique, labels known, dependencies point backwards, spec references exist.');
  if (args.includes('--check')) return;

  const only = args.includes('--milestone') ? args[args.indexOf('--milestone') + 1] : null;
  const selected = plan.issues.filter(
    (i) => !only || (only.toLowerCase() === 'backlog' ? !i.milestone : i.milestone?.startsWith(`${only} `)),
  );
  if (only && selected.length === 0) throw new Error(`No issues match --milestone ${only}`);

  if (args.includes('--dry-run')) {
    const numbers = new Map();
    for (const issue of selected) {
      console.log(`\n=== ${issue.id} · ${issue.title}\nmilestone: ${issue.milestone ?? '(none)'}\nlabels: ${issue.labels.join(', ')}`);
      if (args.includes('--verbose')) console.log(renderBody(issue, numbers));
    }
    return;
  }

  const repo = resolveRepo(args);
  const gh = makeClient(repo, resolveToken());
  const update = args.includes('--update');
  console.log(`\nRepository: ${repo}`);

  // Labels: create missing ones, align colour and description of existing ones.
  const existingLabels = new Map((await gh.all(`${gh.base}/labels`)).map((l) => [l.name, l]));
  for (const [name, [color, description]] of Object.entries(LABELS)) {
    const current = existingLabels.get(name);
    if (!current) {
      await gh.call('POST', `${gh.base}/labels`, { name, color, description });
      console.log(`  + label ${name}`);
    } else if (current.color.toLowerCase() !== color.toLowerCase() || (current.description ?? '') !== description) {
      await gh.call('PATCH', `${gh.base}/labels/${encodeURIComponent(name)}`, { color, description });
      console.log(`  ~ label ${name}`);
    }
  }

  // Milestones, matched by title.
  const milestoneNumbers = new Map((await gh.all(`${gh.base}/milestones?state=all`)).map((m) => [m.title, m.number]));
  for (const m of plan.milestones) {
    if (!milestoneNumbers.has(m.title)) {
      const created = await gh.call('POST', `${gh.base}/milestones`, { title: m.title, description: m.description });
      milestoneNumbers.set(m.title, created.number);
      console.log(`  + milestone ${m.title}`);
    }
  }

  // Existing issues, found by their hidden marker.
  const numbers = new Map();
  for (const issue of await gh.all(`${gh.base}/issues?state=all`)) {
    if (issue.pull_request) continue;
    const found = (issue.body ?? '').match(/<!-- quart-issue-id: (\S+) -->/);
    if (found) numbers.set(found[1], issue.number);
  }

  let created = 0;
  let updated = 0;
  for (const issue of selected) {
    const missingDeps = issue.depends.filter((d) => !numbers.has(d));
    if (missingDeps.length) {
      throw new Error(`${issue.id} depends on ${missingDeps.join(', ')}, which do not exist on GitHub yet. Create earlier milestones first.`);
    }
    const payload = {
      title: `${issue.id} · ${issue.title}`,
      body: renderBody(issue, numbers),
      labels: issue.labels,
      milestone: issue.milestone ? milestoneNumbers.get(issue.milestone) : null,
    };
    if (numbers.has(issue.id)) {
      if (update) {
        await gh.call('PATCH', `${gh.base}/issues/${numbers.get(issue.id)}`, payload);
        updated++;
        console.log(`  ~ #${numbers.get(issue.id)} ${payload.title}`);
        await sleep(1000);
      }
      continue;
    }
    const result = await gh.call('POST', `${gh.base}/issues`, payload);
    numbers.set(issue.id, result.number);
    created++;
    console.log(`  + #${result.number} ${payload.title}`);
    writeFileSync(statePath, JSON.stringify(Object.fromEntries(numbers), null, 2) + '\n');
    await sleep(1000); // stay well under GitHub's limits on content creation
  }
  writeFileSync(statePath, JSON.stringify(Object.fromEntries(numbers), null, 2) + '\n');
  console.log(`\nDone: ${created} created, ${updated} updated, ${selected.length - created - updated} already present.`);
  console.log(`ID → issue number map written to ${relative(root, statePath)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
