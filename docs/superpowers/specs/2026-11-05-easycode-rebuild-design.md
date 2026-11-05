# EasyCode: adaptive questions and reliable execution

## Intent

The user wants EasyCode rebuilt into a cheap, fast guide that turns vague requests such as “fix” into exactly the desired change. Most interaction should work through buttons. Each next question must use the previous answers and project evidence. Success means delivering a verified change, preserving unrelated work, and reporting failure honestly.

## Selected approach

Replace EasyCode orchestration with one explicit request lifecycle, while retaining provider adapters, the Code workflow, session storage, and usable existing question controls. Patching prompts alone leaves competing execution paths intact. Rewriting the entire Electron application adds unrelated risk. Replace the guided workflow end to end instead.

## User flow

1. A request starts a read-only inspection of relevant project structure and available evidence. “Fix” is a valid starting request; no detailed written prompt is required.
2. Show one short question with two to four distinct buttons, plus an optional custom answer. Ask what area is affected before asking how it should behave. Offer “Help me find it” when the target is unknown. Never invent observed errors or claim to have inspected unavailable evidence.
3. Generate each next question from the original request, cumulative answers, and inspection results. For example: Fix → Login → Cannot sign in → Returns to login screen. A different answer follows a different branch. Do not use a fixed questionnaire or ask resolved questions again.
4. Stop asking when target, desired outcome, preservation constraints, and observable acceptance checks are sufficiently clear. A default soft limit of five questions exposes “Show the fix summary” and “Keep narrowing it down”; it must not silently resolve material ambiguity.
5. Show a concise editable summary of what will change, what must be preserved, and how success will be checked. Buttons: “Make this change”, “Change an answer”, and “Cancel”. Small, already precise requests can reach this summary immediately.
6. After confirmation, execute the scoped change, run relevant checks, and report the actual outcome. Show changed files, check results, and any unresolved issue. A completed process is not proof of a successful fix.

Assumption: one final confirmation of the concrete change is useful to prevent accidental edits. Discovery answers themselves never authorize coding. User product preferences always reach the user, including when automatic execution settings are enabled.

## State and boundaries

Persist an EasyCode request record with a unique request ID, revision, lifecycle state, original request, ordered question/answer history, inspection summary, acceptance checks, confirmed revision, attempts, changed paths, and verification evidence. States: inspecting, questioning, ready, running, verifying, succeeded, blocked, cancelled. Only the confirmed revision can enter running. Late results from cancelled or superseded requests are ignored. Button submissions carry request and question IDs; duplicate submissions are idempotent and stale submissions cannot advance the request.

The question engine produces validated structured questions or a ready summary. Invalid output gets one repair attempt, then a visible recoverable error. It cannot edit files. The executor consumes the confirmed summary and cannot silently broaden it. A material new scope question pauses work and returns to the user. Session switching, restart, and resume preserve the correct request and pending question; in-flight editing is never blindly rerun after a crash.

## Cost and execution

Use one configured inexpensive provider for discovery, one model call per newly generated question, compact accumulated context, and no voting panel or teammate debate. Local state changes, button submission, cancellation, and redisplaying stored questions require no model call. Provider availability comes from existing adapters; no new model names or pricing assumptions are required.

Use one worker for the confirmed change by default. Retain internal splitting only for demonstrably independent, disjoint file scopes where it reduces work. Do not assign a worker to every acceptance criterion. Default automatic budget: one initial implementation attempt, one targeted repair attempt, and at most one stronger-route implementation attempt. No route cycles or unbounded review loops. Show attempt counts and available usage data; do not invent currency totals when adapters lack pricing data. Exhaustion produces a blocked result with explicit retry controls.

## Preservation and verification

Record the workspace baseline and preserve existing dirty files. Use existing isolated workspaces where safe; if isolation or integration cannot preserve the baseline, block with an actionable explanation. Do not reset, discard, or overwrite user changes. Integrate only scoped changes, check conflicts, and verify the integrated result. Retain recoverable work after a failed attempt.

Use actual command results and scoped diff inspection as evidence. Baseline failures remain distinguishable from introduced failures. Relevant failing checks block success. Missing verification yields an unverified blocked outcome, never a pass. Reviewer prose cannot override a failed command. UI behavior needs a renderer interaction check when applicable; source inspection alone cannot establish visual correctness. Cancellation stops active child processes and prevents subsequent integration.

## Repository integration

Trace and replace EasyCode branches in main.js, requirement discovery/dispatch, automatic voting, coordinator completion, retry/recovery, and renderer question handling in index.html/turn.js. Reuse provider launchers, routing, sessions, and safe workspace utilities where their contracts fit. Consolidate active EasyCode execution behind the new lifecycle; remove or disconnect superseded paths so legacy handoffs cannot start a second run. Keep Code behavior and existing sessions readable. Legacy in-progress EasyCode records are shown as needing review rather than automatically dispatched under new semantics. Preserve the existing unrelated workbench.css modification.

## Acceptance evidence

- Starting with “fix” reaches a useful project-grounded question without edits.
- Different button answers produce different relevant follow-ups; all earlier answers remain in the final scope.
- A complete request skips unnecessary questions, while unresolved material ambiguity cannot auto-start work.
- Product choices never trigger AI voters; default discovery uses at most one model call per question, excluding one malformed-output repair.
- Duplicate and stale clicks, cancellation, restart, and session switching cannot execute a request twice or apply a superseded answer.
- Confirmation executes the exact summary revision, with one worker by default and finite retries.
- A failing or unavailable check cannot become succeeded after retry exhaustion.
- Integration conflicts and pre-existing local edits preserve user work and report a blocked outcome.
- Renderer checks exercise question selection, custom answers, back/edit, confirmation, progress, failure, and retry.
- Existing Code mode checks still pass. Repair the existing test harness failure before relying on the full test suite.

## Current baseline

On 2026-11-05, npm test stops in test-requirement-subagents.js:20 with a SyntaxError from VM-evaluated code. main.js currently includes a five-voter automatic question path and review results whose failures are conveyed in summary text. These paths require explicit replacement or guarded integration, not another prompt layered over them.

## Exclusions

No application-wide redesign, new provider integration, new dependency, autonomous publishing, or unrelated repository cleanup. This is a full rework of EasyCode's question-to-verified-change workflow.
