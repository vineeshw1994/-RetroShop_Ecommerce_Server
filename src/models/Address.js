import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const Address = sequelize.define(
  'Address',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    label: { type: DataTypes.STRING(40), allowNull: true },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(24), allowNull: false },
    line1: { type: DataTypes.STRING(160), allowNull: false },
    line2: { type: DataTypes.STRING(160), allowNull: true },
    city: { type: DataTypes.STRING(80), allowNull: false },
    state: { type: DataTypes.STRING(80), allowNull: true },
    postcode: { type: DataTypes.STRING(20), allowNull: false },
    country: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'United Kingdom' },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: 'addresses',
    indexes: [{ fields: ['userId'] }],
  }
);

export default Address;
