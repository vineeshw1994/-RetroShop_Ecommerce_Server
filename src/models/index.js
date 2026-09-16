import sequelize from '../db/sequelize.js';
import User from './User.js';
import AdminUser from './AdminUser.js';
import RefreshToken from './RefreshToken.js';
import Otp from './Otp.js';
import Category from './Category.js';
import Product from './Product.js';
import ProductImage from './ProductImage.js';
import Banner from './Banner.js';
import Address from './Address.js';
import CartItem from './CartItem.js';
import WishlistItem from './WishlistItem.js';
import GameRequest from './GameRequest.js';
import Order from './Order.js';
import OrderItem from './OrderItem.js';
import OrderEvent from './OrderEvent.js';
import InventoryLog from './InventoryLog.js';
import Review from './Review.js';
import Coupon from './Coupon.js';
import ContactMessage from './ContactMessage.js';
import StoreSetting from './StoreSetting.js';
import ReturnRequest from './ReturnRequest.js';

Category.hasMany(Category, { as: 'children', foreignKey: 'parentId' });
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parentId' });

Category.hasMany(Product, { as: 'products', foreignKey: 'categoryId' });
Product.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });

Product.hasMany(ProductImage, {
  as: 'images',
  foreignKey: 'productId',
  onDelete: 'CASCADE',
});
ProductImage.belongsTo(Product, { as: 'product', foreignKey: 'productId' });

User.hasMany(Address, { as: 'addresses', foreignKey: 'userId', onDelete: 'CASCADE' });
Address.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.hasMany(CartItem, { as: 'cartItems', foreignKey: 'userId', onDelete: 'CASCADE' });
CartItem.belongsTo(User, { as: 'user', foreignKey: 'userId' });
CartItem.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Product.hasMany(CartItem, { as: 'cartItems', foreignKey: 'productId', onDelete: 'CASCADE' });

User.hasMany(WishlistItem, { as: 'wishlist', foreignKey: 'userId', onDelete: 'CASCADE' });
WishlistItem.belongsTo(User, { as: 'user', foreignKey: 'userId' });
WishlistItem.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Product.hasMany(WishlistItem, {
  as: 'wishlistEntries',
  foreignKey: 'productId',
  onDelete: 'CASCADE',
});

User.hasMany(GameRequest, { as: 'gameRequests', foreignKey: 'userId', onDelete: 'CASCADE' });
GameRequest.belongsTo(User, { as: 'user', foreignKey: 'userId' });
GameRequest.belongsTo(AdminUser, { as: 'handledBy', foreignKey: 'handledById' });
GameRequest.belongsTo(Product, { as: 'linkedProduct', foreignKey: 'linkedProductId' });

User.hasMany(Order, { as: 'orders', foreignKey: 'userId' });
Order.belongsTo(User, { as: 'customer', foreignKey: 'userId' });

Order.hasMany(OrderItem, { as: 'items', foreignKey: 'orderId', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
OrderItem.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Product.hasMany(OrderItem, { as: 'orderItems', foreignKey: 'productId' });

Order.hasMany(OrderEvent, { as: 'events', foreignKey: 'orderId', onDelete: 'CASCADE' });
OrderEvent.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
OrderEvent.belongsTo(AdminUser, { as: 'createdBy', foreignKey: 'createdById' });

Product.hasMany(InventoryLog, {
  as: 'inventoryLogs',
  foreignKey: 'productId',
  onDelete: 'CASCADE',
});
InventoryLog.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
InventoryLog.belongsTo(AdminUser, { as: 'admin', foreignKey: 'adminId' });

Product.hasMany(Review, { as: 'reviews', foreignKey: 'productId', onDelete: 'CASCADE' });
Review.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Review.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Review, { as: 'reviews', foreignKey: 'userId', onDelete: 'CASCADE' });

AdminUser.belongsTo(AdminUser, { as: 'createdBy', foreignKey: 'createdById' });

ContactMessage.belongsTo(AdminUser, { as: 'repliedBy', foreignKey: 'repliedById' });
Banner.belongsTo(Category, { as: 'linkCategory', foreignKey: 'linkCategoryId' });
Banner.belongsTo(Product, { as: 'linkProduct', foreignKey: 'linkProductId' });

Order.hasMany(ReturnRequest, { as: 'returnRequests', foreignKey: 'orderId', onDelete: 'CASCADE' });
ReturnRequest.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
ReturnRequest.belongsTo(User, { as: 'customer', foreignKey: 'userId' });
User.hasMany(ReturnRequest, { as: 'returnRequests', foreignKey: 'userId', onDelete: 'CASCADE' });
ReturnRequest.belongsTo(AdminUser, { as: 'handledBy', foreignKey: 'handledById' });

export {
  sequelize,
  User,
  AdminUser,
  RefreshToken,
  Otp,
  Category,
  Product,
  ProductImage,
  Banner,
  Address,
  CartItem,
  WishlistItem,
  GameRequest,
  Order,
  OrderItem,
  OrderEvent,
  InventoryLog,
  Review,
  Coupon,
  ContactMessage,
  StoreSetting,
  ReturnRequest,
};
