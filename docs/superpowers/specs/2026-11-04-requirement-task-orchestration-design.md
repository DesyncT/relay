# Requirement Task Orchestration Design

## Goal

When a requirements checklist is ready in Supercode, Relay should assign each actionable requirement to a worker with an explicit provider, model, and reasoning effort; work on independent tasks concurrently; review and test every task; then let one integrator reconcile the passed work and obtain a final independent review.

## Current behavior

- `session.reqs.items` stores requirement text, completion, and a small amount of progress metadata.
- Main agents choose work from the checklist and may emit up to three `[sub:]` tasks. Those subagents use the owner's `other` route, execute in the same working directory, and are not tied to individual requirements.
- `reviewResult` reviews the accumulated change set after wrap-up, not each requirement result. It may invoke multiple reviewers, but the review prompt does not require tests for each requirement.
- Model and reasoning effort are configured by provider and phase in `routing.js`; the subagent path currently uses a fixed phase.

## Chosen design

Use a per-session task coordinator, backed by persisted assignments, and reuse the existing worker limit of three. Each actionable checklist item gets one assignment with the linked requirement index, a concise task, assigned provider, exact model and effort, status, changed paths, review attempts, escalation tier, and result summary. Preservation constraints and exclusions remain global inputs to worker prompts and reviewer checks; they are not coded as fake implementation jobs.

Before workers start, one coordinator groups work only when requirements are tightly coupled, identifies likely file overlap, and assigns disjoint paths where practical. It chooses a provider/model/effort from available providers and the configured coding routes: routine isolated changes use the lower suitable route, and broad or risky changes use the strongest suitable configured route. The assignment is persisted and shown beside its requirement so the user can see who is doing it, with which model/effort, and whether it is queued, working, under review, passed, or blocked. The scheduler runs up to three independent assignments at once and queues the rest; it never asks the user a new question for each checklist item.

Workers report their result and changed paths against their assigned requirement. When a worker finishes, the configured number of reviewers independently read the task and current result, run the most relevant available checks, and return PASS, FAIL, or UNKNOWN with concrete evidence. Each task must pass before integration. FAIL returns to that task's worker with the next stronger available model/effort; if that model also cannot complete or pass it, escalate again through the available stronger tiers up to a bounded maximum. UNKNOWN never counts as a pass. A task that cannot be completed remains open with its blocker explained; Relay does not claim all requirements passed.

After all actionable tasks pass review, exactly one integrator owns the integration stage. In an eligible Git project, workers use isolated workspaces based on the same captured project snapshot; the integrator applies their reviewed changes to the active project and resolves conflicts. The snapshot must include the user's existing tracked and untracked work without committing or discarding it. If isolated workspaces cannot be prepared safely (for example, no usable Git repository or snapshot failure), Relay falls back to the existing shared project directory, assigns disjoint file ownership, and serializes tasks with overlapping paths. The integrator still performs one reconciliation pass after the workers finish.

The integrator runs full project checks and requests the configured independent reviewers plus the existing completion gate to review the combined changes. If the final review fails, a stronger integration model repairs the combined result and submits it to a fresh final review. Retries are bounded by the available stronger model tiers; unresolved failures stay visible and do not mark requirements complete. Only after final review passes does Relay mark the linked requirements done and produce the final summary.

## Model assignment and escalation

- The coordinator records the concrete provider, model, and effort before starting each worker; status updates and task history show these values.
- Assignment respects available providers, model connections, existing CLI argument overrides, and configured coding routes. When a user's explicit CLI argument overrides model or effort, Relay reports the effective override rather than claiming it selected a different value.
- The starting tier reflects task complexity and risk, not a single global setting. Low-cost routes are preferred for small, well-bounded tasks; higher reasoning effort and stronger configured models are used for cross-cutting, ambiguous, or high-impact work.
- Each failed worker review retries the same task with a strictly stronger available route. Each final integration failure escalates the integrator similarly. Both loops have a finite tier/attempt cap and retain the failed evidence.
- A provider failure unrelated to task quality (for example, unavailable credentials or rate limits) is reported distinctly from a model-quality failure and does not falsely count as a review rejection.

## Data flow and interfaces

1. Requirements interviewer completes the checklist as it does today.
2. Coordinator reads the active checklist and project context, writes the complete assignment set and chosen routes into session state, and displays assignments.
3. Scheduler starts up to three eligible assignments, persisting status/progress and changed-path evidence.
4. Each completed assignment transitions to review. Independent reviewers return a structured verdict and evidence tied to that assignment.
5. Failed/unknown assignments stay in the task loop or remain blocked; only passed assignments enter the integration set.
6. One integrator reconciles the complete passed set, runs the full checks, and invokes a final review. Stronger integration retries are bounded.
7. Successful final review marks mapped requirements complete and closes the task using the existing summary path.

All task and review state is per session and persisted, so the UI can recover it after a renderer reload. A process restart must mark interrupted runs as interrupted/queued safely, never as passed. Ending or clearing a task stops its workers and reviewers and cleans up temporary workspaces without removing the user's project files.

## Failure handling and safety

- A task cannot be marked passed without a PASS verdict tied to current evidence and at least one relevant successful check where the project exposes a runnable check.
- Reviewers inspect the current assigned workspace, not only worker claims. A reviewer unable to verify returns UNKNOWN.
- Workspaces are captured from the project state at assignment time. Existing uncommitted changes are baseline content and are never included in worker-owned diffs unless a task explicitly modifies them.
- Integration applies only reviewed worker changes. Conflicts or unexpected modifications stop integration for coordinator reconciliation; no force-reset, destructive checkout, or automatic overwrite of new user edits.
- Existing full-permission policy stays in effect for workers. Review roles remain read-only by instruction and must not modify product files.
- The three-worker cap remains the concurrency limit; there is no new unbounded fan-out or per-requirement reviewer swarm.

## UI behavior

The current requirement list becomes the task board without adding a separate dashboard. Each item can show a compact assignment row (worker, model/effort, state, and review result). Queued tasks show their assignment before they run; review failures and escalations remain visible on the relevant item. The existing expandable list and empty-list behavior remain intact. Long model names may be shortened visually but remain available in a tooltip/accessibility label.

## Scope and compatibility

- This pipeline applies to Supercode tasks with a generated requirements checklist. Ordinary conversation, direct one-off chats, and the one-agent workflow keep their current behavior.
- The requirements interview remains one question at a time; parallelism starts only after the complete checklist is published.
- Existing subagent cards and manual `[sub:]` behavior remain available where they do not conflict with an active coordinator assignment.
- Existing final review remains the combined-change gate, adapted to follow the per-task gates and single-integrator stage.
- No external service, new runtime dependency, automatic push, or automatic release is added by this design.

## Validation

- Unit tests cover assignment coverage (including preservation-only requirements), model/effort selection and CLI overrides, bounded escalation, review verdict handling, and status transitions.
- Scheduler tests prove up to three independent tasks run concurrently, overlapping file tasks serialize in fallback mode, and integration waits for every required PASS.
- Workspace tests cover clean Git projects, dirty tracked/untracked baselines, non-Git fallback, cleanup, cancellation, and preservation of newly edited user files.
- Review tests prove each task gets independent evidence-based checks, UNKNOWN blocks integration, failures route to stronger models, and combined changes get one final independent review.
- Renderer checks verify per-requirement assignment, model/effort, queue/running/review/escalation/blocked states, and compact widths.
- Existing `npm test` and `npm run test:ui` suites stay green.

## Acceptance criteria

1. Every actionable checklist requirement has a persisted, visible assignment with a concrete provider, effective model, and effort before work begins.
2. Independent assignments execute concurrently up to three; later assignments queue, and overlapping paths do not write concurrently in shared-directory fallback mode.
3. Every assignment receives an independent reviewer verdict and relevant test evidence before integration.
4. A failed assignment is retried by its owner at a stronger available model/effort; retries stop at a finite configured-route tier ceiling and retain an explicit blocker if unresolved.
5. One integrator reconciles only passed task changes and runs full checks after all assignments pass.
6. Failed final integration review triggers a stronger integration repair and fresh review, with a bounded retry count.
7. Requirements are marked complete only after the combined final review passes; blocked, unknown, skipped, or failed items remain open.
8. User modifications present at the captured baseline or made later are not discarded by task workspace setup, integration, cancellation, or cleanup.
9. Non-Supercode and normal conversation paths are unchanged.
