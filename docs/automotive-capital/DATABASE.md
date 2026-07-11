# Database — Automotive Capital

## 1. Principles

| Rule | Rationale |
|------|-----------|
| All money in **paise** (`bigint`) | No floating-point errors; India-native |
| **Append-only ledger** | Audit-grade financial history |
| **Reversals, not deletes** | Corrections preserve truth |
| **Assets are polymorphic** | Cars today; property/gold/loans tomorrow |
| **Separate Neon database** | `INVEST_DATABASE_URL` — zero PG table sharing |
| **snake_case** columns | Drizzle `casing: 'snake_case'` |
| **Restrict FK deletes** | `ON DELETE RESTRICT` on financial FKs |
| **Timestamps in UTC** | `timestamptz` everywhere |

---

## 2. Entity Relationship

```mermaid
erDiagram
  ac_settings {
    uuid id PK
    text business_name
    text logo_url
    int profit_share_numerator
    int profit_share_denominator
    text currency_code
    jsonb theme_tokens
  }

  ac_admin_users {
    uuid id PK
    text email UK
    text password_hash
    timestamptz last_login_at
  }

  ac_auth_sessions {
    uuid id PK
    uuid admin_user_id FK
    text token_hash
    timestamptz expires_at
    timestamptz revoked_at
  }

  ac_assets {
    uuid id PK
    text asset_class
    text status
    date purchase_date
    bigint purchase_price_paise
    bigint expected_sale_price_paise
    bigint actual_sale_price_paise
    date sale_date
    bigint total_expense_paise
    bigint total_investment_paise
    int holding_days
    bigint profit_paise
    int roi_bps
    text notes
  }

  ac_automotive_details {
    uuid asset_id PK_FK
    text manufacturer
    text model
    text variant
    int year
    text registration_number UK
    text vin
    text engine_number
    text chassis_number
    text color
    text purchase_notes
  }

  ac_categories {
    uuid id PK
    text slug UK
    text label
    text kind
    boolean is_system
    int sort_order
  }

  ac_capital_investments {
    uuid id PK
    date invested_at
    bigint amount_paise
    text payment_mode
    text reference_number
    text notes
  }

  ac_expenses {
    uuid id PK
    uuid asset_id FK
    uuid category_id FK
    date expense_date
    text vendor
    bigint amount_paise
    text description
    text payment_method
    text notes
    boolean is_reversed
    uuid reversal_of_id
  }

  ac_payments_received {
    uuid id PK
    uuid asset_id FK
    date received_at
    bigint amount_paise
    text payment_type
    bigint capital_returned_paise
    bigint profit_paise
    bigint adjustment_paise
    text payment_mode
    text reference_number
    text notes
    boolean is_reversed
    uuid reversal_of_id
  }

  ac_settlements {
    uuid id PK
    uuid asset_id FK
    date settled_at
    bigint total_investment_paise
    bigint total_received_paise
    bigint profit_paise
    bigint admin_share_paise
    bigint partner_share_paise
    text notes
  }

  ac_ledger_entries {
    uuid id PK
    text entry_type
    bigint amount_paise
    text direction
    uuid asset_id FK
    uuid source_table
    uuid source_id
    uuid reversal_of_entry_id FK
    text description
    jsonb metadata
    timestamptz created_at
  }

  ac_documents {
    uuid id PK
    uuid asset_id FK
    text document_type
    text file_name
    text blob_path
    text mime_type
    bigint file_size_bytes
    text notes
  }

  ac_activity_log {
    uuid id PK
    text action
    text entity_type
    uuid entity_id
    jsonb before_state
    jsonb after_state
    text ip_address
    text user_agent
    timestamptz created_at
  }

  ac_drafts {
    uuid id PK
    text draft_key UK
    jsonb payload
    timestamptz updated_at
  }

  ac_assets ||--o| ac_automotive_details : has
  ac_assets ||--o{ ac_expenses : has
  ac_assets ||--o{ ac_payments_received : receives
  ac_assets ||--o{ ac_settlements : settles
  ac_assets ||--o{ ac_documents : has
  ac_assets ||--o{ ac_ledger_entries : tracks
  ac_categories ||--o{ ac_expenses : classifies
  ac_admin_users ||--o{ ac_auth_sessions : has
```

---

## 3. Enums

### 3.1 `ac_asset_class`

```
automotive
property
gold
machinery
business
loan
```

Phase 1 only inserts `automotive`.

### 3.2 `ac_asset_status`

```
purchased
repairing
painting
ready
listed
sold
settled
cancelled
```

### 3.3 `ac_expense_category_slug` (seeded)

```
purchase
repair
painting
denting
engine
accessories
fuel
insurance
broker
transport
cleaning
rto
miscellaneous
```

### 3.4 `ac_payment_type`

```
capital_returned
profit
adjustment
refund
```

### 3.5 `ac_payment_mode`

```
cash
upi
neft
rtgs
cheque
bank
```

### 3.6 `ac_document_type`

```
purchase_invoice
repair_bill
insurance
rc
photo
sale_invoice
other
```

### 3.7 `ac_ledger_entry_type`

```
capital_investment
asset_purchase
expense
payment_received
settlement
reversal
adjustment
```

### 3.8 `ac_ledger_direction`

```
debit
credit
```

Convention: **debit increases cost basis / money out; credit decreases cost basis / money in** (asset accounting perspective from investor's viewpoint).

### 3.9 `ac_activity_action`

```
login
logout
login_failed
asset_created
asset_updated
asset_status_changed
expense_created
expense_reversed
payment_created
payment_reversed
capital_invested
settlement_created
document_uploaded
document_deleted
export_generated
settings_updated
```

---

## 4. Table Specifications

### 4.1 `ac_settings`

Singleton configuration row (enforced by check or application logic).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Fixed seed UUID |
| `business_name` | text | Display name |
| `logo_url` | text nullable | Blob path |
| `profit_share_numerator` | int | Default 1 |
| `profit_share_denominator` | int | Default 2 (50/50) |
| `currency_code` | text | Default `INR` |
| `theme_tokens` | jsonb | Accent colors override |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 4.2 `ac_admin_users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `email` | text UNIQUE | Lowercased |
| `password_hash` | text | scrypt |
| `display_name` | text nullable | |
| `last_login_at` | timestamptz nullable | |
| `created_at` | timestamptz | |

**Constraint:** Application enforces max 1 row (Phase 1).

### 4.3 `ac_auth_sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `admin_user_id` | uuid FK → ac_admin_users | |
| `token_hash` | text | SHA-256 of raw token |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz nullable | |
| `ip_address` | text nullable | |
| `user_agent` | text nullable | |
| `created_at` | timestamptz | |

Indexes: `token_hash`, `admin_user_id`, `expires_at`.

### 4.4 `ac_assets`

Generic asset root. All financial rollups cached here for query performance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `asset_class` | ac_asset_class | |
| `status` | ac_asset_status | |
| `display_name` | text | Computed: "2020 Honda City" |
| `purchase_date` | date | |
| `purchase_price_paise` | bigint | Base purchase cost |
| `expected_sale_price_paise` | bigint nullable | |
| `actual_sale_price_paise` | bigint nullable | Set on sale |
| `sale_date` | date nullable | |
| `total_expense_paise` | bigint | Cached SUM(expenses) |
| `total_investment_paise` | bigint | purchase + expenses |
| `holding_days` | int nullable | Cached |
| `profit_paise` | bigint nullable | actual_sale - total_investment |
| `roi_bps` | int nullable | Basis points |
| `capital_returned_paise` | bigint | Cached from payments |
| `profit_received_paise` | bigint | Cached from payments |
| `outstanding_paise` | bigint | Cached |
| `settlement_pct_bps` | int nullable | Basis points 0-10000 |
| `notes` | text nullable | |
| `cancelled_at` | timestamptz nullable | |
| `cancel_reason` | text nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes:
- `(status)`
- `(asset_class, status)`
- `(purchase_date)`
- `(sale_date)`
- GIN `(to_tsvector('english', coalesce(notes, '') || ' ' || coalesce(display_name, '')))`

### 4.5 `ac_automotive_details`

1:1 extension for `asset_class = automotive`.

| Column | Type | Notes |
|--------|------|-------|
| `asset_id` | uuid PK FK → ac_assets | CASCADE on asset delete blocked |
| `manufacturer` | text | |
| `model` | text | |
| `variant` | text nullable | |
| `year` | int | |
| `registration_number` | text UNIQUE | Normalized uppercase |
| `vin` | text nullable | |
| `engine_number` | text nullable | |
| `chassis_number` | text nullable | |
| `color` | text nullable | |
| `purchase_notes` | text nullable | |

Indexes: `registration_number`, `manufacturer`, `model`, `year`.

### 4.6 `ac_categories`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | text UNIQUE | |
| `label` | text | Display name |
| `kind` | text | `expense` (future: `income`) |
| `is_system` | boolean | Seeded categories |
| `is_active` | boolean | |
| `sort_order` | int | |

### 4.7 `ac_capital_investments`

Portfolio-level capital injections (not tied to a specific asset).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `invested_at` | date | |
| `amount_paise` | bigint | CHECK > 0 |
| `payment_mode` | ac_payment_mode | |
| `reference_number` | text nullable | |
| `notes` | text nullable | |
| `is_reversed` | boolean | Default false |
| `reversal_of_id` | uuid nullable | Self-FK |
| `created_at` | timestamptz | |

### 4.8 `ac_expenses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `asset_id` | uuid FK → ac_assets | NOT NULL |
| `category_id` | uuid FK → ac_categories | |
| `expense_date` | date | |
| `vendor` | text nullable | |
| `amount_paise` | bigint | CHECK > 0 |
| `description` | text | |
| `payment_method` | ac_payment_mode nullable | |
| `notes` | text nullable | |
| `is_reversed` | boolean | Default false |
| `reversal_of_id` | uuid nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `(asset_id, expense_date)`, `(category_id)`.

### 4.9 `ac_payments_received`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `asset_id` | uuid FK nullable | Null = portfolio-level payment |
| `received_at` | date | |
| `amount_paise` | bigint | CHECK > 0 |
| `payment_type` | ac_payment_type | |
| `capital_returned_paise` | bigint | Split component |
| `profit_paise` | bigint | Split component |
| `adjustment_paise` | bigint | Split component |
| `payment_mode` | ac_payment_mode | |
| `reference_number` | text nullable | |
| `notes` | text nullable | |
| `is_reversed` | boolean | |
| `reversal_of_id` | uuid nullable | |
| `created_at` | timestamptz | |

**CHECK:** `capital_returned_paise + profit_paise + adjustment_paise = amount_paise`

Indexes: `(asset_id, received_at)`, `(received_at)`.

### 4.10 `ac_settlements`

Formal profit settlement event per asset.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `asset_id` | uuid FK UNIQUE | One final settlement per asset |
| `settled_at` | date | |
| `total_investment_paise` | bigint | Snapshot |
| `total_received_paise` | bigint | Snapshot |
| `gross_profit_paise` | bigint | |
| `admin_share_paise` | bigint | Per profit_share ratio |
| `partner_share_paise` | bigint | |
| `notes` | text nullable | |
| `created_at` | timestamptz | |

### 4.11 `ac_ledger_entries` (SACRED)

**Never DELETE. Never UPDATE amount or direction after insert.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `entry_type` | ac_ledger_entry_type | |
| `direction` | ac_ledger_direction | |
| `amount_paise` | bigint | Always positive magnitude |
| `asset_id` | uuid FK nullable | |
| `source_table` | text | `expenses`, `payments_received`, etc. |
| `source_id` | uuid | FK to source row |
| `reversal_of_entry_id` | uuid FK nullable | Points to original |
| `description` | text | Human-readable |
| `metadata` | jsonb | Structured context |
| `created_at` | timestamptz | Immutable |

Indexes:
- `(asset_id, created_at)`
- `(entry_type, created_at)`
- `(source_table, source_id)`
- `(reversal_of_entry_id)`

**Trigger (optional):** Prevent UPDATE/DELETE via DB trigger for defense in depth.

### 4.12 `ac_documents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `asset_id` | uuid FK nullable | |
| `expense_id` | uuid FK nullable | |
| `payment_id` | uuid FK nullable | |
| `document_type` | ac_document_type | |
| `file_name` | text | Original filename |
| `blob_path` | text | Vercel Blob path |
| `mime_type` | text | |
| `file_size_bytes` | bigint | |
| `notes` | text nullable | |
| `created_at` | timestamptz | |

### 4.13 `ac_activity_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `action` | ac_activity_action | |
| `entity_type` | text | `asset`, `expense`, etc. |
| `entity_id` | uuid nullable | |
| `before_state` | jsonb nullable | |
| `after_state` | jsonb nullable | |
| `ip_address` | text nullable | |
| `user_agent` | text nullable | |
| `created_at` | timestamptz | |

Indexes: `(action, created_at)`, `(entity_type, entity_id)`, `(created_at DESC)`.

### 4.14 `ac_drafts`

Autosave for in-progress forms.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `draft_key` | text UNIQUE | e.g. `asset:new`, `expense:{assetId}` |
| `payload` | jsonb | Form state |
| `updated_at` | timestamptz | |

---

## 5. Computed Fields

### 5.1 Per Asset

```
total_expense_paise     = SUM(ac_expenses.amount WHERE NOT is_reversed)
total_investment_paise  = purchase_price_paise + total_expense_paise
holding_days            = COALESCE(sale_date, CURRENT_DATE) - purchase_date
profit_paise            = actual_sale_price_paise - total_investment_paise
roi_bps                 = (profit_paise * 10000) / total_investment_paise  [if > 0]
capital_returned_paise  = SUM(payments.capital_returned WHERE NOT reversed)
profit_received_paise   = SUM(payments.profit WHERE NOT reversed)
outstanding_paise       = total_investment_paise - capital_returned_paise
settlement_pct_bps      = (capital_returned + profit_received) * 10000 / total_investment
```

### 5.2 Portfolio

```
total_capital_invested  = SUM(ac_capital_investments) - reversals
total_capital_outstanding = total_capital_invested - SUM(capital_returned across all)
total_profit_earned     = SUM(profit_received)
total_profit_pending    = SUM(asset.profit_paise WHERE sold) - total_profit_earned
cash_received_month     = SUM(payments.amount WHERE received_at in month)
```

All portfolio aggregates computed in `AnalyticsService` with optimized SQL, not N+1.

---

## 6. Ledger Posting Rules

| Event | Entry type | Direction | Amount | Asset |
|-------|-----------|-----------|--------|-------|
| Capital invested | `capital_investment` | debit | amount | null |
| Asset purchased | `asset_purchase` | debit | purchase_price | asset_id |
| Expense added | `expense` | debit | amount | asset_id |
| Payment received (capital) | `payment_received` | credit | capital_portion | asset_id |
| Payment received (profit) | `payment_received` | credit | profit_portion | asset_id |
| Settlement | `settlement` | credit | settlement_amount | asset_id |
| Reversal | `reversal` | opposite | same magnitude | same |

Reversal creates a new entry with `reversal_of_entry_id` pointing to original. Source row marked `is_reversed = true`.

---

## 7. Migration Strategy

```
src/capital/db/
  schema/
    index.ts
    enums.ts
    settings.ts
    admin.ts
    assets.ts
    automotive.ts
    categories.ts
    capital.ts
    expenses.ts
    payments.ts
    settlements.ts
    ledger.ts
    documents.ts
    activity.ts
    drafts.ts
  migrations/
    0001_initial.sql
    ...
  client.ts
  migrate.ts
  seed.ts
```

**Seed script (`capital:db:seed`):**

1. Insert `ac_settings` singleton
2. Insert expense categories (13 system categories)
3. Create admin user from env if not exists
4. No demo assets unless `CAPITAL_SEED_DEMO=true`

**Drizzle config:** `capital/drizzle.config.ts` → `INVEST_DATABASE_URL`

---

## 8. Future Tables (Not Phase 1)

| Table | When |
|-------|------|
| `ac_property_details` | Property asset class |
| `ac_gold_details` | Gold asset class |
| `ac_machinery_details` | Machinery |
| `ac_business_details` | Business investments |
| `ac_loan_details` | Loans given |
| `ac_portfolio_snapshots` | Point-in-time portfolio valuation |
| `ac_search_index` | Materialized search (if needed at scale) |

These extend `ac_assets` without altering financial tables.

---

## 9. Index Strategy at Scale (₹10 Cr+)

- Partition `ac_ledger_entries` by year when >1M rows
- Materialized view `ac_portfolio_summary_mv` refreshed on mutation
- BRIN index on `ac_ledger_entries.created_at` for time-range scans
- Partial indexes: `WHERE NOT is_reversed` on expenses and payments

---

## 10. Backup & Recovery

- Neon point-in-time recovery (production)
- Ledger rebuild script: recompute cached fields from source tables
- Migration rollback: forward-only; reversals handle data corrections
