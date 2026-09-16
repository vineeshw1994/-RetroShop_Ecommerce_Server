import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

export const RETURN_STATUSES = ['pending', 'approved', 'rejected', 'completed'];

/** Customer asking to return items from a delivered order. */
const ReturnRequest = sequelize.define(
  'ReturnRequest',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM(...RETURN_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    adminNote: { type: DataTypes.TEXT, allowNull: true },
    handledById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'return_requests',
    indexes: [{ fields: ['orderId'] }, { fields: ['userId'] }, { fields: ['status'] }],
  }
);

export default ReturnRequest;
