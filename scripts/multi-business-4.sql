-- Multi-business, stage 4: businesses sign up and pay a monthly subscription (Stripe).
-- Additive; apply after multi-business-3.sql.
-- Apply with: node scripts/applySql.mjs scripts/multi-business-4.sql

-- Where the business is: 'NZ' pays in NZD, 'INTL' (anywhere else) in USD.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'NZ';
-- Businesses that never pay (The Gene Protocol).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
-- Kept in step with Stripe (api/_lib/billing.ts). subscription_status is Stripe's: trialing, active, past_due, canceled...
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
-- Who signed the business up (for contacting them about billing).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_email text NOT NULL DEFAULT '';

UPDATE businesses SET billing_exempt = true WHERE id = 'tgp';

-- businesses.status is now only for the platform owner to suspend a business by hand ("active" | "suspended").
UPDATE businesses SET status = 'active' WHERE status = 'paused';
