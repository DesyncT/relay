# Task 3 Report: Coordinator, parallel workers, and per-task reviews

## Delivered

- Added `requirement-coordinator.js`, an injectable scheduler that persists the initial assignment list synchronously before launching work, caps concurrency at three, tracks task progress/evidence, and emits every persisted transition.
- Shared-folder scheduling serializes overlapping declared path ownership. Worktree tasks can run concurrently because each has an isolated workspace.
- Each task runs independently, records changed paths and worker evidence, then receives the configured number of independent read-only reviewer calls. The coordinator runs a package `test` script when one is present and includes its output as review evidence.
- `PASS` marks only that task passed. `UNKNOWN` and worker/provider failures block that task. `FAIL` retries through the next stronger configured route under the same owner; an exhausted failure remains open.
- Wired completed Supercode checklists to planning, task workspace creation, assignment persistence, worker execution, and structured review. Normal one-agent checklist flow is unchanged. Assignment route overrides carry the explicit provider/model/effort through the existing CLI argument builder.
- Assignment workspace metadata, exact changed paths, base64 patch data, review attempts, reviewer evidence, status, progress, and blockers persist under the session requirements record for the separate integrator task.
- Added the coordinator suite to `npm test` and adjusted the requirement gate test harness for the newly exercised Supercode guard.

## Validation

- `node test-requirement-coordinator.js` — passed.
- `node --check main.js` and `node --check requirement-coordinator.js` — passed.
- `npm test` — passed all suites, including the new provider permission and coordinator tests.
- The worktree suite prints Git LF/CRLF warnings and expected negative patch-application output while validating safety cases; the suite completed successfully.

## Integration boundary and follow-up

This task does not apply worker patches to the project checkout or declare the overall workflow complete. Task 4 should consume only assignments whose status is `passed`, convert the persisted base64 patch into a `Buffer`, validate the recorded paths/scope/baseline with `applyTaskChanges`, and keep failed, blocked, or open assignments out of integration. Task workspaces are intentionally retained for that handoff.

## Review fix round

- Reviewer CLI construction uses provider-native read-only permissions: Claude Code receives `--permission-mode plan`; Codex receives `--sandbox read-only --ask-for-approval never`. Worker calls continue through the existing full-access permission path. See the [Claude CLI permission mode reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage) and [Codex CLI sandbox and approval options](https://developers.openai.com/codex/cli/reference).
- Planned assignments require a normalized, nonempty repository-relative file scope. Missing, empty, repository-wide, or traversal scopes preserve checklist coverage as coordinator-owned assignments marked `blocked` with `missing-file-scope`; those assignments receive no task workspace and never reach the worker.
- The task workspace collector refuses empty scope, and the integrator helper rejects nonempty patches without an explicit scope.
- Added provider permission tests and regression assertions for unsafe scopes, blocked scheduler behavior, collection refusal, and integration refusal.

## Restart recovery fix round

- Persisted task workspace ownership-marker metadata on every assignment and added `validTaskWorkspace` checks for temp-root ownership, marker agreement, assignment path membership, baseline fields, isolation mode and scope.
- Startup reconstructs requirement assignments directly from persisted state, without rerunning the planner. Interrupted `running` tasks restart as queued in their saved workspace; interrupted `reviewing` tasks resume at review using saved worker evidence. Neither state is treated as passed.
- Missing or invalid active workspaces become visible `open` assignments with `workspace-unavailable`; recovery never substitutes the active project path.
- Integration status is persisted before an integrator starts. Startup recognizes completed integration and marks a partially saved checklist complete, while interrupted/exhausted integration stays open and is never launched a second time.
- Legacy sessions without assignments retain lane resume. Resume triggers bypass the regular-follow-up guard and are scheduled before the persisted user queue; the queue remains intact until resumed work settles.
- Added recovery, workspace validation, and restart queue-order tests to `npm test`.

## Files changed

- `main.js`
- `requirement-coordinator.js`
- `requirement-recovery.js`
- `test-requirement-coordinator.js`
- `test-provider-permissions.js`
- `test-requirement-recovery.js`
- `test-resume-queue.js`
- `test-requirement-gate.js`
- `package.json`
- `.superpowers/sdd/2026-11-04-parallel-requirement-tasks/task-3-report.md`

## Verification

- `npm test` passed, including requirement recovery and resume queue ordering regressions.
- `npm run test:ui` passed; dynamic arrow remained clear of the busy status and requirement bar.
- Syntax checks for changed JavaScript modules and git diff --check passed.


## Workspace retention and validation review fix

- Open, blocked, cancelled, or failed-integration tasks retain their owned temporary workspaces for inspection and recovery. Cleanup is eligible only when every actionable assignment passed and integration passed.
- Ownership markers now record task scope, assignment ID, Git repo, baseline commit/ref, and workspace mode. Recovery compares normalized saved scope to the assignment and validates the marker, actual Git common repository, baseline object/ref, and worktree registration.
- Added regressions for assignment/workspace scope tampering, stale baseline commit/ref, repo rebinding, and cleanup eligibility.
- Verification: 
pm test, 
pm run test:ui, syntax checks, and git diff --check passed.

