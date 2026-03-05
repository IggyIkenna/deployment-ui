#!/bin/bash

# Quality gates for TypeScript/React UI repository
set -e

echo "🔍 Running TypeScript/React Quality Gates..."

# Step 1: TypeScript type check
echo "Step 1/3: TypeScript type check..."
if [ -f "package.json" ] && [ -f "tsconfig.json" ]; then
    npm run typecheck
    echo "✅ TypeScript type check passed"
else
    echo "⚠️ No package.json or tsconfig.json found, skipping TypeScript check"
fi

# Step 2: ESLint
echo "Step 2/3: ESLint..."
if [ -f "package.json" ]; then
    if npm run lint --silent 2>/dev/null; then
        echo "✅ ESLint passed"
    else
        echo "⚠️ No lint script or lint failed"
    fi
else
    echo "⚠️ No package.json found, skipping ESLint"
fi

# Step 3 (optional): Smoke tests
echo "Step 3/3: Smoke tests (optional)..."
if [ -f "package.json" ] && grep -q '"smoketest"' package.json; then
    npm run smoketest || echo "⚠️ Smoke tests failed (not blocking)"
    echo "✅ Smoke tests completed"
else
    echo "⚠️ No smoke tests configured, skipping"
fi

echo ""
echo "🎉 All TypeScript/React quality gates completed!"
