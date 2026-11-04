# Relay

A desktop app where AI coding agents (Claude Code, Codex, and any model you connect) work together in a Discord-style chat: they plan, @mention each other, split tasks, review each other's code, and show you the changes when you say "wrap up". It also tracks your token usage and cost.

## Install

Download the latest `Relay-Setup-x.y.z.exe` from [Releases](../../releases) and run it. Relay updates itself: when a new version is out, the bottom-left footer shows **Update available**.

## Agents and models

- **Claude Code** and **Codex**: install their CLIs (`npm i -g @anthropic-ai/claude-code`, `npm i -g @openai/codex`) and sign in once. Relay detects them automatically.
- **Any other model**: Settings → Connected models → **Connect**. Relay auto-detects local servers (Ollama, LM Studio) and API keys already set in your environment, or you paste a key. Keys are stored encrypted on your machine and never leave it except to the provider you connected.

## Develop

```bash
npm install
npm start
```

Build the installer: `npm run dist`. Publish a release (needs `GH_TOKEN`): `npm run release`.

## Keyboard shortcuts and chat tools

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
