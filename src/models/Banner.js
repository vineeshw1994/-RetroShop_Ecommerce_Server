import { DataTypes } from 'sequelize';
import sequelize from '../db/sequelize.js';

const Banner = sequelize.define(
  'Banner',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    subtitle: { type: DataTypes.STRING(240), allowNull: true },
    image: { type: DataTypes.STRING(255), allowNull: true },
    mobileImage: { type: DataTypes.STRING(255), allowNull: true },
    linkUrl: { type: DataTypes.STRING(255), allowNull: true },
    linkType: {
      type: DataTypes.ENUM('none', 'category', 'product'),
      allowNull: false,
      defaultValue: 'none',
    },
    linkCategoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    linkProductId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    linkProductIds: { type: DataTypes.JSON, allowNull: true },
    ctaLabel: { type: DataTypes.STRING(60), allowNull: true },
    // Where the banner renders on the storefront.
    placement: {
      type: DataTypes.ENUM('home_hero', 'home_side', 'promo_strip', 'category_top'),
      allowNull: false,
      defaultValue: 'home_hero',
    },
    theme: { type: DataTypes.STRING(40), allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    endsAt: { type: DataTypes.DATE, allowNull: true },
    clickCount: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
  },
  {
    tableName: 'banners',
    indexes: [{ fields: ['placement'] }, { fields: ['isActive'] }],
  }
);

export default Banner;
