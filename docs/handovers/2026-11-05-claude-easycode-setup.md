# Claude handover: EasyCode setup recovery

## User goal

Make EasyCode catch missing prerequisites before approval, recover from setup failures through a visible **Fix setup and retry** button, and preserve the request, answers and saved work. The user is frustrated by repeated preventable blockers. Do not promise that arbitrary runtime failures can never happen.

## Confirmed cause

The active installed Relay chat selected `C:/Users/mmmul/Documents/groencentrum/wordpress`. Read-only inspection confirmed this is an ordinary folder, not a Git repository. `projectChanges()` intentionally returned null outside a Git root, but EasyCode treated null as a hard failure before it reached the already-existing isolated plain-folder snapshot path. The earlier message incorrectly told the user to use a Git project root.

The source folder was not initialized as a repository or edited during diagnosis. Git itself is available and is still used internally inside temporary snapshots.

An earlier, separate setup bug was fixed in v0.1.42: Electron's virtual ASAR filesystem caused snapshot/cleanup failures on projects containing `.asar` archives. Workspace operations use `original-fs` inside Electron; keep that fix.

## Implementation

- `requirement-workspaces.js`: added `projectBaseline`, `baselineUnchanged`, and `inspectProjectSetup`. Git roots with commits retain HEAD and dirty-file fingerprint checks. Plain folders and unborn repositories use streamed SHA-256 file fingerprints. Added/deleted/changed files block integration; symlinks are rejected. Original folders are not given a `.git` directory. Existing isolated snapshots and scoped patch application remain in use.
- Setup checks confirm a readable/writable project and temporary directory, the Git executable, available project npm scripts, and known executables referenced by proposed verification commands. The original folder does not need a repository. Expected failed Git probes no longer print alarming stderr.
- `main.js`: EasyCode performs these checks in worker threads, uses the new baseline methods, and surfaces actual isolated-workspace errors. Blocked messages offer **Fix setup and retry**. Its click is recorded in chat history. Typed `fix` invokes the same recovery.
- `easycode.js`: preflight runs before discovery, before presenting a ready summary, and again before execution. Setup failures block without starting the worker. Recovery preserves the original request/history/worker reference, clears obsolete scope and confirmation, adds the previous failure and actual setup facts to discovery, and prepares a revised summary for confirmation. Read-only discovery can repair a bad proposed check once via the existing bounded output-repair path.
- `index.html`: exposes the recovery button in both new and already-saved blocked chats, including old messages lacking that option. It is the recommended blocked-state action.
- `easycode-execution.js`: no longer claims every baseline failure requires a Git project root.

## Validation

Run `npm test`, `npm run test:ui`, and `npm run test:electron`. New coverage exercises plain-folder baselines, edits/additions/deletions, Git HEAD changes, unborn repositories, scoped snapshot integration without creating `.git` in the original folder, missing npm scripts, early setup failure, recovery preserving answers, and cancellation. Renderer coverage exercises the repair action on a saved blocked message that originally only offered Review and retry.

A read-only check of the user's selected WordPress folder now reports `projectKind: folder`, `requiresGitRepository: false`, and no npm scripts. Do not invent `npm test` for it; inspect actual supported checks.

## Review focus and limits

1. Review cancellation/stale-request handling around the new awaited preflight calls. A completed preflight must not revive a cancelled request or start an unconfirmed worker.
2. Review plain-folder baseline and scoped integration preservation. Never bypass a changed baseline or apply an unreviewed patch to the original.
3. Setup checks cover basic tool availability and npm script existence. They cannot prove external services, credentials, PHP extensions, network access or arbitrary verification behavior. Surface concrete failures; add a targeted check when justified instead of claiming comprehensive environment validation.
4. The recovery button re-diagnoses and replans. It does not install global software, delete user files, or modify the original project before confirmation. If Git itself is missing, the user gets an actionable explanation.
5. No paid live-provider run or end-to-end modification of the user's WordPress project was performed. Model-generated discovery quality and command selection still require real-provider verification.
6. Folder hashing is streamed off the UI thread, but can still take time on large media/dependency trees. Any optimization must preserve change detection and avoid shared writable worker inputs.

Keep the user's prior UX requirements: simple informative questions, one decision at a time, recommendations using theme colors, no repeated settled preferences, normal composer for typed answers, visible selected choices and action clicks, agent/model labels, and real worker/reviewer progress in chat.
