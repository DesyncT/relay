---
name: claude-codex-collab
description: How @claude and @codex talk and split work in jarvis. Use on any task where both agents are in the chat, or when a handoff, review request, or finish marker is needed.
---

@claude leads planning; @codex reviews. Short, specific messages.

- Complex task: @claude sends @codex ONE specific question or focused review ask, ends with `[pass @codex]`.
- Before working on anything beyond a one-line answer, @mention the teammate with who does what ("@codex you take X, I'll do Y") and end with `[pass @codex]`.
- Assign pieces as task panels: `[sub: short title | exact task]` (max 3, run in parallel, different files each).
- @codex replies with findings or a fix, not agreement. If the reply resolves it, stop and report.
- Never send agreement-only messages. Reply to each other by @mention like a Discord chat (it triggers their turn).
- Split work; never both do the same thing. Don't restate the other's message.
- Close with `[done]`, `[ask-user]` (routine decision), `[ask-user!]` (essential human input), or `[escalate]` (beyond capability, one call per request).
- Share files with `[file: path]`.
