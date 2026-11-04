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

## License

MIT
