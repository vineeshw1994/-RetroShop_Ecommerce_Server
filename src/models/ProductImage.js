import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const ProductImage = sequelize.define(
  'ProductImage',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    url: { type: DataTypes.STRING(255), allowNull: false },
    alt: { type: DataTypes.STRING(200), allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    isPrimary: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: 'product_images',
    indexes: [{ fields: ['productId'] }],
  }
);

export default ProductImage;
