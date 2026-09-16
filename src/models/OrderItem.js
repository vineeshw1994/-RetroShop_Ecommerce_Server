import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const decimal = (field) => ({
  type: DataTypes.DECIMAL(10, 2),
  allowNull: false,
  defaultValue: 0,
  get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? null : Number(raw);
  },
});

/** Product details are copied in so historic orders survive catalogue edits. */
const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(220), allowNull: true },
    sku: { type: DataTypes.STRING(64), allowNull: true },
    image: { type: DataTypes.STRING(255), allowNull: true },
    condition: { type: DataTypes.STRING(20), allowNull: true },
    unitPrice: decimal('unitPrice'),
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    lineTotal: decimal('lineTotal'),
  },
  {
    tableName: 'order_items',
    indexes: [{ fields: ['orderId'] }, { fields: ['productId'] }],
  }
);

export default OrderItem;
