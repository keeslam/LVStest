# 🚀 Deployment Configuration Guide

## File Upload Configuration

The car rental system now supports configurable upload directories that work across different server environments.

### Environment Variables

Set this environment variable on your server:

```bash
# Optional: Custom upload directory (defaults to ./uploads)
UPLOADS_DIR=/path/to/your/uploads/directory
```

### Deployment Setup

#### 1. Create Upload Directory
```bash
# Create the upload directory with proper permissions
sudo mkdir -p /var/uploads/car-rental
sudo chown -R your-app-user:your-app-group /var/uploads/car-rental
sudo chmod -R 755 /var/uploads/car-rental
```

#### 2. Set Environment Variable
```bash
# In your .env file or environment
UPLOADS_DIR=/var/uploads/car-rental
```

#### 3. Directory Structure
The system will automatically create subdirectories:
```
/var/uploads/car-rental/
├── contracts/
│   └── ABC123/          # Vehicle license plates (sanitized)
├── ABC123/              # Vehicle-specific folders
│   ├── damage_checks/
│   ├── insurance/
│   └── maintenance/
├── invoices/
└── temp/                # Temporary uploads
```

### Troubleshooting

#### Permission Issues
```bash
# Check directory permissions
ls -la /var/uploads/car-rental

# Fix permissions if needed
sudo chown -R your-app-user:your-app-group /var/uploads/car-rental
sudo chmod -R 755 /var/uploads/car-rental
```

#### File Not Found Errors
1. Check the console for upload directory path
2. Verify the directory exists and has write permissions
3. Check environment variable is set correctly

### Server Requirements

- **Write Permissions**: Application must have write access to upload directory
- **Disk Space**: Ensure adequate storage for uploaded documents
- **Backup**: Include upload directory in your backup strategy

### Default Behavior

If `UPLOADS_DIR` is not set, the system defaults to `./uploads` relative to the application directory.

For production, it's recommended to use an absolute path outside the application directory to prevent data loss during deployments.