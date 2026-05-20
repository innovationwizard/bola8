# Quotation Engine Documentation

**Last Updated:** 2025-01-XX  
**Status:** Fully Implemented

---

## Overview

The quotation engine is a robust, automated system that generates and manages quotations for design projects. It automatically detects materials and elements from images, groups items by project spaces, maintains complete version history, and provides export functionality.

---

## Key Features

1. **Automatic Generation**: Quotations created automatically when images are enhanced
2. **Version Control**: Complete history of all quotation changes
3. **Space-Based Grouping**: Items organized by project spaces
4. **Automatic Detection**: Materials and elements detected from images
5. **Cost Libraries**: Comprehensive cost management system
6. **Manual Editing**: Full CRUD operations on quotation items
7. **Export**: PNG (screenshot) and PDF (formatted) export

---

## Database Schema

### Core Tables

#### `quotations`
Main quotation record (one per project).

```sql
CREATE TABLE quotations (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  iva_rate DECIMAL(5, 4) DEFAULT 0.19,
  margin_rate DECIMAL(5, 2) DEFAULT 30.00,
  status VARCHAR(50) DEFAULT 'draft',
  current_version_id UUID REFERENCES quotation_versions(id),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `quotation_versions`
Versioned quotations (new version for each change).

```sql
CREATE TABLE quotation_versions (
  id UUID PRIMARY KEY,
  quotation_id UUID REFERENCES quotations(id),
  version_number INTEGER NOT NULL,
  changes_description TEXT,
  is_final BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (quotation_id, version_number)
);
```

#### `quotation_items`
Individual line items in quotations.

```sql
CREATE TABLE quotation_items (
  id UUID PRIMARY KEY,
  quotation_version_id UUID REFERENCES quotation_versions(id),
  space_id UUID REFERENCES spaces(id),
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  dimensions JSONB,
  materials JSONB,
  material_ids UUID[],
  quantity DECIMAL(10, 2) NOT NULL,
  unit_id UUID REFERENCES cost_units(id),
  unit_cost DECIMAL(10, 2) NOT NULL,
  labor_cost DECIMAL(10, 2) DEFAULT 0,
  subtotal DECIMAL(12, 2) NOT NULL,
  iva_rate DECIMAL(5, 4) NOT NULL,
  price_with_iva DECIMAL(12, 2) NOT NULL,
  margin_rate DECIMAL(5, 2) NOT NULL,
  profit DECIMAL(12, 2) NOT NULL,
  image_id UUID REFERENCES images(id),
  notes TEXT,
  display_order INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `spaces`
Project spaces/rooms.

```sql
CREATE TABLE spaces (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  room_type VARCHAR(100),
  area_sqm DECIMAL(10, 2),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `image_spaces`
Many-to-many relationship between images and spaces.

```sql
CREATE TABLE image_spaces (
  image_id UUID REFERENCES images(id),
  space_id UUID REFERENCES spaces(id),
  PRIMARY KEY (image_id, space_id)
);
```

### Cost Library Tables

#### `cost_units`
Unit of measurement library.

```sql
CREATE TABLE cost_units (
  id UUID PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_es VARCHAR(50) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true
);
```

#### `material_costs`
Material cost library.

```sql
CREATE TABLE material_costs (
  id UUID PRIMARY KEY,
  material_id UUID REFERENCES materials(id),
  name VARCHAR(255) NOT NULL,
  unit_id UUID REFERENCES cost_units(id),
  base_cost DECIMAL(10, 2) NOT NULL,
  labor_cost_per_unit DECIMAL(10, 2) DEFAULT 0,
  supplier VARCHAR(255),
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `element_costs`
Element/furniture cost library.

```sql
CREATE TABLE element_costs (
  id UUID PRIMARY KEY,
  element_id UUID REFERENCES elements(id),
  name VARCHAR(255) NOT NULL,
  unit_id UUID REFERENCES cost_units(id),
  base_cost DECIMAL(10, 2) NOT NULL,
  labor_cost_per_unit DECIMAL(10, 2) DEFAULT 0,
  supplier VARCHAR(255),
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `labor_costs`
Labor cost library.

```sql
CREATE TABLE labor_costs (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_es VARCHAR(255),
  category VARCHAR(100),
  unit_id UUID REFERENCES cost_units(id),
  rate_per_unit DECIMAL(10, 2) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Automatic Quotation Flow

### 1. Image Enhancement Triggers Quotation Update

```
User enhances image
    ↓
Image saved to database (lib/db/image-storage.ts)
    ↓
saveImageToDatabase() detects enhanced image
    ↓
Triggers async quotation update:
    - getOrCreateQuotation(projectId)
    - createQuotationVersionFromImage(quoteId, imageId, spaceId)
    ↓
New quotation version created
    ↓
Items detected from image (detectItemsFromImage)
    ↓
Items added to quotation with costs
    ↓
Totals calculated automatically
```

### 2. Space Assignment Updates Items

```
User assigns image to space(s)
    ↓
POST /api/images/[id]/spaces
    ↓
Space assignments saved
    ↓
Async update: quotation items linked to image
    ↓
Items updated with space_id
    ↓
Items now grouped by space in display
```

---

## Quotation Engine Functions

Located in `lib/quotation-engine.ts`:

### `getOrCreateQuotation(projectId, quoteType)`
- Gets existing quotation or creates new one
- Creates initial version (version 1)
- Sets as current version

### `createQuotationVersionFromImage(quoteId, imageId, spaceId, userId?)`
- Creates new quotation version
- Copies items from previous version (if exists)
- Detects new items from image
- Adds items to new version
- Links items to space if provided

### `detectItemsFromImage(imageId, projectId)`
- Analyzes image metadata
- Detects materials from `enhancement_metadata.replacements`
- Detects elements from `enhancement_metadata.elements`
- Fetches costs from cost libraries
- Returns array of `QuotationItem` objects

### `getQuotationVersion(versionId)`
- Gets full quotation version with items
- Calculates totals
- Groups items by space
- Returns formatted version object

---

## API Endpoints

### Quotation Management

- `GET /api/quotes?project_id=...` - List quotations for project
- `GET /api/quotes/[id]` - Get quotation with current version
- `PUT /api/quotes/[id]` - Update quotation settings

### Version Management

- `GET /api/quotes/[id]/versions` - List all versions
- `POST /api/quotes/[id]/versions` - Create new version
- `GET /api/quotes/[id]/versions/[versionId]` - Get specific version
- `PUT /api/quotes/[id]/versions/[versionId]` - Update version

### Item Management

- `GET /api/quotes/[id]/versions/[versionId]/items` - Get items
- `POST /api/quotes/[id]/versions/[versionId]/items` - Create item
- `PUT /api/quotes/[id]/versions/[versionId]/items/[itemId]` - Update item
- `DELETE /api/quotes/[id]/versions/[versionId]/items/[itemId]` - Delete item

### Export

- `GET /api/quotes/[id]/export/pdf` - Export to PDF (returns HTML)

---

## UI Components

### Quotation Display Page
**Location**: `app/projects/[id]/quotation/page.tsx`

**Features**:
- Displays current quotation version
- Groups items by space
- Shows totals (subtotal, IVA, total, profit)
- Inline item editing
- Export buttons (PNG, PDF)
- Version selector (future)

### Item Editing
- Click edit icon on any item
- Edit name, quantity, unit, costs inline
- Save or cancel changes
- Totals recalculate automatically

### Export Functionality
- **PNG**: Uses `html2canvas` to capture quotation content
- **PDF**: Generates formatted HTML, opens print dialog (or downloads HTML)

---

## Cost Calculation

### Item Cost Calculation

```typescript
subtotal = (unit_cost * quantity) + (labor_cost * quantity)
price_with_iva = subtotal * (1 + iva_rate)
profit = price_with_iva * (margin_rate / 100)
```

### Totals

```typescript
total_cost = sum(all items.subtotal)
total_with_iva = sum(all items.price_with_iva)
total_profit = sum(all items.profit)
```

---

## Automatic Item Detection

Items are automatically detected from image enhancement metadata:

### Material Replacements
```json
{
  "enhancement_type": "targeted",
  "replacements": [
    {
      "targetElement": "floor",
      "toMaterialId": "marble-white"
    }
  ]
}
```
→ Creates item: "Floor - White Marble"

### Element Additions
```json
{
  "enhancement_type": "elements",
  "elements": [
    { "id": "modern-armchair", "name": "Sillón Moderno" }
  ]
}
```
→ Creates item: "Sillón Moderno"

### Cost Lookup
- System looks up material/element in cost libraries
- Uses `base_cost` and `labor_cost_per_unit`
- Applies default quantity (1.0) if not specified
- Uses default unit if not specified

---

## Space Management

### Creating Spaces
- Spaces defined during project creation (for space design projects)
- User specifies number of spaces and names them
- Spaces stored with `display_order` for sorting

### Assigning Images to Spaces
- UI: `ImageSpaceAssignment` component
- API: `POST /api/images/[id]/spaces`
- Multiple spaces can be assigned to one image
- Quotation items automatically linked to first assigned space

### Item Grouping
- Items displayed grouped by space in quotation
- Items without space shown in "Otros Items" section
- Space subtotals calculated automatically

---

## Cost Libraries

### Material Costs
- **Admin Page**: `/admin/cost-libraries/material-costs`
- CRUD operations for material pricing
- Linked to `materials` table
- Supports multiple cost entries per material

### Element Costs
- **Admin Page**: `/admin/cost-libraries/element-costs`
- CRUD operations for element pricing
- Linked to `elements` table
- Supports multiple cost entries per element

### Labor Costs
- API ready, UI pending
- Categorized labor rates
- Per-unit pricing

### Cost Units
- Predefined units: m², m, unit, hour, kg, etc.
- Bilingual (English/Spanish)
- Symbol display

---

## Migration History

1. **`005_add_spaces_and_quotation_engine.sql`**
   - Creates all quotation engine tables
   - Creates cost library tables
   - Sets up relationships and indexes

2. **`006_seed_initial_costs.sql`**
   - Seeds initial costs (1.00) for all materials
   - Seeds initial costs (1.00) for all elements
   - Uses default 'unit' cost unit

---

## Future Enhancements

- [ ] Labor cost admin UI
- [ ] Version comparison view
- [ ] Quote approval workflow
- [ ] Email quote to client
- [ ] Quote templates
- [ ] Historical accuracy tracking
- [ ] Bulk item operations
- [ ] Advanced item detection (AI-based)
- [ ] Multi-currency support

---

**Note**: The quotation engine ensures that every design change is automatically reflected in pricing, maintaining complete version history and providing accurate, up-to-date quotations at all times.

