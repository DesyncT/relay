# Relay: dark sculpted glass

A transparent Windows desktop workspace with Apple-inspired material, restraint, and dimensional rounding. Retain standard native Windows controls. Native dark acrylic supplies the desktop blur; the root canvas remains transparent. No opaque page-sized backing layers.

Use the Acrylic palette from themeStore.js: smoke and slate surfaces, bright cool text, pale-blue accents. Glass planes are separately elevated with deep black directional shadows, thin silver top highlights, subtle side reflections, and restrained curved-surface gradients. All styling uses theme-derived tokens; existing themes remain selectable.

The sidebar, main workspace, panels, settings cards, toolbar controls, menus, and floating composer share this material. Small controls may carry a stronger dark tint for readability. Keep visible keyboard focus, readable text, existing responsive and phone behavior, reduced motion, and opaque reduced-transparency fallback. Never fade text to make the glass look transparent.

Settings subpanels use translucent .set-sec groups instead of opaque cards. Provider controls form full-width rows with aligned status actions; complex agent settings use full-width labeled groups and responsive command grids. Preserve control labels, selection focus, and save behavior.

Color-theme selection is removed. The fixed dark Acrylic palette supplies the appearance; saved background effects and media remain independent. Background settings use a responsive effect grid and grouped adjustments. Surface shadows use a single restrained elevation; controls and nested cards use only edge highlights.

Motion: shared 140/220/300ms control, state, and view timings. Session/project insertion and removal use presence transitions; navigation, settings, dialogs, search, forms and feedback share gentle entry motion. Streamed text stays stable. Respect system reduced motion. Verified with tools/motion-check.js in both preference modes.
