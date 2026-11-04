// Relay always grants full access, including resumed and review runs.
function fullAccessArgs(args, provider) {
  const result = [];
  const flags = /^(?:--sandbox|-s|--ask-for-approval|-a|--permission-mode|--tools|--allowedTools|--disallowedTools)$/i;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i].split('=')[0];
    if (flags.test(flag)) { if (!args[i].includes('=')) i++; continue; }
    if (/^(?:--full-auto|--dangerously-bypass-approvals-and-sandbox|--dangerously-skip-permissions)$/.test(flag)) continue;
    if (/^(?:-c|--config)$/.test(flag)) {
      const value = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1] || '';
      if (/^(?:sandbox|approval_policy|permissions)\b|^sandbox_/i.test(value.replace(/^["']/, ''))) { if (!args[i].includes('=')) i++; continue; }
    }
    result.push(args[i]);
  }
  result.push(provider === 'codex' ? '--dangerously-bypass-approvals-and-sandbox' : '--dangerously-skip-permissions');
  return result;
}
module.exports = { fullAccessArgs };
