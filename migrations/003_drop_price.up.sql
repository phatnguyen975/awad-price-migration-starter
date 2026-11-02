-- Refuse to lose the only source value if the backfill was not completed.
-- The runner rolls back the whole migration on a NOT NULL violation here.
CREATE TABLE _guard_price_vnd (x INTEGER NOT NULL);
INSERT INTO _guard_price_vnd SELECT NULL WHERE EXISTS (SELECT 1 FROM menu_items WHERE price_vnd IS NULL);
DROP TABLE _guard_price_vnd;

ALTER TABLE menu_items DROP COLUMN price;
