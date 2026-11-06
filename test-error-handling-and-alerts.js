const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanErrorMessage, formatFailureInfo } = require('./turn');
const { createSessions } = require('./sessions');

// 1. Error categorization: Codex usage limit with reset time
const codexUsageErr = '{"type":"error","message":"You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:32 PM."}';
const codexClean = cleanErrorMessage(codexUsageErr, 'codex');
assert.match(codexClean, /try again at 8:32 PM/i);
const codexFailure = formatFailureInfo(codexUsageErr, 'codex');
assert.equal(codexFailure.provider, 'codex');
assert.equal(codexFailure.title, 'Usage limit reached');
assert.equal(codexFailure.badge, 'amber');
assert.equal(codexFailure.action, 'switch');

// 2. Error categorization: Claude session limit
const claudeRateErr = 'Rate limit reached for claude.';
const claudeFailure = formatFailureInfo(claudeRateErr, 'claude');
assert.equal(claudeFailure.provider, 'claude');
assert.equal(claudeFailure.title, 'Session limit reached');
assert.equal(claudeFailure.badge, 'amber');
assert.equal(claudeFailure.action, 'switch');

// 3. Error categorization: Missing CLI
const missingCliErr = 'Codex CLI is not installed or could not be started.';
const missingFailure = formatFailureInfo(missingCliErr, 'codex');
assert.equal(missingFailure.title, 'Install the CLI');
assert.equal(missingFailure.badge, 'amber');
assert.equal(missingFailure.action, 'install');

// 4. Error categorization: Context length exceeded
const contextErr = 'maximum context length exceeded';
const contextFailure = formatFailureInfo(contextErr, 'codex');
assert.equal(contextFailure.title, 'Context limit reached');
assert.equal(contextFailure.badge, 'amber');
assert.equal(contextFailure.action, 'retry');

// 5. Error categorization: Authentication error
const authErr = 'unauthorized: not logged in';
const authFailure = formatFailureInfo(authErr, 'claude');
assert.equal(authFailure.title, 'Authentication error');
assert.equal(authFailure.badge, 'amber');
assert.equal(authFailure.action, 'retry');

// 6. Error categorization: No response / returned no message fallback
const noMsgErr = 'codex returned no message';
const noMsgClean = cleanErrorMessage(noMsgErr, 'codex');
assert.equal(noMsgClean, 'No response received from codex.');
const noMsgFailure = formatFailureInfo(noMsgErr, 'codex');
assert.equal(noMsgFailure.title, 'No response');
assert.equal(noMsgFailure.badge, 'amber');
assert.equal(noMsgFailure.action, 'retry');

// Codex errors include recovery steps without assuming installation or login failed.
assert.match(noMsgFailure.fix, /codex --version/);
assert.match(noMsgFailure.fix, /codex login status/);
assert.match(noMsgFailure.fix, /codex exec --skip-git-repo-check/);
assert.match(formatFailureInfo('unauthorized: not logged in', 'codex').fix, /codex login/);
const networkFailure = formatFailureInfo('fetch failed: connection timed out', 'codex');
assert.equal(networkFailure.title, 'Connection error');
assert.doesNotMatch(networkFailure.message, /Antigravity/);
assert.match(networkFailure.fix, /VPN|firewall/);
assert.equal(formatFailureInfo("Codex didn't respond", 'codex').title, 'No response');

assert.equal(formatFailureInfo('No message received from codex', 'codex').canSignInAgain, true);
assert.equal(formatFailureInfo('not logged in', 'codex').canSignInAgain, true);
assert.equal(formatFailureInfo('model_not_found: model is not supported when using Codex with a ChatGPT account', 'codex').canSignInAgain, true);
assert.equal(formatFailureInfo('rate limit reached', 'codex').canSignInAgain, false);
assert.equal(formatFailureInfo('No response received', 'claude').canSignInAgain, false);

// 7. Error categorization: Proxy connection error
const proxyErr = 'Cannot connect to Antigravity proxy on port 8080. Ensure the proxy is running.';
const proxyFailure = formatFailureInfo(proxyErr, 'antigravity');
assert.equal(proxyFailure.title, 'Proxy connection error');
assert.equal(proxyFailure.badge, 'red');
assert.equal(proxyFailure.action, 'retry');

// 8. Session waitingQuestion state transitions
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-alert-'));
try {
  const store = createSessions({ dataDir: tmp, send: () => {} });
  const p = store.addProject(tmp, 'Alert Test');
  const s = store.createSession(p.id, 'Session Q');

  // Agent asks question -> waitingQuestion = true
  store.appendMessage(s.id, { from: 'claude', text: 'Which database? [ask-user: Postgres | SQLite]', askUser: true });
  assert.equal(store.getSession(s.id).waitingQuestion, true);
  assert.equal(store.listSessions(p.id)[0].waitingQuestion, true);

  // User answers -> waitingQuestion = false
  store.appendMessage(s.id, { from: 'user', text: 'Postgres' });
  assert.equal(store.getSession(s.id).waitingQuestion, false);
  assert.equal(store.listSessions(p.id)[0].waitingQuestion, false);

  // Another question cleared by clearSession
  store.appendMessage(s.id, { from: 'codex', text: 'Confirm? [ask-user: Yes | No]', askUser: true });
  assert.equal(store.getSession(s.id).waitingQuestion, true);
  store.clearSession(s.id);
  assert.equal(store.getSession(s.id).waitingQuestion, false);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 9. Overlay badge asset verification
const badgePath = path.join(__dirname, 'assets', 'question-badge.png');
assert.ok(fs.existsSync(badgePath), 'question-badge.png must exist');
const buf = fs.readFileSync(badgePath);
assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Must have PNG header');
assert.equal(buf.readUInt32BE(16), 16, 'Width must be 16');
assert.equal(buf.readUInt32BE(20), 16, 'Height must be 16');

console.log('Error handling and question alert checks passed');
