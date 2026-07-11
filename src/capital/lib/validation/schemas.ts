import { z } from 'zod';

const rupees = z.coerce.number().positive('Amount must be greater than zero');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');
const uuid = z.string().uuid();
const paymentMode = z.enum(['cash', 'upi', 'neft', 'rtgs', 'cheque', 'bank']);
const paymentType = z.enum(['capital_returned', 'profit', 'adjustment', 'refund']);
const assetStatus = z.enum([
  'purchased', 'repairing', 'painting', 'ready', 'listed', 'sold', 'settled', 'cancelled',
]);
const documentType = z.enum([
  'purchase_invoice', 'repair_bill', 'insurance', 'rc', 'photo', 'sale_invoice', 'other',
]);

export const createAssetSchema = z.object({
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  model: z.string().min(1, 'Model is required'),
  fuelType: z.enum(['petrol', 'diesel', 'cng', 'ev', 'hybrid']),
  year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  ownership: z.enum(['first_owner', 'second_owner', 'third_owner']),
  purchaseDate: dateStr,
  purchasePrice: rupees,
  notes: z.string().optional(),
});

export const createExpenseSchema = z.object({
  assetId: uuid,
  categoryId: uuid,
  expenseDate: dateStr,
  amount: rupees,
  description: z.string().min(1, 'Description is required'),
  vendor: z.string().optional(),
  paymentMethod: paymentMode.optional(),
  notes: z.string().optional(),
});

export const createPaymentSchema = z
  .object({
    assetId: z.string().uuid().optional().or(z.literal('')),
    receivedAt: dateStr,
    amount: rupees,
    paymentType,
    capitalReturned: z.coerce.number().min(0),
    profit: z.coerce.number().min(0),
    adjustment: z.coerce.number().min(0),
    paymentMode,
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (d) => Math.round(d.capitalReturned * 100) + Math.round(d.profit * 100) + Math.round(d.adjustment * 100) === Math.round(d.amount * 100),
    { message: 'Split must equal total amount', path: ['amount'] },
  );

export const createCapitalSchema = z.object({
  investedAt: dateStr,
  amount: rupees,
  paymentMode,
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const createManualProfitSchema = z.object({
  profitDate: dateStr,
  amount: rupees,
  source: z.string().min(1, 'Source is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.enum(['investment_return', 'adjustment', 'bonus', 'settlement', 'other']),
});

export const recordSaleSchema = z.object({
  assetId: uuid,
  salePrice: rupees,
  saleDate: dateStr,
});

export const updateStatusSchema = z.object({
  assetId: uuid,
  status: assetStatus,
});

export const reverseSchema = z.object({
  id: uuid,
  reason: z.string().min(1, 'Reason is required'),
});

export const uploadDocumentSchema = z.object({
  assetId: z.string().uuid().optional().or(z.literal('')),
  documentType,
  notes: z.string().optional(),
});

export const updateSettingsSchema = z.object({
  businessName: z.string().min(1),
  profitShareNumerator: z.coerce.number().int().positive(),
  profitShareDenominator: z.coerce.number().int().positive(),
  currencyCode: z.string().min(3).max(3),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: z.string().optional(),
  search: z.string().optional(),
  manufacturer: z.string().optional(),
  sort: z.enum(['created', 'purchase', 'investment', 'profit', 'holding']).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
  profitFilter: z.enum(['all', 'profit', 'loss']).default('all'),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateCapitalInput = z.infer<typeof createCapitalSchema>;
export type CreateManualProfitInput = z.infer<typeof createManualProfitSchema>;
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
