const assert = require('node:assert/strict');
const { providerArgs } = require('./permissions');

const claudeReview = providerArgs(['-p', '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions'], 'claude', { readonly:true });
assert.ok(claudeReview.includes('--permission-mode') && claudeReview.includes('plan'), 'Claude reviewers use native plan permission mode');
assert.equal(claudeReview.includes('--dangerously-skip-permissions'), false, 'Claude reviewers do not inherit full-access permission');
const claudeWorker = providerArgs(['-p'], 'claude');
assert.ok(claudeWorker.includes('--dangerously-skip-permissions'), 'Claude workers retain full access');

const codexReview = providerArgs(['exec', '--json', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '--full-auto'], 'codex', { readonly:true });
assert.ok(codexReview.includes('--sandbox') && codexReview.includes('read-only'), 'Codex reviewers use its native read-only sandbox');
assert.equal(codexReview.includes('--ask-for-approval'), false, 'codex exec does not accept the interactive approval flag');
assert.ok(codexReview.includes('-c') && codexReview.includes('approval_policy=never'), 'Codex reviewers disable approval prompts through exec config');
assert.equal(codexReview.includes('--dangerously-bypass-approvals-and-sandbox'), false, 'Codex reviewers do not inherit full access');
const codexWorker = providerArgs(['exec', '--json'], 'codex');
assert.ok(codexWorker.includes('--dangerously-bypass-approvals-and-sandbox'), 'Codex workers retain full access');
console.log('provider permission construction tests passed');
