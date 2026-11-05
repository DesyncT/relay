# Codex handover: replace EasyCode with Spreader

## User goal

Drop EasyCode and the requirements pipeline. Every chat is plain Claude Code or Codex in the project. The one extra is **Spreader**, picked in the agent picker:

- **Question asker:** before changing anything, the agent asks one short question if a product decision is missing, with 2-4 option buttons. That's at most 3 questions per task, then it does the work.
- **Spreader:** each new task runs on the subscription with the most quota left, so usage spreads across providers.

Each provider has one standard model, set in Settings > Rules > Default models. There is no escalation to stronger models for different tasks. The progress bar stays. The user wants short console and error output in chat, not long dumps.

## Done (commit "Replace EasyCode with Spreader", not pushed; `npm test` and `npm run test:ui` pass)

- `spreader.js` (new): `pickProvider(quota, available, last)` picks the provider with the most `remaining` quota, using the lowest of its windows. Unknown quota counts as 50. A tie goes to whoever didn't run last. Self-check: `node spreader.js`.
- `main.js`
  - `isSpreader`, `SPREAD_ASK` and `spreadTo` sit above `dispatchUser`. When the last agent message asked a question, the answer goes back to that same agent; otherwise `pickProvider(readQuota())`. The choice is saved as `session.spreadLast`.
  - `dispatchUser` (normal branch): a new task clears the progress bar, unless it's an answer to the agent's question. Spreader enqueues the picked provider.
  - `ask()` (normal branch): Spreader adds `SPREAD_ASK` before `normalPrompt`. It parses `[ask-user: A | B]` with `parseTurn` and posts `askUser` + `options`, so buttons render. `onTodos` feeds `setReqs` and drives the progress bar.
  - `seatRun`: when Spreader hits a limit, it falls back with `provOf`, the same way the old enhanced path did. In normal runs, the model defaults to `settings.routes[prov].coding` instead of hardcoded IDs. A chat's own picker overrides it, except for Spreader.
  - `supercodeOn = () => false`. The 'super' mode no longer turns supercode on. `chat:info` returns `supercode:false`, and returns `reqs` for every chat.
- `activity.js`: `todos(e)` reads Claude `TodoWrite` and Codex `todo_list` items. `claudeRun` and `codexRun` call `c.onTodos`.
- `routing.js` / `routing-ui.js`: the defaults are now one model per provider for every phase: Sonnet 5.5, GPT-6.1 Sol and Gemini 3.8 Flash Low, all at low effort. The grid is now a single "Default models" row, and editing it writes all three phases. The "Task limit" row and the ladder are gone.
- `index.html`
  - The lead "Random" became "Spreader", available in every chat. Saved `random` maps to `spreader`, and `main.js` treats both as Spreader.
  - The model and effort pickers are hidden for Spreader.
  - The reqbar shows in every chat and is labelled "Progress".
  - The "EasyCode roles" setting is removed.
  - `defaultModel` reads `cfg.routes`.
- `titlebar.js`, `sidebar.js`, CSS: the EasyCode/Code toggle, the sidebar bolt icon and their styles are removed.
- `test-code-mode.js`: the dispatch sandbox now gets `sessOf` and `reqsOf`.

## Remaining for Codex

1. **Delete the dead EasyCode/requirements code.** It's unreachable now that `supercodeOn` is false.
   - Modules: `easycode.js`, `easycode-execution.js`, `requirement-*.js` and `worker-routing.js`, plus their tests and their entries in the `npm test` script.
   - In `main.js`: `saveEasycode`, `executeEasycode`, `easyAction` and `dispatchEasycode`; the `easycode:action` IPC; `startRequirementWorkflow`, `integrate*` and `reviewIntegratedResult`; the requirement retry/skip/debug/finish IPC; and the supercode half of `ask()` after its early return.
   - In `index.html`: the EasyCode message controls (`easycode:update`, ~line 1614) and the requirement Retry/Try another model/Debug/Skip buttons in the reqbar dropdown.
   - Keep `setReqs`, `renderReqs` and the bar itself. `setReqs` calls `requirementSubagents` and `reclaimWorkspaces`: strip those, but keep cleanup of old saved task workspaces once so leftover temp folders still get removed.
   - Run `npm test`, `npm run test:ui` and `npm run test:electron` after each chunk. Update or delete the tests that cover removed behavior.
2. **Short output everywhere:** failure posts already trim through `formatFailureInfo`. Check that normal-mode tool and command output in chat stays short, and don't paste raw stderr.
3. **Real-app check:** pick Spreader in a project. Send a vague request, then check that one question with buttons appears, and that the answer goes to the same provider. Send a clear request, then check the agent just works and the Progress bar follows its todo list. Check that the next new task can switch providers when quota differs.
4. **Release:** bump to 0.1.46, then `npm run dist`. Delete `dist/win-unpacked` first if the build fails with EBUSY. Then `gh release create v0.1.46` with the exe, blockmap and `latest.yml`. Commit as DesyncT (repo config) and leave out any Claude co-author trailer.

## Known limits

- Switching providers between tasks loses the CLI's own session memory. The new provider gets the chat history as text through `normalPrompt(resumed=false)`.
- The question limit is enforced by the prompt only.
- `readQuota` covers Codex from its logs, and Claude and Antigravity from their checks. A provider with no data counts as half full.
