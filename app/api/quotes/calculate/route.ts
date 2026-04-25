import { NextResponse } from 'next/server';

// ============================================================================
// QUOTE CALCULATION LOGIC
// ============================================================================

interface FurnitureQuoteInput {
  type: 'wardrobe' | 'kitchen' | 'bookshelf' | 'table' | 'cabinet' | 'custom';
  width: number;
  height: number;
  depth: number;
  materialTier: 'basic' | 'mid' | 'premium';
  addOns: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}

interface SpaceDesignQuoteInput {
  roomType: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'custom';
  area: number; // square meters
  scope: 'full' | 'partial' | 'consultation';
  materialTier: 'basic' | 'mid' | 'premium';
  includesRenders: boolean;
  revisionRounds: number;
}

// Base pricing structure (in MXN - adjust as needed)
const FURNITURE_BASE_PRICES = {
  wardrobe: 15000,
  kitchen: 25000,
  bookshelf: 8000,
  table: 12000,
  cabinet: 10000,
  custom: 15000,
};

const MATERIAL_MULTIPLIERS = {
  basic: 1.0,
  mid: 1.4,
  premium: 2.0,
};

const COMPLEXITY_MULTIPLIERS = {
  simple: 1.0,
  moderate: 1.3,
  complex: 1.7,
};

const ADDON_PRICES: Record<string, number> = {
  lighting: 3000,
  specialHardware: 2000,
  customFinishes: 4000,
  softClose: 1500,
  glassDoors: 5000,
};

const SPACE_BASE_PRICES = {
  living: 35000,
  bedroom: 30000,
  kitchen: 45000,
  bathroom: 25000,
  office: 28000,
  custom: 35000,
};

const SCOPE_MULTIPLIERS = {
  full: 1.0,
  partial: 0.6,
  consultation: 0.3,
};

function calculateFurnitureQuote(input: FurnitureQuoteInput) {
  const basePrice = FURNITURE_BASE_PRICES[input.type];
  const materialMultiplier = MATERIAL_MULTIPLIERS[input.materialTier];
  const complexityMultiplier = COMPLEXITY_MULTIPLIERS[input.complexity];
  
  // Volume-based calculation (cubic meters)
  const volume = (input.width * input.height * input.depth) / 1000000; // cm³ to m³
  const volumeRate = volume * 5000; // 5000 MXN per m³
  
  // Base calculation
  let subtotal = basePrice * materialMultiplier * complexityMultiplier;
  subtotal += volumeRate;
  
  // Add-ons
  const addOnsTotal = input.addOns.reduce((sum, addon) => {
    return sum + (ADDON_PRICES[addon] || 0);
  }, 0);
  
  subtotal += addOnsTotal;
  
  // Labor (20% of subtotal)
  const labor = subtotal * 0.2;
  
  // Final total
  const total = subtotal + labor;
  
  return {
    basePrice,
    volumeRate: Math.round(volumeRate),
    materialMultiplier,
    complexityMultiplier,
    addOnsTotal,
    subtotal: Math.round(subtotal),
    labor: Math.round(labor),
    total: Math.round(total),
    breakdown: {
      base: Math.round(basePrice * materialMultiplier * complexityMultiplier),
      volume: Math.round(volumeRate),
      addOns: addOnsTotal,
      labor: Math.round(labor),
    },
  };
}

function calculateSpaceDesignQuote(input: SpaceDesignQuoteInput) {
  const basePrice = SPACE_BASE_PRICES[input.roomType];
  const materialMultiplier = MATERIAL_MULTIPLIERS[input.materialTier];
  const scopeMultiplier = SCOPE_MULTIPLIERS[input.scope];
  
  // Area-based calculation
  const areaRate = input.area * 2000; // 2000 MXN per m²
  
  // Base calculation
  let subtotal = basePrice * materialMultiplier * scopeMultiplier;
  subtotal += areaRate;
  
  // Renders
  if (input.includesRenders) {
    subtotal += 8000; // Base render package
  }
  
  // Revision rounds (first 2 included, then 3000 per round)
  if (input.revisionRounds > 2) {
    subtotal += (input.revisionRounds - 2) * 3000;
  }
  
  // Design fee (15% of subtotal)
  const designFee = subtotal * 0.15;
  
  // Final total
  const total = subtotal + designFee;
  
  return {
    basePrice,
    areaRate: Math.round(areaRate),
    materialMultiplier,
    scopeMultiplier,
    includesRenders: input.includesRenders,
    revisionRounds: input.revisionRounds,
    subtotal: Math.round(subtotal),
    designFee: Math.round(designFee),
    total: Math.round(total),
    breakdown: {
      base: Math.round(basePrice * materialMultiplier * scopeMultiplier),
      area: Math.round(areaRate),
      renders: input.includesRenders ? 8000 : 0,
      revisions: input.revisionRounds > 2 ? (input.revisionRounds - 2) * 3000 : 0,
      designFee: Math.round(designFee),
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, ...input } = body;

    if (type === 'furniture') {
      const result = calculateFurnitureQuote(input as FurnitureQuoteInput);
      return NextResponse.json({ type: 'furniture', ...result });
    } else if (type === 'space') {
      const result = calculateSpaceDesignQuote(input as SpaceDesignQuoteInput);
      return NextResponse.json({ type: 'space', ...result });
    } else {
      return NextResponse.json(
        { error: 'Invalid quote type. Must be "furniture" or "space".' },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('Quote calculation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate quote' },
      { status: 500 }
    );
  }
}

