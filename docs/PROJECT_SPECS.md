# Bola8 - Project Specifications

**Last Updated:** 2025-01-XX (Client Priorities Updated)  
**Status:** Active Development  
**Version:** 0.1.0

---

## ⚠️ CRITICAL: READ CLIENT FEEDBACK FIRST

**Before making any changes to image enhancement features, READ:**
- [`docs/CRITICAL_CLIENT_FEEDBACK.md`](./CRITICAL_CLIENT_FEEDBACK.md)

This document contains essential client requirements that must be considered for all image enhancement work.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Features Implemented](#features-implemented)
4. [Workflow System](#workflow-system)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [S3 Bucket Organization](#s3-bucket-organization)
8. [Authentication & Authorization](#authentication--authorization)
9. [UI/UX Design Principles](#uiux-design-principles)
10. [Environment Variables](#environment-variables)
11. [Deployment](#deployment)
12. [Future Enhancements](#future-enhancements)

---

## Project Overview

**Bola8** is an internal operations platform for an elite interior design studio. It provides project management, quotation tools, and AI-powered image enhancement capabilities for both space design and furniture design projects.

---

## 🎯 CLIENT PRIORITIES (Maximum Value)

> **Client Meeting - 2025-01-XX**: The client has identified two critical value propositions that are the highest priority for this application. These priorities should guide all development decisions.

### 1. ⚡ Image Enhancement - Photorealism (MAXIMUM PRIORITY)

**⚠️ CRITICAL CLIENT FEEDBACK - READ [`CRITICAL_CLIENT_FEEDBACK.md`](./CRITICAL_CLIENT_FEEDBACK.md) FIRST**

**Client Requirements:**
- **Single-click enhancement** - No manual work required
- **Preserve everything**: Space, element shapes/sizes, materials, colors (even smallest elements)
- **Photorealism**: Transform flat/montage renders into professional photograph quality
- **No manipulation tools**: Client does NOT want manual element/material/color/lighting changes

**What Client DOES NOT Want:**
- ❌ Manual element replacement/addition
- ❌ Manual material replacement
- ❌ Manual color changes
- ❌ Manual lighting adjustments
- ❌ Any tool requiring client to "put in work"

**What Client DOES Want:**
- ✅ Single-click enhancement
- ✅ Preserves space layout exactly
- ✅ Preserves all element shapes and sizes exactly (including smallest)
- ✅ Preserves all materials and colors exactly (including smallest)
- ✅ Makes image photorealistic (not flat, not montage, not Photoshop-composition-like)
- ✅ Results indistinguishable from professional photographs

**Current State:**
- ✅ Leonardo AI integration for image enhancement
- ✅ Two modes: Structure (ControlNet) and Surfaces (PhotoReal)
- ✅ Aspect ratio preservation
- ⚠️ **Gap**: Need to ensure 100% preservation of space, elements, materials, colors
- ⚠️ **Gap**: Need to optimize for photorealism without any changes to content
- ⚠️ **Note**: Existing manipulation tools (targeted, color, lighting, elements) exist but are NOT what client wants

**Target Improvements:**
- Optimize enhancement prompts for maximum photorealism
- Ensure structure preservation (ControlNet weights)
- Verify smallest elements remain unchanged
- Improve texture detail and depth perception
- Natural lighting and shadow rendering
- Professional photography quality output

### 2. 📊 Automated, Accurate Quotations

**Requirements:**
- **Automation**: Fully automated calculation
- **Accuracy**: Precise pricing based on materials, dimensions, complexity
- **Speed**: Instant quote generation

**Current State:**
- ✅ Parametric calculators for space and furniture design
- ✅ Database persistence
- ✅ Project linking
- ⚠️ **Gap**: May need refinement for accuracy
- ⚠️ **Gap**: Material cost database may need expansion
- ⚠️ **Gap**: Complexity factors may need calibration

**Target Improvements:**
- Material cost database with real-time pricing
- Labor cost calculations
- Complexity scoring refinement
- Historical quote accuracy tracking
- Export to PDF with detailed breakdown

---

### Key Objectives

- **Data Persistence**: Store all project data, quotes, images, notes, and files
- **Workflow Management**: Track projects through a 14-step process from lead to completion
- **AI Integration**: Enhance design renders using Leonardo AI
- **Quote Automation**: Parametric calculators for space and furniture design quotes
- **Minimalistic Design**: Elegant, typography-driven interface worthy of an elite designer

### Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript / JavaScript
- **Database**: PostgreSQL 17.4 (AWS RDS)
- **Storage**: AWS S3 (5 buckets)
- **Authentication**: JWT with session cookies
- **AI Service**: Leonardo AI
- **Image Processing**: Sharp

---

## Architecture

### Application Structure

```
app/
├── api/                    # API routes
│   ├── auth/              # Authentication endpoints
│   ├── enhance/           # Leonardo AI image enhancement
│   ├── images/            # Image management
│   ├── projects/          # Project CRUD operations
│   └── quotes/             # Quote calculation and storage
├── components/             # Reusable React components
├── login/                  # Authentication page
├── page.tsx               # Dashboard/home page
├── projects/              # Project management pages
├── quotes/                # Quote calculator pages
└── tools/                 # Utility tools (image enhancer)
```

### Key Libraries

- `@aws-sdk/client-s3`: S3 file storage
- `pg`: PostgreSQL database client
- `sharp`: Image processing
- `jose`: JWT token handling
- `bcryptjs`: Password hashing
- `lucide-react`: Icon library

---

## Features Implemented

### ✅ Core Features

**Image Storage & Versioning**
- **Automatic Storage**: Every image upload and enhancement is automatically saved to:
  - S3 (organized by bucket and project)
  - Database (with full metadata)
- **Version Tracking**: Complete history of all image enhancements
  - Original images linked to enhanced versions via `parent_image_id`
  - Version numbers auto-increment
  - Full metadata stored (enhancement type, parameters, replacements, etc.)
- **Auto-Project Creation**: If `projectId` is not provided, a project is automatically created
- **Version Navigator**: Elegant component (`ImageVersionNavigator`) to browse through all versions
  - Navigation arrows
  - Thumbnail gallery
  - Version metadata display
  - Download functionality

**Robust Quotation Engine**
- **Automatic Quotation Generation**: Quotations automatically created when images are enhanced
- **Space-Based Organization**: Items grouped by project spaces for clear organization
- **Version Control**: Complete version history - new version created for each change
- **Automatic Item Detection**: Materials and elements automatically detected from images
- **Cost Libraries**: Comprehensive cost management:
  - Material costs (`/admin/cost-libraries/material-costs`)
  - Element costs (`/admin/cost-libraries/element-costs`)
  - Labor costs (API ready, UI pending)
  - Cost units (m², m, unit, hour, etc.)
- **Manual Editing**: Full CRUD operations on quotation items:
  - Edit item name, quantity, unit, costs
  - Delete items
  - Real-time total calculations
- **Export Functionality**:
  - PNG export (screenshot with html2canvas)
  - PDF export (formatted HTML with jsPDF)
- **Automatic Updates**:
  - New quotation version created when images are enhanced
  - Items automatically linked to spaces when images are assigned
  - Totals recalculated automatically

1. **Dashboard**
   - Minimalistic home page with navigation to projects, quotes, and tools
   - User menu with logout functionality
   - Spanish (Latin American) localization
   - Links to admin pages (materials, elements, cost libraries)

2. **Project Management**
   - Create new projects with client information
   - **Space Configuration**: Define spaces/rooms during project creation (for space design projects)
   - View project list with status filtering
   - Detailed project view with workflow tracking
   - 14-step workflow system (see [Workflow System](#workflow-system))
   - Link to quotation page

3. **Workflow Steps**
   - Each step supports:
     - Written notes (with author tracking)
     - File uploads (photos, documents, design files)
     - Status tracking

4. **Quote System (Robust Quotation Engine)**
   - **Automatic Quotation Generation**: Quotations automatically created and updated from image enhancements
   - **Space-Based Grouping**: Items automatically grouped by project spaces
   - **Version Control**: Complete version history of all quotation changes
   - **Material & Element Detection**: Automatic detection of materials and elements from images
   - **Cost Libraries**: Comprehensive cost management for materials, elements, and labor
   - **Manual Editing**: Full CRUD operations on quotation items
   - **Export Functionality**: Export to PNG (screenshot) and PDF (formatted)
   - **Real-time Updates**: Quotations update automatically when images are enhanced or spaces are assigned

5. **Image Enhancement (Leonardo AI)**
   - Upload images for AI enhancement
   - Five enhancement modes:
     - **General**: Structure (ControlNet) and Surfaces (PhotoReal)
     - **Targeted**: Material replacement with visual picker
     - **Color**: Color-only replacement
     - **Lighting**: Control light sources (position, strength, warmth, color)
     - **Elements**: Add furniture/decor elements to images
   - Preserves original image aspect ratio
   - **Automatic storage**: All images saved to database and S3
   - **Version tracking**: Complete history of all enhancements
   - **Version navigator**: Elegant component to browse through image versions
   - **Space assignment**: Assign images to project spaces for quotation grouping
   - Side-by-side comparison view (original vs enhanced)
   - **Auto-project creation**: Projects created automatically if not provided
   - **Automatic quotation updates**: Quotations automatically updated when images are enhanced

6. **File Management**
   - Organized S3 bucket structure
   - Automatic categorization (images, designs, documents)
   - Project and workflow step association

7. **Authentication**
   - User login with email/password
   - JWT-based session management
   - Protected routes via middleware
   - Role-based access (admin, designer, viewer)

8. **Admin Interfaces**
   - **Material Library** (`/admin/materials`): CRUD operations for materials
   - **Element Library** (`/admin/elements`): CRUD operations for furniture/decor elements
   - **Material Costs** (`/admin/cost-libraries/material-costs`): Manage material pricing
   - **Element Costs** (`/admin/cost-libraries/element-costs`): Manage element pricing
   - All interfaces follow minimalistic design principles

---

## Workflow System

The project follows a 14-step workflow:

1. **Lead** (`lead`)
2. **Scheduled** (`scheduled`)
3. **Site Visit** (`site_visit`)
4. **Design** (`design`)
5. **Client Review 1** (`client_review_1`)
6. **Design Revision 1** (`design_revision_1`)
7. **Client Review 2** (`client_review_2`)
8. **Design Revision 2** (`design_revision_2`)
9. **Client Review 3** (`client_review_3`)
10. **Quotation** (`quotation`)
11. **Technical Drawings** (`technical_drawings`)
12. **Manufacturing** (`manufacturing`)
13. **Installation** (`installation`)
14. **Completed** (`completed`)

Each step supports:
- Notes (text with optional author)
- File uploads (images, documents, design files)
- Status tracking

---

## Database Schema

### Core Tables

#### `users`
- User authentication and authorization
- Fields: `id`, `email`, `name`, `password_hash`, `role`, `active`, `created_at`, `updated_at`
- Roles: `admin`, `designer`, `viewer`

#### `projects`
- Project information and tracking
- Fields: `id`, `client_name`, `client_email`, `client_phone`, `project_type`, `status`, `created_at`, `updated_at`
- Status: Enum matching workflow steps

#### `quotes` (Legacy - being phased out)
- Legacy quote calculations
- Fields: `id`, `project_id`, `quote_type`, `total_amount`, `details` (JSONB), `created_at`
- Types: `space`, `furniture`

#### `spaces`
- Project spaces/rooms
- Fields: `id`, `project_id`, `name`, `description`, `room_type`, `area_sqm`, `display_order`, `created_at`, `updated_at`
- Created during project creation for space design projects

#### `quotations`
- Main quotation records
- Fields: `id`, `project_id`, `iva_rate`, `margin_rate`, `status`, `current_version_id`, `notes`, `created_at`, `updated_at`
- One quotation per project (auto-created on first image enhancement)

#### `quotation_versions`
- Versioned quotations (new version created for each change)
- Fields: `id`, `quotation_id`, `version_number`, `changes_description`, `is_final`, `created_by`, `created_at`, `updated_at`
- Automatically created when images are enhanced or items are modified

#### `quotation_items`
- Individual line items in quotations
- Fields: `id`, `quotation_version_id`, `space_id`, `item_name`, `category`, `description`, `dimensions`, `materials`, `material_ids`, `quantity`, `unit_id`, `unit_cost`, `labor_cost`, `subtotal`, `iva_rate`, `price_with_iva`, `margin_rate`, `profit`, `image_id`, `notes`, `display_order`
- Automatically detected from images or manually added/edited

#### `image_spaces`
- Many-to-many relationship between images and spaces
- Fields: `image_id`, `space_id` (composite primary key)
- Links images to spaces for proper item grouping

#### `cost_units`
- Unit of measurement library
- Fields: `id`, `name`, `name_es`, `symbol`, `description`, `active`
- Examples: `m2`, `m`, `unit`, `hour`, `kg`

#### `material_costs`
- Material cost library
- Fields: `id`, `material_id`, `name`, `unit_id`, `base_cost`, `labor_cost_per_unit`, `supplier`, `notes`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`
- Linked to `materials` table

#### `element_costs`
- Element/furniture cost library
- Fields: `id`, `element_id`, `name`, `unit_id`, `base_cost`, `labor_cost_per_unit`, `supplier`, `notes`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`
- Linked to `elements` table

#### `labor_costs`
- Labor cost library
- Fields: `id`, `name`, `name_es`, `category`, `unit_id`, `rate_per_unit`, `description`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`

#### `images`
- Image metadata and S3 references
- Fields: `id`, `project_id`, `workflow_step`, `image_type`, `s3_key`, `s3_bucket`, `filename`, `leonardo_image_id`, `created_at`
- **Version tracking**: `parent_image_id`, `version`, `enhancement_type`, `enhancement_metadata`
- Types: `original`, `enhanced`, `render`, `technical`, `other`, `photo`, `file`
- **Auto-linking**: Enhanced images automatically linked to originals via `parent_image_id`
- **Metadata storage**: Full enhancement parameters stored in `enhancement_metadata` JSONB field

#### `materials`
- Material library for enhancement
- Fields: `id`, `name`, `name_es`, `category`, `color`, `texture`, `leonardo_prompt`, `negative_prompt`, `common_uses`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`
- Categories: `flooring`, `furniture`, `wall`, `fabric`, `metal`, `wood`, `stone`, `glass`, `ceramic`, `paint`
- Managed via admin interface (`/admin/materials`)

#### `elements`
- Element/furniture library for enhancement
- Fields: `id`, `name`, `name_es`, `category`, `description`, `leonardo_prompt`, `negative_prompt`, `placement_hints`, `common_uses`, `dimensions`, `style`, `color`, `material`, `image_url`, `active`, `created_by`, `updated_by`, `created_at`, `updated_at`
- Categories: `chair`, `table`, `sofa`, `coffee_table`, `dining_table`, `desk`, `cabinet`, `shelf`, `bed`, `nightstand`, `lamp`, `rug`, `curtain`, `plant`, `art`, `accessory`, `other`
- Managed via admin interface (`/admin/elements`)

#### `design_files`
- Design file metadata (CAD, renders, presentations)
- Fields: `id`, `project_id`, `workflow_step`, `file_type`, `s3_key`, `s3_bucket`, `filename`, `created_at`
- Types: `drawing`, `render`, `presentation`, `technical`, `other`, `document`, `photo`

#### `project_notes`
- Notes associated with workflow steps
- Fields: `id`, `project_id`, `workflow_step`, `note_text`, `created_by`, `created_at`

### Relationships

- `quotes.project_id` → `projects.id`
- `images.project_id` → `projects.id`
- `design_files.project_id` → `projects.id`
- `project_notes.project_id` → `projects.id`

---

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info

### Projects

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/[id]` - Get project details
- `PUT /api/projects/[id]` - Update project
- `POST /api/projects/[id]/notes` - Add note to project
- `POST /api/projects/[id]/files` - Upload file to project

### Quotes (Legacy)

- `POST /api/quotes/calculate` - Calculate quote (space or furniture)
- `POST /api/quotes/save` - Save quote to database

### Quotations (New Robust Engine)

- `GET /api/quotes?project_id=...` - List quotations for a project
- `GET /api/quotes/[id]` - Get quotation with current version
- `PUT /api/quotes/[id]` - Update quotation settings (IVA rate, margin rate)
- `GET /api/quotes/[id]/versions` - List all versions
- `POST /api/quotes/[id]/versions` - Create new version
- `GET /api/quotes/[id]/versions/[versionId]` - Get specific version
- `PUT /api/quotes/[id]/versions/[versionId]` - Update version
- `GET /api/quotes/[id]/versions/[versionId]/items` - Get items for version
- `POST /api/quotes/[id]/versions/[versionId]/items` - Create item
- `PUT /api/quotes/[id]/versions/[versionId]/items/[itemId]` - Update item
- `DELETE /api/quotes/[id]/versions/[versionId]/items/[itemId]` - Delete item
- `GET /api/quotes/[id]/export/pdf` - Export quotation to PDF

### Spaces

- `GET /api/spaces?project_id=...` - List spaces for a project
- `POST /api/spaces` - Create space
- `GET /api/spaces/[id]` - Get single space
- `PUT /api/spaces/[id]` - Update space
- `DELETE /api/spaces/[id]` - Delete space

### Image-Space Assignment

- `GET /api/images/[id]/spaces` - Get spaces assigned to image
- `POST /api/images/[id]/spaces` - Assign spaces to image (body: `{ space_ids: string[] }`)

### Cost Libraries

- `GET /api/cost-libraries/units` - List cost units
- `GET /api/cost-libraries/material-costs` - List material costs
- `POST /api/cost-libraries/material-costs` - Create material cost
- `PUT /api/cost-libraries/material-costs/[id]` - Update material cost
- `DELETE /api/cost-libraries/material-costs/[id]` - Delete material cost
- `GET /api/cost-libraries/element-costs` - List element costs
- `POST /api/cost-libraries/element-costs` - Create element cost
- `PUT /api/cost-libraries/element-costs/[id]` - Update element cost
- `DELETE /api/cost-libraries/element-costs/[id]` - Delete element cost
- `GET /api/cost-libraries/labor-costs` - List labor costs
- `POST /api/cost-libraries/labor-costs` - Create labor cost
- `PUT /api/cost-libraries/labor-costs/[id]` - Update labor cost
- `DELETE /api/cost-libraries/labor-costs/[id]` - Delete labor cost

### Images

- `POST /api/images` - Upload and save image metadata
- `GET /api/images?project_id=...` - Get images for project
- `GET /api/images/[id]/versions` - Get all versions of an image (original + enhancements)

### Enhancement

- `POST /api/enhance` - General image enhancement
  - Form data: `image` (file), `mode` (structure/surfaces), `project_id` (optional)
  - **Auto-stores**: Original and enhanced images saved automatically
  - **Returns**: `imageId`, `version`, `projectId` (may be auto-created)

- `POST /api/enhance/targeted` - Targeted material replacement
  - Form data: `image` (file), `replacements` (JSON array), `project_id` (optional)
  - Replacements: `targetElement`, `fromMaterialId`, `toMaterialId`
  - **Auto-stores**: All versions tracked with metadata

- `POST /api/enhance/color` - Color-only replacement
  - Form data: `image` (file), `replacements` (JSON array), `project_id` (optional)
  - Replacements: `targetElement`, `fromColor`, `toColor`
  - **Auto-stores**: All versions tracked with metadata

- `POST /api/enhance/lighting` - Lighting control
  - Form data: `image` (file), `lightingConfig` (JSON), `project_id` (optional)
  - Config: `lightSources` (array), `overallWarmth`, `overallBrightness`
  - **Auto-stores**: All versions tracked with metadata

### Materials

- `GET /api/materials` - List materials (with filters: `category`, `search`, `active`)
- `POST /api/materials` - Create material (admin/designer only)
- `GET /api/materials/[id]` - Get single material
- `PUT /api/materials/[id]` - Update material (admin/designer only)
- `DELETE /api/materials/[id]` - Soft delete material (admin only)

### Elements

- `GET /api/elements` - List elements (with filters: `category`, `search`, `active`)
- `POST /api/elements` - Create element (admin/designer only)
- `GET /api/elements/[id]` - Get single element
- `PUT /api/elements/[id]` - Update element (admin/designer only)
- `DELETE /api/elements/[id]` - Soft delete element (admin only)

---

## S3 Bucket Organization

### Bucket Structure

1. **`bola8-uploads`** (US East Ohio)
   - Original file uploads before processing
   - Path: `uploads/{projectId}/originals/{timestamp}-{filename}`

2. **`bola8-images`** (US East Ohio)
   - General project images (photos, workflow images)
   - Path: `projects/{projectId}/{workflowStep}/images/{timestamp}-{filename}`

3. **`bola8-leonardo-images`** (US East Ohio)
   - Leonardo AI enhanced/rendered images
   - Path: `enhanced/{projectId}/{timestamp}-{filename}`

4. **`bola8-designs`** (US East Ohio)
   - Design files (drawings, renders, presentations, technical drawings)
   - Path: `projects/{projectId}/{workflowStep}/designs/{timestamp}-{filename}`

5. **`bola8-not-images`** (US East Ohio)
   - Non-image documents (PDFs, spreadsheets, Word docs)
   - Path: `projects/{projectId}/{workflowStep}/documents/{timestamp}-{filename}`

### File Categorization

Files are automatically categorized based on:
- File MIME type
- Context (workflow step, project association)
- Explicit type indicators

---

## Authentication & Authorization

### Authentication Flow

1. User submits email/password via `/api/auth/login`
2. Server validates credentials against `users` table
3. JWT token created with user info
4. Session cookie set (httpOnly, secure in production)
5. Middleware validates token on protected routes

### Protected Routes

All routes except `/login` require authentication. Unauthenticated users are redirected to `/login`.

### User Roles

- **admin**: Full access
- **designer**: Standard access (default)
- **viewer**: Read-only access (future implementation)

---

## UI/UX Design Principles

### Design Philosophy

- **Minimalistic**: Clean, uncluttered interface
- **Typography-driven**: Elegant use of fonts (Inter, Roboto Mono)
- **Elite Designer Quality**: Interface worthy of a high-end design studio
- **Spanish Localization**: All user-facing text in Latin American Spanish

### Color Palette

- Primary: Neutral grays (`neutral-900`, `neutral-500`, `neutral-400`)
- Accents: Subtle underlines and hover states
- Red accent: `#dc2626` (for "Artificial Intelligence Developments" branding)

### Typography

- **Inter**: Primary font for body text
- **Roboto Mono**: Monospace font for technical elements
- Font weights: Light (300), Regular (400), Medium (500)

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/bola8

# AWS S3
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# S3 Buckets (optional, defaults provided)
S3_UPLOAD_BUCKET=bola8-uploads
S3_IMAGES_BUCKET=bola8-images
LEONARDO_S3_BUCKET=bola8-leonardo-images
S3_DESIGNS_BUCKET=bola8-designs
S3_NOT_IMAGES_BUCKET=bola8-not-images

# Authentication
AUTH_SECRET=your-random-secret-key-for-jwt

# Leonardo AI
LEONARDO_API_KEY=your-leonardo-api-key
```

### Optional

- AWS credentials can use IAM roles if running on AWS infrastructure
- Bucket names default to standard values if not specified

---

## Deployment

### Infrastructure

- **Database**: AWS RDS PostgreSQL 17.4
  - Instance: `bola8-db-instance`
  - Region: `us-east-2b`
  - Not publicly accessible (VPC-only)
  
- **Storage**: AWS S3 (5 buckets in `us-east-2`)

- **Hosting**: Vercel (or similar Next.js-compatible platform)

### Setup Scripts

- `scripts/setup-database.js` - Create database and schema
- `scripts/test-connection.js` - Test database connection
- `scripts/create-user.js` - Create user account
- `scripts/run-migration.js` - Run database migrations
- `scripts/test-materials-table.js` - Verify materials table and data

### Quick Start Guides

- `QUICK_START_DB.md` - Database setup
- `QUICK_START_AUTH.md` - Authentication setup
- `docs/database-setup-guide.md` - Detailed database guide
- `docs/s3-setup-guide.md` - S3 bucket setup

---

## Implementation Recommendations

Based on the client's priorities, here are specific code improvements to achieve maximum value:

### Priority 1: Image Manipulation & Enhancement

#### Current Architecture Analysis
- **Location**: `app/api/enhance/route.js`
- **Current Flow**: Upload → Preprocess → Leonardo API → Poll → Return
- **Limitation**: Generic enhancement, no targeted material/color replacement

#### Recommended Improvements

**1. Material/Color Library System**
```typescript
// New file: lib/material-library.ts
export interface Material {
  id: string;
  name: string;
  category: 'flooring' | 'furniture' | 'wall' | 'fabric' | 'metal' | 'wood';
  color?: string;
  texture?: string;
  leonardoPrompt: string; // Optimized prompt for this material
}

export const MATERIAL_LIBRARY: Material[] = [
  {
    id: 'oak-wood',
    name: 'Oak Wood',
    category: 'wood',
    color: '#D4A574',
    leonardoPrompt: 'natural oak wood grain, warm honey tones, smooth finish'
  },
  // ... more materials
];
```

**2. Targeted Enhancement API**
```typescript
// New endpoint: app/api/enhance/targeted/route.ts
// Accepts:
// - image: File
// - replacements: Array<{
//     target: 'floor' | 'chair' | 'wall' | etc.
//     fromMaterial: string
//     toMaterial: string
//     maskRegion?: { x, y, width, height } // Optional region selection
//   }>
```

**3. Visual Material Picker UI**
```typescript
// New component: app/components/MaterialPicker.tsx
// Features:
// - Visual grid of materials with thumbnails
// - Category filtering (flooring, furniture, etc.)
// - Color swatches
// - Search functionality
// - "Before/After" preview
```

**4. Inpainting Integration**
- Use Leonardo's inpainting API for precise material replacement
- Implement mask generation from user selections
- Support multiple simultaneous replacements

**5. Prompt Engineering Optimization**
```typescript
// Enhanced prompt generation
function buildMaterialReplacementPrompt(
  originalMaterial: Material,
  targetMaterial: Material,
  targetElement: string
): string {
  return `Replace ${targetElement} material from ${originalMaterial.name} to ${targetMaterial.name}. 
          ${targetMaterial.leonardoPrompt}. 
          Maintain lighting, shadows, and perspective. 
          Seamless integration with surrounding elements.`;
}
```

**6. Batch Processing**
- Queue multiple material changes
- Process sequentially or in parallel (if API allows)
- Progress tracking UI

**7. Performance Optimizations**
- Image caching for frequently used materials
- Pre-generate material previews
- Optimize image dimensions before processing
- Implement request queuing to avoid rate limits

#### File Structure Changes
```
app/
├── api/
│   └── enhance/
│       ├── route.js (existing - general enhancement)
│       ├── targeted/route.ts (NEW - material replacement)
│       └── batch/route.ts (NEW - batch processing)
├── components/
│   ├── MaterialPicker.tsx (NEW)
│   ├── MaterialReplacementTool.tsx (NEW)
│   └── EnhancementPreview.tsx (NEW)
lib/
├── material-library.ts (NEW)
└── prompt-optimizer.ts (NEW)
```

### Priority 2: Automated, Accurate Quotations

#### Current Architecture Analysis
- **Location**: `app/api/quotes/calculate/route.ts`
- **Current Flow**: Form data → Calculation → Return
- **Limitation**: Static pricing, no material cost database

#### Recommended Improvements

**1. Material Cost Database**
```sql
-- New table: material_costs
CREATE TABLE material_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'wood', 'fabric', 'metal', etc.
  unit VARCHAR(50) NOT NULL, -- 'sqft', 'linear_ft', 'piece'
  base_cost DECIMAL(10, 2) NOT NULL,
  labor_cost_per_unit DECIMAL(10, 2),
  complexity_multiplier DECIMAL(3, 2) DEFAULT 1.0,
  supplier VARCHAR(255),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- New table: quote_history
CREATE TABLE quote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id),
  actual_cost DECIMAL(10, 2), -- Actual cost after project completion
  variance_percentage DECIMAL(5, 2), -- Difference from quote
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**2. Enhanced Quote Calculation Engine**
```typescript
// Enhanced: app/api/quotes/calculate/route.ts
import { getMaterialCost, calculateLaborCost } from '@/lib/quote-engine';

interface QuoteCalculation {
  materials: Array<{
    materialId: string;
    quantity: number;
    unitCost: number;
    laborCost: number;
    totalCost: number;
  }>;
  subtotal: number;
  complexityMultiplier: number;
  laborTotal: number;
  finalTotal: number;
  breakdown: {
    materials: number;
    labor: number;
    complexity: number;
    overhead: number;
  };
}
```

**3. Material Cost Management API**
```typescript
// New: app/api/materials/route.ts
// CRUD operations for material costs
// GET /api/materials - List all materials
// POST /api/materials - Add new material
// PUT /api/materials/[id] - Update material cost
// GET /api/materials/categories - Get by category
```

**4. Quote Accuracy Tracking**
```typescript
// New: app/api/quotes/[id]/accuracy/route.ts
// Track actual vs quoted costs
// Calculate variance
// Generate accuracy reports
```

**5. PDF Export with Breakdown**
```typescript
// New: app/api/quotes/[id]/export/route.ts
// Generate PDF with:
// - Itemized material costs
// - Labor breakdown
// - Complexity factors
// - Visual charts
// Use library like 'pdfkit' or 'puppeteer'
```

**6. Real-time Price Updates**
- Integration with supplier APIs (if available)
- Scheduled price refresh jobs
- Price change notifications

**7. Historical Data Analysis**
```typescript
// New: app/api/quotes/analytics/route.ts
// Provide insights:
// - Average quote accuracy
// - Most common materials
// - Cost trends over time
// - Variance by project type
```

#### File Structure Changes
```
app/
├── api/
│   ├── quotes/
│   │   ├── calculate/route.ts (ENHANCED)
│   │   ├── [id]/accuracy/route.ts (NEW)
│   │   └── [id]/export/route.ts (NEW)
│   └── materials/
│       └── route.ts (NEW)
lib/
├── quote-engine.ts (NEW - calculation logic)
├── material-costs.ts (NEW - cost database access)
└── pdf-generator.ts (NEW - PDF export)
db/
└── migrations/
    ├── 002_add_material_costs.sql (NEW)
    └── 003_add_quote_history.sql (NEW)
```

### Implementation Priority

**Phase 1 (Immediate - 1-2 weeks)**
1. Material/Color Library (database + UI)
2. Enhanced quote calculation with material costs
3. Basic material replacement API

**Phase 2 (Short-term - 2-4 weeks)**
1. Visual material picker UI
2. Inpainting integration
3. Quote accuracy tracking
4. PDF export

**Phase 3 (Medium-term - 1-2 months)**
1. Batch processing
2. Historical data analysis
3. Real-time price updates
4. Advanced prompt optimization

---

## Future Enhancements

### Short-term

- [ ] Client-facing portal (curated content view)
- [ ] Email notifications for workflow step changes
- [ ] Advanced search and filtering for projects
- [ ] Export quotes to PDF
- [ ] Image gallery improvements

### Medium-term

- [ ] 3D room scanning integration (MagicPlan)
- [ ] Automated note-taking from meetings
- [ ] Modular product library
- [ ] Design asset standardization
- [ ] Mobile app for site visits

### Long-term

- [ ] AI design assistant trained on historical projects
- [ ] Automatic layout proposals from 3D scans
- [ ] Machine learning for design style consistency
- [ ] Full design personalization system

---

## Known Issues & Limitations

1. **Image Enhancement**: Leonardo AI may have rate limits
2. **File Size**: No explicit file size limits (relies on S3 defaults)
3. **Concurrent Users**: Not tested with high concurrency
4. **Offline Support**: No offline capabilities

---

## Contributing

This is an internal tool. For questions or issues, contact the development team.

---

## Changelog

### 2025-01-XX
- Initial project setup
- 14-step workflow implementation
- Leonardo AI integration with aspect ratio preservation
- S3 bucket organization
- Authentication system
- Quote calculators
- Spanish localization

### 2025-01-XX (Latest)
- **Automatic Image Storage**: All images automatically saved to database and S3
- **Version Tracking**: Complete enhancement history with parent-child relationships
- **Image Version Navigator**: Minimalist component for browsing image versions
- **Material Library System**: Database-backed material management with CRUD interface
- **Element Library System**: Database-backed furniture/decor element management
- **Targeted Enhancement APIs**: Material replacement, color replacement, lighting control, element addition
- **Auto-Project Creation**: Projects created automatically when missing
- **Enhanced Metadata Storage**: Full enhancement parameters stored in database
- **Robust Quotation Engine**: Automatic quotation generation and versioning
  - Space-based item grouping
  - Automatic material/element detection from images
  - Cost libraries (materials, elements, labor)
  - Manual item editing
  - PNG and PDF export
  - Automatic updates on image changes
- **Space Management**: Define and manage project spaces
- **Image-Space Assignment**: Link images to spaces for quotation organization

---

**Note**: This is a living document. Update as features are added or changed.

