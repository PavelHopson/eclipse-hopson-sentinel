# Provenance and adaptation

- Imported: 2026-09-29.
- Upstream repository: https://github.com/emilkowalski/skills
- Pinned commit: `d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128`
- Commit page: https://github.com/emilkowalski/skills/commit/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128
- Upstream source: https://github.com/emilkowalski/skills/blob/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128/skills/apple-design/SKILL.md
- Upstream license: https://github.com/emilkowalski/skills/blob/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128/LICENSE
- License: MIT; the complete upstream license is stored in `upstream-license.txt`.

`apple-design-upstream.md` is an unaltered copy of the pinned upstream `skills/apple-design/SKILL.md`. It is stored below `references/`, not as a skill entrypoint, so it cannot auto-activate as a second project skill.

## Deliberate adaptations in `../SKILL.md`

- Renamed and narrowed the skill to Eclipse product web UI work.
- Removed the forced greeting and response choreography.
- Made repository rules and `project-profile.md` authoritative over generic aesthetics.
- Separated instant pointer feedback from committing an operation.
- Required server/runtime confirmation before success and explicit pending/error/retry/cancel states.
- Kept CSS transitions valid for bounded state changes; reserved gesture-aware APIs for continuous gestures.
- Clarified that Apple's damping ratio is not Motion/Framer Motion's `damping` parameter.
- Required installed-version and official-API verification before motion tuning.
- Prevented automatic blur, bounce, custom fonts, dependencies, or visual-system replacement.
- Added keyboard, focus, Escape, contrast, responsive, and reduced-motion gates.
- Excluded backend-only tasks and product AI system prompts.
