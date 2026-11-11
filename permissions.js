// Worker calls default to full access; reviewer calls replace it with native read-only modes.
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
function providerArgs(args, provider, { readonly = false, textOnly = false } = {}) {
  if (!readonly && !textOnly) return fullAccessArgs(args, provider);
  // Reuse the sanitizer to discard conflicting sandbox, permission and approval flags,
  // then replace its full-access tail with the provider's native read-only mode.
  const result = fullAccessArgs(args, provider).filter(arg => arg !== '--dangerously-skip-permissions' && arg !== '--dangerously-bypass-approvals-and-sandbox');
  if (provider === 'codex') result.push('--sandbox', 'read-only', '-c', 'approval_policy=never');
  else result.push('--permission-mode', 'plan');
  // textOnly (turns lent to a co-work partner): the model gets no tools at all, so it cannot read files or env vars, run commands or call
  // connected services (MCP) on this computer. Read-only alone still lets it read any file. The literal "" is an empty argument for the shell.
  if (textOnly) result.push(...(provider === 'codex' ? ['-c', 'features.shell_tool=false', '-c', 'mcp_servers={}'] : ['--tools', '""', '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '""']));
  return result;
}
module.exports = { fullAccessArgs, providerArgs };
