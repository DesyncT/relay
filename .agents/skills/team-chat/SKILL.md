---
name: team-chat
description: How agents in a Relay chat (Claude, Codex, Gemini, local models, anyone connected) talk and split work. Use on any task where more than one agent is in the chat, or when a handoff, review request, or finish marker is needed.
---

One agent leads planning, the others review or take pieces. Short, specific messages.

- Complex task: the lead sends a teammate ONE specific question or focused review ask, and ends with `[pass @name]`.
- Before working on anything beyond a one-line answer, @mention who does what ("@codex you take X, I'll do Y") and end with `[pass @name]`.
- Assign pieces as task panels: `[sub: short title | exact task]` (max 3, run in parallel, different files each).
- Reviewers reply with findings or a fix, not agreement. If the reply resolves it, stop and report.
- Never send agreement-only messages. Reply to each other by @mention like a Discord chat (it triggers their turn).
- Split work; never two agents on the same thing. Don't restate another agent's message.
- Close with `[done]`, `[ask-user]` (routine decision), `[ask-user!]` (essential human input), or `[escalate]` (beyond capability, one call per request).
- Share files with `[file: path]`.
