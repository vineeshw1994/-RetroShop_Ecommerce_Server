import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';
import { ORDER_STATUSES } from './Order.js';

/** Append-only timeline shown to the customer on the order tracking page. */
const OrderEvent = sequelize.define(
  'OrderEvent',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false },
    note: { type: DataTypes.STRING(300), allowNull: true },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'order_events',
    updatedAt: false,
    indexes: [{ fields: ['orderId'] }],
  }
);

export default OrderEvent;
