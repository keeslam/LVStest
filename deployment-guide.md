# Deployment Guide for Car Rental Management System

This guide provides step-by-step instructions for deploying the Car Rental Management System to your own server. There are three main methods for deployment:

1. **Coolify Deployment** (Easiest) - Using your own Coolify server for automated deployments
2. **GitHub Deployment** (Traditional) - Using Git for version control and easier updates
3. **ZIP File Deployment** - Direct transfer of files using a ZIP archive

## Prerequisites

- Linux server (Ubuntu 20.04 LTS or newer recommended)
- Node.js 18 or newer
- PostgreSQL 14 or newer
- Nginx
- Domain name (optional)

## Server Setup

1. **Update system packages**:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install required software**:
   ```bash
   # Install Node.js 18.x
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs

   # Install PostgreSQL
   sudo apt install -y postgresql postgresql-contrib

   # Install Nginx
   sudo apt install -y nginx

   # Install PM2 for process management
   sudo npm install -g pm2
   ```

## Database Setup

1. **Create a PostgreSQL user and database**:
   ```bash
   sudo -u postgres psql
   ```

   In the PostgreSQL prompt:
   ```sql
   CREATE USER carrentaluser WITH PASSWORD 'secure_password_here';
   CREATE DATABASE carrentaldb OWNER carrentaluser;
   \q
   ```

2. **Test the database connection**:
   ```bash
   psql -U carrentaluser -d carrentaldb -h localhost
   # Enter your password when prompted
   # Type \q to exit
   ```

## Coolify Deployment Method (Easiest)

Coolify is a self-hosted platform that automates your deployments directly from GitHub. This method is the easiest and most automated way to deploy your application.

### Prerequisites for Coolify

- A running Coolify server (v4.0 or newer)
- GitHub account with your code repository
- Access to your Coolify dashboard

### Step 1: Prepare Your Code for Coolify

1. **Clean up your repository first** (CRITICAL for fast deployment):
   
   Your repository may contain large uploaded files that make deployment very slow. Run the cleanup script:
   ```bash
   # Make the script executable
   chmod +x cleanup-repo.sh
   
   # Run the cleanup (this will rewrite git history)
   ./cleanup-repo.sh
   
   # Force push the cleaned repository
   git push --force-with-lease origin main
   ```
   
   **Warning**: This removes upload files from git history. Your team should coordinate this change.

2. **Upload your code to GitHub** (if not already done):
   ```bash
   # In your project directory
   git init
   git add .
   git commit -m "Initial commit for Coolify deployment"
   
   # Add your GitHub repository as remote
   git remote add origin https://github.com/your-username/car-rental-manager.git
   git push -u origin main
   ```

3. **Verify required files are present**:
   Your repository should include these Coolify-specific files (already included):
   - `nixpacks.toml` - Coolify build configuration
   - `.env.coolify` - Environment variables template
   - `package.json` - Dependencies and build scripts
   - `cleanup-repo.sh` - Repository optimization script

### Step 2: Create a New Project in Coolify

1. **Log in to your Coolify dashboard**
2. **Create a new project**:
   - Click "Create New Project"
   - Give your project a name (e.g., "Car Rental Manager")
   - Select your preferred server

3. **Create a new application**:
   - Click "Create Application"
   - Choose "GitHub" as the source
   - Select your repository (`car-rental-manager`)
   - Set branch to `main`
   - Leave build pack as "Nixpacks" (default)
   - **Set "Clone Depth" to 1** for faster cloning

### Step 3: Configure Application Settings

1. **Basic Configuration**:
   - **Name**: car-rental-manager
   - **Port**: 3000 (Coolify will handle port mapping automatically)
   - **Build Command**: `npm run build` (automatically detected)
   - **Start Command**: `npm start` (automatically detected)

2. **Environment Variables**:
   In your Coolify application dashboard, go to "Environment Variables" and add:
   
   ```bash
   NODE_ENV=production
   PORT=3000
   SESSION_SECRET=your_secure_random_32_character_string
   
   # Database variables (use your Coolify database service)
   DATABASE_URL=postgresql://username:password@database:5432/car_rental
   PGUSER=your_db_user
   PGPASSWORD=your_db_password
   PGHOST=database
   PGPORT=5432
   PGDATABASE=car_rental
   ```

   **Important**: Mark database-related environment variables as "Build Variables" if you need them during the build process.

### Step 4: Set Up Database Service

1. **Create a PostgreSQL database service**:
   - In your Coolify project, click "Create Database"
   - Choose "PostgreSQL"
   - Name it "car-rental-db"
   - Set a strong password
   - Create the database

2. **Get database connection details**:
   - Note the internal URL (usually: `postgresql://postgres:password@database:5432/postgres`)
   - Update your environment variables with the correct database URL

3. **Create a persistent volume for uploads**:
   - In your Coolify project, click "Create Volume"
   - Name: `uploads-storage`
   - Mount path: `/app/uploads`
   - This ensures uploaded files persist across deployments

### Step 5: Deploy Your Application

1. **Configure build settings** (if needed):
   - Coolify automatically uses the `nixpacks.toml` configuration
   - Node.js version 20 is specified in the config
   - Build process will run `npm run build` automatically

2. **Deploy the application**:
   - Click "Deploy" in your Coolify dashboard
   - Monitor the build logs for any issues
   - The deployment typically takes 2-5 minutes

3. **Verify deployment**:
   - Once deployed, click on your application URL
   - You should see the Car Rental Management System login page
   - Test the application functionality

### Step 6: Database Migration (First Deployment)

After your first successful deployment, you need to set up the database schema:

1. **Access application logs**:
   - In Coolify dashboard, go to your application
   - Click on "Logs" to see runtime logs

2. **Run database migrations**:
   - The application will automatically create tables on first connection
   - Monitor the logs to ensure database setup completes successfully

### Step 7: Configure Domain (Optional)

1. **Set up custom domain**:
   - In Coolify, go to your application settings
   - Add your domain name
   - Coolify will automatically handle SSL certificates

### Coolify Deployment Benefits

- **Automatic deployments**: Push to GitHub triggers automatic rebuilds
- **Built-in SSL**: Automatic HTTPS certificates
- **Container management**: Automatic scaling and health checks
- **Easy rollbacks**: One-click rollback to previous versions
- **Environment management**: Easy environment variable management
- **Integrated databases**: Built-in PostgreSQL service
- **Log monitoring**: Centralized application and build logs

### Updating Your Application

To update your deployed application:

1. **Make changes to your code**
2. **Commit and push to GitHub**:
   ```bash
   git add .
   git commit -m "Update: description of changes"
   git push
   ```
3. **Coolify automatically deploys** the changes (if auto-deploy is enabled)
4. **Or manually trigger deployment** from the Coolify dashboard

### Troubleshooting Coolify Deployment

**Build fails**:
- Check the build logs in Coolify dashboard
- Verify `nixpacks.toml` configuration
- Ensure all dependencies are listed in `package.json`

**Application won't start**:
- Check runtime logs
- Verify environment variables are set correctly
- Ensure database connection is working

**Database connection issues**:
- Verify database service is running
- Check database credentials in environment variables
- Ensure `DATABASE_URL` format is correct

**Port binding issues**:
- Coolify expects apps to use the `PORT` environment variable
- Your app should bind to `0.0.0.0:$PORT` (already configured)

## GitHub Deployment Method (Traditional)

### Step 1: Create a GitHub Repository

1. **Create a new GitHub repository**:
   - Go to [GitHub](https://github.com) and log in to your account
   - Click the "+" icon in the top right and select "New repository"
   - Name your repository (e.g., "car-rental-manager")
   - Set it to private if you want to keep your code secure
   - Click "Create repository"

2. **Push your code to GitHub**:
   ```bash
   # On your local machine, after downloading the project from Replit
   cd car-rental-manager
   
   # Initialize Git repository
   git init
   
   # Add the GitHub repository as remote
   git remote add origin https://github.com/your-username/car-rental-manager.git
   
   # Add all files
   git add .
   
   # Commit changes
   git commit -m "Initial commit"
   
   # Push to GitHub
   git push -u origin main
   ```

### Step 2: Deploy from GitHub to Your Server

1. **Install Git on your server**:
   ```bash
   sudo apt install git
   ```

2. **Clone the repository**:
   ```bash
   # Create the application directory
   sudo mkdir -p /var/www
   
   # Clone your repository
   cd /var/www
   sudo git clone https://github.com/your-username/car-rental-manager.git carrentalmanager
   cd carrentalmanager
   ```

3. **Set up deployment key (optional but recommended)**:
   For secure deployments without entering your password:
   ```bash
   # Generate SSH key on your server
   ssh-keygen -t ed25519 -C "your-email@example.com"
   
   # View and copy the public key
   cat ~/.ssh/id_ed25519.pub
   ```
   
   Then add this key to your GitHub repository:
   - Go to your repository on GitHub
   - Click "Settings" > "Deploy keys" > "Add deploy key"
   - Paste your public key and give it a title
   - Check "Allow write access" if you need to push from the server
   - Click "Add key"

4. **Configure Git on your server**:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your-email@example.com"
   ```

### Step 3: Set Up Application

Now proceed with installing dependencies, setting up the environment file, and building the application:

## ZIP File Deployment Method

1. **Transfer the ZIP file to your server**:
   ```bash
   # On your local machine, download the ZIP file from Replit
   
   # Option 1: Use SCP to transfer the ZIP file to your server
   scp car-rental-manager.zip username@your-server-ip:/tmp/
   
   # Option 2: Or use SFTP to upload the file
   
   # On your server, extract the ZIP file
   sudo mkdir -p /var/www/carrentalmanager
   sudo unzip /tmp/car-rental-manager.zip -d /var/www/carrentalmanager
   cd /var/www/carrentalmanager
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create .env file**:
   Copy the `.env.sample` file to `.env` and update the values:
   ```bash
   cp .env.sample .env
   nano .env
   ```

   Update the contents with your actual database credentials:
   ```
   DATABASE_URL=postgresql://carrentaluser:secure_password_here@localhost:5432/carrentaldb
   NODE_ENV=production
   SESSION_SECRET=random_secure_string_here
   ```

4. **Build the application**:
   ```bash
   npm run build
   ```

5. **Initialize database schema**:
   ```bash
   npm run db:push
   ```

6. **Configure PM2**:
   ```bash
   # Start the application with PM2
   pm2 start dist/index.js --name "car-rental-manager"

   # Configure PM2 to start on system boot
   pm2 startup
   # Follow the instructions output by the above command
   pm2 save
   ```

## Nginx Configuration

1. **Create Nginx server block**:
   ```bash
   sudo nano /etc/nginx/sites-available/car-rental-manager
   ```

   Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # Replace with your domain or server IP

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       # Configure file upload size limits
       client_max_body_size 50M;
   }
   ```

2. **Enable the site and restart Nginx**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/car-rental-manager /etc/nginx/sites-enabled/
   sudo nginx -t  # Test the configuration
   sudo systemctl restart nginx
   ```

## SSL Configuration (Optional)

1. **Install Certbot**:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

2. **Obtain and install SSL certificate**:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

   Follow the prompts and choose to redirect HTTP traffic to HTTPS.

## File Upload Directory

Ensure the uploads directory exists and has proper permissions:

```bash
mkdir -p /var/www/carrentalmanager/uploads
chmod 755 /var/www/carrentalmanager/uploads
chown -R www-data:www-data /var/www/carrentalmanager/uploads
```

## Monitoring and Maintenance

1. **Check application status**:
   ```bash
   pm2 status
   ```

2. **View logs**:
   ```bash
   pm2 logs car-rental-manager
   ```

3. **Set up log rotation**:
   ```bash
   pm2 install pm2-logrotate
   ```

## Database Backups

1. **Create a backup script**:
   ```bash
   sudo nano /usr/local/bin/backup-carrentaldb.sh
   ```

   Add the following content:
   ```bash
   #!/bin/bash
   BACKUP_DIR="/var/backups/carrentaldb"
   TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
   mkdir -p $BACKUP_DIR
   pg_dump -U carrentaluser -d carrentaldb -h localhost > $BACKUP_DIR/carrentaldb_$TIMESTAMP.sql
   find $BACKUP_DIR -type f -mtime +7 -delete  # Delete backups older than 7 days
   ```

2. **Make the script executable**:
   ```bash
   sudo chmod +x /usr/local/bin/backup-carrentaldb.sh
   ```

3. **Set up a daily cron job**:
   ```bash
   sudo crontab -e
   ```

   Add this line:
   ```
   0 2 * * * /usr/local/bin/backup-carrentaldb.sh
   ```

## Updating the Application

### GitHub Update Method (Recommended)

When you have updates to the application:

1. **Push changes to GitHub first**:
   ```bash
   # On your local machine, make changes to the code
   
   # Commit and push changes to GitHub
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

2. **Pull changes on your server**:
   ```bash
   # Navigate to the application directory
   cd /var/www/carrentalmanager
   
   # Create a backup of your .env file
   cp .env /tmp/.env.backup
   
   # Pull the latest changes
   sudo git pull
   
   # Restore your .env file if it was overwritten
   cp /tmp/.env.backup .env
   
   # Install any new dependencies
   npm install
   
   # Rebuild the application
   npm run build
   
   # Apply any database migrations
   npm run db:push
   
   # Restart the application
   pm2 restart car-rental-manager
   ```

3. **Verify the update**:
   ```bash
   # Check application status
   pm2 status
   
   # Check logs for any errors
   pm2 logs car-rental-manager
   ```

### ZIP File Update Method

When you have new versions of the application:

1. **Transfer the new ZIP file to your server**:
   ```bash
   # On your local machine, download the new ZIP file from Replit
   
   # Use SCP to transfer the ZIP file to your server
   scp car-rental-manager.zip username@your-server-ip:/tmp/
   ```

2. **Back up your .env file**:
   ```bash
   cp /var/www/carrentalmanager/.env /tmp/.env.backup
   ```

3. **Extract the new version**:
   ```bash
   # Create a new directory for the updated application
   sudo mkdir -p /var/www/carrentalmanager-new
   
   # Extract the ZIP file
   sudo unzip /tmp/car-rental-manager.zip -d /var/www/carrentalmanager-new
   
   # Restore your .env file
   sudo cp /tmp/.env.backup /var/www/carrentalmanager-new/.env
   
   # Copy uploads directory if it contains important data
   sudo cp -r /var/www/carrentalmanager/uploads /var/www/carrentalmanager-new/
   ```

4. **Switch to new version**:
   ```bash
   # Stop the current app
   pm2 stop car-rental-manager
   
   # Rename directories
   sudo mv /var/www/carrentalmanager /var/www/carrentalmanager-old
   sudo mv /var/www/carrentalmanager-new /var/www/carrentalmanager
   
   # Install dependencies and build
   cd /var/www/carrentalmanager
   npm install
   npm run build
   
   # Restart the application
   pm2 restart car-rental-manager || pm2 start dist/index.js --name "car-rental-manager"
   
   # Verify it's running
   pm2 status
   ```

5. **Apply any database migrations if needed**:
   ```bash
   npm run db:push
   ```

6. **Clean up**:
   ```bash
   # After confirming everything works, remove the old version
   sudo rm -rf /var/www/carrentalmanager-old
   ```

## Troubleshooting

- **Check application logs**:
  ```bash
  pm2 logs car-rental-manager
  ```

- **Check Nginx logs**:
  ```bash
  sudo tail -f /var/log/nginx/error.log
  sudo tail -f /var/log/nginx/access.log
  ```

- **Check database connection**:
  ```bash
  psql -U carrentaluser -d carrentaldb -h localhost
  ```

- **Verify environment variables are loaded**:
  ```bash
  pm2 env car-rental-manager
  ```