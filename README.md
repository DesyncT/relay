# Relay

A desktop app where AI coding agents (Claude Code, Codex, and any model you connect) work together in a Discord-style chat: they plan, @mention each other, split tasks, review each other's code, and show you the changes when you say "wrap up". It also tracks your token usage and cost.

## Install

Download the latest `Relay-Setup-x.y.z.exe` from [Releases](../../releases) and run it. Relay updates itself: when a new version is out, the bottom-left footer shows **Update available**.

## Agents and models

- **Claude Code** and **Codex**: install their CLIs (`npm i -g @anthropic-ai/claude-code`, `npm i -g @openai/codex`) and sign in once. Relay detects them automatically.
- **Any other model**: Settings → Connected models → **Connect**. Relay auto-detects local servers (Ollama, LM Studio) and API keys already set in your environment, or you paste a key. Keys are stored encrypted on your machine and never leave it except to the provider you connected.

## Develop

EasyCode turns a request such as “fix” into one project-grounded question at a time. Pick a button or type an answer, review the proposed change and checks, then press **Fix it**. Auto settings do not answer these product questions or skip confirmation.

One worker runs at a time, using your configured worker model and effort within your task model limit. A failed check gets at most one targeted repair. Failed or missing verification remains blocked; retrying returns to a summary for confirmation. Stronger routes require an explicit choice. EasyCode uses isolated workspaces and checks the project baseline before applying a scoped patch; currently execution requires a Git project root. Interrupted work is retained for review rather than restarted automatically. Code mode keeps its existing CLI workflow.

```bash
npm install
npm start
```

Build the installer: `npm run dist`. Publish a release (needs `GH_TOKEN`): `npm run release`.

## Keyboard shortcuts and chat tools

**Code** talks directly to your selected Codex or Claude Code CLI and resumes its native session. It uses that CLI's installed skills, project instructions, tools, and configuration. Relay does not add its requirements interview, forced shared skills, workers, or review workflow to Code chats. The first run may replay saved conversation history to establish a new CLI session.

**EasyCode** is the guided workflow: clarify the request, build a checklist, and distribute workers across available Codex, Claude, and Gemini providers. Workers start with smaller models and switch providers after errors or unavailable credits. Failed reviews can move work to a stronger model. Failed checklist steps have **Retry** and **Try another model** controls; completed sibling tasks stay intact.

Each checklist worker also appears in the Subagents panel with its model, result, and individual Stop/Retry controls. Retrying one failed worker does not wait for running siblings. Inconclusive reviews show **Needs verification** and try another available reviewer. Projects without an npm test script can use independent verification of their actual acceptance criteria; a failing test suite is still a failure.

**Themes** includes Graphite, Paper, Midnight, and a square-corner monospace Terminal preset. **Generate with AI** uses an available provider to create colors, typography, corner radius, borders, and spacing density. Preview before applying; theme preferences are saved locally. Generated palettes must pass schema and text-contrast checks.

- `Ctrl+Shift+P`: search actions in the command palette (also available from **Actions** in the chat header).
- `Ctrl+K`: find and switch sessions by title or project.
- `Ctrl+F`: search the current chat and jump to a message.
- `Ctrl+L`: focus the message composer.
- `Ctrl+N`: create a session in the current project.
- `/export`: save a Markdown copy of the active chat with a native Save dialog. Attachment names are included; attachment contents are not copied.
- `/find` and `/switch`: open chat search and the session switcher.

Use Command instead of Ctrl on macOS. The palette supports arrow keys, Enter, and Escape.

## Contributors

- [DesyncT](https://github.com/DesyncT) — project author and maintainer.
- Codex (OpenAI) — AI-assisted implementation, debugging, and verification, directed by the maintainer.

## License

MIT
