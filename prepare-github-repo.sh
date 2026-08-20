#!/bin/bash

# Script to prepare the car rental management system for GitHub deployment

# Check if GitHub repo URL was provided
if [ -z "$1" ]; then
  echo "Usage: ./prepare-github-repo.sh https://github.com/your-username/your-repo.git"
  exit 1
fi

GITHUB_REPO=$1

# Create a temporary directory
TEMP_DIR="github-prep-$(date +%s)"
mkdir -p $TEMP_DIR

# Copy all important project files
echo "Copying project files to $TEMP_DIR..."
cp -r client $TEMP_DIR/
cp -r server $TEMP_DIR/
cp -r shared $TEMP_DIR/
cp -r uploads $TEMP_DIR/ 2>/dev/null || mkdir -p $TEMP_DIR/uploads
cp package.json $TEMP_DIR/
cp package-lock.json $TEMP_DIR/
cp .env.sample $TEMP_DIR/
cp deployment-guide.md $TEMP_DIR/
cp drizzle.config.ts $TEMP_DIR/
cp postcss.config.js $TEMP_DIR/
cp tailwind.config.ts $TEMP_DIR/
cp tsconfig.json $TEMP_DIR/
cp vite.config.ts $TEMP_DIR/
cp components.json $TEMP_DIR/

# Create a README file
cat > $TEMP_DIR/README.md << EOL
# Car Rental Management System

This is a comprehensive car rental management system built with:
- React.js with TypeScript frontend
- Express.js backend
- PostgreSQL database
- TanStack Query for data fetching
- Tailwind CSS for styling

## Deployment Instructions

Please refer to the \`deployment-guide.md\` file for detailed deployment instructions.

## Quick Start

1. Install dependencies: \`npm install\`
2. Copy \`.env.sample\` to \`.env\` and update the database connection string
3. Build the application: \`npm run build\`
4. Start the application: \`npm start\`

## Important Notes

- The uploads directory must have appropriate permissions (755)
- Make sure to run database migrations with \`npm run db:push\`
- Configure a production-ready web server like Nginx as a reverse proxy
EOL

# Create .gitignore file
cat > $TEMP_DIR/.gitignore << EOL
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Editor directories and files
.idea/
.vscode/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db
EOL

# Initialize Git repo
cd $TEMP_DIR
git init
git add .
git commit -m "Initial commit"

# Add remote and instructions
git remote add origin $GITHUB_REPO
echo ""
echo "Repository prepared successfully in the '$TEMP_DIR' directory."
echo ""
echo "To upload to GitHub, run the following commands:"
echo "  cd $TEMP_DIR"
echo "  git push -u origin main"
echo ""
echo "If you encounter authentication issues, you may need to:"
echo "  1. Generate a Personal Access Token on GitHub"
echo "  2. Use the token as your password when prompted"
echo ""
echo "To deploy to your server, follow the GitHub deployment instructions in deployment-guide.md"