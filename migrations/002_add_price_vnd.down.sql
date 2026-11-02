-- Removes all price_vnd values; price remains the source for v1.
ALTER TABLE menu_items DROP COLUMN price_vnd;
