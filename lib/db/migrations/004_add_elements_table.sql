-- Migration: Add elements table for furniture and object library
-- Created: 2025-01-XX

CREATE TABLE IF NOT EXISTS elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  name_es VARCHAR(255), -- Spanish name for display
  category VARCHAR(100) NOT NULL CHECK (category IN ('chair', 'table', 'sofa', 'coffee_table', 'dining_table', 'desk', 'cabinet', 'shelf', 'bed', 'nightstand', 'lamp', 'rug', 'curtain', 'plant', 'artwork', 'accessory', 'other')),
  description TEXT, -- Description of the element
  leonardo_prompt TEXT NOT NULL, -- Optimized prompt for Leonardo AI to add this element
  negative_prompt TEXT, -- What to avoid when adding this element
  placement_hints TEXT, -- Text hints for where/how to place the element
  common_uses TEXT[], -- Array of common uses, e.g., ['living room', 'bedroom', 'office']
  dimensions JSONB, -- Optional: typical dimensions {width, height, depth, unit}
  style VARCHAR(100), -- e.g., 'modern', 'classic', 'scandinavian', 'industrial'
  color VARCHAR(7), -- Hex color code, e.g., #RRGGBB (optional, for color variants)
  material VARCHAR(100), -- e.g., 'wood', 'metal', 'fabric', 'leather'
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_elements_category ON elements(category);
CREATE INDEX IF NOT EXISTS idx_elements_name_es ON elements(name_es);
CREATE INDEX IF NOT EXISTS idx_elements_active ON elements(active);
CREATE INDEX IF NOT EXISTS idx_elements_style ON elements(style);

-- Insert initial elements
INSERT INTO elements (name, name_es, category, description, leonardo_prompt, negative_prompt, placement_hints, common_uses, style) VALUES
('Modern Chair 1', 'Silla Moderna 1', 'chair', 'Contemporary minimalist chair with clean lines', 'modern minimalist chair, clean geometric design, neutral colors, professional interior design', 'cluttered, ornate, vintage, colorful', 'Place near a desk or dining table. Ensure proper scale relative to the table.', ARRAY['office', 'dining room'], 'modern'),
('Modern Chair 2', 'Silla Moderna 2', 'chair', 'Elegant contemporary chair with subtle curves', 'elegant contemporary chair, subtle curves, sophisticated design, neutral tones', 'rustic, industrial, bright colors', 'Works well in dining areas or as accent seating.', ARRAY['dining room', 'living room'], 'modern'),
('Dining Table 1', 'Mesa de Comedor 1', 'dining_table', 'Large rectangular dining table', 'large rectangular dining table, modern design, wood or marble top, elegant legs', 'small, round, vintage', 'Center of dining room. Ensure adequate space around for chairs.', ARRAY['dining room'], 'modern'),
('Dining Table 2', 'Mesa de Comedor 2', 'dining_table', 'Round dining table for intimate settings', 'round dining table, intimate setting, elegant design, wood finish', 'rectangular, large, industrial', 'Perfect for smaller dining spaces or breakfast nooks.', ARRAY['dining room', 'kitchen'], 'classic'),
('Sofa 1', 'Sofá 1', 'sofa', 'Comfortable three-seater sofa', 'comfortable three-seater sofa, modern upholstery, neutral colors, elegant design', 'vintage, bright patterns, small', 'Main seating area in living room. Position facing focal point.', ARRAY['living room'], 'modern'),
('Sofa 2', 'Sofá 2', 'sofa', 'Elegant sectional sofa', 'elegant sectional sofa, contemporary design, luxurious fabric, sophisticated style', 'traditional, small, bright colors', 'Corner placement in living room. Creates cozy conversation area.', ARRAY['living room'], 'modern'),
('Coffee Table 1', 'Mesa de Centro 1', 'coffee_table', 'Modern rectangular coffee table', 'modern rectangular coffee table, clean lines, wood or glass top, minimalist design', 'ornate, vintage, small', 'Center of seating area, between sofa and chairs.', ARRAY['living room'], 'modern'),
('Coffee Table 2', 'Mesa de Centro 2', 'coffee_table', 'Round coffee table with storage', 'round coffee table with storage, modern design, functional and elegant', 'rectangular, ornate, small', 'Perfect for smaller living spaces. Provides storage.', ARRAY['living room'], 'modern'),
('Desk 1', 'Escritorio 1', 'desk', 'Modern office desk', 'modern office desk, clean design, ample workspace, professional appearance', 'vintage, ornate, small', 'Against wall or in center of office. Ensure good lighting.', ARRAY['office'], 'modern'),
('Cabinet 1', 'Gabinete 1', 'cabinet', 'Storage cabinet with doors', 'storage cabinet with doors, modern design, elegant hardware, functional storage', 'vintage, ornate, small', 'Against wall. Can serve as media console or storage.', ARRAY['living room', 'bedroom'], 'modern'),
('Bed 1', 'Cama 1', 'bed', 'Modern platform bed', 'modern platform bed, clean lines, elegant headboard, sophisticated design', 'vintage, ornate, traditional', 'Center of bedroom. Ensure space for nightstands.', ARRAY['bedroom'], 'modern'),
('Nightstand 1', 'Mesa de Noche 1', 'nightstand', 'Modern bedside table', 'modern bedside table, clean design, drawer storage, elegant finish', 'vintage, ornate, large', 'Beside bed, matching pair recommended.', ARRAY['bedroom'], 'modern'),
('Lamp 1', 'Lámpara 1', 'lamp', 'Modern table lamp', 'modern table lamp, elegant design, warm lighting, sophisticated style', 'vintage, ornate, bright', 'On desk, nightstand, or side table. Provides task lighting.', ARRAY['office', 'bedroom', 'living room'], 'modern'),
('Rug 1', 'Alfombra 1', 'rug', 'Modern area rug', 'modern area rug, neutral colors, elegant pattern, sophisticated design', 'vintage, bright patterns, small', 'Under seating area or dining table. Defines space.', ARRAY['living room', 'dining room'], 'modern'),
('Plant 1', 'Planta 1', 'plant', 'Decorative indoor plant', 'decorative indoor plant, modern planter, green foliage, elegant design', 'artificial, small, colorful pot', 'Corner placement or near window. Adds life to space.', ARRAY['living room', 'office', 'bedroom'], 'modern')
ON CONFLICT DO NOTHING;

