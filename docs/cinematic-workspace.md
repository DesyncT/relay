# Cinematic workspace

Relay is a shared coding workspace, so the direction is a focused conversation stage rather than a scrolling marketing page. The shell is recessed into a dark frame; navigation stays quiet; active conversations and keyboard focus carry the selected theme's accent.

Palette: existing deep, background, card, raised, text and Claude/accent variables. The new globals.css derives semantic scene tokens from them, so saved and generated themes continue to apply. Type: Segoe UI Variable with the user's saved font preference; display text only in the starting composition and page headings. Conversation text remains at a readable 14px with a 76-character maximum measure.

The signature is two moving signal paths meeting at a shared node. It appears only in an empty conversation. Page changes use a short focus transition; controls respond to hover/focus, and the composer gains a defined focus edge. Reduced motion removes the signal movement and page blur. Starter buttons fill an empty draft, focus the composer, and never send automatically or replace existing input.

Verification: build and React flow checks at 1280x800 and 860x760; rendered empty and populated chat at both sizes; Settings and Rules at compact width; starter draft protection, keyboard focus and reduced-motion checks. No dependency added. Installer and live provider validation remain separate from this visual pass.
