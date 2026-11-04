# Task 4 report — single integration agent and final review

## Changes

- Added `runRequirementIntegration` to `requirement-coordinator.js`. It refuses to start while any actionable assignment is not `passed`, converts persisted base64 patches into Buffers, and passes only passed assignments to one integration callback. Concurrent duplicate calls share the same in-flight promise; a successful integration is not repeated.
- The integration runner persists `integrating`/`retrying`/`passed`/`open` states. Full-check failure prevents review. Final `UNKNOWN` leaves requirements open. Final `FAIL` selects the next route through the existing bounded escalation policy, runs integration/checks again, and receives a fresh review. Exhaustion keeps assignments open and saves the final concrete findings.
- Wired `main.js` to use Task 2's `applyTaskChanges` for passed patches and preserve the active project as the integration target. One selected integrator reconciles task outputs and overlaps; retries do not reapply already applied patches and receive previous reviewer findings. The full configured `npm test` command must exit successfully before independent review starts.
- Added `reviewIntegratedResult` in `main.js`. It calls configured provider reviewers with native read-only flags, inspects current project files and all requirements/preservation constraints, validates structured verdicts, and requires every reviewer to PASS. The final review is repeated after each stronger-route retry.
- Only final PASS marks checklist requirements done. Failed/incomplete task assignments skip integration, leave requirements open, and clean up their temporary workspaces. Existing no-assignment/manual wrap-up code was not changed.
- Added coordinator tests for early integration prevention, one integrator across passed patches, Buffer conversion, exclusion of non-actionable assignment data, duplicate-call prevention, check/review gates, stronger-route retry/fresh review, and exhausted concrete findings.

## Verification

- Confirmed the worktree started at requested base `9cf96ae8eacb590d5e33970e60a1c8c2508c5b0e`.
- `node test-requirement-coordinator.js` — passed.
- `npm test` — passed all existing suites and the extended coordinator suite.
- `node --check main.js` — passed.
- `node --check requirement-coordinator.js` — passed.
- `git diff --check` — passed. Workspace fixture tests emit expected Git warnings/errors while testing conflict and non-Git fallback cases; the suite passes.

## Review notes / limits

- The integrated behavior is protected by an injected coordinator helper test suite; provider invocation and Electron `main.js` behavior are covered by syntax checks and code inspection, not a live-provider end-to-end run.
- Full checks are considered successful when the configured `npm test` script exists and the app's `run()` helper resolves it with exit code zero. Projects without a test script remain open with a concrete check-unavailable finding.
- The configured reviewers are called using provider-native `readonly:true` and `safeReview:true`; when alternate providers are available, the integration provider is excluded from the final reviewer set. If only one provider is available, it receives a separate read-only reviewer call.
