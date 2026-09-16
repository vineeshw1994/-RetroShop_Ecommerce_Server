import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    // SHA-256 of the issued JWT so a database leak cannot be replayed as a session.
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    actorType: { type: DataTypes.ENUM('customer', 'admin'), allowNull: false },
    actorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    replacedByHash: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    tableName: 'refresh_tokens',
    indexes: [{ fields: ['tokenHash'] }, { fields: ['actorType', 'actorId'] }],
  }
);

export default RefreshToken;
