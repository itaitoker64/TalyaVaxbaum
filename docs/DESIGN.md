# Design direction — first review

Screens (demo data, phone viewport): `docs/screenshots/design/`
1. `1-today.png` — Today
2. `2-library.png`, `2b-practice-detail.png` — guided practice library and detail
3. `3-active-workout.png` — active strength workout
4. `4-goal-progress.png` — personal goal progress
5. `5-share-card.png` — 9:16 workout share card

## Main choices
- **Palette:** cream `#f8f4ec` and off-white surfaces; sand and beige secondary surfaces; sage `#7e9471` brand; dark sage `#4d6143` for primary buttons (6.6:1 contrast); charcoal `#26241f` text. One restrained fresh green, `#a6d86e`, is used only for selection, completion and the single main action on an image. It always appears with charcoal text or an icon.
- **Type:** *Frank Ruhl Libre* for headings (characterful, excellent Hebrew) and *Heebo* for body text, labels and numbers (very readable). Both are self-hosted. Sizes are in rem so text enlargement works. The scale: display 1.85 / page title 1.65 / section 1.25 / card title 1.05 / label 0.8 / value 1.35 rem.
- **Icons:** one family (Lucide, 2px stroke). The four tabs always show their Hebrew labels. The selected tab is shown by an accent pill, bold text and `aria-current`. Directional icons flip in RTL.
- **Imagery:** large image-led cards. Text over images always sits on a dark scrim. Image priority: the practice's own cover photo → the coach's photo for that category (upload in Settings, API ready) → **original placeholder artwork**, which is tagged "תמונה זמנית". No stock photos are bundled, and no image or video URL is invented. Videos that don't exist yet show "הסרטון יתווסף בקרוב", never a broken player.
- **Logging surfaces stay calm:** no imagery beyond a small thumbnail. One exercise is open at a time. Prescription chips, a "last time" box, large inputs, ✓ to fill in from last time, and a rest-timer ring.
- **Charts:** measured points (labeled values) are visually distinct from the dashed target line or shaded range and the dotted baseline. Dates are shown, method changes and long gaps are marked, and there are no projections. Hebrew labels are rendered as HTML so mixed text is never reordered.
- **Brand moments:** subtle flowing lines appear only on the hero, the footer card and share cards.
- **Accessibility:** RTL throughout, bidi-isolated numbers and units, 44px+ touch targets, status shown with text or icon as well as color, labeled icon-only buttons, WebVTT captions, `prefers-reduced-motion`, nothing that relies on hover.
