# Stage 2 product review

## Delivered

The public product experience keeps the existing Lenis and GSAP scroll choreography and now includes a dedicated execution-boundary chapter: VendorProof UI → Fastify API → Swytchcode server-side execution → verified provider methods. The section links to the repository and official Swytchcode documentation without presenting provider access as a browser-side capability.

The fictional `/demo` remains deterministic and write-free. It supports start, pause, resume, reset, replay, direct step navigation, progress, expandable notes, and a final “no invoice created” disclosure. It never calls the API client or a live provider.

The authenticated workspace now exposes API-backed surfaces for:

- clients and projects;
- contracts, including hourly and fixed-milestone creation and draft-to-active transition;
- time entries and milestones, including human review transitions;
- GitHub repository mapping with the actual `connection_status` shown;
- integration status, including a truthful Stripe “not configured” state;
- the existing evidence and reconciliation routes.

The central client now fails closed when `NEXT_PUBLIC_API_BASE_URL` is absent, retries only idempotent GET requests once, supports cancellation, preserves CSRF handling, and notifies the session provider on a 401 response. State-changing methods are never retried automatically.

## Verification

The Stage 2 quality gate passed:

- Prettier format check
- ESLint
- server and web TypeScript checks
- 35 backend unit/domain/route tests
- 4 existing browser acceptance tests
- Drizzle migration metadata check
- server production build
- Next.js production build, including `/app/contracts`, `/app/records`, and `/app/integrations`

The hosted API smoke checks observed on 2026-11-05 returned database readiness, exact-origin CORS preflight success for `https://vendorproof-web-two.vercel.app`, and the expected 401 response for an invalid login without mutating data.

## Explicit release boundary

A real production account registration was not created during verification because that would write a disposable identity into the production database. Provider OAuth and Stripe credentials are not inferred from health checks. The UI therefore keeps provider state honest: mapping a GitHub repository is not treated as OAuth consent, and Stripe remains unavailable until its owner-controlled backend connection is implemented and verified.

For the split Vercel/Render deployment, production session cookies use `HttpOnly`, `Secure`, `__Host-`, `SameSite=None`; CSRF tokens and exact-origin CORS remain required for writes. Local development retains `SameSite=Lax`.
