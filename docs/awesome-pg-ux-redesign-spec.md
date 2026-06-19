# Awesome PG — User Experience Redesign Specification

**Scope:** Customer-facing website + resident dashboard only. Admin panel, financial logic, booking logic, KYC workflow, and database architecture are out of scope and untouched by this document.

---

## 0. Scope, Assumptions & How To Use This Document

This is a **presentation-layer redesign**. Every screen described below is assumed to be powered by an existing API, table, or workflow. Nothing here invents a new source of truth.

**Properties covered:** Shantinagar PG, Central PG, Central PG Female, Trimurti Nagar PG.

This document is the reference spec. The companion file [`awesome-pg-cursor-implementation-prompt.md`](./awesome-pg-cursor-implementation-prompt.md) is the execution prompt. The Phase 0 audit output is in [`feature-inventory.md`](./feature-inventory.md).

---

## 1. UX Architecture (Full Sitemap)

### PUBLIC SITE

- Home (cinematic hero, live availability, PG showcase)
- PG Explorer
  - PG Details (per property)
  - Compare PGs (side-by-side, max 3)
- Room Detail Page
- Booking Flow (5 steps: PG → Room → Bed → Preview → Confirm/Pay)
- Enquiry / Schedule a Visit
- Favorites
- About / Trust

### ACCOUNT (post-signup, pre-resident)

- Application Dashboard (status tracker, profile, KYC, payment status, notifications)

### RESIDENT HUB (post move-in)

- Home, Profile, Wallet, Payments, KYC, My Room, Requests Center, Referrals, Vacating Journey, Notification Center, AI Concierge

### GLOBAL

- AI Concierge, Notifications, Mobile bottom navigation (Resident Hub only)

**Design principle:** The boundary between "Account" and "Resident Hub" should feel like a literal upgrade — a visible unlock moment when a user becomes a resident.

---

## 2. Page Hierarchy & Priorities

| Page | Priority |
|------|----------|
| Home, PG Details, Bed Map, Booking Flow | P0 |
| Application Dashboard, Resident Home, Wallet, Payments | P0 |
| Room Detail, Requests Center, Vacating Journey, Notification Center | P1 |
| Referrals, AI Concierge | P2 |

See full page breakdown in the original spec delivery (sections, data sources, key sections).

---

## 3. Visual Design System

### 3.1 Positioning

Premium, calm, trustworthy — Airbnb warmth + Apple restraint. Semi-3D = quality of light and material, not literal 3D everywhere.

### 3.2 Color System

- Warm off-white background, near-black text
- One confident primary accent (deep amber or forest green — avoid generic SaaS blue/purple)
- Semantic colors for bed states and request statuses — colorblind-safe (pair with icon/shape)
- Surface tiers: Base, Card (soft shadow + hairline border), Floating (modals, hero, concierge)

### 3.3 Typography

- Display typeface for marketing headlines
- Workhorse UI typeface for dashboard/forms
- Tabular figures for numeric amounts

### 3.4 Spacing & Grid

- 8px base unit
- 12-column desktop, 4-column mobile
- Generous whitespace on marketing; denser rhythm in Resident Hub

### 3.5 Imagery

Real property photography > illustration > stock. Isometric line art if 3D room previews aren't feasible.

---

## 4. Motion Design System

### 4.1 Principles

- Motion explains state change, not decoration
- 150–250ms UI feedback, 300–500ms page reveals
- One focal animation at a time
- Respect `prefers-reduced-motion`

### 4.2 Token Catalog

| Token | Duration | Use |
|-------|----------|-----|
| instant | 100ms | Hover, press |
| quick | 200ms | Selection |
| standard | 300ms | Card expand, modal |
| reveal | 450ms | Scroll reveals |
| count-up | 600–900ms | Numeric animations |

### 4.3 Signature Patterns

- Live availability counter with count-up
- Bed map hover/select/compare
- Status timeline sequential fill
- Wallet balance count-up
- Page cross-fade + 8–12px slide

---

## 5. 3D Interaction Strategy

| Element | Approach |
|---------|----------|
| Home hero | Lightweight R3F or parallax photo/video |
| Floor/Room Explorer | Isometric 2D + CSS 3D transforms |
| Bed Map | 2D grid with elevation styling |
| Room cards | Tilt-on-hover (CSS perspective) |
| Wallet/payments | 2D charts with glass elevation |

Prefer Framer Motion + CSS 3D for 90% of premium feel. WebGL at most one hero element with static fallback.

---

## 6. Component Map

Organized by domain — Layout, Marketing, PG Explorer, Booking, Application, Resident Hub, Wallet & Payments, KYC, Room, Requests, Referrals, Vacating, Notifications, AI Concierge.

See [`feature-inventory.md`](./feature-inventory.md) Section 11 for existing → spec component mapping.

---

## 7. User Journeys

- **A:** Visitor → Booking
- **B:** Signup → Move-In (unlock moment)
- **C:** Resident day-to-day
- **D:** Referral
- **E:** Vacating

---

## 8. Mobile Layouts

- Mobile-first (student audience)
- Resident Hub bottom nav: Home / Wallet / Requests / Concierge / Profile
- Marketing sticky bottom CTA
- Swipeable card stacks for explorers
- Single-question forms where possible
- Touch targets ≥44px
- Hero interactive within ~2s on mid-range Android / 4G

---

## 9. Conversion Strategy

**Increase:** enquiries/bookings (live availability, benefit-framed amenities, guided booking), trust (reviews, transparent pricing), engagement (interactive explorers if fast).

**Reduce:** confusion (one primary CTA, visual status language), text overload, booking drop-off (persistent stay summary).

**Metrics:** enquiry-to-booking, step drop-off, time-to-KYC, resident WAU, concierge deflection, referral activation.

---

## Codebase gaps (from Phase 0 audit)

Features in this spec that require backend work or are missing entirely — see [`feature-inventory.md`](./feature-inventory.md) Section 13:

- Favorites, Enquiry, Reviews, Nearby, Referrals, in-app Notification Center
- 10 request types (only 3 exist in schema)
- Dedicated Resident Hub routes (currently `?section=resident`)
- Full AI Concierge (Roachie/CockroachAI is partial)

Presentation-only redesign can proceed for P0 pages using existing data. Flag backend needs before building missing features.
