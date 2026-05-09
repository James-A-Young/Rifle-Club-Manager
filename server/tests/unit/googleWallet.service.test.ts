import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set mock environment variables BEFORE importing the service
beforeEach(() => {
  process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer-id';
  process.env.GOOGLE_WALLET_ISSUER_EMAIL = 'test@example.com';
  process.env.GOOGLE_WALLET_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygaxJiWr/LVy9T1n1c6hZjz5pNQr5T3P\nLb/GyRZUzwCGlxeJ7IpR2Kp8h8BU8uTKFkm2LqRJvKGhVLqKVhGtmLkGhLJsB+Jn\nt0JjfQM6zy0hKK8vKxqz0YvLzCPWRPcEZKbTg2NnvLQNJj8jNZvYPU6bKP8wMQpU\nC6hRMCmNHVGqXgzvCPQKZL7NqQzKgNZtFqRvBCPqLVMcH+z/Y8kVDfQVLaKxKFZY\nmJqB0kNGNPkqJU0Q2R8p7S+TcJvMQxWPLK8J7FQtPPLFCpkYJJ0H7v7R7NHqNLFE\nKkqmVEqbVQxT7Z2jqGcMlNQgFGcWp7pYpGiRkwIDAQABAoIBAHFKYJqKVxU/S4b1\nGbLpVH8kWDXY4qfZxUMGaGpG6AGCQB7L1GpPW5vS3aKmI4NXzxhCUzK8LUZJhFd4\nJW+dC+TfCH3BnOh1ZjvKh8V2uLGp6KDZqCGgT0t5F9NV2G8lB3rB9Yz3CUV9Kpn+\nhjqcQg8TzYO0llDZYhCi7J6fJF1nvKVL1S1j4eR8G6JaEMjMSqYK7YPK6Yz3Xhz+\nVFKzKvl9E7QKRhQLNFKEjXTF7xNhNqKvXQGBqDu8MF2U7bNmHkZjkCYZcMQNqR8D\nN6qR6nY+k2cZ0J9zGgLGhVHJJV+p8K0K5w5JnqLpGrr7XvPxG6x9GUj5XBMHuNLN\nk1LKO4ECgYEA7RvbjZr1I7K9EqjEn1VlUZnI5Eg0OmCxqxKDqnBxM2kZvCLzLQSo\nYgxG7qBtYQSYX+0q7QkqGLiQeHPH9LS9g/5sG0B1BsNQmD2KR6cChvqJhv8u3K9X\nLfQrQ2yMB2LlN7VH7/A0uu3T6cJqVUAhJELNVXa5mH2YX8k2Hq3Z1JECgYEA4rXp\np5KXl7CX3ZBV7xVLvQvJ5u0uOwQxH7DCwfVr6b8x2V8YF6BYIFJiCYQPm7bw0t6T\nnDxqvE6n3k4zO0J9xzQfKF+nPc7TvMKd9xw3DfPNlrVQhH1Y5B5QNhNT8GvMjnkd\nVLQQfR7iH1fZa+k8xhxd/YN7O3zOjx7BQnHCgYEA4PYwSLiWqZ7P7e7LFp0l0fAx\nrvNbdW5B9nqUeVQvR1zr3kN5EXOv9r4U/4bqBPT5W5xFz6pJZmkNZpKVPfxaG5VK\nwPLH/yG7JLrNZKCqUXQ+7fH1EbKsQrZd4mYH9B5ELVqOkKjLN8BYV1qQKLfEMZyc\nnCtGKvqYBYrKf+ECgYAD7MhGM9Q2JSxvIxFXOQ7g5YfLHkHVBQlLk7Agh5dHvON8\nY2QJlxfmxUx2Uu+LmLXeKYUXFCmJFDf5cG1fVTmNBl0LNvFQr8hZhJQn0cCqHJZO\nYqUhU0+K4Q7hK8VvMqD6xDQgkLxVN/xvQXJqb7JKhC5iowuU7x6QG4pCcQKBgQCE\nm+pFh+0F2e7K1bBqPZPCWnvRwpqH8KfF3F2+WL8jF3RNvPZKWNLnKkMT3RJiPMDt\noZ2xP7Y0e+r6qRe/FW1vKLy9zL6OyN3bx3M9Q0qxNmCXJQ5X3zJXNjFLhU2kfhCn\nUmJMfPOQHq7f7fxJhYpK8TvRzXj3pVkCKWTYQNQLOQ==\n-----END RSA PRIVATE KEY-----';
  process.env.GOOGLE_WALLET_PRIVATE_KEY_ID = 'test-key-id';
});

afterEach(() => {
  vi.resetModules();
});

// Now import the service after env vars are set
import { GoogleWalletService } from '../../src/services/googleWallet';

describe('GoogleWalletService', () => {
  it('validates 6-digit hex colors', () => {
    const service = new GoogleWalletService();
    expect(service.validateHexColor('#FF5500')).toBe(true);
    expect(service.validateHexColor('#000000')).toBe(true);
    expect(service.validateHexColor('#FFFFFF')).toBe(true);
  });

  it('validates 3-digit hex colors', () => {
    const service = new GoogleWalletService();
    expect(service.validateHexColor('#F50')).toBe(true);
    expect(service.validateHexColor('#000')).toBe(true);
  });

  it('rejects invalid hex colors', () => {
    const service = new GoogleWalletService();
    expect(service.validateHexColor('#FF550')).toBe(false);
    expect(service.validateHexColor('FF5500')).toBe(false);
    expect(service.validateHexColor('#GG5500')).toBe(false);
    expect(service.validateHexColor('red')).toBe(false);
  });

  it('generates QR code as data URL', async () => {
    const service = new GoogleWalletService();
    const qrCode = await service.generateQRCode('test-membership-id');
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
    expect(qrCode.length).toBeGreaterThan(100);
  });

  it('generates different QR codes for different IDs', async () => {
    const service = new GoogleWalletService();
    const qr1 = await service.generateQRCode('id-1');
    const qr2 = await service.generateQRCode('id-2');
    expect(qr1).not.toBe(qr2);
  });

  it('generates QR code as buffer', async () => {
    const service = new GoogleWalletService();
    const buffer = await service.generateQRCodeBuffer('test-membership-id');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('creates pass object with user details', async () => {
    const service = new GoogleWalletService();
    const passObject = await service.createPassObject(
      'user-123',
      'club-456',
      'John Doe',
      'MEMBER',
      42,
      'Test Club',
      'data:image/png;base64,...',
      {
        secondaryColor: '#374151',
        accentColor: '#3b82f6',
      }
    );

    expect(passObject.id).toContain('test-issuer-id');
    expect(passObject.classId).toContain('club-456');
    expect(passObject.genericObjects?.[0]?.genericData?.cardDetails?.cardRowTemplateInfos?.length).toBe(3);

    // Check member name is included
    const memberRow = passObject.genericObjects?.[0]?.genericData?.cardDetails?.cardRowTemplateInfos?.[0];
    expect(memberRow?.twoItems?.endItem?.firstValue?.content).toBe('John Doe');

    // Check visit count is included
    const visitRow = passObject.genericObjects?.[0]?.genericData?.cardDetails?.cardRowTemplateInfos?.[2];
    expect(visitRow?.twoItems?.endItem?.firstValue?.content).toBe('42');

    // Check barcode is QR code
    expect(passObject.genericObjects?.[0]?.barcode?.type).toBe('QR_CODE');
    expect(passObject.genericObjects?.[0]?.barcode?.value).toBe('club:club-456:member:user-123');
  });

  it('generates Add to Google Wallet link', () => {
    const service = new GoogleWalletService();
    const jwt = 'test.jwt.token';
    const link = service.generateAddToWalletLink(jwt);

    expect(link).toBe('https://pay.google.com/gp/v/save/test.jwt.token');
  });

  it('updates visit count in pass object', async () => {
    const service = new GoogleWalletService();
    const passObject = await service.createPassObject(
      'user-999',
      'club-999',
      'Bob Smith',
      'MEMBER',
      5,
      'Test Club',
      'data:image/png;base64,...'
    );

    const updated = await service.updatePassObject(passObject, 15);
    const visitRow = updated.genericObjects?.[0]?.genericData?.cardDetails?.cardRowTemplateInfos?.[2];
    expect(visitRow?.twoItems?.endItem?.firstValue?.content).toBe('15');
  });
});
