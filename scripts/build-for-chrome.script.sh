#!/bin/bash

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes. Please commit or stash them before building."
    exit 1
fi

echo "🧹 Cleaning up any existing dist directory..."
rm -rf dist

echo "🔨 Cleaning up existing builds..."
rm -rf dist-*.zip

echo "Updating package.json version..."
pnpm version patch

echo "🔨 Building the project with pnpm..."
pnpm build

# Create a timestamp for the zip file
current_datetime=$(date +"%Y%m%d%H%M")

echo "📎 Creating zip archive of the extension..."
7z a "dist-${current_datetime}.zip" dist

echo "🧹 Cleaning up the dist directory..."
rm -rf dist

echo "✅ Build complete! Chrome extension package created: dist-${current_datetime}.zip"

# To run the script:
# chmod +x scripts/build-for-chrome.script.sh
# ./scripts/build-for-chrome.script.sh
