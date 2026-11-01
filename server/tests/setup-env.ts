import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
process.env.NODE_ENV = 'test';
// Ảnh upload trong lúc test ghi vào thư mục tạm, không lẫn với uploads/ khi chạy thật
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'kanban-test-uploads');
