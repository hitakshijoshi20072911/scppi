# VendorProof Frontend

This directory will contain the Lenis scrolling frontend application.

## Status

**NOT YET INTEGRATED**

The existing Lenis frontend source has not been added yet. When it is integrated:

1. The original design system will be preserved:
   - Fonts and typography
   - Colours
   - Components
   - Visual hierarchy
   - Animations
   - Lenis scrolling configuration
   - Transitions
   - Responsive layouts
   - Existing assets

2. The frontend will be inspected and mapped to the VendorProof page structure defined in `docs/architecture.md`.

3. No existing frontend file will be changed without explicit documentation of the reason.

## Planned Integration

See `docs/architecture.md` Section 15 for the complete page map and component plan.

The frontend will:
- Call only the VendorProof API
- Use shared types from `packages/shared`
- Hold no secrets or provider credentials
- Render provider-sourced text as plain text only
- Preserve the Lenis scrolling behaviour

## Next Steps

1. Provide the Lenis frontend source
2. Inspect the codebase structure
3. Map existing components to VendorProof pages
4. Integrate with the backend API
5. Preserve all design system elements
