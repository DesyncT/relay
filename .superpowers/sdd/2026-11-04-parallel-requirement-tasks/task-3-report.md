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

## Files changed

- `main.js`
- `requirement-coordinator.js`
- `test-requirement-coordinator.js`
- `test-provider-permissions.js`
- `test-requirement-gate.js`
- `package.json`
- `.superpowers/sdd/2026-11-04-parallel-requirement-tasks/task-3-report.md`
