import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const Otp = sequelize.define(
  'Otp',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(160), allowNull: false },
    codeHash: { type: DataTypes.STRING(64), allowNull: false },
    purpose: {
      type: DataTypes.ENUM('signup', 'forgot_password', 'admin_reset'),
      allowNull: false,
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
    attempts: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  },
  {
    tableName: 'otps',
    indexes: [{ fields: ['email', 'purpose'] }],
  }
);

export default Otp;
