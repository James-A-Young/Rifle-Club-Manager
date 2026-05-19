import fs from 'fs';
import path from 'path';

// Load environment variables from .env file if it exists
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key) {
      const value = valueParts.join('=').trim();
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = cleanValue;
      }
    }
  }
}

process.env.NODE_ENV = 'test';
// Use a sufficiently long secret (≥32 chars) to satisfy the JWT validation requirement
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-only-do-not-use-in-prod';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
