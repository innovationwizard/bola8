-- Migration: Seed initial costs and prices for all materials and elements
-- Created: 2025-01-XX

-- Get default unit_id for 'unit'
DO $$
DECLARE
  default_unit_id UUID;
BEGIN
  SELECT id INTO default_unit_id FROM cost_units WHERE name = 'unit' LIMIT 1;
  
  IF default_unit_id IS NULL THEN
    -- Create unit if it doesn't exist
    INSERT INTO cost_units (name, name_es, symbol, description)
    VALUES ('unit', 'Unidad', 'u', 'Single unit/item')
    RETURNING id INTO default_unit_id;
  END IF;

  -- Seed material costs for all active materials
  INSERT INTO material_costs (material_id, name, unit_id, base_cost, labor_cost_per_unit, active)
  SELECT 
    m.id,
    COALESCE(m.name_es, m.name) as name,
    default_unit_id,
    1.00 as base_cost,
    0.00 as labor_cost_per_unit,
    true
  FROM materials m
  WHERE m.active = true
  AND NOT EXISTS (
    SELECT 1 FROM material_costs mc WHERE mc.material_id = m.id
  );

  -- Seed element costs for all active elements
  INSERT INTO element_costs (element_id, name, unit_id, base_cost, labor_cost_per_unit, active)
  SELECT 
    e.id,
    COALESCE(e.name_es, e.name) as name,
    default_unit_id,
    1.00 as base_cost,
    0.00 as labor_cost_per_unit,
    true
  FROM elements e
  WHERE e.active = true
  AND NOT EXISTS (
    SELECT 1 FROM element_costs ec WHERE ec.element_id = e.id
  );

END $$;

