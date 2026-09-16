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

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

const Order = sequelize.define(
  'Order',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderNumber: { type: DataTypes.STRING(24), allowNull: false, unique: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM(...ORDER_STATUSES),
      allowNull: false,
      defaultValue: 'pending',
    },
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'unpaid',
    },
    paymentMethod: {
      type: DataTypes.ENUM('card', 'cash_on_delivery', 'bank_transfer'),
      allowNull: false,
      defaultValue: 'card',
    },
    itemCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    subtotal: decimal('subtotal'),
    shippingFee: decimal('shippingFee'),
    discount: decimal('discount'),
    total: decimal('total'),
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'GBP' },
    shippingAddress: { type: DataTypes.JSON, allowNull: false },
    customerNote: { type: DataTypes.TEXT, allowNull: true },
    adminNote: { type: DataTypes.TEXT, allowNull: true },
    trackingNumber: { type: DataTypes.STRING(80), allowNull: true },
    courier: { type: DataTypes.STRING(80), allowNull: true },
    placedAt: { type: DataTypes.DATE, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    shippedAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    couponCode: { type: DataTypes.STRING(40), allowNull: true },
    paymentIntentId: { type: DataTypes.STRING(80), allowNull: true },
    stripeRefundId: { type: DataTypes.STRING(80), allowNull: true },
    refundedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'orders',
    indexes: [
      { fields: ['orderNumber'] },
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default Order;
