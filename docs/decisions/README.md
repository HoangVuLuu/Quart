# Decision records

Short records of decisions that shape the code, so future-you knows why things are the way they are.
The full reasoning for most decisions lives in the spec (`docs/quart-project-spec.txt`, sections 9, 10
and 17); a record here points to it and adds anything the spec does not say.

Add a record when a decision is hard to reverse or would surprise a newcomer. Copy `0000-template.md`,
take the next number, and never edit an accepted record: supersede it with a new one.

| #    | Decision                                               | Status   |
| ---- | ------------------------------------------------------ | -------- |
| 0001 | Record architecture decisions                          | Accepted |
| 0002 | Modular monolith in a single container                 | Accepted |
| 0003 | PostgreSQL on Supabase, Canada Central (Montreal)      | Accepted |
| 0004 | Azure Container Apps, Canada East                      | Accepted |
| 0005 | No live connection in v1                               | Accepted |
| 0006 | Build in vertical slices, generator lab first          | Accepted |
| 0007 | Dependency versions and upgrade policy                 | Accepted |
| 0008 | A new workplace starts with a single owner invitation  | Accepted |
| 0009 | The background tick runs as a short job, not HTTP      | Accepted |
| 0010 | The visual design comes from the design prototype      | Accepted |
