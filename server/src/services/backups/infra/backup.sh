#!/bin/bash
set -e # Stop the script immediately if any command fails

DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILE_NAME="backup_$DATE.dump"

echo "Streaming $DB_NAME backup directly to Google Drive..."

# Pipe the dump directly into rclone's encryption layer
pg_dump -h "$DB_HOST" -U "$DB_USER" -Fc "$DB_NAME" | rclone rcat "crypt_backup:$FILE_NAME"

echo "Upload successful. Cleaning up old cloud backups..."

# Tell rclone to delete backups older than 30 days from the encrypted folder
rclone delete "crypt_backup:" --min-age 30d

echo "All done!"