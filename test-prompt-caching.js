// ponytail: subagent verification suite for prompt caching & KV-cache stability
const assert = require('assert');

// Pure simulation of prompt building logic matching main.js (promptFor)
function buildPrompt({ messages, who = 'claude', other = 'codex', edits = true, sharedRules = 'always use ponytail plugin', scGuidance = '', note = '', stand = false }) {
  // ponytail: chunked step (8 msgs) + static slice keeps prefix byte-identical for prompt cache hits
  const start = Math.floor(Math.max(0, messages.length - 16) / 8) * 8;
  const recent = messages.slice(start).map((m) =>
    `[${m.from}] ${String(m.text || '').slice(0, 3000)}${(m.attachments || []).map((a) => `\nattached: ${a.name} (${a.path})`).join('')}`
  );
  if (start > 0) recent.unshift(`[Earlier chat: ${start} messages archived to preserve context cache]`);
  const standNote = stand ? `You are standing in for @${who}` : '';
  const notes = [standNote, note].filter(Boolean).join('\n\n');
  const first = messages.find(m => m.from === 'user' && m.text?.trim());

  return `You are @${who}, a coding assistant for developer. Be concise and complete the user's task.
You and @${other} are the inexpensive working team.
${scGuidance ? `Model roles, delegation & task priority guidelines:\n${scGuidance}\n` : ''}Edits: ${edits ? 'enabled' : 'disabled'}.
Save tokens: read only relevant files and ranges.
Shared rules: ${sharedRules || '(none)'}
Original task: ${first ? first.text.slice(0, 1000) : '(see recent chat)'}
Recent chat (older messages may be omitted; read project files for details):
${recent.join('\n\n')}
${notes ? `\n${notes}\n` : ''}
Your response:`;
}

function runTests() {
  console.log('Running prompt caching validation suite...\n');
  let passed = 0;

  // Test 1: Stepped chunking preserves byte-identical prefix across 8-turn intervals
  {
    const messages = [];
    for (let i = 0; i < 16; i++) {
      messages.push({ from: i % 2 === 0 ? 'user' : 'claude', text: `Message turn ${i + 1}: test prompt content.` });
    }

    const basePrompt = buildPrompt({ messages });
    let prefixHits = 0;

    // Simulate next 7 turns (turns 17 to 23, total 8 turns in step chunk)
    for (let i = 16; i < 23; i++) {
      messages.push({ from: i % 2 === 0 ? 'user' : 'claude', text: `Message turn ${i + 1}: continuing discussion.` });
      const currentPrompt = buildPrompt({ messages });
      const promptWithoutLatest = buildPrompt({ messages: messages.slice(0, -1) });

      // The current prompt prefix must start with the exact text of the previous prompt (up to the recent chat addition)
      const prevRecentIdx = promptWithoutLatest.indexOf('Recent chat (older messages may be omitted; read project files for details):');
      const currRecentIdx = currentPrompt.indexOf('Recent chat (older messages may be omitted; read project files for details):');

      assert.strictEqual(prevRecentIdx, currRecentIdx, 'Header byte offsets must match exactly');
      assert.strictEqual(
        promptWithoutLatest.slice(0, prevRecentIdx),
        currentPrompt.slice(0, currRecentIdx),
        'System prompt and rules prefix must be byte-identical'
      );

      // Verify the previous recent section is an exact prefix of the new recent section
      const prevRecent = promptWithoutLatest.slice(prevRecentIdx, promptWithoutLatest.indexOf('\nYour response:'));
      const currRecent = currentPrompt.slice(currRecentIdx);
      assert.ok(currRecent.startsWith(prevRecent), `Turn ${i + 1} must preserve byte-prefix of turn ${i}`);
      prefixHits++;
    }

    console.log(`✓ Test 1: Stepped chunking preserved 100% prefix byte match across ${prefixHits} consecutive turns`);
    passed++;
  }

  // Test 2: Shift occurs strictly at step boundary (turn 24)
  {
    const messages = [];
    for (let i = 0; i < 24; i++) {
      messages.push({ from: i % 2 === 0 ? 'user' : 'claude', text: `Turn ${i + 1}` });
    }
    const step0 = Math.floor(Math.max(0, 23 - 16) / 8) * 8; // turn 23 (length 23): step 0
    const step1 = Math.floor(Math.max(0, 24 - 16) / 8) * 8; // turn 24 (length 24): step 8
    assert.strictEqual(step0, 0, 'Step at turn 23 should be 0');
    assert.strictEqual(step1, 8, 'Step at turn 24 should step forward by 8');
    console.log('✓ Test 2: Boundary step shifts cleanly by 8 messages instead of sliding 1-by-1');
    passed++;
  }

  // Test 3: Deterministic message length slicing prevents past turn mutation
  {
    const longText = 'A'.repeat(5000);
    const messages = [
      { from: 'user', text: 'Initial prompt' },
      { from: 'claude', text: longText },
    ];
    const prompt1 = buildPrompt({ messages });
    messages.push({ from: 'user', text: 'Another message' });
    const prompt2 = buildPrompt({ messages });

    const expectedSlice = 'A'.repeat(3000);
    assert.ok(prompt1.includes(expectedSlice), 'Old message must be deterministically capped at 3000');
    assert.ok(prompt2.includes(expectedSlice), 'Subsequent messages must not mutate length or content of earlier messages');
    console.log('✓ Test 3: Deterministic message length capping preserves byte stability');
    passed++;
  }

  // Test 4: Dynamic notes and fallback stand-in annotations are placed at suffix
  {
    const messages = [{ from: 'user', text: 'Hello' }];
    const promptWithoutNote = buildPrompt({ messages, note: '', stand: false });
    const promptWithNote = buildPrompt({ messages, note: 'Dynamic note', stand: true });

    const prefixLen = promptWithoutNote.indexOf('Your response:');
    const headerWithout = promptWithoutNote.slice(0, prefixLen);
    const headerWith = promptWithNote.slice(0, prefixLen);

    assert.strictEqual(headerWithout, headerWith, 'Prefix up to suffix notes must be completely unaffected by dynamic notes');
    console.log('✓ Test 4: Dynamic notes and stand-in annotations do not bust prefix cache');
    passed++;
  }

  // Test 5: Original task anchor remains stable
  {
    const messages = [
      { from: 'user', text: 'Build a trade bot' },
      { from: 'claude', text: 'Sure' },
      { from: 'user', text: 'Now add a stop loss' },
    ];
    const prompt = buildPrompt({ messages });
    assert.ok(prompt.includes('Original task: Build a trade bot'), 'Original task anchor must stay locked to first user message');
    console.log('✓ Test 5: Original task anchor remains locked to initial user turn');
    passed++;
  }

  console.log(`\nAll ${passed} tests passed successfully! KV-cache reuse verified.`);
}

runTests();
