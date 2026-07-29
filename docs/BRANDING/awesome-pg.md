# Awesome PG (customer)

## Purpose

Customer platform for premium PG living and bed-first booking.

## Primary

- Orange: `#FF5A1F`
- Charcoal shell: `#070A0F`
- Silver text: `#B0B7C3`

## Feel

Friendly · Premium · Modern

## Symbol

House / home mark inside rounded square (orange roof + door on dark or light field).

## Logo usage

- **Full lockup:** mark + “Awesome PG” wordmark on marketing header
- **Icon only:** favicons, PWA, small UI
- **Minimum mark size:** 16px (use filled house, no fine strokes)

## Do

- Use SVG mark via `AwesomePgMark` in UI; PNG for PDF/email fallbacks
- Keep customer manifest `start_url` at `/`
- Use orange for CTAs and brand accents only

## Don’t

- Use APG OS blue shield on customer marketing surfaces
- Point customer PWA to `/admin`

## Code

- Tokens: `src/lib/brand/awesomePgTokens.ts`
- Metadata: `src/lib/brand/awesomePgCustomerMetadata.ts`
- Assets: `public/awesome-pg/`
