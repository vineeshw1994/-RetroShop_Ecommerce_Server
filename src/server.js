import app from './app.js';
import connectDB from './config/db.js';
import config from './config/index.js';
import { ensureSuperAdmin } from './seeders/superAdmin.js';

const start = async () => {
  await connectDB();
  await ensureSuperAdmin();

  app.listen(config.port, () => {
    console.log(`API running on http://localhost:${config.port}/api`);
  });
};

start();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
