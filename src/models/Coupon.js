import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const decimal = (field) => ({
  type: DataTypes.DECIMAL(10, 2),
  get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? null : Number(raw);
  },
});

const Coupon = sequelize.define(
  'Coupon',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(240), allowNull: true },
    type: {
      type: DataTypes.ENUM('percent', 'fixed'),
      allowNull: false,
      defaultValue: 'percent',
    },
    value: { ...decimal('value'), allowNull: false, defaultValue: 0 },
    minOrder: { ...decimal('minOrder'), allowNull: false, defaultValue: 0 },
    maxUses: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    usedCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    scope: {
      type: DataTypes.ENUM('all', 'categories', 'products'),
      allowNull: false,
      defaultValue: 'all',
    },
    categoryIds: { type: DataTypes.JSON, allowNull: true },
    productIds: { type: DataTypes.JSON, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    endsAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'coupons',
    indexes: [{ fields: ['code'] }, { fields: ['isActive'] }],
  }
);

export default Coupon;
