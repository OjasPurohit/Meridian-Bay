-- =====================================================================================
-- 0008 — Cafe menu items carry their own stock
--
-- The kitchen manages the cafe's stock (portions / bottles on hand). Menu items are not products (they are not sold in
-- the shop and have no SKU), so the quantity lives on the menu item itself, exactly like products.stock_quantity does
-- for the shop: one number, never negative (the database refuses it). Cafe orders take stock off it; the kitchen
-- adjusts it by hand. No ledger table, no duplicate product rows. Existing items start with a sensible opening stock.
-- =====================================================================================

ALTER TABLE bar_menu_items ADD COLUMN stock_quantity integer NOT NULL DEFAULT 40 CHECK (stock_quantity >= 0);

ALTER TABLE bar_menu_items ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0);
