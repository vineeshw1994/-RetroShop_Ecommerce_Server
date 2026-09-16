import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

/** DECIMAL comes back from mysql2 as a string; expose it as a number to callers. */
const decimal = (field) => ({
  type: DataTypes.DECIMAL(10, 2),
  get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? null : Number(raw);
  },
});

const Product = sequelize.define(
  'Product',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(220), allowNull: false, unique: true },
    sku: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    brand: { type: DataTypes.STRING(80), allowNull: true },
    platform: { type: DataTypes.STRING(80), allowNull: true },
    condition: {
      type: DataTypes.ENUM('new', 'like_new', 'very_good', 'good', 'fair'),
      allowNull: false,
      defaultValue: 'very_good',
    },
    shortDescription: { type: DataTypes.STRING(300), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    price: { ...decimal('price'), allowNull: false, defaultValue: 0 },
    salePrice: { ...decimal('salePrice'), allowNull: true },
    costPrice: { ...decimal('costPrice'), allowNull: true },
    tradeInPrice: { ...decimal('tradeInPrice'), allowNull: true },
    stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    warrantyMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    ratingAverage: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    ratingCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    soldCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    viewCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
    cardImage: { type: DataTypes.STRING(255), allowNull: true },
    metaTitle: { type: DataTypes.STRING(200), allowNull: true },
    metaDescription: { type: DataTypes.STRING(300), allowNull: true },
  },
  {
    tableName: 'products',
    indexes: [
      { fields: ['slug'] },
      { fields: ['sku'] },
      { fields: ['categoryId'] },
      { fields: ['isActive'] },
      { fields: ['isFeatured'] },
      { fields: ['platform'] },
    ],
  }
);

/** Price a customer actually pays. */
Product.prototype.effectivePrice = function effectivePrice() {
  return this.salePrice && this.salePrice > 0 ? this.salePrice : this.price;
};

export default Product;
