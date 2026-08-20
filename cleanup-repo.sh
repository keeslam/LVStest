#!/bin/bash

# Repository cleanup script for Coolify deployment
# This script removes large binary files from git history to speed up cloning

echo "🧹 Cleaning up repository for faster Coolify deployment..."

# Check if git-filter-repo is available
if ! command -v git-filter-repo &> /dev/null; then
    echo "❌ git-filter-repo not found. Installing..."
    
    # Try to install git-filter-repo
    if command -v pip3 &> /dev/null; then
        pip3 install git-filter-repo
    elif command -v brew &> /dev/null; then
        brew install git-filter-repo
    else
        echo "Please install git-filter-repo manually:"
        echo "- pip3 install git-filter-repo"
        echo "- or brew install git-filter-repo"
        echo "- or visit: https://github.com/newren/git-filter-repo"
        exit 1
    fi
fi

echo "📊 Repository size before cleanup:"
du -sh .git

echo "🗑️  Removing uploads/, attached_assets/, and contracts/ from git history..."

# Remove the directories from git history
git filter-repo --path uploads --path attached_assets --path contracts --invert-paths

# Aggressive garbage collection
echo "🗑️  Running garbage collection..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "📊 Repository size after cleanup:"
du -sh .git

echo "✅ Repository cleanup complete!"
echo ""
echo "📤 Next steps:"
echo "1. Force push to GitHub: git push --force-with-lease origin main"
echo "2. In Coolify, set 'Clone Depth' to 1 for shallow cloning"
echo "3. Set up a persistent volume in Coolify for /app/uploads"
echo ""
echo "⚠️  Warning: This rewrites git history. Make sure your team is aware!"