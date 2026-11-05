# EasyCode implementation evidence

Approved scope: one adaptive question at a time, explicit Fix it confirmation, one worker at a time, configured worker routes retained, one repair, honest verification.

Pre-flight: discovery produces the persisted request consumed by the renderer and confirmed executor; request ID/revision/question ID are the shared boundary. Execution uses existing workspace and integration utilities; legacy Code mode stays separate.

Task 1: npm test reproduced the reviewer VM SyntaxError. Cause: CRLF source read with LF-only substring boundaries. Normalize newlines and anchor at the coordinator callback boundary. npm test subsequently passed.

Task 2: test-easycode.js RED (missing lifecycle module), then GREEN. Covers stale answers, confirmation revisions, duplicate confirmation, restart recovery, cancellation, invalid discovery, bounded malformed response repair, cumulative answers and actual command evidence.

Task 4: test-easycode-worker.js RED (reviewer PASS overrode failed command), then GREEN with optional bounded coordinator policy. test-easycode-execution.js RED (missing executor), then GREEN covering one worker route, preserved constraints, at most two attempts, blocked checks, changed project baseline, cancellation before integration.

Ruling: Work in the existing checkout and preserve its pre-existing changes — the user approved direct execution here; creating a second checkout would separate the running app from the reviewable result. Cost if wrong: changes need moving to a branch later.

Ruling: Use a separate EasyCode executor with the existing coordinator and workspace utilities, bypassing legacy orchestration — legacy completion hands failed work to unrestricted editing leads. Cost if wrong: the disconnected legacy code remains maintenance debt.

Ruling: Missing executable checks block confirmation; summaries must name runnable commands — reviewer prose alone cannot prove success. Cost if wrong: projects without tests need an explicit useful check before execution.

Ruling: Final patch application is synchronous after the cancellation guard — prevents cancellation interleaving with integration. Cost if wrong: large patches can briefly delay the UI.


Task 3: Persisted single adaptive discovery route wired into EasyCode dispatch, bypassing voters, requirement splitting and legacy handoffs. Stored controls bind session, request, revision, question and lifecycle state. Summary refinement, answer editing, investigation, cancellation, explicit stronger retry and reconfirmation are supported. Malformed JSON is repaired once. Custom answers and restart recovery are tested.

Task 4 completion: Configured worker routes and effort retained; task model cap enforced without mutating settings. One execution queue across EasyCode sessions; bounded coordinator performs at most two implementations. Structured command exit evidence, silent exit-zero checks, timeouts, isolated workspace copies, strict scope, dirty baseline plus HEAD checks, conflict-safe patch application and integrated checks/review govern completion. Current and archived workspaces remain recoverable across later requests. Legacy retry, skip, debug and finish IPC cannot bypass the gate.

Task 5: npm test and npm run test:ui passed. Renderer checks cover two session identities, choices, custom answer, earlier answer editing, summary edit affordance, double confirmation, running controls and blocked retry. Two distinct stubbed discovery branches were exercised. Persisted running requests recover blocked; ready requests recover ready. Existing Code and workspace suites pass. Visually inspected the captured EasyCode blocked controls. No live-provider end-to-end run was performed; model quality, provider compatibility and real costs are unverified.

Final review: independent read-only reviewer found two Important issues. Fixed missing ignored workspace inputs using isolated copies (regression ENOENT RED to GREEN). Fixed checks/review mutating the reviewed patch by recollecting and comparing after verification, plus final integrated-baseline validation (regression missing rejection RED to GREEN). No second review was dispatched.

Final review minor: verifying lifecycle state is now emitted during integrated checks. The reported literal NUL in requirement-workspaces.js exists once in both HEAD and the working file; it predates this change and is deferred as existing tooling debt. The UI detector also reported existing padding/gradient/animation warnings outside the changed controls; these are outside the approved redesign scope.

Ruling: Execution currently requires a Git project root so the baseline can be checked safely. Discovery and questions remain available for other folders. Cost if wrong: non-Git projects must initialize Git before execution.

Ruling: Keep changes uncommitted in the existing checkout; no merge, push, publication or app restart was requested. Cost if wrong: the user must restart Relay to load the rebuilt workflow.
