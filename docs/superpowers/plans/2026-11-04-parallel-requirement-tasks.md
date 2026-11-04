# Parallel Requirement Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement and review each task, then review the full branch.

**Goal:** Assign every actionable requirement a model/effort-specific task, run independent tasks concurrently, review each task, then integrate once and independently review the combined result.

**Architecture:** Add a small pure workflow module for validated assignments, concurrency, and bounded escalation. Add an isolated workspace helper for Git projects and a safe shared-folder fallback. Adapt `main.js` to coordinate task workers, per-task reviews, and one final integrator; persist status in session requirement data and render it in the existing checklist.

**Tech Stack:** Electron main process, Node.js built-ins (`fs`, `path`, `child_process`, `os`), existing CLI routing, vanilla DOM, Node assert-based tests.

**Spec:** `docs/superpowers/specs/2026-11-04-requirement-task-orchestration-design.md`

## Global Constraints

- Apply this workflow only to Supercode tasks after the requirements checklist is complete.
- Run no more than three worker tasks concurrently.
- Keep normal chat, the requirements interview, and one-agent workflow unchanged.
- Persist assignments and review state per session; interrupted work never becomes passed.
- Keep the existing full-access execution policy for workers and read-only reviewer instructions.
- Never discard, reset, or overwrite the user's tracked, untracked, or newly edited files.
- Escalation is finite and must choose a strictly stronger available model/effort.
- Only final combined review success may mark all mapped requirements complete.
- Add no runtime dependency, automatic Git push, or automatic release.

## Review Focus

- Dirty staged and unstaged content must be the task baseline and remain untouched by setup/cleanup.
- New untracked files must appear in worker snapshots and survive integration.
- Two tasks that touch the same path must not write to it concurrently in shared-folder fallback mode.
- Reviewer `UNKNOWN`, timeout, provider outage, or missing test evidence must never be treated as `PASS`.
- A task or integration repair exhausted at the strongest route must remain visibly blocked with requirements open.

---

### Task 1: Assignment and escalation policy

**Files:**
- Create: `requirement-workflow.js`
- Create: `test-requirement-workflow.js`
- Modify: `package.json`

**Interfaces:**
- `createAssignments(items, plan, routes, availableProviders)` returns validated assignments with stable IDs, requirement indices, task text, provider/model/effort, file ownership, and initial `queued` status.
- `nextEscalation(assignment, routes, availableProviders)` returns the next strictly stronger compatible route or `null` when exhausted.
- `readyAssignments(assignments, runningLimit)` returns queued assignments whose declared file ownership does not overlap running assignments, up to the remaining concurrency limit.
- `allTasksPassed(assignments)` returns true only when every actionable assignment is `passed`.

- [ ] **Step 1: Write failing tests** for one-to-one actionable requirement coverage, preservation-only constraints, invalid/duplicate plan entries, exact route validation, provider overrides, and bounded strictly stronger escalation.
- [ ] **Step 2: Run `node test-requirement-workflow.js`** and confirm it fails because the module/API is absent.
- [ ] **Step 3: Implement the minimal pure workflow module** using `routing.js` route definitions; reject invalid provider/model/effort combinations rather than silently inventing them.
- [ ] **Step 4: Add the test to `npm test` and run it**; confirm invalid plans fall back to a single safe coordinator-owned task rather than dropping requirements.

### Task 2: Safe task workspaces and change transfer

**Files:**
- Create: `requirement-workspaces.js`
- Create: `test-requirement-workspaces.js`
- Modify: `package.json`

**Interfaces:**
- `createTaskWorkspaces(projectPath, sessionId, assignments)` returns `{ mode, base, tasks, cleanup }`; `mode` is `worktree` or `shared`.
- Each worktree records the captured baseline commit/ref and assigned task path.
- `collectTaskChanges(workspace)` returns reviewed-scope paths and a binary-safe change patch against the captured baseline.
- `applyTaskChanges(projectPath, changes)` applies only task patches and returns conflicts without destructive reset.
- `cleanupTaskWorkspaces(workspaces)` removes only paths/ref names created by this workflow.

- [ ] **Step 1: Write failing tests** using temporary Git repositories for clean, dirty tracked, staged/unstaged, untracked, overlapping, and newly changed-during-run cases; add a non-Git fallback and cleanup-containment case.
- [ ] **Step 2: Run `node test-requirement-workspaces.js`** and confirm the safety cases fail before implementation.
- [ ] **Step 3: Implement Git snapshot/worktree creation and patch transfer** without changing the user's current branch, index, or working tree. If any safe preflight step fails, choose shared-folder mode and serialize overlapping paths.
- [ ] **Step 4: Run the workspace suite** and confirm user content survives successful integration, conflict, cancellation, and cleanup.

### Task 3: Coordinator, parallel workers, and per-task reviews

**Files:**
- Modify: `main.js`
- Modify: `sessions.js` only if a narrowly scoped persistence method is required
- Create: `test-requirement-coordinator.js`
- Modify: `package.json`

**Interfaces:**
- `startRequirementWorkflow(sid, owner, trigger, epoch)` plans assignments from the completed checklist and persists them before any worker starts.
- `pumpRequirementTasks(sid)` starts at most three eligible assignments, respecting path overlap in shared-folder mode.
- `runRequirementTask(assignment)` executes using its explicit provider/model/effort and task workspace, then records exact changed paths and worker evidence.
- `reviewRequirementTask(assignment)` runs the configured independent reviewers, executes relevant checks, and returns only structured `PASS`, `FAIL`, or `UNKNOWN` plus evidence.
- Task transitions are persisted and emitted through `reqs:update` with assignment model, effort, status, progress, review attempts, and blocker.

- [ ] **Step 1: Write failing scheduler tests** proving assignment persistence precedes execution, concurrency never exceeds three, disjoint tasks overlap, and shared-folder overlapping paths serialize.
- [ ] **Step 2: Write failing review tests** proving each completed task receives independent reviewer evidence; UNKNOWN/provider failure blocks integration; FAIL asks the same owner to retry at the next stronger route; exhausted tasks stay open.
- [ ] **Step 3: Run `node test-requirement-coordinator.js`** and confirm the missing coordinator/scheduler behavior fails.
- [ ] **Step 4: Implement the coordinator and worker runner** by adapting existing `seatRun`, `spawnSubs`, activity tracking, and session persistence. Pass explicit route overrides through the normal CLI argument construction so displayed model/effort matches the effective invocation.
- [ ] **Step 5: Implement per-task review** as a separate read-only call with task-only request context, current task workspace, relevant test command/evidence, and mandatory structured verdict fields.
- [ ] **Step 6: Run the coordinator suite plus `npm test`** and confirm one task's failure does not prevent unrelated tasks from finishing, while no failed task enters integration.

### Task 4: Single integration agent and final review/escalation

**Files:**
- Modify: `main.js`
- Modify: `test-requirement-coordinator.js`

**Interfaces:**
- `integrateRequirementTasks(sid, assignments, trigger, epoch)` is called once, only after all actionable assignments pass.
- `reviewIntegratedResult(sid, integrator, changes, epoch)` runs configured reviewers and the completion gate over the combined result.

- [ ] **Step 1: Write failing tests** proving one integrator is selected after all PASS, no integrator runs early, only passed patches are supplied, and full checks plus independent final review are required.
- [ ] **Step 2: Write failing escalation tests** proving final FAIL routes repair to a stronger integrator and starts a fresh review round; reaching the route ceiling leaves requirements open and reports concrete findings.
- [ ] **Step 3: Run the targeted coordinator tests** and confirm the current batch-wide wrap-up does not satisfy the new gates.
- [ ] **Step 4: Implement the single integration stage**: apply or reconcile task outputs in the active project, resolve overlaps, run full checks, then invoke the combined review. Keep existing manual wrap-up behavior for tasks without assignments.
- [ ] **Step 5: Run `npm test`** and confirm requirements are ticked only after final integration review passes.

### Task 5: Requirement assignment UI and persisted recovery

**Files:**
- Modify: `index.html`
- Modify: `workbench.css`
- Modify: `test-renderer.js`

- [ ] **Step 1: Add failing renderer assertions** for queued, running, reviewing, passed, escalated, and blocked items, including model/effort and long names at compact width.
- [ ] **Step 2: Run `npm run test:ui`** and confirm the current requirement list omits assignment metadata.
- [ ] **Step 3: Render compact assignment details inside each existing requirement row** using restrained labels for worker, model/effort, progress, review, and blocker; preserve empty-list hiding and the existing expanded state.
- [ ] **Step 4: Test reload recovery** by reopening a session with saved assignment states and asserting no interrupted task renders as passed.
- [ ] **Step 5: Run `npm run test:ui`** and inspect desktop/compact screenshots for clipping and list readability.

### Task 6: End-to-end verification and release handoff

**Files:**
- Modify: `README.md` only if user-facing workflow documentation is needed
- Modify: the applicable test files from Tasks 1–5

- [ ] **Step 1: Run `node --check main.js`, `node --check requirement-workflow.js`, and `node --check requirement-workspaces.js`.**
- [ ] **Step 2: Run `npm test` and `npm run test:ui`;** resolve all regressions before declaring completion.
- [ ] **Step 3: Run workspace fixtures and confirm the main repo remains on its original branch with pre-existing staged/unstaged/untracked content preserved.**
- [ ] **Step 4: Inspect the combined diff and confirm no worktree/ref/temp directories remain after success, failure, cancellation, or End task.**
- [ ] **Step 5: Report the verified behavior and unresolved safety limitations; package a release only if the user asks for one.**
