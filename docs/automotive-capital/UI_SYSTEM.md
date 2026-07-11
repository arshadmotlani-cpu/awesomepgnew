# UI System — Automotive Capital

## 1. Design Philosophy

Automotive Capital should feel like **Stripe Dashboard × Linear × Apple × Notion** — not like Awesome PG and not like generic admin templates.

| Principle | Expression |
|-----------|------------|
| Premium | Dark glass surfaces, subtle gradients, refined typography |
| Fast | Skeleton loaders, optimistic updates, minimal chrome |
| Calm | Low visual noise, generous whitespace, muted palette |
| Precise | Monospace numbers, aligned columns, clear hierarchy |
| Delightful | Micro-animations on state changes, smooth transitions |

**Anti-patterns to avoid:**

- Orange PG branding (`#FF5A1F`, `apg-*` tokens)
- Dense data tables without breathing room
- Modal-heavy CRUD flows
- Generic Bootstrap/Material look
- Light mode as default

---

## 2. Brand Identity

| Element | Value |
|---------|-------|
| Product name | Automotive Capital |
| Tagline | Private Automotive Investment Operating System |
| Logo | Abstract geometric mark — capital "A" with motion line (custom SVG) |
| Wordmark | "Automotive Capital" — Inter 600, letter-spacing -0.02em |
| Favicon | Simplified mark on dark background |

No reference to Awesome PG in any visual element.

---

## 3. Color System

### 3.1 Core Palette

```css
/* Background layers */
--ac-bg-base:        #08080C;    /* Deepest background */
--ac-bg-elevated:    #0F0F14;    /* Sidebar, panels */
--ac-bg-surface:     #14141A;    /* Cards */
--ac-bg-glass:       rgba(20, 20, 26, 0.72);  /* Glassmorphism */

/* Accent */
--ac-accent:         #22D3EE;    /* Cyan — primary actions */
--ac-accent-muted:   #0891B2;    /* Hover/pressed */
--ac-accent-glow:    rgba(34, 211, 238, 0.15);

/* Secondary accent */
--ac-violet:         #8B5CF6;    /* Gradients, highlights */
--ac-violet-muted:   #6D28D9;

/* Semantic */
--ac-success:        #34D399;    /* Profit, positive ROI */
--ac-warning:        #FBBF24;    /* Pending, stale assets */
--ac-danger:         #F87171;    /* Loss, errors */
--ac-info:            #60A5FA;    /* Informational */

/* Text */
--ac-text-primary:   #F4F4F5;    /* zinc-100 */
--ac-text-secondary: #A1A1AA;    /* zinc-400 */
--ac-text-muted:     #71717A;    /* zinc-500 */
--ac-text-inverse:   #08080C;

/* Borders */
--ac-border:         rgba(255, 255, 255, 0.08);
--ac-border-hover:   rgba(255, 255, 255, 0.14);
```

### 3.2 Gradients

```css
--ac-gradient-mesh:  radial-gradient(ellipse at 20% 50%, rgba(34,211,238,0.08), transparent 50%),
                     radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06), transparent 50%);

--ac-gradient-card:  linear-gradient(135deg, rgba(255,255,255,0.03), transparent);

--ac-gradient-accent: linear-gradient(135deg, #22D3EE, #8B5CF6);
```

### 3.3 Financial Colors

| Meaning | Color | Usage |
|---------|-------|-------|
| Profit | `--ac-success` | Positive ROI, profit received |
| Loss | `--ac-danger` | Negative ROI, loss cars |
| Capital | `--ac-accent` | Capital invested, outstanding |
| Pending | `--ac-warning` | Awaiting settlement |
| Neutral | `--ac-text-secondary` | Zero/null values |

---

## 4. Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | Inter | 700 | 32–48px |
| Heading | Inter | 600 | 18–24px |
| Body | Inter | 400 | 14–16px |
| Label | Inter | 500 | 12–13px |
| Caption | Inter | 400 | 11–12px |
| Money | JetBrains Mono | 500 | 14–16px |
| Code | JetBrains Mono | 400 | 13px |

**Money formatting rules:**

- Always use `JetBrains Mono` for rupee amounts
- Format: `₹12,45,000` (Indian numbering)
- Paise hidden in UI unless precision mode
- Negative amounts: prefix `−` in danger color
- Percentages: `24.5%` with one decimal

---

## 5. Spacing & Layout

| Token | Value |
|-------|-------|
| Base unit | 4px |
| Card padding | 20–24px |
| Section gap | 24–32px |
| Page max-width | 1440px |
| Sidebar width | 240px (desktop) |
| Top bar height | 56px |
| Border radius (card) | 12px |
| Border radius (button) | 8px |
| Border radius (input) | 8px |
| Border radius (pill) | 9999px |

### 5.1 Grid

Dashboard: 12-column grid, 24px gutter.

KPI cards: 4 columns desktop, 2 tablet, 1 mobile.

---

## 6. Glassmorphism Components

### 6.1 Glass Card

```css
.ac-glass-card {
  background: var(--ac-bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--ac-border);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.24);
}
```

Hover: border brightens, subtle `translateY(-1px)`, 150ms ease.

### 6.2 Glass Sidebar

Frosted panel with right border. Active nav item: accent left border + `ac-accent-glow` background.

### 6.3 Login Screen

Full-viewport gradient mesh animation (slow CSS/Framer Motion). Centered glass card with logo, email, password fields.

---

## 7. Component Library

Built on **shadcn/ui** installed under `src/capital/components/ui/`.

### 7.1 Core Components

| Component | Usage |
|-----------|-------|
| `Button` | Primary (accent), secondary (glass), ghost, danger |
| `Input` | Text, email, password, search |
| `Select` | Status, category, payment mode |
| `Textarea` | Notes |
| `DatePicker` | Purchase date, expense date |
| `Dialog` | Confirmations, quick add |
| `Sheet` | Mobile nav, detail panels |
| `DropdownMenu` | Row actions, profile menu |
| `Command` | Command palette (cmdk) |
| `Table` | Asset list, ledger, expenses |
| `Tabs` | Asset detail page sections |
| `Badge` | Status pills, category tags |
| `Tooltip` | Icon explanations |
| `Skeleton` | Loading states |
| `Toast` | Success, undo, error |
| `Progress` | Settlement %, upload progress |
| `Avatar` | Admin profile |
| `Separator` | Section dividers |
| `ScrollArea` | Sidebar, long lists |

### 7.2 Domain Components

| Component | Description |
|-----------|-------------|
| `KpiCard` | Metric with label, value, delta, sparkline |
| `MoneyDisplay` | Formatted ₹ with color semantics |
| `StatusBadge` | Asset status with color mapping |
| `AssetCard` | Grid card for asset list |
| `Timeline` | Vertical event timeline |
| `LedgerRow` | Debit/credit with description |
| `InsightCard` | Smart insight with CTA |
| `ChartCard` | Recharts wrapper with glass container |
| `EmptyState` | Illustration + message + CTA |
| `QuickAddButton` | FAB / header button |
| `CommandPalette` | Global Cmd+K |
| `SearchInput` | Instant search with debounce |
| `FilterBar` | Status, date, manufacturer filters |
| `UndoSnackbar` | 5-second undo window |
| `DocumentGrid` | Thumbnail grid with type icons |
| `ExportMenu` | CSV/XLSX/PDF selector |

---

## 8. Status Badge Colors

| Status | Background | Text |
|--------|------------|------|
| Purchased | `zinc-500/20` | `zinc-300` |
| Repairing | `amber-500/20` | `amber-300` |
| Painting | `orange-500/20` | `orange-300` |
| Ready | `cyan-500/20` | `cyan-300` |
| Listed | `blue-500/20` | `blue-300` |
| Sold | `violet-500/20` | `violet-300` |
| Settled | `emerald-500/20` | `emerald-300` |
| Cancelled | `red-500/20` | `red-300` |

---

## 9. Motion & Animation

Using **Framer Motion** (already in repo).

| Interaction | Animation |
|-------------|-----------|
| Page enter | Fade + slide up 8px, 200ms |
| Card stagger | 50ms delay per card on dashboard load |
| KPI count-up | Animate number from 0 to value, 600ms |
| Modal open | Scale 0.95→1 + fade, 150ms |
| Toast enter | Slide from bottom, 200ms |
| Sidebar toggle | Width transition 200ms |
| Hover cards | `y: -2`, border glow |
| Status change | Badge color crossfade |
| Skeleton | Pulse shimmer |

**Reduced motion:** respect `prefers-reduced-motion: reduce`.

---

## 10. Loading States

Every data surface has three states:

1. **Loading** — skeleton matching final layout dimensions
2. **Empty** — illustration + helpful message + primary CTA
3. **Error** — message + retry button

No spinners except for button loading indicators.

---

## 11. Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 640px | Bottom tab nav, stacked cards, full-width tables scroll |
| Tablet | 640–1024px | Collapsible sidebar, 2-col KPI grid |
| Desktop | > 1024px | Full sidebar, 4-col KPI grid |

Touch targets: minimum 44×44px on mobile.

---

## 12. PWA Visual Assets

| Asset | Size | Notes |
|-------|------|-------|
| `icon-192.png` | 192×192 | App icon |
| `icon-512.png` | 512×512 | Splash + install |
| `apple-touch-icon` | 180×180 | iOS home screen |
| Splash screens | Various | Dark bg + centered logo |

`manifest.webmanifest`:

```json
{
  "name": "Automotive Capital",
  "short_name": "Auto Capital",
  "theme_color": "#08080C",
  "background_color": "#08080C",
  "display": "standalone",
  "start_url": "/dashboard"
}
```

---

## 13. CSS Architecture

```
src/capital/styles/
  tokens.css          # CSS custom properties
  globals.css         # Base styles, imported in Capital layout only
  glass.css           # Glassmorphism utilities
  typography.css      # Font faces and type scale
  animations.css      # Keyframes and motion utilities
```

Capital layout imports `src/capital/styles/globals.css`.

PG `app/globals.css` is **not** imported in Capital layout.

Tailwind config extends with `ac-*` color tokens via `@theme inline`.

---

## 14. Iconography

**Lucide React** icons throughout.

| Context | Icon |
|---------|------|
| Dashboard | `LayoutDashboard` |
| Assets | `Car` |
| Expenses | `Receipt` |
| Payments | `IndianRupee` or `Banknote` |
| Capital | `TrendingUp` |
| Ledger | `BookOpen` |
| Documents | `FileText` |
| Reports | `FileBarChart` |
| Settings | `Settings` |
| Search | `Search` |
| Quick add | `Plus` |
| Command | `Command` |

---

## 15. Accessibility

- WCAG 2.1 AA contrast ratios on text
- Focus rings: 2px accent outline
- Keyboard navigable: all interactive elements tabbable
- ARIA labels on icon-only buttons
- Screen reader announcements on toast/undo
- Form errors linked via `aria-describedby`

---

## 16. Dark Mode

Dark is the **only** mode in Phase 1. No toggle.

`theme_tokens` in settings allows accent color customization only.

---

## 17. Reference Screens

### Dashboard
- Top: 4×3 KPI card grid
- Middle: 2×2 chart cards (profit, cash flow, investments, expenses)
- Bottom: smart insight cards in horizontal scroll

### Asset Detail
- Header: registration, status badge, key metrics row
- Tabs: Timeline | Expenses | Documents | Payments | Profit | Ledger | Notes
- Right rail (desktop): quick stats + actions

### Login
- Full-screen gradient mesh
- Centered glass card, 400px max-width
- Logo + tagline + form + subtle footer
