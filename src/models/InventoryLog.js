import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const InventoryLog = sequelize.define(
  'InventoryLog',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: {
      type: DataTypes.ENUM('restock', 'sale', 'adjustment', 'return', 'cancellation'),
      allowNull: false,
    },
    quantityChange: { type: DataTypes.INTEGER, allowNull: false },
    stockAfter: { type: DataTypes.INTEGER, allowNull: false },
    reference: { type: DataTypes.STRING(64), allowNull: true },
    note: { type: DataTypes.STRING(255), allowNull: true },
    adminId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'inventory_logs',
    updatedAt: false,
    indexes: [{ fields: ['productId'] }, { fields: ['type'] }],
  }
);

export default InventoryLog;
