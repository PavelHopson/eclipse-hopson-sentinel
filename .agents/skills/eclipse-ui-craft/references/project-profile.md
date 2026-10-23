# Eclipse Hopson Sentinel / Ultron UI profile

## Product character

Sentinel is a local-first AI command center. Its dashboard presents three deliberately separate modes:

- **Альтрон** — voice-first conversation with explicit listening and speaking state.
- **Lab** — isolated model experimentation without tools.
- **Оператор** — command, plan, diff, human approval, one-shot execution, and receipt.

UI craft must make those boundaries clearer, never visually merge them or imply shared permissions.

## Visual system to preserve

- Preserve the existing Ultron identity: near-black panels, restrained red signal `#FF304A`, silver text, green confirmed/live state, compact telemetry, and the existing Eclipse/Ultron mark.
- Preserve the current distinction between conversation, Lab, and Operator surfaces. Do not restyle Sentinel into the violet Chat profile, generic glass, Apple chrome, or an AI-gradient dashboard.
- Keep motion meaningful: listening, thinking, speaking, approval, executing, success, and blocked. Do not fabricate activity or turn decoration into system status.
- Reuse the existing dashboard tokens, components, `ultron.css`, local icons, and installed `framer-motion` version. No new fonts, visual dependencies, or animation packages by default.

## Non-negotiable runtime boundaries

A UI-craft task must not change:

- microphone, speaker, STT, TTS, voice-session, wake-word, or background-listening behavior;
- models, provider routing, prompts, model registry, or Lab isolation;
- tools, capabilities, permissions, IPC, credential storage, or OS execution;
- STOP defaults or behavior;
- plan, diff, approval, one-shot execution, cancellation, receipt, audit, or replay semantics.

Pressed, animated, selected, speaking, or successful-looking UI is never authority. Execute remains unavailable until the existing runtime confirms the required state and approval.

## Motion and accessibility

- Inspect the installed `framer-motion` API before changing spring values. Apple's damping ratio is not Framer Motion's numeric `damping` option.
- Preserve the explicit Motion control and OS `prefers-reduced-motion`. Reduced motion must keep state text, progress, STOP, errors, approvals, and receipts fully visible.
- No transition may delay STOP, cancel, mute, permission denial, error recovery, or switching away from an active visual surface.
- Preserve keyboard focus, Escape behavior, semantic buttons, screen-reader status, high contrast, Russian labels, and the compact desktop layout.

## Next small pilot — not implemented here

Audit only the visual interaction states of the `surface-switcher` in `dashboard/src/App.tsx` and its existing rules in `dashboard/src/ultron.css`: consistent press/focus feedback, clear `aria-pressed` state, predictable bounded transition, and reduced-motion behavior. Keep the three mode IDs, lazy-loaded surfaces, session/model selection, permissions, STOP, approvals, and voice runtime unchanged.

## Sources inside this repository

- `README.md`
- `docs/sentinel-roadmap.md`
- `dashboard/src/App.tsx`
- `dashboard/src/ultron.css`
- `dashboard/package.json`
