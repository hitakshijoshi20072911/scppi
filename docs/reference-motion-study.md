# VendorProof motion study

The landing refresh is informed by the public [SWTTM reference site](https://switchctm.vercel.app/) and its public [source repository](https://github.com/RidhimaKulashriz/SWTTM). The useful interaction patterns are structural rather than product-specific: technical boot loader, fixed navigation that hides while scrolling down, a pinned hero scene, scrubbed workflow nodes, word-level statement reveal, pinned product intelligence scene, horizontal use-case rail, and reduced-motion fallbacks.

VendorProof now uses the same class of interaction through `gsap` and `ScrollTrigger`, coordinated with the existing `server/src/lenis` implementation through `apps/web/components/lenis-provider.tsx`. The landing remains product-specific: the source is technical delivery evidence, the destination is a human-controlled reconciliation record, and all preview data is fictional and explicitly marked as such.

The dynamic scenes are implemented in `apps/web/components/landing-experience.tsx`:

- The hero pins on desktop and advances a four-node evidence timeline as the user scrolls.
- The statement fades words in progressively from scroll position.
- The workflow intelligence section pins on desktop and advances through capture, context, review, and reconciliation.
- The live product model exposes clickable pull-request records and classification states.
- The audience section pins on desktop and translates a horizontal card rail.
- Mobile uses normal flow layouts instead of desktop pinning.
- `prefers-reduced-motion: reduce` disables scroll-driven animation and keeps the content readable.

The reference’s provider-specific claims and source data were not copied into VendorProof. The VendorProof page keeps Swytchcode as a disclosed server-side execution layer and does not claim live provider consent in the browser.

## Runtime verification

Local checks passed after the refresh: formatting, ESLint, server and web typechecks, 35 backend unit tests, browser acceptance coverage, and server/frontend production builds. The live Render readiness endpoint also returned `{"status":"ready","checks":{"database":"ready"}}` during verification. The deployed API currently reports a preview Vercel origin in its CORS response; the production origin must be set in the Render environment before the merged frontend can make browser API calls from production.

## Sources

- [SWTTM landing page](https://switchctm.vercel.app/)
- [SWTTM source repository](https://github.com/RidhimaKulashriz/SWTTM)
- [VendorProof Lenis integration](../apps/web/components/lenis-provider.tsx)
- [VendorProof landing experience](../apps/web/components/landing-experience.tsx)
