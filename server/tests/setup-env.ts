process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
