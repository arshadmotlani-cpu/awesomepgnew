import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  assetClassEnum,
  assetStatusEnum,
  fuelTypeEnum,
  ownershipEnum,
  profitDistributionModeEnum,
  profitShareModeEnum,
} from './enums';

export const acAssets = pgTable(
  'ac_assets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetClass: assetClassEnum('asset_class').notNull().default('automotive'),
    status: assetStatusEnum('status').notNull().default('purchased'),
    displayName: text('display_name').notNull(),
    purchaseDate: date('purchase_date').notNull(),
    /** Legacy — kept in sync with sellerPricePaise for older queries. */
    purchasePricePaise: bigint('purchase_price_paise', { mode: 'number' }).notNull(),
    /** Editable target budget (Expected Total Investment). */
    expectedTotalInvestmentPaise: bigint('expected_total_investment_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Negotiated seller price. */
    sellerPricePaise: bigint('seller_price_paise', { mode: 'number' }).notNull().default(0),
    /** Seller Price + costs − refunds (SSOT cache). */
    currentInvestmentPaise: bigint('current_investment_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Expected − Current Investment (SSOT cache; may be negative). */
    budgetRemainingPaise: bigint('budget_remaining_paise', { mode: 'number' })
      .notNull()
      .default(0),
    expectedSalePricePaise: bigint('expected_sale_price_paise', { mode: 'number' }),
    actualSalePricePaise: bigint('actual_sale_price_paise', { mode: 'number' }),
    saleDate: date('sale_date'),
    buyerName: text('buyer_name'),
    /** Signed expense sum (repairs − refunds/credits) */
    totalExpensePaise: bigint('total_expense_paise', { mode: 'number' }).notNull().default(0),
    /** Σ positive expenses (repairs) */
    repairTotalPaise: bigint('repair_total_paise', { mode: 'number' }).notNull().default(0),
    /** Σ |negative| expenses (dealer refunds / credits) */
    dealerRefundTotalPaise: bigint('dealer_refund_total_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /**
     * Alias of currentInvestmentPaise for list/report compatibility.
     * Current Investment = seller price + costs − refunds.
     */
    totalInvestmentPaise: bigint('total_investment_paise', { mode: 'number' }).notNull().default(0),
    /** Cached Σ non-reversed additional income (not part of TVI). */
    totalAdditionalIncomePaise: bigint('total_additional_income_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** @deprecated Funding removed from product — kept nullable/0. */
    fundingGapPaise: bigint('funding_gap_paise', { mode: 'number' }).notNull().default(0),
    holdingDays: integer('holding_days'),
    /** Gross Deal Profit = sale − current investment + additional income */
    profitPaise: bigint('profit_paise', { mode: 'number' }),
    roiBps: integer('roi_bps'),
    /**
     * Sale-time My vs Sufii split — SELF (100% me) or PARTNERSHIP_50_50.
     * NULL until the sale is recorded (not a purchase property).
     * Not the legacy percentage/fixed enum used by manual profits.
     */
    profitDistributionMode: profitDistributionModeEnum('profit_distribution_mode'),
    /** Profit distribution — set when sale is recorded (legacy manual-style enum) */
    profitShareMode: profitShareModeEnum('profit_share_mode'),
    /** Operating partner (Sufii) share of business profit, in bps */
    partnerSharePctBps: integer('partner_share_pct_bps'),
    /** My capital stake as % of total funding, in bps */
    mySharePctBps: integer('my_share_pct_bps'),
    myInvestmentPctBps: integer('my_investment_pct_bps'),
    /** Operating partner (Sufii) profit — alias of operatingPartnerProfitPaise for compatibility */
    partnerSharePaise: bigint('partner_share_paise', { mode: 'number' }),
    operatingPartnerProfitPaise: bigint('operating_partner_profit_paise', { mode: 'number' }),
    /** Investor Pool after Sufii cut */
    investorProfitPoolPaise: bigint('investor_profit_pool_paise', { mode: 'number' }),
    /** My slice of Investor Pool */
    mySharePaise: bigint('my_share_paise', { mode: 'number' }),
    businessRoiBps: integer('business_roi_bps'),
    myRoiBps: integer('my_roi_bps'),
    capitalReturnedPaise: bigint('capital_returned_paise', { mode: 'number' }).notNull().default(0),
    profitReceivedPaise: bigint('profit_received_paise', { mode: 'number' }).notNull().default(0),
    outstandingPaise: bigint('outstanding_paise', { mode: 'number' }).notNull().default(0),
    settlementPctBps: integer('settlement_pct_bps'),
    notes: text('notes'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    coverDocumentId: uuid('cover_document_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_assets_status_idx').on(t.status),
    index('ac_assets_class_status_idx').on(t.assetClass, t.status),
    index('ac_assets_purchase_date_idx').on(t.purchaseDate),
  ],
);

export const acAutomotiveDetails = pgTable(
  'ac_automotive_details',
  {
    assetId: uuid('asset_id')
      .primaryKey()
      .references(() => acAssets.id, { onDelete: 'restrict' }),
    manufacturer: text('manufacturer').notNull(),
    model: text('model').notNull(),
    variant: text('variant'),
    year: integer('year').notNull(),
    registrationNumber: text('registration_number').unique(),
    vin: text('vin'),
    engineNumber: text('engine_number'),
    chassisNumber: text('chassis_number'),
    color: text('color'),
    fuelType: fuelTypeEnum('fuel_type'),
    ownership: ownershipEnum('ownership'),
    purchaseNotes: text('purchase_notes'),
  },
  (t) => [
    index('ac_auto_reg_idx').on(t.registrationNumber),
    index('ac_auto_manufacturer_idx').on(t.manufacturer),
    index('ac_auto_model_idx').on(t.model),
  ],
);
