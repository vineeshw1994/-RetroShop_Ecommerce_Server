import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const WishlistItem = sequelize.define(
  'WishlistItem',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  },
  {
    tableName: 'wishlist_items',
    indexes: [{ unique: true, fields: ['userId', 'productId'] }],
  }
);

export default WishlistItem;
