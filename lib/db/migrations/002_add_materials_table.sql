-- Migration: Add materials table for dynamic material library management
-- Created: 2025-01-XX

CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  name_es VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'flooring', 'furniture', 'wall', 'fabric', 'metal', 'wood', 
    'stone', 'glass', 'ceramic', 'paint'
  )),
  color VARCHAR(7), -- Hex color code
  texture TEXT,
  leonardo_prompt TEXT NOT NULL,
  negative_prompt TEXT,
  common_uses TEXT[], -- Array of common uses
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

-- Index for faster category searches
CREATE INDEX idx_materials_category ON materials(category);
CREATE INDEX idx_materials_active ON materials(active);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial materials from the static library
INSERT INTO materials (name, name_es, category, color, texture, leonardo_prompt, negative_prompt, common_uses) VALUES
-- FLOORING
('Oak Wood Floor', 'Piso de Roble', 'flooring', '#D4A574', 'natural wood grain', 
 'natural oak wood flooring, warm honey tones, smooth polished finish, realistic wood grain texture, professional interior design',
 'artificial, plastic, glossy, unrealistic',
 ARRAY['living room', 'bedroom', 'office']),

('Walnut Wood Floor', 'Piso de Nogal', 'flooring', '#5C4033', 'rich dark wood grain',
 'luxurious walnut wood flooring, rich dark brown tones, elegant wood grain pattern, polished finish, high-end interior design',
 'light, faded, damaged, unrealistic',
 ARRAY['living room', 'dining room', 'office']),

('White Marble Floor', 'Piso de Mármol Blanco', 'flooring', '#F5F5F5', 'veined marble',
 'premium white marble flooring, elegant gray veining, polished glossy surface, luxurious interior design, realistic marble texture',
 'matte, dull, artificial stone, plastic',
 ARRAY['bathroom', 'entryway', 'luxury spaces']),

('Gray Porcelain Tile', 'Azulejo de Porcelana Gris', 'flooring', '#808080', 'smooth ceramic',
 'modern gray porcelain tile flooring, matte finish, contemporary design, clean lines, professional installation',
 'glossy, shiny, outdated, damaged',
 ARRAY['kitchen', 'bathroom', 'modern spaces']),

('Parquet Hardwood', 'Parquet de Madera', 'flooring', '#8B7355', 'geometric wood pattern',
 'classic parquet hardwood flooring, herringbone pattern, rich wood tones, elegant geometric design, traditional interior',
 'modern, minimalist, plain, damaged',
 ARRAY['dining room', 'living room', 'classic spaces']),

-- FURNITURE - WOOD
('Oak Furniture', 'Mueble de Roble', 'furniture', '#D4A574', 'natural wood grain',
 'solid oak furniture, natural wood grain texture, warm honey tones, smooth finish, quality craftsmanship',
 'plastic, particle board, cheap, damaged',
 ARRAY['tables', 'chairs', 'cabinets']),

('Walnut Furniture', 'Mueble de Nogal', 'furniture', '#5C4033', 'rich dark wood',
 'luxurious walnut furniture, rich dark brown wood, elegant grain pattern, premium finish, high-end design',
 'light wood, cheap, damaged, unrealistic',
 ARRAY['dining tables', 'desks', 'shelves']),

('Teak Furniture', 'Mueble de Teca', 'furniture', '#B8860B', 'golden brown wood',
 'premium teak furniture, golden brown tones, natural wood grain, weather-resistant finish, elegant design',
 'dark, black, damaged, faded',
 ARRAY['outdoor furniture', 'modern pieces']),

-- FURNITURE - FABRIC
('Linen Fabric', 'Tela de Lino', 'fabric', '#FAF0E6', 'natural linen weave',
 'natural linen fabric upholstery, soft texture, elegant beige tones, premium quality, sophisticated design',
 'synthetic, shiny, cheap, wrinkled',
 ARRAY['sofas', 'chairs', 'curtains']),

('Velvet Fabric', 'Tela de Terciopelo', 'fabric', '#8B0000', 'luxurious velvet',
 'luxurious velvet fabric, rich deep color, soft plush texture, elegant sheen, premium upholstery',
 'matte, flat, cheap fabric, damaged',
 ARRAY['sofas', 'armchairs', 'cushions']),

('Brown Leather', 'Cuero Marrón', 'fabric', '#654321', 'genuine leather',
 'premium brown leather, genuine hide texture, rich patina, elegant aging, luxury furniture',
 'fake leather, plastic, cheap, damaged',
 ARRAY['sofas', 'chairs', 'ottomans']),

('Black Leather', 'Cuero Negro', 'fabric', '#1C1C1C', 'genuine black leather',
 'premium black leather, smooth texture, elegant finish, modern design, luxury furniture',
 'brown, faded, damaged, fake',
 ARRAY['modern sofas', 'office chairs']),

-- WALLS
('White Paint', 'Pintura Blanca', 'paint', '#FFFFFF', 'smooth matte',
 'clean white matte paint, smooth wall surface, professional finish, modern interior design',
 'glossy, textured, yellowed, damaged',
 ARRAY['walls', 'ceilings']),

('Beige Paint', 'Pintura Beige', 'paint', '#F5F5DC', 'smooth matte',
 'warm beige matte paint, elegant neutral tone, smooth finish, sophisticated interior design',
 'bright, yellow, orange, damaged',
 ARRAY['walls', 'living rooms']),

('Gray Paint', 'Pintura Gris', 'paint', '#808080', 'smooth matte',
 'modern gray matte paint, contemporary neutral tone, smooth professional finish, elegant design',
 'blue, purple, bright, damaged',
 ARRAY['modern spaces', 'offices']),

('Exposed Brick', 'Ladrillo Expuesto', 'wall', '#8B4513', 'rough brick',
 'exposed brick wall, natural red brick texture, authentic aged appearance, industrial design, realistic brick pattern',
 'smooth, painted, new, artificial',
 ARRAY['accent walls', 'industrial spaces']),

-- METAL
('Brass', 'Latón', 'metal', '#B8860B', 'polished brass',
 'polished brass metal, warm golden tone, elegant shine, premium finish, luxury hardware',
 'rusty, tarnished, silver, chrome',
 ARRAY['hardware', 'fixtures', 'decor']),

('Chrome', 'Cromo', 'metal', '#C0C0C0', 'mirror finish',
 'polished chrome metal, mirror-like finish, modern design, sleek appearance, contemporary hardware',
 'brass, gold, matte, rusty',
 ARRAY['fixtures', 'hardware', 'modern spaces']),

('Black Metal', 'Metal Negro', 'metal', '#1C1C1C', 'matte black',
 'matte black metal, modern finish, contemporary design, sleek appearance, premium hardware',
 'shiny, chrome, brass, damaged',
 ARRAY['modern fixtures', 'hardware']),

-- STONE
('Granite Counter', 'Encimera de Granito', 'stone', '#696969', 'speckled granite',
 'premium granite countertop, natural stone texture, elegant speckled pattern, polished finish, luxury kitchen',
 'matte, artificial, damaged, cheap',
 ARRAY['kitchen counters', 'bathroom vanities']),

('Quartz Counter', 'Encimera de Cuarzo', 'stone', '#F5F5F5', 'engineered quartz',
 'premium quartz countertop, smooth surface, elegant pattern, polished finish, modern kitchen design',
 'rough, natural stone, damaged, cheap',
 ARRAY['kitchen counters', 'bathroom vanities'])
ON CONFLICT DO NOTHING;

