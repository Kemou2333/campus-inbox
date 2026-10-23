# 2.21.1 validation

- First-entry sequence: 8 focused tests passed; platform bridge: 14 focused tests passed.
- TypeScript and Vite production build passed. Public example privacy gate passed for 24 reviewed examples (policy 2); example/demo files remain unchanged.
- Built web app checked at 390 × 844: main shell hidden/inert during the guide, practice notice readable, main shell restored after closing, settings headings use 34 / 24 / 18 px hierarchy.
- Entry uses pre-paint preparation, one-time playback, reduced-motion/static fallbacks and cancellation when the user interacts. No frame-by-frame reference-video comparison was performed.
- Android now exposes a manual update check in Settings. Native compilation and host-policy checks run in the existing Android CI. Physical-device update behavior remains unverified.
- No paid model calls, production user writes or backend deployment in this patch.
