import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const CartItem = sequelize.define(
  'CartItem',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    tableName: 'cart_items',
    indexes: [{ unique: true, fields: ['userId', 'productId'] }],
  }
);

export default CartItem;
