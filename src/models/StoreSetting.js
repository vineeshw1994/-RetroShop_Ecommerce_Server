import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

/** Key/value store for shop-wide settings editable from the admin dashboard. */
const StoreSetting = sequelize.define(
  'StoreSetting',
  {
    key: { type: DataTypes.STRING(60), primaryKey: true },
    value: { type: DataTypes.JSON, allowNull: false },
  },
  { tableName: 'store_settings', timestamps: true }
);

export default StoreSetting;
