# Working in this repository

Quart is a shift-scheduling web app for Presotea Montmorency. React frontend in `src/web`, ASP.NET
Core backend in `src`, tests in `tests`.

## Read before you change anything

1. `docs/quart-project-spec.txt` is the single source of truth. Requirements have IDs (FR-, BR-,
   AD-, NFR-). Cite them in commits and pull requests.
2. The work is planned as issues in `docs/issues` and tracked on GitHub. Issue titles start with
   their plan ID (for example M5-06). Cite the ID in commits.

## UI work: the mockups decide

Before building or editing any screen, read `docs/design/mockups/README.md`, open the matching
image in `docs/design/mockups/screens/`, and build to it. Do not work from memory or from the old
prototype for layout. Colours, type, radius and shadows come from the tokens in `docs/design/README.md`
and `src/web/src/styles/index.css`; never hard-code a colour, radius or shadow.

- If a screen is not in the mockups, reuse the nearest pattern and say so in the pull request.
- If a mockup and the spec disagree, follow the "Known conflicts" table in the mockups README. If the
  case is not listed, stop and ask rather than choosing.
- Name the mockup screen IDs (`1a`, `1l`, …) in the pull request description.
- Every string in French and English; phone width 390 px first; taps only (no required dragging).

## Changing a requirement

Edit the spec in place and append to its decision log (section 17). If it changes an issue, change
the plan file in `docs/issues` too, then update the GitHub issue.
