import { beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/prisma';

// Ensure JWT_SECRET is long enough to satisfy the 32-char minimum requirement
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'test-secret-for-integration-tests-only-do-not-use-in-prod';
}

process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer-id';
process.env.GOOGLE_WALLET_ISSUER_EMAIL = 'test@example.com';
process.env.GOOGLE_WALLET_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygaxJiWr/LVy9T1n1c6hZjz5pNQr5T3P\nLb/GyRZUzwCGlxeJ7IpR2Kp8h8BU8uTKFkm2LqRJvKGhVLqKVhGtmLkGhLJsB+Jn\nt0JjfQM6zy0hKK8vKxqz0YvLzCPWRPcEZKbTg2NnvLQNJj8jNZvYPU6bKP8wMQpU\nC6hRMCmNHVGqXgzvCPQKZL7NqQzKgNZtFqRvBCPqLVMcH+z/Y8kVDfQVLaKxKFZY\nmJqB0kNGNPkqJU0Q2R8p7S+TcJvMQxWPLK8J7FQtPPLFCpkYJJ0H7v7R7NHqNLFE\nKkqmVEqbVQxT7Z2jqGcMlNQgFGcWp7pYpGiRkwIDAQABAoIBAHFKYJqKVxU/S4b1\nGbLpVH8kWDXY4qfZxUMGaGpG6AGCQB7L1GpPW5vS3aKmI4NXzxhCUzK8LUZJhFd4\nJW+dC+TfCH3BnOh1ZjvKh8V2uLGp6KDZqCGgT0t5F9NV2G8lB3rB9Yz3CUV9Kpn+\nhjqcQg8TzYO0llDZYhCi7J6fJF1nvKVL1S1j4eR8G6JaEMjMSqYK7YPK6Yz3Xhz+\nVFKzKvl9E7QKRhQLNFKEjXTF7xNhNqKvXQGBqDu8MF2U7bNmHkZjkCYZcMQNqR8D\nN6qR6nY+k2cZ0J9zGgLGhVHJJV+p8K0K5w5JnqLpGrr7XvPxG6x9GUj5XBMHuNLN\nk1LKO4ECgYEA7RvbjZr1I7K9EqjEn1VlUZnI5Eg0OmCxqxKDqnBxM2kZvCLzLQSo\nYgxG7qBtYQSYX+0q7QkqGLiQeHPH9LS9g/5sG0B1BsNQmD2KR6cChvqJhv8u3K9X\nLfQrQ2yMB2LlN7VH7/A0uu3T6cJqVUAhJELNVXa5mH2YX8k2Hq3Z1JECgYEA4rXp\np5KXl7CX3ZBV7xVLvQvJ5u0uOwQxH7DCwfVr6b8x2V8YF6BYIFJiCYQPm7bw0t6T\nnDxqvE6n3k4zO0J9xzQfKF+nPc7TvMKd9xw3DfPNlrVQhH1Y5B5QNhNT8GvMjnkd\nVLQQfR7iH1fZa+k8xhxd/YN7O3zOjx7BQnHCgYEA4PYwSLiWqZ7P7e7LFp0l0fAx\nrvNbdW5B9nqUeVQvR1zr3kN5EXOv9r4U/4bqBPT5W5xFz6pJZmkNZpKVPfxaG5VK\nwPLH/yG7JLrNZKCqUXQ+7fH1EbKsQrZd4mYH9B5ELVqOkKjLN8BYV1qQKLfEMZyc\nnCtGKvqYBYrKf+ECgYAD7MhGM9Q2JSxvIxFXOQ7g5YfLHkHVBQlLk7Agh5dHvON8\nY2QJlxfmxUx2Uu+LmLXeKYUXFCmJFDf5cG1fVTmNBl0LNvFQr8hZhJQn0cCqHJZO\nYqUhU0+K4Q7hK8VvMqD6xDQgkLxVN/xvQXJqb7JKhC5iowuU7x6QG4pCcQKBgQCE\nm+pFh+0F2e7K1bBqPZPCWnvRwpqH8KfF3F2+WL8jF3RNvPZKWNLnKkMT3RJiPMDt\noZ2xP7Y0e+r6qRe/FW1vKLy9zL6OyN3bx3M9Q0qxNmCXJQ5X3zJXNjFLhU2kfhCn\nUmJMfPOQHq7f7fxJhYpK8TvRzXj3pVkCKWTYQNQLOQ==\n-----END RSA PRIVATE KEY-----';
process.env.GOOGLE_WALLET_PRIVATE_KEY_ID = 'test-key-id';

const tables = [
  'Score',
  'CompetitionEntry',
  'Round',
  'Competition',
  'Season',
  'ClubSettings',
  'AmmunitionStockInput',
  'AmmunitionSale',
  'AmmunitionStock',
  'AmmunitionTypePriceHistory',
  'AmmunitionSafe',
  'AmmunitionType',
  'VisitLog',
  'SignInLink',
  'PasswordResetToken',
  'ClubInvite',
  'ClubMembership',
  'Firearm',
  'Club',
  'User',
];

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  const quoted = tables.map(t => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE;`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
