-- Multi-business, stage 3: each business's own peptide library and supplier price list.
-- New tables only, but they rely on the peppal_app role and row-level security from multi-business-2.sql,
-- so apply after it (at the switch-over for the live database).
-- Apply with: node scripts/applySql.mjs scripts/multi-business-3.sql
-- Then fill The Gene Protocol's copy: npx tsx scripts/seedPeptideLibrary.ts

-- Everything the Peptide Database, Protocol Builder and My Stack show, one row per record:
--   entry               a Peptide Database page (PeptideDbEntry), key = slug
--   peptide             a peptide the Protocol Builder offers (PeptideProtocolInfo), key = id
--   interaction         how two Protocol Builder peptides combine (PeptideInteraction), key = "<peptideA>|<peptideB>"
--   peptidedb-meta      Peptide DB dosing notes for a Protocol Builder peptide, key = peptide id
--   peptidedosages-meta Peptide Dosages dosing notes for a Protocol Builder peptide, key = peptide id
CREATE TABLE IF NOT EXISTS peptide_library (
  business_id text NOT NULL DEFAULT current_setting('app.business_id', true) REFERENCES businesses (id),
  kind text NOT NULL,
  key text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, kind, key)
);

-- The supplier's products a business picks from on supplier orders (was src/data/myProducts.ts).
-- options: [{ code, vialSize, priceUsd, inStock }]
CREATE TABLE IF NOT EXISTS supplier_catalog (
  business_id text NOT NULL DEFAULT current_setting('app.business_id', true) REFERENCES businesses (id),
  id text NOT NULL,
  name text NOT NULL,
  note text NOT NULL DEFAULT '',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON peptide_library, supplier_catalog TO peppal_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['peptide_library', 'supplier_catalog'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS business_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY business_isolation ON %I USING (business_id = current_setting(%L, true)) WITH CHECK (business_id = current_setting(%L, true))',
      t, 'app.business_id', 'app.business_id');
  END LOOP;
END $$;
