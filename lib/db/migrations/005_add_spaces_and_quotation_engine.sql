-- Migration: Add spaces, quotation items, versions, and cost libraries
-- Created: 2025-01-XX

-- Spaces table (rooms/areas within a project)
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spaces_project ON spaces(project_id);

-- Image-Space relationship (many-to-many)
CREATE TABLE IF NOT EXISTS image_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(image_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_image_spaces_image ON image_spaces(image_id);
CREATE INDEX IF NOT EXISTS idx_image_spaces_space ON image_spaces(space_id);

-- Cost Units table (configurable units of measure)
CREATE TABLE IF NOT EXISTS cost_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'unit', 'm2', 'm3', 'linear_m', 'kg'
  name_es VARCHAR(50), -- Spanish name
  symbol VARCHAR(10), -- e.g., 'u', 'm²', 'm³', 'm', 'kg'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default units
INSERT INTO cost_units (name, name_es, symbol, description) VALUES
('unit', 'Unidad', 'u', 'Single unit/item'),
('m2', 'Metro Cuadrado', 'm²', 'Square meters'),
('m3', 'Metro Cúbico', 'm³', 'Cubic meters'),
('linear_m', 'Metro Lineal', 'm', 'Linear meters'),
('kg', 'Kilogramo', 'kg', 'Kilograms'),
('roll', 'Rollo', 'roll', 'Rolls (e.g., wallpaper)'),
('sheet', 'Lámina', 'sheet', 'Sheets/panels')
ON CONFLICT (name) DO NOTHING;

-- Material Costs library
CREATE TABLE IF NOT EXISTS material_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL, -- Link to materials table
  name VARCHAR(255) NOT NULL, -- Material name (can be standalone or linked)
  unit_id UUID NOT NULL REFERENCES cost_units(id),
  base_cost DECIMAL(12, 4) NOT NULL, -- Cost per unit
  labor_cost_per_unit DECIMAL(12, 4) DEFAULT 0, -- Labor cost per unit
  supplier VARCHAR(255),
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_material_costs_material ON material_costs(material_id);
CREATE INDEX IF NOT EXISTS idx_material_costs_active ON material_costs(active);

-- Element Costs library
CREATE TABLE IF NOT EXISTS element_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id UUID REFERENCES elements(id) ON DELETE SET NULL, -- Link to elements table
  name VARCHAR(255) NOT NULL, -- Element name (can be standalone or linked)
  unit_id UUID NOT NULL REFERENCES cost_units(id),
  base_cost DECIMAL(12, 4) NOT NULL, -- Cost per unit
  labor_cost_per_unit DECIMAL(12, 4) DEFAULT 0, -- Labor cost per unit
  supplier VARCHAR(255),
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_element_costs_element ON element_costs(element_id);
CREATE INDEX IF NOT EXISTS idx_element_costs_active ON element_costs(active);

-- Labor Costs library (general labor rates)
CREATE TABLE IF NOT EXISTS labor_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- e.g., 'Corte y Canto', 'Mano de Obra Bola8', 'Instalación'
  name_es VARCHAR(255),
  category VARCHAR(100), -- e.g., 'cutting', 'assembly', 'installation', 'finishing'
  unit_id UUID NOT NULL REFERENCES cost_units(id),
  rate_per_unit DECIMAL(12, 4) NOT NULL, -- Labor rate per unit
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_labor_costs_active ON labor_costs(active);
CREATE INDEX IF NOT EXISTS idx_labor_costs_category ON labor_costs(category);

-- Quote Versions (tracks each version of a quotation)
CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changes_description TEXT, -- Description of what changed in this version
  is_final BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  UNIQUE(quote_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quote_versions_quote ON quote_versions(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_versions_final ON quote_versions(is_final);

-- Quote Items (individual items in a quotation, grouped by space)
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_version_id UUID NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  space_id UUID REFERENCES spaces(id) ON DELETE SET NULL, -- Group by space
  item_name VARCHAR(255) NOT NULL, -- e.g., "SILLAS OPCION 1", "MESA DE COMEDOR"
  category VARCHAR(100), -- e.g., "Comedor", "Sala principal"
  description TEXT,
  
  -- Dimensions
  dimensions JSONB, -- {"largo": 1.8, "alto": 0.9, "profundidad": 0.75}
  
  -- Materials (can reference material_costs or be free text)
  materials JSONB, -- Array of material references or strings
  material_ids UUID[], -- References to material_costs
  
  -- Costs
  quantity DECIMAL(12, 4) NOT NULL DEFAULT 1.0,
  unit_id UUID REFERENCES cost_units(id),
  unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0.0,
  labor_cost DECIMAL(12, 4) DEFAULT 0.0,
  subtotal DECIMAL(12, 4) NOT NULL DEFAULT 0.0, -- quantity * (unit_cost + labor_cost)
  
  -- Pricing
  iva_rate DECIMAL(5, 4) DEFAULT 0.19, -- IVA rate (default 19%)
  price_with_iva DECIMAL(12, 4) NOT NULL DEFAULT 0.0, -- subtotal * (1 + iva_rate)
  margin_rate DECIMAL(5, 4) DEFAULT 0.30, -- Margin rate (default 30%)
  profit DECIMAL(12, 4) NOT NULL DEFAULT 0.0, -- Calculated profit
  
  -- Visual reference
  image_id UUID REFERENCES images(id) ON DELETE SET NULL, -- Link to enhanced image
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_quote_items_version ON quote_items(quote_version_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_space ON quote_items(space_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_image ON quote_items(image_id);

-- Update quotes table to support new structure
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS iva_rate DECIMAL(5, 4) DEFAULT 0.19,
ADD COLUMN IF NOT EXISTS margin_rate DECIMAL(5, 4) DEFAULT 0.30,
ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES quote_versions(id);

-- Add trigger to auto-calculate quote item totals
CREATE OR REPLACE FUNCTION calculate_quote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate subtotal
  NEW.subtotal := NEW.quantity * (NEW.unit_cost + NEW.labor_cost);
  
  -- Calculate price with IVA
  NEW.price_with_iva := NEW.subtotal * (1 + NEW.iva_rate);
  
  -- Calculate profit (margin applied to price_with_iva)
  NEW.profit := NEW.price_with_iva * NEW.margin_rate;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_quote_item_totals
BEFORE INSERT OR UPDATE ON quote_items
FOR EACH ROW
EXECUTE FUNCTION calculate_quote_item_totals();

