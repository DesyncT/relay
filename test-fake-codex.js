// Minimal stand-in for `codex app-server`: answers the account usage handshake for test-usage-account-cost.js.
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let at;
  while ((at = buffer.indexOf('\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, at));
    buffer = buffer.slice(at + 1);
    const reply = (result) => console.log(JSON.stringify({ id: message.id, result }));
    if (message.id === 1) reply({});
    else if (message.id === 2) reply({ account: { id: 'acct' } });
    else if (message.id === 3) reply({ summary: { lifetimeTokens: 5500000 }, dailyUsageBuckets: [] });
  }
});
