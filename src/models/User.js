import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    firstName: { type: DataTypes.STRING(60), allowNull: false },
    lastName: { type: DataTypes.STRING(60), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(24), allowNull: false },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    avatar: { type: DataTypes.STRING(255), allowNull: true },
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    marketingOptIn: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'users',
    indexes: [{ fields: ['email'] }, { fields: ['isActive'] }],
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  }
);

User.prototype.fullName = function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
};

export default User;
