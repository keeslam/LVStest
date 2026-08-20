#!/bin/bash

# Script to prepare the car rental management system for deployment

# Create a timestamped directory name
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEPLOY_DIR="car-rental-manager_$TIMESTAMP"

echo "Creating deployment package in $DEPLOY_DIR..."
mkdir -p $DEPLOY_DIR

# Copy all important project files
echo "Copying project files..."
cp -r client $DEPLOY_DIR/
cp -r server $DEPLOY_DIR/
cp -r shared $DEPLOY_DIR/
cp -r uploads $DEPLOY_DIR/ 2>/dev/null || mkdir -p $DEPLOY_DIR/uploads
cp package.json $DEPLOY_DIR/
cp package-lock.json $DEPLOY_DIR/
cp .env.sample $DEPLOY_DIR/
cp deployment-guide.md $DEPLOY_DIR/
cp drizzle.config.ts $DEPLOY_DIR/
cp postcss.config.js $DEPLOY_DIR/
cp tailwind.config.ts $DEPLOY_DIR/
cp tsconfig.json $DEPLOY_DIR/
cp vite.config.ts $DEPLOY_DIR/
cp components.json $DEPLOY_DIR/

# Create a README file
cat > $DEPLOY_DIR/README.md << EOL
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

# Create a ZIP file
echo "Creating ZIP archive..."
zip -r "car-rental-manager_$TIMESTAMP.zip" $DEPLOY_DIR

echo "Done! Deployment package created: car-rental-manager_$TIMESTAMP.zip"
echo "This file is ready to be transferred to your production server."
echo "Follow the instructions in deployment-guide.md to complete the deployment."