-- Database schema for BRDG JPMP backend

-- Create enum types
CREATE TYPE kiosk_type AS ENUM ('sweet', 'juice');
CREATE TYPE item_type AS ENUM ('sweet', 'juice', 'gift');
CREATE TYPE order_status AS ENUM ('pending', 'completed', 'canceled');
CREATE TYPE kiosk_role AS ENUM ('order', 'fulfill', 'customize');

-- Kiosk types (sweet, pastry, hat)
CREATE TABLE IF NOT EXISTS kiosks (
    id SERIAL PRIMARY KEY,
    type kiosk_type NOT NULL,
    nickname TEXT,
    enabled BOOLEAN DEFAULT true,
    role kiosk_role NOT NULL,
    client_kiosk_id INTEGER REFERENCES kiosks(id),
    app_version TEXT,
    app_platform TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT client_kiosk_role_check CHECK (
        (role = 'fulfill' AND client_kiosk_id IS NOT NULL) OR
        (role != 'fulfill' AND client_kiosk_id IS NULL)
    )
);

-- Items available at each kiosk type
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    kiosk_type kiosk_type NOT NULL,
    item_type item_type NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_items_slug ON items(slug);

-- Orders placed at kiosks
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    kiosk_id INTEGER REFERENCES kiosks(id),
    kiosk_type kiosk_type NOT NULL,
    status order_status NOT NULL DEFAULT 'pending',
    user_profile JSONB DEFAULT NULL,
    survey_response JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Items included in each order
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    item_id INTEGER REFERENCES items(id),
    customizations JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert juice items
INSERT INTO items (slug, kiosk_type, item_type, name, description, available) VALUES
    ('dailygreens', 'juice', 'juice', 'Greens Juice', 'Cucumber, Celery, Spinach, Lemon, Kale, Parsley', true),
    ('rootswithginger', 'juice', 'juice', 'Roots With Ginger', 'Apple, Lemon, Ginger, Beet', true),
    ('sweetcitrus', 'juice', 'juice', 'Sweet Citrus', 'Apple, Pineapple, Mint, Lemon', true);

-- Insert sweet items (Sugarfina)
INSERT INTO items (slug, kiosk_type, item_type, name, description, available) VALUES
    ('lemonshortbreadcookies', 'sweet', 'sweet', 'Lemon Shortbread Cookies', 'Brighten up your day with these delightful lemon-flavored shortbread bites dipped in a pastel coating.', true),
    ('darkchocolateseasaltcaramels', 'sweet', 'sweet', 'Dark Chocolate Sea Salt Caramels', 'Rich and creamy caramels are dipped in superfine dark chocolate, with just a kiss of sea salt. A perfect mix of sweet, salty, and indulgent.', true),
    ('peachbellinigummyhearts', 'sweet', 'sweet', 'Peach Bellini Gummy Hearts', 'These delicious gummies are filled with juicy peach flavor, then dusted in sweet and sour crystals.', true);

-- Insert gift items
INSERT INTO items (slug, kiosk_type, item_type, name, description, available) VALUES
    ('giftwithpurchase', 'sweet', 'gift', 'Gift With Purchase', 'A special surprise for our valued customers', true);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_items_kiosk_type ON items(kiosk_type);
CREATE INDEX IF NOT EXISTS idx_items_available ON items(available);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_kiosk_id ON orders(kiosk_id);

-- Create trigger to update kiosks.updated_at on any change
CREATE OR REPLACE FUNCTION update_kiosk_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kiosk_timestamp
    BEFORE UPDATE ON kiosks
    FOR EACH ROW
    EXECUTE FUNCTION update_kiosk_timestamp();

-- Create trigger to update orders.completed_at when status changes from pending
CREATE OR REPLACE FUNCTION update_order_completed_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'pending' AND (NEW.status = 'completed' OR NEW.status = 'canceled') THEN
        NEW.completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_completed_timestamp
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_order_completed_timestamp();
