-- Invite links: pepbiz.io/start?invite=<code>. Each code works once and gives the business a longer free trial
-- (trial_days, 30 unless set) instead of the usual 14 days, then the normal price.
-- Additive and safe to run before the new code goes live. Re-runnable.
-- Usage: node scripts/applySql.mjs scripts/invites.sql   (dev)
--        powershell -ExecutionPolicy Bypass -File scripts\applyLive.ps1 scripts\invites.sql   (live)

CREATE TABLE IF NOT EXISTS signup_invites (
    code text PRIMARY KEY,
    note text NOT NULL DEFAULT '',
    -- The business that used it (cleared if that business is ever deleted - the code stays used).
    business_id text REFERENCES businesses(id) ON DELETE SET NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE signup_invites ADD COLUMN IF NOT EXISTS trial_days integer;
UPDATE signup_invites SET trial_days = 30 WHERE trial_days IS NULL;
ALTER TABLE signup_invites ALTER COLUMN trial_days SET DEFAULT 30;
ALTER TABLE signup_invites ALTER COLUMN trial_days SET NOT NULL;

-- A business's own free-trial length, from its invite (NULL = the usual 14 days).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_days integer;

-- The first testers (2026-10-16): three invited, two spare - each a 30-day free trial.
INSERT INTO signup_invites (code, note, trial_days) VALUES
    ('pb-9yhhcsac', 'Tester 1', 30),
    ('pb-tavam5hf', 'Tester 2', 30),
    ('pb-2c36rjc5', 'Tester 3', 30),
    ('pb-kc8bcb7t', 'Spare 1', 30),
    ('pb-ev4euv7h', 'Spare 2', 30)
ON CONFLICT (code) DO NOTHING;
