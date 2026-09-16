import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const Category = sequelize.define(
  'Category',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING(255), allowNull: true },
    parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: 'categories',
    indexes: [{ fields: ['slug'] }, { fields: ['parentId'] }, { fields: ['isActive'] }],
  }
);

export default Category;
