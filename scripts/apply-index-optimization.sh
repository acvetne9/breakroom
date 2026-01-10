#!/bin/bash

# Script to apply index optimization to Supabase database
# Usage: ./scripts/apply-index-optimization.sh

set -e  # Exit on error

PROJECT_REF="hyygpxhwkvyxtbjnnpqk"
MIGRATION_FILE="supabase/migrations/20260106000000_optimize_indexes.sql"

echo "============================================"
echo "Supabase Index Optimization Script"
echo "============================================"
echo ""
echo "Project: $PROJECT_REF"
echo "Migration: $MIGRATION_FILE"
echo ""

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Confirm before proceeding
read -p "This will optimize database indexes. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "📊 Applying index optimization migration..."
echo ""

# Apply the migration using Supabase CLI
# Note: You may need to authenticate first with: supabase login

# Option 1: If you have Supabase CLI properly configured
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."

    # Try to apply the migration
    supabase db push --db-url "postgresql://postgres.[PROJECT-PASSWORD]@db.$PROJECT_REF.supabase.co:5432/postgres" || {
        echo ""
        echo "⚠️  Supabase CLI push failed. Please apply manually."
        echo ""
        echo "Manual application methods:"
        echo ""
        echo "1. Via Supabase Dashboard:"
        echo "   - Go to https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
        echo "   - Copy and paste the contents of $MIGRATION_FILE"
        echo "   - Click 'Run'"
        echo ""
        echo "2. Via psql:"
        echo "   psql postgresql://postgres:[YOUR-PASSWORD]@db.$PROJECT_REF.supabase.co:5432/postgres < $MIGRATION_FILE"
        echo ""
        exit 1
    }
else
    echo "⚠️  Supabase CLI not found."
    echo ""
    echo "Please apply the migration manually:"
    echo ""
    echo "1. Via Supabase Dashboard:"
    echo "   - Go to https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
    echo "   - Copy and paste the contents of $MIGRATION_FILE"
    echo "   - Click 'Run'"
    echo ""
    echo "2. Via psql (if you have database password):"
    echo "   psql postgresql://postgres:[YOUR-PASSWORD]@db.$PROJECT_REF.supabase.co:5432/postgres < $MIGRATION_FILE"
    echo ""
    exit 1
fi

echo ""
echo "✅ Index optimization complete!"
echo ""
echo "Next steps:"
echo "1. Monitor index usage with: SELECT * FROM get_index_usage_stats();"
echo "2. Check for missing indexes: SELECT * FROM get_missing_indexes_suggestions();"
echo "3. Run ANALYZE on tables periodically"
echo ""
echo "If you need to rollback, run:"
echo "   psql < supabase/migrations/20260106000001_rollback_optimize_indexes.sql"
echo ""
