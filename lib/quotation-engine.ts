/**
 * Quotation Engine
 * 
 * Automatically detects and manages quotation items from images
 * Supports versioning, space grouping, and automatic calculations
 */

import { query } from './db';

export interface QuotationItem {
  id?: string;
  space_id?: string | null;
  space_name?: string | null;
  item_name: string;
  category?: string | null;
  description?: string | null;
  dimensions?: Record<string, number>;
  materials?: string[];
  material_ids?: string[];
  quantity: number;
  unit_id?: string | null;
  unit_cost: number;
  labor_cost?: number;
  subtotal: number;
  iva_rate: number;
  price_with_iva: number;
  margin_rate: number;
  profit: number;
  image_id?: string | null;
  notes?: string | null;
}

export interface QuotationVersion {
  id: string;
  quote_id: string;
  version_number: number;
  changes_description: string;
  is_final: boolean;
  items: QuotationItem[];
  totals: {
    total_cost: number;
    total_with_iva: number;
    total_profit: number;
  };
}

/**
 * Auto-detect quotation items from an enhanced image
 * Analyzes image metadata to extract materials, elements, and create items
 */
export async function detectItemsFromImage(
  imageId: string,
  _projectId: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<QuotationItem[]> {
  try {
    // Get image with metadata
    const imageResult = await query(
      `SELECT i.*, p.project_type 
       FROM images i
       JOIN projects p ON i.project_id = p.id
       WHERE i.id = $1`,
      [imageId]
    );

    if (imageResult.rows.length === 0) {
      return [];
    }

    const image = imageResult.rows[0];
    const metadata = image.enhancement_metadata || {};
    const items: QuotationItem[] = [];

    // Detect from material replacements
    if (metadata.replacements && Array.isArray(metadata.replacements)) {
      for (const replacement of metadata.replacements) {
        if (replacement.toMaterialId) {
          // Get material cost
          const materialCostResult = await query(
            `SELECT mc.*, m.name_es as material_name
             FROM material_costs mc
             LEFT JOIN materials m ON mc.material_id = m.id
             WHERE mc.material_id = $1 AND mc.active = true
             ORDER BY mc.created_at DESC
             LIMIT 1`,
            [replacement.toMaterialId]
          );

          if (materialCostResult.rows.length > 0) {
            const cost = materialCostResult.rows[0];
            const item: QuotationItem = {
              item_name: `${replacement.targetElement} - ${cost.material_name || replacement.toMaterialName || 'Material'}`,
              category: replacement.targetElement,
              materials: [cost.material_name || replacement.toMaterialName || ''],
              material_ids: [replacement.toMaterialId],
              quantity: 1,
              unit_id: cost.unit_id,
              unit_cost: parseFloat(cost.base_cost) || 0,
              labor_cost: parseFloat(cost.labor_cost_per_unit) || 0,
              subtotal: 0, // Will be calculated by trigger
              iva_rate: 0.19, // Default, can be overridden
              price_with_iva: 0, // Will be calculated
              margin_rate: 0.30, // Default, can be overridden
              profit: 0, // Will be calculated
              image_id: imageId,
            };
            items.push(item);
          }
        }
      }
    }

    // Detect from element additions
    if (metadata.elements && Array.isArray(metadata.elements)) {
      for (const elementData of metadata.elements) {
        if (elementData.elementId) {
          // Get element cost
          const elementCostResult = await query(
            `SELECT ec.*, e.name_es as element_name, e.category as element_category
             FROM element_costs ec
             LEFT JOIN elements e ON ec.element_id = e.id
             WHERE ec.element_id = $1 AND ec.active = true
             ORDER BY ec.created_at DESC
             LIMIT 1`,
            [elementData.elementId]
          );

          if (elementCostResult.rows.length > 0) {
            const cost = elementCostResult.rows[0];
            const item: QuotationItem = {
              item_name: elementData.elementNameEs || elementData.elementName || cost.element_name || 'Elemento',
              category: cost.element_category || 'Otro',
              materials: [],
              quantity: 1,
              unit_id: cost.unit_id,
              unit_cost: parseFloat(cost.base_cost) || 0,
              labor_cost: parseFloat(cost.labor_cost_per_unit) || 0,
              subtotal: 0,
              iva_rate: 0.19,
              price_with_iva: 0,
              margin_rate: 0.30,
              profit: 0,
              image_id: imageId,
            };
            items.push(item);
          }
        }
      }
    }

    return items;
  } catch (error) {
    console.error('Error detecting items from image:', error);
    return [];
  }
}

/**
 * Get or create quotation for a project
 */
export async function getOrCreateQuotation(
  projectId: string,
  quoteType: 'furniture' | 'space' = 'space'
): Promise<string> {
  try {
    // Check if quotation exists
    const existingResult = await query(
      'SELECT id FROM quotes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0].id;
    }

    // Create new quotation
    const createResult = await query(
      `INSERT INTO quotes (project_id, quote_type, quote_data, total_amount, iva_rate, margin_rate, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        projectId,
        quoteType,
        JSON.stringify({}),
        0,
        0.19, // Default IVA
        0.30, // Default margin
        'draft',
      ]
    );

    const quoteId = createResult.rows[0].id;

    // Create initial version
    const versionResult = await query(
      `INSERT INTO quote_versions (quote_id, version_number, changes_description, is_final)
       VALUES ($1, 1, $2, false)
       RETURNING id`,
      [quoteId, 'Cotización inicial en blanco']
    );

    const versionId = versionResult.rows[0].id;

    // Set as current version
    await query(
      'UPDATE quotes SET current_version_id = $1 WHERE id = $2',
      [versionId, quoteId]
    );

    return quoteId;
  } catch (error) {
    console.error('Error getting/creating quotation:', error);
    throw error;
  }
}

/**
 * Create new quotation version from image changes
 */
export async function createQuotationVersionFromImage(
  quoteId: string,
  imageId: string,
  spaceId: string | null,
  userId?: string
): Promise<string> {
  try {
    // Get current version
    const currentVersionResult = await query(
      `SELECT version_number FROM quote_versions 
       WHERE quote_id = $1 
       ORDER BY version_number DESC 
       LIMIT 1`,
      [quoteId]
    );

    const nextVersion = currentVersionResult.rows.length > 0
      ? currentVersionResult.rows[0].version_number + 1
      : 1;

    // Create new version
    const versionResult = await query(
      `INSERT INTO quote_versions (quote_id, version_number, changes_description, is_final, created_by)
       VALUES ($1, $2, $3, false, $4)
       RETURNING id`,
      [
        quoteId,
        nextVersion,
        `Actualización automática desde imagen ${imageId}`,
        userId || null,
      ]
    );

    const versionId = versionResult.rows[0].id;

    // Copy items from previous version (if exists)
    if (nextVersion > 1) {
      const prevVersionResult = await query(
        `SELECT id FROM quote_versions 
         WHERE quote_id = $1 AND version_number = $2`,
        [quoteId, nextVersion - 1]
      );

      if (prevVersionResult.rows.length > 0) {
        const prevVersionId = prevVersionResult.rows[0].id;
        await query(
          `INSERT INTO quote_items (
            quote_version_id, space_id, item_name, category, description,
            dimensions, materials, material_ids, quantity, unit_id,
            unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
            margin_rate, profit, image_id, notes, display_order
          )
          SELECT 
            $1, space_id, item_name, category, description,
            dimensions, materials, material_ids, quantity, unit_id,
            unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
            margin_rate, profit, image_id, notes, display_order
          FROM quote_items
          WHERE quote_version_id = $2`,
          [versionId, prevVersionId]
        );
      }
    }

    // Detect and add new items from image
    const projectResult = await query(
      'SELECT project_id FROM quotes WHERE id = $1',
      [quoteId]
    );

    if (projectResult.rows.length > 0) {
      const projectId = projectResult.rows[0].project_id;
      const detectedItems = await detectItemsFromImage(imageId, projectId);

      for (const item of detectedItems) {
        await query(
          `INSERT INTO quote_items (
            quote_version_id, space_id, item_name, category, description,
            dimensions, materials, material_ids, quantity, unit_id,
            unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
            margin_rate, profit, image_id, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            versionId,
            spaceId || item.space_id || null,
            item.item_name,
            item.category || null,
            item.description || null,
            item.dimensions ? JSON.stringify(item.dimensions) : null,
            item.materials ? JSON.stringify(item.materials) : null,
            item.material_ids || null,
            item.quantity,
            item.unit_id || null,
            item.unit_cost,
            item.labor_cost || 0,
            item.subtotal,
            item.iva_rate,
            item.price_with_iva,
            item.margin_rate,
            item.profit,
            item.image_id || imageId,
            item.notes || null,
          ]
        );
      }
    }

    // Update quote with current version
    await query(
      'UPDATE quotes SET current_version_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [versionId, quoteId]
    );

    return versionId;
  } catch (error) {
    console.error('Error creating quotation version from image:', error);
    throw error;
  }
}

/**
 * Get quotation version with items grouped by space
 */
export async function getQuotationVersion(versionId: string): Promise<QuotationVersion | null> {
  try {
    const versionResult = await query(
      `SELECT qv.*, q.project_id, q.iva_rate as quote_iva_rate, q.margin_rate as quote_margin_rate
       FROM quote_versions qv
       JOIN quotes q ON qv.quote_id = q.id
       WHERE qv.id = $1`,
      [versionId]
    );

    if (versionResult.rows.length === 0) {
      return null;
    }

    const version = versionResult.rows[0];

    // Get items
    const itemsResult = await query(
      `SELECT qi.*, s.name as space_name
       FROM quote_items qi
       LEFT JOIN spaces s ON qi.space_id = s.id
       WHERE qi.quote_version_id = $1
       ORDER BY s.display_order, qi.display_order, qi.item_name`,
      [versionId]
    );

    const items = itemsResult.rows.map((row) => ({
      id: row.id,
      space_id: row.space_id,
      space_name: row.space_name || null,
      item_name: row.item_name,
      category: row.category,
      description: row.description,
      dimensions: row.dimensions,
      materials: row.materials,
      material_ids: row.material_ids,
      quantity: parseFloat(row.quantity),
      unit_id: row.unit_id,
      unit_cost: parseFloat(row.unit_cost),
      labor_cost: parseFloat(row.labor_cost || 0),
      subtotal: parseFloat(row.subtotal),
      iva_rate: parseFloat(row.iva_rate || version.quote_iva_rate || 0.19),
      price_with_iva: parseFloat(row.price_with_iva),
      margin_rate: parseFloat(row.margin_rate || version.quote_margin_rate || 0.30),
      profit: parseFloat(row.profit),
      image_id: row.image_id,
      notes: row.notes,
    }));

    // Calculate totals
    const totals = {
      total_cost: items.reduce((sum, item) => sum + item.subtotal, 0),
      total_with_iva: items.reduce((sum, item) => sum + item.price_with_iva, 0),
      total_profit: items.reduce((sum, item) => sum + item.profit, 0),
    };

    return {
      id: version.id,
      quote_id: version.quote_id,
      version_number: version.version_number,
      changes_description: version.changes_description,
      is_final: version.is_final,
      items,
      totals,
    };
  } catch (error) {
    console.error('Error getting quotation version:', error);
    return null;
  }
}

