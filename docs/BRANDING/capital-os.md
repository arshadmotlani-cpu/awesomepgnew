# Capital OS

## Purpose

Finance — private automotive investment operating system.

## Display naming (dual lockup)

- **Product:** Capital OS
- **Legal / subtitle:** Automotive Capital

Use both in login, sidebar subtitle, and OpenGraph description.

## Primary

- Green: `#16A34A` (brand) · `#22C55E` (bright accent)
- Shell: `#08080C` (existing Capital dark base)

## Feel

Accounting · Investment · Professional

## Symbol

Abstract growth / ledger mark (ascending bars + baseline).

## Logo usage

- Sidebar: mark + “Capital OS” + subtitle “Automotive Capital”
- Favicons: `/capital-os/` SVG + exported PNG under `/capital/icons/`

## Do

- Align PWA `theme_color` with green brand token
- Keep URLs and paths as `/capital/*` (no route renames)

## Don’t

- Use orange `#E85A1C` in new Capital brand assets (legacy manifest drift)

## Code

- Tokens: `src/lib/brand/capitalOsTokens.ts`
- Metadata: `src/lib/brand/capitalOsMetadata.ts`
- Assets: `public/capital-os/` (SVG), `public/capital/icons/` (PNG)
