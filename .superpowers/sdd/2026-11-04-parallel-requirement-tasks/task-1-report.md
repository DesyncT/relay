# Task 1 implementation report: assignment and escalation policy

## TDD sequence

1. Added `test-requirement-workflow.js` before the implementation.
2. Ran `node test-requirement-workflow.js`; it failed as expected because `requirement-workflow.js` did not exist (`MODULE_NOT_FOUND`).
3. Implemented the pure workflow module and reran the focused test successfully.
4. Added the test to `npm test`; the full suite passed, including prompt caching, requirement gate (27 cases), question controls, interview routing/waiting, and requirement workflow.
5. Ran `git diff --check`; no whitespace errors remain.

## Implementation

- `createAssignments` maps actionable checklist items to deterministic IDs and preserves checklist index, task, provider/model/effort, declared file ownership, and queued status.
- Preservation-only entries are excluded. Missing or duplicate proposals produce a coordinator-owned fallback for every uncovered actionable requirement, using only an available provider's configured coding route. These coordinator-owned tasks are scheduled serially.
- A proposal with an invalid provider, task, model, or effort is rejected. A valid provider/model/effort override is accepted only when it exactly matches that provider's configured coding route and the provider is available.
- `nextEscalation` searches available configured coding routes in a finite known model/effort ordering and returns only a strictly stronger tier; it returns `null` at exhaustion.
- `readyAssignments` respects the running limit and avoids overlapping declared file ownership. `allTasksPassed` requires every assignment to have passed.
- No runtime dependencies were added.

## Limits / concerns

Model strength ordering is intentionally explicit for the known provider models in `routing.js`; unrecognized configured models can be assigned when their route matches exactly, but are not treated as an escalation candidate because their relative strength cannot be established safely. The test schema follows the task brief's `requirementIndex`, `task`, `provider`, `model`, `effort`, and `files` fields.

## Files

- `requirement-workflow.js`
- `test-requirement-workflow.js`
- `package.json`

## Review fixes and regression evidence (2026-11-04)

### Changes

- `createAssignments` now validates every planner entry before constructing assignments. Entries that are null/malformed, have a non-integer index, reference an out-of-range index, or target a non-actionable/preservation item throw an explicit invalid-plan error instead of being silently ignored.
- Expanded tests to assert that duplicate proposals produce coordinator-owned fallbacks for every affected actionable requirement, invalid indices and malformed entries are rejected, and both `type: 'preservation'` and `kind: 'constraint'` items are excluded.
- Reworked scheduler assertions to include a running assignment and queued work with case-insensitive overlapping paths. The overlap is withheld while unrelated queued work is scheduled.

### TDD and verification

- RED: before the validation fix, `node test-requirement-workflow.js` failed with `AssertionError [ERR_ASSERTION]: Missing expected exception: out-of-range plan entries are rejected`.
- GREEN: after the fix, `node test-requirement-workflow.js` printed `requirement workflow tests passed`.
- Full suite: `npm test` exited successfully and printed the existing prompt caching success (5 cases), requirement gate success (27 cases), question controls success, interview routing/waiting success, and `requirement workflow tests passed`.
- `git diff --check` exited successfully with no whitespace errors.
