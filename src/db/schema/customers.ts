import { sql } from 'drizzle-orm';
import { boolean, date, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { citext } from './customTypes';
import {
  authProviderEnum,
  genderEnum,
  idProofTypeEnum,
  kycStatusEnum,
  residencyStatusEnum,
} from './enums';

export type CustomerAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

export type EmergencyContact = {
  name: string;
  phone: string;
  relation: string;
};

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fullName: text('full_name').notNull(),
    email: citext('email').notNull(),
    phone: text('phone').notNull(),
    gender: genderEnum('gender').notNull(),
    dob: date('dob'),
    idProofType: idProofTypeEnum('id_proof_type'),
    // TODO(security): encrypt at rest via pgcrypto/pgp_sym_encrypt in a later phase.
    idProofNumber: text('id_proof_number'),
    idProofImageUrl: text('id_proof_image_url'),
    address: jsonb('address').$type<CustomerAddress>(),
    emergencyContact: jsonb('emergency_contact').$type<EmergencyContact>(),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('pending'),
    profileCompletedAt: timestamp('profile_completed_at', { withTimezone: true }),
    authProvider: authProviderEnum('auth_provider').notNull().default('email'),
    passwordHash: text('password_hash'),
    /** When true, customer must set a password before using the account. */
    mustSetPassword: boolean('must_set_password').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    residencyStatus: residencyStatusEnum('residency_status').notNull().default('active'),
    isTest: boolean('is_test').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customers_email_unique').on(t.email),
    uniqueIndex('customers_phone_unique').on(t.phone),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
