# Image Storage & Versioning Flow

**Last Updated:** 2025-01-XX  
**Status:** Implemented

---

## Overview

The application implements automatic, persistent storage of all images with complete version tracking. Every image upload and enhancement is automatically saved to both S3 and the database, creating a complete audit trail.

---

## Key Principles

1. **Store Always**: Every image is saved, no exceptions
2. **Store Automatically**: No manual save actions required
3. **Store All Versions**: Complete history of all enhancements
4. **Auto-Create Projects**: Projects created automatically if `projectId` is missing

---

## Storage Flow

### 1. Original Image Upload

```
User uploads image
    ↓
Save to S3 (bola8-uploads bucket)
    ↓
Create/Find project (auto-create if needed)
    ↓
Save to database (images table)
    - image_type: 'original'
    - parent_image_id: NULL
    - version: 1
    ↓
Return imageId and projectId
```

### 2. Image Enhancement

```
Enhancement API called
    ↓
Find or create original image record
    ↓
Process with Leonardo AI
    ↓
Save enhanced image to S3 (bola8-leonardo-images bucket)
    ↓
Save to database (images table)
    - image_type: 'enhanced'
    - parent_image_id: <original_image_id>
    - version: <auto-incremented>
    - enhancement_type: 'general' | 'targeted' | 'color' | 'lighting'
    - enhancement_metadata: { full parameters }
    ↓
Return enhanced imageId, version, projectId
```

---

## Database Schema

### Images Table Structure

```sql
CREATE TABLE images (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  parent_image_id UUID REFERENCES images(id), -- Links to original
  image_type VARCHAR(50), -- 'original', 'enhanced', etc.
  enhancement_type VARCHAR(50), -- 'general', 'targeted', 'color', 'lighting'
  version INTEGER DEFAULT 1, -- Auto-incremented per parent
  original_url TEXT, -- S3 URL
  enhanced_url TEXT, -- S3 URL
  s3_key TEXT,
  s3_bucket VARCHAR(255),
  filename VARCHAR(255),
  width INTEGER,
  height INTEGER,
  metadata JSONB, -- General metadata
  enhancement_metadata JSONB, -- Enhancement-specific metadata
  created_at TIMESTAMP WITH TIME ZONE
);
```

### Enhancement Metadata Structure

**General Enhancement:**
```json
{
  "enhancement_type": "general",
  "mode": "structure" | "surfaces",
  "parameters": {
    "init_strength": 0.4,
    "guidance_scale": 7,
    "width": 1024,
    "height": 768
  },
  "leonardoImageId": "...",
  "generationId": "..."
}
```

**Targeted Enhancement (Material Replacement):**
```json
{
  "enhancement_type": "targeted",
  "replacements": [
    {
      "targetElement": "floor",
      "fromMaterialId": "oak-wood",
      "fromMaterialName": "Oak Wood",
      "toMaterialId": "marble-white",
      "toMaterialName": "White Marble"
    }
  ],
  "parameters": { ... }
}
```

**Color Replacement:**
```json
{
  "enhancement_type": "color",
  "replacements": [
    {
      "targetElement": "wall",
      "fromColor": "#FFFFFF",
      "toColor": "#E5E5E5"
    }
  ],
  "parameters": { ... }
}
```

**Lighting Control:**
```json
{
  "enhancement_type": "lighting",
  "lightingConfig": {
    "lightSources": [
      {
        "type": "window",
        "position": { "x": 0.5, "y": 0.2, "z": 1.0 },
        "strength": 0.8,
        "warmth": 0.6,
        "color": "#FFF8E1"
      }
    ],
    "overallWarmth": 0.7,
    "overallBrightness": 0.8
  },
  "parameters": { ... }
}
```

---

## API Endpoints

### Image Storage Utilities

Located in `lib/db/image-storage.ts`:

- **`ensureProject(projectId)`**: Auto-creates project if missing
- **`findOrCreateOriginalImage(...)`**: Finds or creates original image record
- **`saveImageToDatabase(...)`**: Saves image with full metadata and version tracking

### Version Retrieval

**`GET /api/images/[id]/versions`**

Returns all versions of an image (original + all enhancements):

```json
{
  "versions": [
    {
      "id": "...",
      "version": 0,
      "isOriginal": true,
      "original_url": "...",
      "created_at": "..."
    },
    {
      "id": "...",
      "version": 1,
      "isOriginal": false,
      "enhancement_type": "targeted",
      "enhanced_url": "...",
      "enhancement_metadata": { ... },
      "created_at": "..."
    }
  ],
  "count": 2
}
```

---

## Component: ImageVersionNavigator

A minimalist component for navigating through image versions.

**Location**: `app/components/ImageVersionNavigator.tsx`

**Features**:
- Navigation arrows (previous/next)
- Thumbnail gallery
- Version metadata display
- Enhancement type indicators
- Download functionality
- Elegant, minimalistic design

**Usage**:
```tsx
<ImageVersionNavigator imageId={imageId} />
```

---

## S3 Bucket Organization

### Original Uploads
- **Bucket**: `bola8-uploads`
- **Path**: `uploads/{projectId}/originals/{timestamp}-{filename}`
- **When**: Initial file upload

### Enhanced Images
- **Bucket**: `bola8-leonardo-images`
- **Path**: `enhanced/{projectId}/{timestamp}-{filename}`
- **When**: After Leonardo AI processing

---

## Auto-Project Creation

When `projectId` is `null` or missing:

1. System automatically creates a project
2. Project name: `"Proyecto de Mejora - {date}"`
3. Client name: `"Cliente Temporal"`
4. Project type: `space_design` (default)
5. Status: `design`
6. Notes: `"Proyecto creado automáticamente para almacenar mejoras de imagen"`

This ensures **every image is always associated with a project**, maintaining data integrity.

---

## Version Numbering

- **Original images**: `version = 1` (or `0` in API responses for clarity)
- **Enhanced images**: Auto-incremented based on `parent_image_id`
  - First enhancement: `version = 1`
  - Second enhancement: `version = 2`
  - etc.

Version numbers are calculated per parent image, allowing multiple enhancement chains.

---

## Benefits

1. **Complete Audit Trail**: Every change is tracked
2. **No Data Loss**: All images persisted automatically
3. **Version Comparison**: Easy to compare different enhancements
4. **Project Organization**: All images linked to projects
5. **Metadata Preservation**: Full enhancement parameters stored
6. **User-Friendly**: No manual save actions required

---

## Quotation Integration

When an enhanced image is saved, the system automatically:

1. **Creates or Updates Quotation**: Gets or creates quotation for the project
2. **Creates New Version**: Creates a new quotation version (maintaining history)
3. **Detects Items**: Automatically detects materials and elements from the image
4. **Links to Spaces**: If image is assigned to spaces, items are grouped accordingly
5. **Calculates Costs**: Uses cost libraries to calculate item costs and totals

This happens asynchronously (non-blocking) so image saving is never delayed.

### Space Assignment

Images can be assigned to project spaces via:
- **UI**: `ImageSpaceAssignment` component in image comparison page
- **API**: `POST /api/images/[id]/spaces` with `{ space_ids: string[] }`

When spaces are assigned:
- Quotation items linked to the image are automatically updated with space information
- Items are grouped by space in quotation display

## Future Enhancements

- [ ] Version diff visualization
- [ ] Batch version operations
- [ ] Version tagging/labeling
- [ ] Version rollback functionality
- [ ] Export version history as PDF
- [ ] Automatic space detection from images

---

**Note**: This system ensures that no image enhancement work is ever lost, providing a complete history of all design iterations. The automatic quotation integration ensures that every design change is reflected in pricing.
