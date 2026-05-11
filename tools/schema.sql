CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  sheet_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  product_name TEXT,
  price TEXT,
  item_code TEXT,
  model TEXT,
  modifier TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  status_sell_ok INTEGER DEFAULT 0,
  status_repair_sell INTEGER DEFAULT 0,
  status_check_stock INTEGER DEFAULT 0,
  status_unconfirmed INTEGER DEFAULT 0,
  status_repair_only INTEGER DEFAULT 0,
  status_discontinued INTEGER DEFAULT 0,
  is_red_row BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT '조회',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for searching
CREATE INDEX IF NOT EXISTS idx_items_product_name ON items USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_item_code ON items (item_code);
CREATE INDEX IF NOT EXISTS idx_items_sheet_name ON items (sheet_name);
