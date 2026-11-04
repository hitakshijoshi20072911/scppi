import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'

/** Phase 0 connectivity sentinel; business tables belong to Phase 1. */
export const phase0Baseline = pgTable('_vendorproof_phase0', {
  id: integer('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
