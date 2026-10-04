-- 0010_tax_overview.sql
-- Owner "Taxes to report": an INTERNAL finance overview (no government filing). Tax collected and taxable revenue are NOT stored:
-- they come from payments.tax_amount through the existing reports (one revenue calculation). Two small tables hold what
-- cannot be derived, plus the leave decision audit that 0004 had dropped.
--   tax_inputs  = input tax paid on the club's own purchases (the only legitimate source of Input Tax Credit; entered by the owner)
--   tax_periods = one row per calendar month the owner has marked as reported (an internal tracking flag, not a filing receipt)
--   leave_requests.decided_by_user_id / decided_at = who decided a leave request and when (NULL while PENDING)
-- Nothing existing is changed or removed; every new column is nullable.

CREATE TABLE tax_inputs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_date          date NOT NULL,                                           -- the supplier invoice date (IST business date)
  supplier            text NOT NULL,
  reference           text,                                                    -- supplier invoice number
  taxable_amount      numeric(12,2) NOT NULL CHECK (taxable_amount >= 0),      -- purchase value before tax
  tax_amount          numeric(12,2) NOT NULL CHECK (tax_amount >= 0),          -- tax paid on it
  is_eligible         boolean NOT NULL DEFAULT true,                           -- only eligible input tax counts as credit
  notes               text,
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tax_inputs_date_idx ON tax_inputs (input_date);

CREATE TABLE tax_periods (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period                 date NOT NULL UNIQUE CHECK (date_part('day', period) = 1),  -- first day of the month that was reported
  reported_at            timestamptz NOT NULL DEFAULT now(),
  reported_by_user_id    uuid REFERENCES users(id),
  notes                  text
);

CREATE TRIGGER trg_tax_inputs_updated_at BEFORE UPDATE ON tax_inputs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE leave_requests ADD COLUMN decided_by_user_id uuid REFERENCES users(id);
ALTER TABLE leave_requests ADD COLUMN decided_at timestamptz;

ALTER TABLE tax_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_periods ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE tax_inputs, tax_periods FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE tax_inputs, tax_periods FROM authenticated';
  END IF;
END $$;
