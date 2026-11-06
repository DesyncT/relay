// Turn control for the agent conversation. Pure, so it can be tested without Electron.
// An agent may end a message with one tag: [pass @claude] [pass @codex] [ask-user] [done].
// Models often append it inline ("...start building? [ask-user]"), so the tag only has to be last, not on its own line.
const NAMES = ['claude', 'codex'];
const mentions = (text) => NAMES.filter((a) => new RegExp(`@${a}\\b`, 'i').test(text));
const otherOf = (who) => (who === 'claude' ? 'codex' : 'claude');
function answeredQuestions(messages) {
  let count = 0;
  for (let u = messages.findLastIndex(m => m.from === 'user'); u > 0; count++) {
    const a = messages.slice(0,u).findLastIndex(m => m.from !== 'user' && m.from !== 'system' && m.from !== 'auto');
    if (a < 0 || !(messages[a].askUser || messages[a].autoAsk)) break; // autoAsk: the auto voters answered it
    u = messages.slice(0,a).findLastIndex(m => m.from === 'user');
  }
  return count;
}

// Common conversational replies need no model call. Keep matches anchored so a
// greeting followed by a work request still reaches the normal task flow.
function conversationReply(text, { awaiting = false, busy = false, items = [], doneAt = null } = {}) {
  const t = String(text || '').toLowerCase().replace(/[’]/g, "'").trim().replace(/[?!.]+$/g, '').replace(/\s+/g, ' ');
  if (/^(?:(?:hi|hey|hello|hiya|yo|greetings)(?: there| relay| guys| everyone)?|good (?:morning|afternoon|evening))$/.test(t)) return 'Hello.';
  if (/^(?:thanks(?: a lot| so much)?|thank you(?: very much)?|thx|ty|cheers|much appreciated)$/.test(t)) return 'You’re welcome.';
  if (/^(?:how (?:are|r) (?:you|u)(?: doing)?|how'?s it going|what'?s up|sup)$/.test(t)) return 'Ready to help.';
  if (/^(?:who (?:are|r) (?:you|u)|what (?:are|r) (?:you|u))$/.test(t)) return 'I’m Relay, your coding assistant.';
  if (/^(?:help|what can (?:you|u) do|how can (?:you|u) help(?: me)?|what (?:are )?your capabilities)$/.test(t)) return 'I can answer questions, define requirements, and work on code in your project.';
  const done = !busy && !awaiting && (items.length ? items.every(i => i.done) : !!doneAt);
  if (/^(?:(?:are )?(?:you|u)(?: guys)? (?:done|finished)(?: yet)?|(?:is|has) (?:it|the task|the work) (?:done|finished|ready)|(?:done|finished|ready)(?: yet)?|all done)$/.test(t)) return done ? 'Yes.' : awaiting ? 'No—waiting for your answer to the question above.' : 'No.';
  if (/^(?:status(?: update)?|progress|any (?:updates|progress)|what(?:'s| is) (?:the |your )?(?:status|progress)|(?:are (?:you|u) )?still working|how far (?:along )?are (?:you|u)|how'?s (?:it|the task|the work) going)$/.test(t)) return awaiting ? 'Waiting for your answer to the question above.' : busy ? 'Still working.' : done ? 'Done.' : 'No task is running.';
  if (/^what(?:'s| is) (?:left|remaining)(?: to do)?$/.test(t)) {
    const remaining = items.filter(i => !i.done);
    return awaiting ? 'Your answer to the question above.' : remaining.length ? remaining.map(i => '- ' + i.t).join('\n') : 'No outstanding requirements.';
  }
  return null;
}

// Informational questions get one brief read-only answer; work requests retain
// the requirements gate. Never treat a request as small talk just for saying hi.
function isConversation(text) {
  const t = String(text || '').trim();
  if (conversationReply(t) !== null) return true;
  if (/^how (?:do|can|should|would) i\b/i.test(t) && !/\b(?:and|then)\s+(?:you\s+)?(?:build|fix|change|deploy|publish|run)\b/i.test(t)) return true;
  return /^(?:what|why|how|when|where|who|which|is|are|does|can|could|explain|define|describe|tell me (?:about|why|how)|do (?:you|u|they|we))\b.+/i.test(t)
    && !/\b(?:build|create|make|fix|change|edit|update|add|remove|delete|implement|redesign|deploy|publish|release|install|refactor|test|debug|hide|show|polish|improve|optimize|clean|organize|rename|move|upload|commit|push|restart|run)\b/i.test(t);
}

// Delegation lines anywhere in a message: [sub: <title> | <task>], max 3. Stripped from the shown text.
const SUB = /^[ \t]*\[sub:\s*([^|\]\n]+?)\s*\|\s*([^\]\n]+?)\s*\][ \t]*$/gim;
function parseSubs(raw) {
  const subs = [];
  const text = String(raw).replace(SUB, (_, title, task) => { subs.push({ title: title.slice(0, 60), task }); return ''; }).replace(/\n{3,}/g, '\n\n');
  return { text, subs: subs.slice(0, 3) };
}

function parseTurn(raw0, who, trigger) {
  let { text: raw, subs } = parseSubs(raw0);
  const files = []; // [file: path] lines: files the agent shares as cards (max 4)
  raw = raw.replace(/^[ \t]*\[file:\s*([^\]\n]+?)\s*\][ \t]*$/gim, (_m, p) => { files.push(p); return ''; }).replace(/\n{3,}/g, '\n\n');
  // Question controls are metadata even when the model adds prose after them.
  const m = /\s*\[(ask-user()(!)?(?:[:\s]([^\]]*))?)\]/i.exec(raw)
    || /\s*\[(pass @(claude|codex)|ask-user(!)?(?:[:\s]([^\]]*))?|done)\][\s.]*$/i.exec(raw.trimEnd());
  const text = m ? (raw.slice(0, m.index) + (/^ask-user/i.test(m[1]) ? raw.slice(m.index + m[0].length) : '')).replace(/\s*\[ask-user!?(?:[:\s][^\]]*)?\]/gi, '').trim() : raw.trim();
  const tag = m ? (/^ask-user/i.test(m[1]) ? 'ask-user' : m[1].toLowerCase()) : '';
  // [ask-user: A | B | C], each optionally "Label :: what picking it does"
  const picks = m && m[4] ? m[4].split('|').map((o) => o.split('::')).filter(([l]) => l.trim()).slice(0, 4) : [];
  // labels are what gets sent as the answer, so keep them whole; only a runaway label is cut, at a word
  const clip = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '');
  const options = picks.map(([l]) => clip(l.trim(), 160)), optionInfo = picks.map(([, d]) => (d || '').trim().slice(0, 160));
  let next = mentions(text);
  if (tag === 'ask-user' || tag === 'done') next = [];
  else if (tag.startsWith('pass') && !next.includes(m[2].toLowerCase())) next.push(m[2].toLowerCase());
  // no mention, no tag: answering an agent hands the turn back to it; answering the user ends the round
  if (!next.length && !tag && trigger && trigger.from !== who && NAMES.includes(trigger.from)) next = [trigger.from];
  return { text, next, tag, askUser: tag === 'ask-user', subs, ...(files.length && { files: files.slice(0, 4) }), ...(options.length && { options }), ...(optionInfo.some(Boolean) && { optionInfo }), ...(tag === 'ask-user' && m[3] && { important: true }) }; // [ask-user! ...] = really needs the human
}

// Which agent(s) answer a user message. Planning: one leader (the Lead setting; 'random' flips a coin per message),
// only explicitly mentioned agents join. Building (the user said go): both at once.
function route(text, lead, building, rng = Math.random, interviewing = false) {
  if (interviewing) {
    const l = NAMES.includes(lead) ? lead : rng() < 0.5 ? 'claude' : 'codex';
    return { first: [l], after: null, lead: l };
  }
  const at = mentions(text);
  if (at.length === 1) return { first: at, after: null }; // mentioning both = the normal lead-then-teammate flow below
  const l = lead === 'random' ? (rng() < 0.5 ? 'claude' : 'codex') : NAMES.includes(lead) ? lead : 'claude';
  return building ? { first: [l, otherOf(l)], after: null, lead: l } : { first: [l], after: otherOf(l), lead: l };
}

// The other agent posted while this one was thinking, and both are still proposals: re-run once instead of posting blind.
const stale = (postedSince, who, tag, building) => !building && !tag && postedSince.some((m) => NAMES.includes(m.from) && m.from !== who);

const isGo = (t) => t.trim().length < 60 && /\b(go|go ahead|go for it|start|start building|build it|do it|ship it|let'?s go|let'?s do it|yes|yep|yeah|approved?|ok|okay|sure)\b/i.test(t);

function cleanErrorMessage(errText, provider = 'agent') {
  if (!errText) return 'Unknown error occurred.';
  let text = typeof errText === 'string' ? errText : (errText.message || String(errText));

  // 1. Strip ANSI escape sequences
  text = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
             .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  const prov = String(provider || 'agent').toLowerCase();

  // 2. Check connection / proxy error early
  if (/localhost:8080|127\.0\.0\.1:8080/i.test(text) || (prov.includes('antigravity') && /ECONNREFUSED|fetch failed/i.test(text))) {
    return 'Cannot connect to Antigravity proxy on port 8080. Ensure the proxy is running.';
  }

  // 3. Check unrecognized model early
  if (/unrecognized_model|model_not_found/i.test(text) ||
      (/model/i.test(text) && /not found|does not exist|unsupported|invalid|is not supported/i.test(text)) ||
      /(?:unsupported|invalid|unknown)\s+model/i.test(text)) {
    return `Invalid model for ${provider}. Please select a supported model.`;
  }

  // 4. Extract from JSON if present
  let extracted = null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('"result"') || trimmed.includes('"error"') || trimmed.includes('"message"')) {
      try {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.result && typeof parsed.result === 'string') extracted = parsed.result;
          else if (parsed.error) {
            if (typeof parsed.error === 'string') extracted = parsed.error;
            else if (parsed.error.message) extracted = parsed.error.message;
          } else if (parsed.message && typeof parsed.message === 'string') {
            extracted = parsed.message;
          }
        }
      } catch {}
    }
  }

  if (!extracted) {
    const resMatch = /"result"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(text);
    if (resMatch) {
      try { extracted = JSON.parse('"' + resMatch[1] + '"'); } catch { extracted = resMatch[1].replace(/\\"/g, '"'); }
    }
  }
  if (!extracted) {
    const errMsgMatch = /"error"\s*:\s*\{\s*"message"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(text) ||
                        /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(text);
    if (errMsgMatch) {
      try { extracted = JSON.parse('"' + errMsgMatch[1] + '"'); } catch { extracted = errMsgMatch[1].replace(/\\"/g, '"'); }
    }
  }

  if (extracted) text = extracted;

  // Re-check model & proxy in extracted JSON content
  if (/unrecognized_model|model_not_found/i.test(text) ||
      (/model/i.test(text) && /not found|does not exist|unsupported|invalid|is not supported/i.test(text)) ||
      /(?:unsupported|invalid|unknown)\s+model/i.test(text)) {
    return `Invalid model for ${provider}. Please select a supported model.`;
  }
  if (/localhost:8080|127\.0\.0\.1:8080/i.test(text) || (prov.includes('antigravity') && /ECONNREFUSED|fetch failed/i.test(text))) {
    return 'Cannot connect to Antigravity proxy on port 8080. Ensure the proxy is running.';
  }

  // 5. Rate / usage limits check
  const isRateLimit = /api_error_status":\s*429|usage_limit_reached|usage[_ ]?limit|hit your .{0,30}limit|rate[_ ]?limit|exceeded your current quota|too many requests|credit balance|insufficient[_ ]credits?|out of credits|no credits|credits? exhausted|\b429\b|\b529\b|overloaded|resource[_ ]exhausted/i.test(text) ||
                      /api_error_status":\s*429|usage_limit_reached|usage[_ ]?limit|hit your .{0,30}limit|rate[_ ]?limit|exceeded your current quota|too many requests|credit balance|insufficient[_ ]credits?|out of credits/i.test(String(errText));
  if (isRateLimit) {
    const limitSentenceMatch = /(?:You['’]ve hit your (?:usage |session )?limit[^\n\r"]*|resets? (?:at )?\d+[^\n\r"]*|try again at[^\n\r"]*|Rate limit reached[^\n\r"]*|Exceeded your current quota[^\n\r"]*|credit balance is too low[^\n\r"]*)/i.exec(text);
    if (limitSentenceMatch) return limitSentenceMatch[0].trim();
    if (text.length <= 250 && /limit|quota|credit|429/i.test(text)) return text.trim();
    return `Rate limit reached for ${provider}.`;
  }

  // 6. Context length limit check
  if (/context length|maximum context length|prompt is too long|request is too large|exceeds? context limit/i.test(text)) {
    return `Prompt exceeds context length limit for ${provider}.`;
  }

  // 7. Empty message returned
  if (/returned no (?:message|result)|no message returned|no result returned/i.test(text)) {
    return `No response received from ${provider}.`;
  }

  // 8. Authentication / login check
  if (/(?:unauthorized|not logged in|authentication error|invalid api key|token.*(?:expired|invalid)|run codex login|run \/login)/i.test(text)) {
    return `Authentication required for ${provider}. Check sign-in status in Settings.`;
  }

  // 9. Strip connector warnings, hook logs, telemetry, and CLI prefixes
  text = text
    .replace(/^.*?exited\s+\d+:\s*/i, '')
    .replace(/\[Session[A-Za-z0-9_-]+:[^\]]*\]/gi, '')
    .replace(/SessionStart:[^\s]+/gi, '')
    .replace(/⚠\s*claude\.ai connectors are disabled[^\n\r]*/gi, '')
    .replace(/claude\.ai connectors are disabled because ANTHROPIC_API_KEY[^\n\r]*/gi, '')
    .replace(/\{?"(?:unset|started_in_background|max_depth|spawned_by_subagents|total_subagents)"[^\n\r}]*\}?/gi, '')
    .replace(/\{[^{}]*"query_source"\s*:\s*"sdk"[^{}]*\}/gi, '')
    .replace(/^\s*Error:\s*/i, '')
    .trim();

  if (!text || /^[\s{},:[\]"']+$/.test(text)) {
    return `Command failed for ${provider}.`;
  }

  if (text.length > 250) {
    const firstSentence = text.split(/(?<=[.?!])\s+/)[0];
    if (firstSentence && firstSentence.length <= 250) text = firstSentence;
    else text = text.slice(0, 247) + '...';
  }

  return text;
}

function formatFailureInfo(errText, provider = 'claude') {
  const p = String(provider || 'agent').toLowerCase();
  const prov = p.includes('antigravity') ? 'antigravity' : p.includes('codex') ? 'codex' : 'claude';
  const cleanMsg = cleanErrorMessage(errText, prov);

  let title = 'Command failed';
  let badge = 'red';
  let action = 'retry';

  const lower = cleanMsg.toLowerCase() + ' ' + String(errText).toLowerCase();

  if (/CLI is not installed|could not be started|spawn .* not found|command not found|is not recognized as an internal/i.test(lower)) {
    title = 'Install the CLI';
    badge = 'amber';
    action = 'install';
  } else if (/session limit|rate limit|usage[_ ]?limit|hit your .{0,30}limit|quota|429|too many requests|credit balance|insufficient[_ ]credits?|out of credits|no credits|credits? exhausted|overloaded|529|resource[_ ]exhausted/i.test(lower)) {
    title = /usage|credit|quota/i.test(lower) ? 'Usage limit reached' : 'Session limit reached';
    badge = 'amber';
    action = 'switch';
  } else if (/proxy|port 8080|econnrefused/i.test(lower)) {
    title = 'Proxy connection error';
    badge = 'red';
    action = 'retry';
  } else if (/fetch failed|econnrefused|econnreset|etimedout|enotfound|connection timed out|network error|error sending request|stream disconnected/i.test(lower)) {
    title = 'Connection error';
    badge = 'amber';
    action = 'retry';
  } else if (/invalid model|unrecognized_model/i.test(lower)) {
    title = 'Invalid model';
    badge = 'amber';
    action = 'switch';
  } else if (/unauthorized|not logged in|authentication|invalid api key|token.*(?:expired|invalid)|run codex login|run \/login/i.test(lower)) {
    title = 'Authentication error';
    badge = 'amber';
    action = 'retry';
  } else if (/context length|maximum context length|prompt is too long|request is too large|context limit/i.test(lower)) {
    title = 'Context limit reached';
    badge = 'amber';
    action = 'retry';
  } else if (/no (?:response|message) received|returned no (?:message|result)|no message returned|didn.t respond|did not respond/i.test(lower)) {
    title = 'No response';
    badge = 'amber';
    action = 'retry';
  }

  let fix = '';
  if (prov === 'codex') {
    if (title === 'No response') fix = 'If the CLI is using the wrong account, click Sign in again and choose the intended ChatGPT account, then retry. Also check the chat model picker: choose a model available to that account, or try another available Codex model if Luna is rejected. Sign-in does not guarantee access to the selected model. On the affected PC, open PowerShell and run codex --version, then codex login status. If signed out, run codex login. Next run: codex exec --skip-git-repo-check "Reply with OK". If that works, restart Relay, check the Codex command in Settings points to the same CLI, and retry in a new chat. If it fails, its error identifies what needs fixing.';
    else if (title === 'Authentication error') fix = 'On this PC, run codex login status in PowerShell. If signed out or the credentials are rejected, run codex login, then restart Relay and retry.';
    else if (title === 'Connection error') fix = 'Check the connection on this PC and whether a VPN, proxy, or firewall is blocking Codex. Run codex exec --skip-git-repo-check "Reply with OK" in PowerShell to check outside Relay, then retry once the connection works.';
    else if (action === 'install') fix = 'Run codex --version in PowerShell on this PC. Relay needs the Codex CLI. If it already works, set the Codex command in Settings to that CLI and restart Relay to refresh PATH. Otherwise use Install Codex CLI.';
    else if (title === 'Invalid model') fix = 'Choose a Codex model available to your account in the chat model picker, then retry. If the CLI is signed into the wrong account, click Sign in again and choose the intended ChatGPT account. Signing in again does not guarantee model access.';
    else if (title === 'Context limit reached') fix = 'Start a new chat with a shorter task and only the files needed for it.';
    else if (action === 'switch') fix = 'Wait until the limit resets or choose another available provider, then retry.';
  }

  return {
    provider: prov,
    title,
    message: cleanMsg,
    fix,
    canSignInAgain: prov === 'codex' && ['No response', 'Authentication error', 'Invalid model'].includes(title),
    badge,
    action,
    raw: String(errText || '').slice(0, 500),
  };
}

const exported = { parseTurn, parseSubs, mentions, route, stale, isGo, otherOf, answeredQuestions, isConversation, conversationReply, NAMES, cleanErrorMessage, formatFailureInfo };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}
if (typeof window !== 'undefined') {
  Object.assign(window, exported);
}
