# Layout and responsiveness pass

Direction: Relay is a coding workspace for reading and coordinating agent work. Its character is calm, exact and compact. The visual world is a working editor; the chart and provider identity carry color, and a single static relay mark identifies the empty conversation. Saved theme choices remain intact.

Unslop audit and changes:
- Spacing/layout: reduced oversized headings, sidebar gaps and composer height; aligned provider totals and input controls. Page navigation resets the main scroll position. Input drafts initialize from storage rather than briefly clearing it.
- Color/icons/copy/type: removed the decorative color wash, focus glow, oversized empty-state slogan and looping signature. Preserved the logo, provider marks and user palette. Message text uses a stable readable measure, and short interface labels remain in sentence case.
- Motion/performance: removed page-sized blur and overlapping route transitions, the heatmap's 364 individual entrance animations and the universal per-element theme crossfade. Existing control feedback remains. Identical process polls no longer rebuild chat, message layout is memoized separately from status updates, and store subscriptions are stable.
- Backgrounds: decorative effects are behind the message log, not the composer. A theme-colored scrim and opaque message surfaces preserve readability. Canvas work is capped to 960×640 at 20 updates per second, yields during typing/scrolling, and stops when chat is left or hidden. Reduced motion remains supported.
- Usage: each provider has a lifetime API estimate. Only Codex receives the account-only adjustment, priced at its local average rate. It remains visibly estimated and excluded from local model/type breakdowns. Recovered tokens without pricing do not acquire invented costs.

Verification: Node behavior suite, dedicated provider account-cost checks, React flow/draft/reduced-motion checks, and a repeatable seven-screen layout tour at 1280×800 and 860×760 with 300 messages and ASCII backgrounds. The tour checks overflow, composer bounds, background layering/removal, reading position, theme switching and draft restoration. Input-to-next-frame maxima on this machine were 24 ms and 28 ms in an offscreen Electron run; these are diagnostic measurements, not an FPS guarantee or a before/after speedup claim.

Run `npm run test:layout` for the screen tour and its screenshots, `npm run test:ui` for interactions, and `npm run test:account-cost` for provider attribution. The screenshot harness now uses offscreen rendering so hidden windows do not return stale frames.

Limits: mock IPC does not replace live sign-in/provider, updater, terminal process or browser-webview testing. Very large histories beyond the 300-message case were not profiled. The existing Vite main-bundle size warning remains.

Design workflow credit: Unslop by Damir Sokolovsky (@heydamir), https://heydamir.design/unslop, CC BY 4.0. Existing implementation and artwork were retained rather than replacing the product identity.
