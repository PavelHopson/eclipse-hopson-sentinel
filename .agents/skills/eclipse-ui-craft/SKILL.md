---
name: eclipse-ui-craft
description: Design, implement, or review Eclipse product web UI, component states, gestures, motion, and accessibility while preserving the product's existing visual system and runtime boundaries. Do not use for backend-only work or product AI system prompts.
---

# Eclipse UI Craft

Apply fluid-interface principles as a quality lens, not as an Apple visual clone.

Before changing UI, read [the product profile](references/project-profile.md). Existing repository instructions, design tokens, accessibility rules, and product contracts take precedence over this skill.

## Interaction contract

- Give immediate visual feedback. A `pointerdown`/`:active` state may acknowledge contact, but it must not commit navigation, submission, deletion, payment, execution, or any other operation. Commit only through the product's established click, submit, keyboard, or confirmed-gesture path.
- Never delay a useful action, request, cancellation, or error solely to finish animation.
- Keep transitions predictable and interruptible. Start from the current rendered state; preserve velocity when an existing gesture API supports it; never make the user wait for a decorative transition before reversing direction.
- CSS transitions and keyframes are appropriate for bounded hover, focus, disclosure, and state feedback. Use a gesture-aware animation API only for genuinely continuous drag/swipe interactions.
- Treat pending, success, error, retry, cancel, disabled, empty, offline, and no-access as product states. Show success only after the server or runtime confirms it.
- Preserve user context: stable focus, scroll position, selection, source-anchored overlays, symmetric enter/exit paths, and recovery after interruption.

## Motion and physics

- Prefer short, restrained motion that explains causality or state change. Do not add bounce, blur, parallax, glow, custom fonts, animation packages, or other dependencies automatically.
- For direct manipulation, track the pointer continuously, respect the grab offset, use pointer capture, and apply a small intent threshold before committing direction.
- Hand release velocity to the existing motion system when supported. Verify the installed package version and its official API documentation before choosing parameters.
- Apple's damping ratio is a dimensionless physical concept. It is not the same value as Motion/Framer Motion's `damping` option; do not copy numeric values between those APIs.
- Reduced motion must retain comprehension and feedback without large displacement, looping decoration, or overshoot.

## Accessibility and resilience

- Preserve semantic controls, keyboard operation, visible `:focus-visible`, logical focus order, Escape/dismiss behavior, screen-reader names, and sufficient contrast.
- Avoid hover-only information. Touch targets and responsive layouts must remain usable at the product's supported widths and zoom levels.
- Keep destructive actions recoverable or explicitly confirmed according to the product contract.
- Motion must never hide errors, approvals, security boundaries, or the actual completion state.

## Workflow

1. Inspect the real component, state owner, tokens, dependencies, and nearby tests before proposing a change.
2. Define the user action, confirmed outcome, interruption path, reduced-motion equivalent, keyboard path, and error recovery.
3. Reuse existing primitives and dependencies. Add a dependency only with explicit need, version/API verification, and repository approval.
4. Verify behavior, not just styling: pointer and keyboard, pending/success/error/cancel, reduced motion, desktop/mobile, and the relevant runtime boundary.

## References

- [Product-specific profile](references/project-profile.md) — required for every use in this repository.
- [Adaptation and provenance](references/provenance.md) — pinned upstream source and deliberate changes.
- [Unaltered upstream Apple Design skill](references/apple-design-upstream.md) — background reference only; it is not a second skill entrypoint.
- [Upstream MIT license](references/upstream-license.txt).
