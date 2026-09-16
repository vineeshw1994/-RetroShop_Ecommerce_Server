import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const ContactMessage = sequelize.define(
  'ContactMessage',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    subject: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM('new', 'replied'),
      allowNull: false,
      defaultValue: 'new',
    },
    replyBody: { type: DataTypes.TEXT, allowNull: true },
    repliedAt: { type: DataTypes.DATE, allowNull: true },
    repliedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    tableName: 'contact_messages',
    indexes: [{ fields: ['status'] }, { fields: ['createdAt'] }],
  }
);

export default ContactMessage;
