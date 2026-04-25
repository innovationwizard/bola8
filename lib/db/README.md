# Database Setup Guide

This application uses PostgreSQL (AWS RDS) for data persistence.

## Database Schema

The schema is defined in `lib/db/schema.sql`. It includes:

- **projects** - Core project entity tracking workflow states
- **site_visits** - Measurements, photos, and notes from on-site visits
- **images** - Original uploads and enhanced versions (stored in S3)
- **quotes** - Quote calculations linked to projects
- **design_files** - Links to design files (Rhino, SketchUp, Canva, etc.)
- **client_reviews** - Track revision rounds and client feedback

## Workflow States

Projects progress through these states:
1. `lead` - Initial inquiry
2. `scheduled` - Visit scheduled
3. `site_visit` - Site visit completed
4. `design_phase` - Design work in progress
5. `client_review` - Awaiting client feedback
6. `quotation` - Quote being prepared
7. `technical_drawings` - Production drawings being created
8. `manufacturing` - In workshop
9. `installation` - Installation phase
10. `completed` - Project complete

## Environment Variables

Add these to your `.env.local` file:

```bash
# Database (AWS RDS PostgreSQL)
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=bola8
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_SSL=true

# AWS S3 (all 5 buckets required)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_UPLOAD_BUCKET=bola8-uploads
S3_IMAGES_BUCKET=bola8-images
LEONARDO_S3_BUCKET=bola8-leonardo-images
S3_DESIGNS_BUCKET=bola8-designs
S3_NOT_IMAGES_BUCKET=bola8-not-images

# Leonardo AI
LEONARDO_API_KEY=your-leonardo-api-key

# Replicate (for Stable Diffusion + ControlNet)
REPLICATE_API_TOKEN=your-replicate-api-token

# ML Training System (optional)
OPENAI_API_KEY=sk-proj-your-openai-api-key
ML_SERVICE_URL=http://your-ml-service-url:8000
ENABLE_TRAINING_MODE=false

# Authentication
AUTH_SECRET=your-very-long-random-secret-key-minimum-32-characters
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
run_terminal_cmd

## Quick Setup Checklist

✅ **See `docs/database-setup-guide.md` for complete step-by-step instructions**

1. **Create AWS RDS PostgreSQL instance** (see detailed guide)
   - Recommended: db.t3.micro or larger
   - Enable public access if needed (or use VPC)
   - Note the endpoint, port, and credentials

2. **Configure Security Group**
   - Allow inbound PostgreSQL (port 5432) from your IP or application

3. **Create database and run schema**
   ```bash
   # Create database
   psql -h your-rds-endpoint -U your-user -d postgres -c "CREATE DATABASE bola8;"
   
   # Run schema
   psql -h your-rds-endpoint -U your-user -d bola8 -f lib/db/schema.sql
   ```

4. **Set environment variables** (see below)

5. **Test the connection**
   - The app will automatically test the connection on first API call
   - Check logs for any connection errors

## Database Migrations

For future schema changes, create migration files in `lib/db/migrations/` and apply them manually or with a migration tool.

### Applied Migrations

1. **`001_add_users_table.sql`** - Adds `users` table for authentication
2. **`002_add_materials_table.sql`** - Adds `materials` table with initial data
3. **`003_add_image_versions.sql`** - Adds version tracking to `images` table
   - `parent_image_id`: Links enhanced images to originals
   - `enhancement_type`: Type of enhancement (general, targeted, color, lighting, elements)
   - `enhancement_metadata`: JSONB field for full enhancement parameters
   - `version`: Version number (auto-incremented per parent)
4. **`004_add_elements_table.sql`** - Adds `elements` table with initial data for furniture/decor items
5. **`005_add_spaces_and_quotation_engine.sql`** - Adds quotation engine tables:
   - `spaces`: Project spaces/rooms
   - `quotations`: Main quotation records
   - `quotation_versions`: Versioned quotations
   - `quotation_items`: Individual line items
   - `image_spaces`: Many-to-many relationship between images and spaces
   - `cost_units`: Unit of measurement library
   - `material_costs`: Material cost library
   - `element_costs`: Element/furniture cost library
   - `labor_costs`: Labor cost library
6. **`006_seed_initial_costs.sql`** - Seeds initial costs (1.00) and prices (2.00) for all materials and elements

7. **`007_add_enhancement_ratings_and_experiments.sql`** - Adds tables for tracking enhancement quality and experiments
   - `enhancement_ratings`: User ratings for enhancement options (A, B, etc.)
   - `prompt_versions`: Different prompt versions and their performance metrics
   - `parameter_experiments`: Parameter combinations and their ratings for optimization

### Running Migrations

```bash
# Run a specific migration
node scripts/run-migration.js lib/db/migrations/003_add_image_versions.sql

# Run all migrations in order
node scripts/run-migration.js lib/db/migrations/001_add_users_table.sql
node scripts/run-migration.js lib/db/migrations/002_add_materials_table.sql
node scripts/run-migration.js lib/db/migrations/003_add_image_versions.sql
node scripts/run-migration.js lib/db/migrations/004_add_elements_table.sql
node scripts/run-migration.js lib/db/migrations/005_add_spaces_and_quotation_engine.sql
node scripts/run-migration.js lib/db/migrations/006_seed_initial_costs.sql
node scripts/run-migration.js lib/db/migrations/007_add_enhancement_ratings_and_experiments.sql
```

