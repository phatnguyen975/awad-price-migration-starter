-- Lossy: re-derive price from price_vnd; original sub-dong float digits are gone.
ALTER TABLE menu_items ADD COLUMN price REAL CHECK (price > 0);
UPDATE menu_items SET price = price_vnd / 1000.0 WHERE price_vnd IS NOT NULL;
