-- Add shopper ID back document field and remove unused proof of address.
-- Existing rows will default id_back_url to NULL.

ALTER TABLE IF EXISTS shoppers
  ADD COLUMN IF NOT EXISTS id_back_url TEXT;

ALTER TABLE IF EXISTS shoppers
  DROP COLUMN IF EXISTS proof_of_address_url;
