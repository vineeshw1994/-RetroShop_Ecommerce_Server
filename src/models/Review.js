import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const Review = sequelize.define(
  'Review',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    rating: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    isApproved: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: 'reviews',
    indexes: [{ unique: true, fields: ['productId', 'userId'] }],
  }
);

export default Review;
