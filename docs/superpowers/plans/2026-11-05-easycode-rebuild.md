# EasyCode Rebuild Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Turn vague requests into adaptive button questions, an approved change summary, and a verified fix with one worker at a time.

**Architecture:** Add a persisted request lifecycle and validated discovery responses. Route all EasyCode actions through it, reusing provider adapters, worker settings, question controls and isolated workspaces. Disconnect legacy automatic voting and requirement-per-worker dispatch from EasyCode.

**Tech Stack:** Existing Electron, CommonJS JavaScript, Node assertions and renderer harness; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-05-easycode-rebuild-design.md`

## Global Constraints

- Exactly one worker at a time; retain configured worker providers, models, effort and task limits.
- One adaptive question at a time; optional custom answer and “Not sure—investigate for me.”
- Discovery is read-only; product choices always reach the user, including in Auto modes.
- Show an editable change summary and require “Fix it” before edits.
- One initial implementation and one targeted repair; stronger routes require explicit user choice.
- Failed or missing verification blocks completion. Preserve dirty files and unrelated workbench.css changes.
- Keep Code behavior and existing sessions readable; no new dependencies or unrelated redesign.

## Review Focus

- Double clicks and late provider results must not advance superseded requests.
- Restart during editing must block for review rather than rerun changes.
- Malformed discovery output must stop after one repair, preserving answers.
- Existing dirty files and integration conflicts must retain recoverable work.
- Configured worker routes and Auto settings must not bypass scope confirmation.

### Task 1: Restore a trustworthy test baseline

**Files:** `test-requirement-subagents.js`, existing test harnesses as needed.

- [x] Reproduce `npm test`; record failures before changing application behavior.
- [x] Replace brittle VM source slicing at the reviewer callback boundary with a balanced extraction or callable exported seam; preserve actual behavioral assertions.
- [x] Run `npm test` and record remaining baseline failures explicitly.

### Task 2: Persist the request lifecycle

**Files:** Create `easycode.js`, `test-easycode.js`; modify `sessions.js`, `package.json`.

**Interfaces:** `createRequest(originalRequest)`, `applyAnswer(request, {requestId, questionId, answer})`, `confirmRequest(request, revision)`, `recoverRequest(request)` return serializable records or reject invalid transitions. Records follow the spec's IDs, revision, history, scope, checks, attempts and evidence fields.

- [x] Write failing tests for confirmation revision, duplicate/stale answers, cancellation, superseded responses and restart recovery.
- [x] Implement state transitions for inspecting/questioning/ready/running/verifying/succeeded/blocked/cancelled; confirmation is the sole gate into running.
- [x] Persist request records through existing session storage; recover editing as blocked and legacy active records as needing review.
- [x] Run `node test-easycode.js`; wire it into `npm test`.

### Task 3: Replace discovery and question controls

**Files:** `easycode.js`, `main.js`, `index.html`, `turn.js`, `test-question-controls.js`, `test-easycode.js`.

**Interfaces:** `validateDiscovery(value)` accepts one structured question or ready summary; main-process answer/confirm/edit/cancel handlers carry session, request, revision and question identities.

- [x] Add failing tests for branching answers, cumulative scope, malformed output with one repair, complete requests, and material ambiguity at the five-question soft limit.
- [x] Replace EasyCode discovery prompts and legacy control-tag handoffs with one read-only configured discovery route and compact accumulated context. Never let discovery spawn voters or editing workers.
- [x] Render stored questions using existing buttons and custom answer controls; support investigation, answer editing, summary, Fix it and Cancel without model calls for local actions.
- [x] Ensure stale controls cannot submit in another session and Auto modes cannot answer product questions.
- [x] Run lifecycle and question-control tests, including restart/session-switch cases.

### Task 4: Execute one scoped worker with bounded repair

**Files:** `main.js`, `requirement-coordinator.js`, `requirement-workflow.js`, `worker-routing.js`, `requirement-recovery.js`, `requirement-retry.js`; corresponding tests.

**Interfaces:** EasyCode execution consumes the confirmed summary, preservation constraints, file scope and acceptance checks as one task; the coordinator receives concurrency `1` and a maximum of two automatic implementation attempts.

- [x] Add failing tests proving peak worker concurrency is one, configured routes remain intact, no worker per acceptance criterion, and exhausted FAIL/UNKNOWN stays blocked.
- [x] Disconnect legacy EasyCode splitting, automatic escalation, auto-debug retries and passed-with-notes behavior. Keep manual stronger-route retry behind explicit buttons.
- [x] Reuse workspace baseline/isolation and integration utilities; reject unsafe scope or conflicts, retain failed work and guard integration against cancellation.
- [x] Persist actual command evidence separately from reviewer prose; require passing relevant checks and scoped diff review before success, including the integrated result.
- [x] Test failed/missing commands, pre-existing failures, dirty files, conflicts, cancelled processes and repeated retry actions.
- [x] Run coordinator, workspace, integration, recovery and routing tests.

### Task 5: Verify the complete user flow

**Files:** `test-renderer.js`, `test-code-mode.js`, relevant new workflow tests and README guidance.

- [x] Add renderer interaction coverage for question choice, custom answer, edit/back, confirmation, running, blocked verification and explicit retry.
- [x] Exercise “fix” through two distinct answer branches with stubbed provider responses; assert no edits before confirmation and one execution for duplicate confirmation clicks.
- [x] Run `npm test` and `npm run test:ui`; inspect actual rendered controls and progress states. Record unavailable live-provider validation honestly.
- [x] Review the final diff against the approved spec, verify worker settings remain intact, and report results and limitations.
