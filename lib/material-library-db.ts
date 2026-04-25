/**
 * Material Library Database Access
 * 
 * Fetches materials from database with fallback to static library
 */

import { Material, MaterialCategory, MATERIAL_LIBRARY, getMaterialsByCategory, getMaterialById, searchMaterials } from './material-library';
import { query } from './db';

export interface MaterialDB {
  id: string;
  name: string;
  name_es: string;
  category: MaterialCategory;
  color?: string;
  texture?: string;
  leonardo_prompt: string;
  negative_prompt?: string;
  common_uses?: string[];
  active: boolean;
}

/**
 * Convert database row to Material interface
 */
function dbRowToMaterial(row: MaterialDB): Material {
  return {
    id: row.id,
    name: row.name,
    nameEs: row.name_es,
    category: row.category,
    color: row.color || undefined,
    texture: row.texture || undefined,
    leonardoPrompt: row.leonardo_prompt,
    negativePrompt: row.negative_prompt || undefined,
    commonUses: row.common_uses || undefined,
  };
}

/**
 * Get all active materials from database
 */
export async function getMaterialsFromDB(): Promise<Material[]> {
  try {
    const result = await query(
      'SELECT * FROM materials WHERE active = true ORDER BY category, name_es',
      []
    );
    return result.rows.map(dbRowToMaterial);
  } catch (error) {
    console.error('Error fetching materials from database:', error);
    // Fallback to static library
    return MATERIAL_LIBRARY;
  }
}

/**
 * Get materials by category from database
 */
export async function getMaterialsByCategoryFromDB(
  category: MaterialCategory
): Promise<Material[]> {
  try {
    const result = await query(
      'SELECT * FROM materials WHERE category = $1 AND active = true ORDER BY name_es',
      [category]
    );
    return result.rows.map(dbRowToMaterial);
  } catch (error) {
    console.error('Error fetching materials by category:', error);
    return getMaterialsByCategory(category);
  }
}

/**
 * Get material by ID from database
 */
export async function getMaterialByIdFromDB(id: string): Promise<Material | null> {
  try {
    const result = await query(
      'SELECT * FROM materials WHERE id = $1 AND active = true',
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return dbRowToMaterial(result.rows[0]);
  } catch (error) {
    console.error('Error fetching material by ID:', error);
    return getMaterialById(id) || null;
  }
}

/**
 * Search materials in database
 */
export async function searchMaterialsInDB(searchQuery: string): Promise<Material[]> {
  try {
    const searchTerm = `%${searchQuery}%`;
    const result = await query(
      `SELECT * FROM materials 
       WHERE active = true 
       AND (name ILIKE $1 OR name_es ILIKE $1 OR texture ILIKE $1)
       ORDER BY category, name_es`,
      [searchTerm]
    );
    return result.rows.map(dbRowToMaterial);
  } catch (error) {
    console.error('Error searching materials:', error);
    return searchMaterials(searchQuery);
  }
}

