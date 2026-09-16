import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const AdminUser = sequelize.define(
  'AdminUser',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(24), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    avatar: { type: DataTypes.STRING(255), allowNull: true },
    role: {
      type: DataTypes.ENUM('super_admin', 'staff'),
      allowNull: false,
      defaultValue: 'staff',
    },
    jobTitle: { type: DataTypes.STRING(120), allowNull: true },
    // Permission keys such as `products:update`. Ignored for super_admin, which has full access.
    permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'admin_users',
    indexes: [{ fields: ['email'] }, { fields: ['role'] }],
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  }
);

AdminUser.prototype.isSuperAdmin = function isSuperAdmin() {
  return this.role === 'super_admin';
};

export default AdminUser;
