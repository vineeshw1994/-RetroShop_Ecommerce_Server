import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

/** Customer asking the shop to source a title that is not listed yet. */
const GameRequest = sequelize.define(
  'GameRequest',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    platform: { type: DataTypes.STRING(80), allowNull: true },
    conditionPreference: {
      type: DataTypes.ENUM('any', 'new', 'used'),
      allowNull: false,
      defaultValue: 'any',
    },
    maxBudget: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      get() {
        const raw = this.getDataValue('maxBudget');
        return raw === null || raw === undefined ? null : Number(raw);
      },
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'sourcing', 'found', 'unavailable', 'fulfilled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    adminResponse: { type: DataTypes.TEXT, allowNull: true },
    linkedProductId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    handledById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'game_requests',
    indexes: [{ fields: ['userId'] }, { fields: ['status'] }],
  }
);

export default GameRequest;
