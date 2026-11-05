# VendorProof Stage 1 motion review

This review covers the Stage 1 frontend refinement on `feat/vendorproof-completion`.

## Implemented

- The workflow scene now uses a pinned GSAP timeline scrubbed by Lenis/ScrollTrigger progress.
- Four cards enter in sequence: source, classification, approval, and milestone.
- Native SVG connector paths draw between the cards as the scene progresses.
- Stage dots, center counter, caption, and card content stay synchronized to scroll progress.
- The audience rail computes its horizontal travel from rendered widths instead of using a hard-coded distance.
- Audience cards now have inline line-art icons, focus/hover states, a visible progress indicator, and native touch scrolling below 900px.
- Reduced-motion mode keeps the content readable without pinned animation.
- Duplicate React keys in the statement word reveal were removed; browser console warnings are clean in the acceptance run.

## Captured visual evidence

- [Workflow start](/home/ubuntu/work/scppi/docs/evidence/stage1/precise-workflow-start.png)
- [Workflow final](/home/ubuntu/work/scppi/docs/evidence/stage1/precise-workflow-final.png)
- [Audience rail](/home/ubuntu/work/scppi/docs/evidence/stage1/precise-audience-final.png)
- [Mobile audience rail](/home/ubuntu/work/scppi/docs/evidence/stage1/precise-mobile-audience-final.png)

## Validation

The complete gate passed on 2026-11-05: formatting, ESLint, server and web TypeScript checks, 35 backend unit tests, 4 Playwright browser tests, Drizzle schema check, server build, and Next.js production build.
