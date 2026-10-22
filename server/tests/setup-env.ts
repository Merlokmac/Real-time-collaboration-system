import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
process.env.NODE_ENV = 'test';
