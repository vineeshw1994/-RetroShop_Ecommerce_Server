import sequelize from '../db/sequelize.js';
import config from './index.js';
import '../models/index.js';

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`MySQL connected (${config.db.database})`);

    await sequelize.sync({ alter: config.nodeEnv === 'development' });
    console.log('Database models synchronized');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
