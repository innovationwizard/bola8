/**
 * Material Library System
 * 
 * Pre-defined materials and colors for easy image manipulation.
 * Each material includes optimized prompts for Leonardo AI.
 */

export type MaterialCategory = 
  | 'flooring' 
  | 'furniture' 
  | 'wall' 
  | 'fabric' 
  | 'metal' 
  | 'wood'
  | 'stone'
  | 'glass'
  | 'ceramic'
  | 'paint';

export interface Material {
  id: string;
  name: string;
  nameEs: string; // Spanish name
  category: MaterialCategory;
  color?: string; // Hex color code
  texture?: string; // Texture description
  leonardoPrompt: string; // Optimized prompt for Leonardo AI
  negativePrompt?: string; // What to avoid
  commonUses?: string[]; // Where this material is commonly used
}

export const MATERIAL_LIBRARY: Material[] = [
  // FLOORING
  {
    id: 'oak-wood-floor',
    name: 'Oak Wood Floor',
    nameEs: 'Piso de Roble',
    category: 'flooring',
    color: '#D4A574',
    texture: 'natural wood grain',
    leonardoPrompt: 'natural oak wood flooring, warm honey tones, smooth polished finish, realistic wood grain texture, professional interior design',
    negativePrompt: 'artificial, plastic, glossy, unrealistic',
    commonUses: ['living room', 'bedroom', 'office']
  },
  {
    id: 'walnut-wood-floor',
    name: 'Walnut Wood Floor',
    nameEs: 'Piso de Nogal',
    category: 'flooring',
    color: '#5C4033',
    texture: 'rich dark wood grain',
    leonardoPrompt: 'luxurious walnut wood flooring, rich dark brown tones, elegant wood grain pattern, polished finish, high-end interior design',
    negativePrompt: 'light, faded, damaged, unrealistic',
    commonUses: ['living room', 'dining room', 'office']
  },
  {
    id: 'white-marble-floor',
    name: 'White Marble Floor',
    nameEs: 'Piso de Mármol Blanco',
    category: 'flooring',
    color: '#F5F5F5',
    texture: 'veined marble',
    leonardoPrompt: 'premium white marble flooring, elegant gray veining, polished glossy surface, luxurious interior design, realistic marble texture',
    negativePrompt: 'matte, dull, artificial stone, plastic',
    commonUses: ['bathroom', 'entryway', 'luxury spaces']
  },
  {
    id: 'gray-porcelain-tile',
    name: 'Gray Porcelain Tile',
    nameEs: 'Azulejo de Porcelana Gris',
    category: 'flooring',
    color: '#808080',
    texture: 'smooth ceramic',
    leonardoPrompt: 'modern gray porcelain tile flooring, matte finish, contemporary design, clean lines, professional installation',
    negativePrompt: 'glossy, shiny, outdated, damaged',
    commonUses: ['kitchen', 'bathroom', 'modern spaces']
  },
  {
    id: 'hardwood-parquet',
    name: 'Parquet Hardwood',
    nameEs: 'Parquet de Madera',
    category: 'flooring',
    color: '#8B7355',
    texture: 'geometric wood pattern',
    leonardoPrompt: 'classic parquet hardwood flooring, herringbone pattern, rich wood tones, elegant geometric design, traditional interior',
    negativePrompt: 'modern, minimalist, plain, damaged',
    commonUses: ['dining room', 'living room', 'classic spaces']
  },

  // FURNITURE - WOOD
  {
    id: 'oak-furniture',
    name: 'Oak Furniture',
    nameEs: 'Mueble de Roble',
    category: 'furniture',
    color: '#D4A574',
    texture: 'natural wood grain',
    leonardoPrompt: 'solid oak furniture, natural wood grain texture, warm honey tones, smooth finish, quality craftsmanship',
    negativePrompt: 'plastic, particle board, cheap, damaged',
    commonUses: ['tables', 'chairs', 'cabinets']
  },
  {
    id: 'walnut-furniture',
    name: 'Walnut Furniture',
    nameEs: 'Mueble de Nogal',
    category: 'furniture',
    color: '#5C4033',
    texture: 'rich dark wood',
    leonardoPrompt: 'luxurious walnut furniture, rich dark brown wood, elegant grain pattern, premium finish, high-end design',
    negativePrompt: 'light wood, cheap, damaged, unrealistic',
    commonUses: ['dining tables', 'desks', 'shelves']
  },
  {
    id: 'teak-furniture',
    name: 'Teak Furniture',
    nameEs: 'Mueble de Teca',
    category: 'furniture',
    color: '#B8860B',
    texture: 'golden brown wood',
    leonardoPrompt: 'premium teak furniture, golden brown tones, natural wood grain, weather-resistant finish, elegant design',
    negativePrompt: 'dark, black, damaged, faded',
    commonUses: ['outdoor furniture', 'modern pieces']
  },

  // FURNITURE - FABRIC
  {
    id: 'linen-fabric',
    name: 'Linen Fabric',
    nameEs: 'Tela de Lino',
    category: 'fabric',
    color: '#FAF0E6',
    texture: 'natural linen weave',
    leonardoPrompt: 'natural linen fabric upholstery, soft texture, elegant beige tones, premium quality, sophisticated design',
    negativePrompt: 'synthetic, shiny, cheap, wrinkled',
    commonUses: ['sofas', 'chairs', 'curtains']
  },
  {
    id: 'velvet-fabric',
    name: 'Velvet Fabric',
    nameEs: 'Tela de Terciopelo',
    category: 'fabric',
    color: '#8B0000',
    texture: 'luxurious velvet',
    leonardoPrompt: 'luxurious velvet fabric, rich deep color, soft plush texture, elegant sheen, premium upholstery',
    negativePrompt: 'matte, flat, cheap fabric, damaged',
    commonUses: ['sofas', 'armchairs', 'cushions']
  },
  {
    id: 'leather-brown',
    name: 'Brown Leather',
    nameEs: 'Cuero Marrón',
    category: 'fabric',
    color: '#654321',
    texture: 'genuine leather',
    leonardoPrompt: 'premium brown leather, genuine hide texture, rich patina, elegant aging, luxury furniture',
    negativePrompt: 'fake leather, plastic, cheap, damaged',
    commonUses: ['sofas', 'chairs', 'ottomans']
  },
  {
    id: 'leather-black',
    name: 'Black Leather',
    nameEs: 'Cuero Negro',
    category: 'fabric',
    color: '#1C1C1C',
    texture: 'genuine black leather',
    leonardoPrompt: 'premium black leather, smooth texture, elegant finish, modern design, luxury furniture',
    negativePrompt: 'brown, faded, damaged, fake',
    commonUses: ['modern sofas', 'office chairs']
  },

  // WALLS
  {
    id: 'white-paint',
    name: 'White Paint',
    nameEs: 'Pintura Blanca',
    category: 'paint',
    color: '#FFFFFF',
    texture: 'smooth matte',
    leonardoPrompt: 'clean white matte paint, smooth wall surface, professional finish, modern interior design',
    negativePrompt: 'glossy, textured, yellowed, damaged',
    commonUses: ['walls', 'ceilings']
  },
  {
    id: 'beige-paint',
    name: 'Beige Paint',
    nameEs: 'Pintura Beige',
    category: 'paint',
    color: '#F5F5DC',
    texture: 'smooth matte',
    leonardoPrompt: 'warm beige matte paint, elegant neutral tone, smooth finish, sophisticated interior design',
    negativePrompt: 'bright, yellow, orange, damaged',
    commonUses: ['walls', 'living rooms']
  },
  {
    id: 'gray-paint',
    name: 'Gray Paint',
    nameEs: 'Pintura Gris',
    category: 'paint',
    color: '#808080',
    texture: 'smooth matte',
    leonardoPrompt: 'modern gray matte paint, contemporary neutral tone, smooth professional finish, elegant design',
    negativePrompt: 'blue, purple, bright, damaged',
    commonUses: ['modern spaces', 'offices']
  },
  {
    id: 'brick-wall',
    name: 'Exposed Brick',
    nameEs: 'Ladrillo Expuesto',
    category: 'wall',
    color: '#8B4513',
    texture: 'rough brick',
    leonardoPrompt: 'exposed brick wall, natural red brick texture, authentic aged appearance, industrial design, realistic brick pattern',
    negativePrompt: 'smooth, painted, new, artificial',
    commonUses: ['accent walls', 'industrial spaces']
  },

  // METAL
  {
    id: 'brass-metal',
    name: 'Brass',
    nameEs: 'Latón',
    category: 'metal',
    color: '#B8860B',
    texture: 'polished brass',
    leonardoPrompt: 'polished brass metal, warm golden tone, elegant shine, premium finish, luxury hardware',
    negativePrompt: 'rusty, tarnished, silver, chrome',
    commonUses: ['hardware', 'fixtures', 'decor']
  },
  {
    id: 'chrome-metal',
    name: 'Chrome',
    nameEs: 'Cromo',
    category: 'metal',
    color: '#C0C0C0',
    texture: 'mirror finish',
    leonardoPrompt: 'polished chrome metal, mirror-like finish, modern design, sleek appearance, contemporary hardware',
    negativePrompt: 'brass, gold, matte, rusty',
    commonUses: ['fixtures', 'hardware', 'modern spaces']
  },
  {
    id: 'black-metal',
    name: 'Black Metal',
    nameEs: 'Metal Negro',
    category: 'metal',
    color: '#1C1C1C',
    texture: 'matte black',
    leonardoPrompt: 'matte black metal, modern finish, contemporary design, sleek appearance, premium hardware',
    negativePrompt: 'shiny, chrome, brass, damaged',
    commonUses: ['modern fixtures', 'hardware']
  },

  // STONE
  {
    id: 'granite-counter',
    name: 'Granite Counter',
    nameEs: 'Encimera de Granito',
    category: 'stone',
    color: '#696969',
    texture: 'speckled granite',
    leonardoPrompt: 'premium granite countertop, natural stone texture, elegant speckled pattern, polished finish, luxury kitchen',
    negativePrompt: 'matte, artificial, damaged, cheap',
    commonUses: ['kitchen counters', 'bathroom vanities']
  },
  {
    id: 'quartz-counter',
    name: 'Quartz Counter',
    nameEs: 'Encimera de Cuarzo',
    category: 'stone',
    color: '#F5F5F5',
    texture: 'engineered quartz',
    leonardoPrompt: 'premium quartz countertop, smooth surface, elegant pattern, polished finish, modern kitchen design',
    negativePrompt: 'rough, natural stone, damaged, cheap',
    commonUses: ['kitchen counters', 'bathroom vanities']
  },
];

/**
 * Get materials by category
 */
export function getMaterialsByCategory(category: MaterialCategory): Material[] {
  return MATERIAL_LIBRARY.filter(m => m.category === category);
}

/**
 * Get material by ID
 */
export function getMaterialById(id: string): Material | undefined {
  return MATERIAL_LIBRARY.find(m => m.id === id);
}

/**
 * Search materials by name
 */
export function searchMaterials(query: string): Material[] {
  const lowerQuery = query.toLowerCase();
  return MATERIAL_LIBRARY.filter(m => 
    m.name.toLowerCase().includes(lowerQuery) ||
    m.nameEs.toLowerCase().includes(lowerQuery) ||
    m.category.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get all categories
 */
export function getCategories(): MaterialCategory[] {
  return Array.from(new Set(MATERIAL_LIBRARY.map(m => m.category)));
}

/**
 * Build optimized prompt for material replacement
 */
export function buildMaterialReplacementPrompt(
  targetElement: string, // e.g., 'floor', 'chair', 'wall'
  fromMaterial: Material | null,
  toMaterial: Material
): string {
  const basePrompt = `Replace the ${targetElement} material`;
  
  if (fromMaterial) {
    return `${basePrompt} from ${fromMaterial.name} to ${toMaterial.name}. 
            ${toMaterial.leonardoPrompt}. 
            Maintain realistic lighting, shadows, and perspective. 
            Ensure seamless integration with surrounding elements. 
            The new material should look natural and professionally applied.`;
  } else {
    return `${basePrompt} with ${toMaterial.name}. 
            ${toMaterial.leonardoPrompt}. 
            Maintain realistic lighting, shadows, and perspective. 
            Ensure seamless integration with surrounding elements. 
            The material should look natural and professionally applied.`;
  }
}

/**
 * Build negative prompt for material replacement
 */
export function buildMaterialReplacementNegativePrompt(
  toMaterial: Material
): string {
  const baseNegative = 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal';
  return toMaterial.negativePrompt 
    ? `${baseNegative}, ${toMaterial.negativePrompt}`
    : baseNegative;
}

