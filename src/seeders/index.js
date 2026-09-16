import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import connectDB from '../config/db.js';
import { ensureSuperAdmin } from './superAdmin.js';
import {
  sequelize,
  Category,
  Product,
  ProductImage,
  Banner,
  User,
  Address,
  Order,
  OrderItem,
  OrderEvent,
  GameRequest,
  InventoryLog,
  AdminUser,
} from '../models/index.js';
import { DEFAULT_STAFF_PERMISSIONS } from '../config/permissions.js';
import { uniqueSlug } from '../helpers/slug.js';
import { uploadsRoot } from '../middleware/upload.js';

/* ------------------------------------------------------------------ *
 * Placeholder artwork
 * Demo rows need images. Rather than depend on a remote CDN, write
 * small SVG tiles into the uploads folder so the storefront renders
 * offline too.
 * ------------------------------------------------------------------ */

const PALETTE = [
  ['#e4002b', '#8e0019'],
  ['#0b63f6', '#062a6b'],
  ['#00a870', '#005c3d'],
  ['#7c3aed', '#3b1a78'],
  ['#f59e0b', '#8a5a05'],
  ['#0f172a', '#334155'],
];

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (char) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]
  );

const writeTile = (folder, fileName, { label, sub, width = 800, height = 800, index = 0 }) => {
  const dir = path.join(uploadsRoot, folder);
  fs.mkdirSync(dir, { recursive: true });

  const [from, to] = PALETTE[index % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${width * 0.85}" cy="${height * 0.15}" r="${width * 0.22}" fill="#ffffff" opacity="0.08"/>
  <circle cx="${width * 0.1}" cy="${height * 0.9}" r="${width * 0.18}" fill="#ffffff" opacity="0.06"/>
  <text x="50%" y="${sub ? '46%' : '52%'}" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif"
        font-size="${Math.round(width / 11)}" font-weight="800" fill="#ffffff">${escapeXml(label)}</text>
  ${sub ? `<text x="50%" y="58%" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${Math.round(width / 24)}" fill="#ffffff" opacity="0.82">${escapeXml(sub)}</text>` : ''}
</svg>`;

  fs.writeFileSync(path.join(dir, fileName), svg, 'utf8');
  return `/uploads/${folder}/${fileName}`;
};

const slugifyFile = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ *
 * Demo data
 * ------------------------------------------------------------------ */

const CATEGORIES = [
  { name: 'Nintendo Switch', featured: true, children: ['Switch Games', 'Switch Consoles', 'Switch Accessories'] },
  { name: 'PlayStation', featured: true, children: ['PS5 Games', 'PS5 Consoles', 'PS4 Games'] },
  { name: 'Xbox', featured: true, children: ['Xbox Series Games', 'Xbox Consoles'] },
  { name: 'Nintendo Wii', featured: true, children: ['Wii Games', 'Wii Consoles', 'Wii Controllers'] },
  { name: 'Retro', featured: true, children: ['SNES', 'Mega Drive', 'Game Boy'] },
  { name: 'Phones & Tablets', featured: true, children: ['Mobile Phones', 'iPad & Tablets'] },
];

const PRODUCTS = [
  { name: 'Switch 2 Console 256GB Black Joy-Con', category: 'Switch Consoles', platform: 'Switch 2', brand: 'Nintendo', price: 379, salePrice: 345, stock: 6, condition: 'like_new', featured: true },
  { name: 'Metroid Dread', category: 'Switch Games', platform: 'Switch', brand: 'Nintendo', price: 34, salePrice: 28, stock: 14, condition: 'very_good', featured: true },
  { name: 'Mario Kart 8 Deluxe', category: 'Switch Games', platform: 'Switch', brand: 'Nintendo', price: 42, salePrice: 35, stock: 22, condition: 'very_good', featured: true },
  { name: 'The Legend of Zelda: Breath of the Wild', category: 'Switch Games', platform: 'Switch', brand: 'Nintendo', price: 45, salePrice: 38, stock: 11, condition: 'good', featured: true },
  { name: 'Super Smash Bros Ultimate', category: 'Switch Games', platform: 'Switch', brand: 'Nintendo', price: 46, stock: 9, condition: 'very_good' },
  { name: 'Animal Crossing: New Horizons', category: 'Switch Games', platform: 'Switch', brand: 'Nintendo', price: 40, stock: 2, condition: 'good' },
  { name: 'Joy-Con Pair, Neon Red and Blue', category: 'Switch Accessories', platform: 'Switch', brand: 'Nintendo', price: 58, salePrice: 49, stock: 8, condition: 'very_good' },
  { name: 'PlayStation 5 Slim Digital Edition', category: 'PS5 Consoles', platform: 'PS5', brand: 'Sony', price: 349, stock: 4, condition: 'like_new', featured: true },
  { name: 'PlayStation 5 Ultra HD Blu-ray Disc Drive', category: 'PS5 Consoles', platform: 'PS5', brand: 'Sony', price: 95, salePrice: 85, stock: 7, condition: 'very_good' },
  { name: "Marvel's Spider-Man 2", category: 'PS5 Games', platform: 'PS5', brand: 'Sony', price: 44, salePrice: 36, stock: 13, condition: 'very_good', featured: true },
  { name: 'God of War Ragnarok', category: 'PS5 Games', platform: 'PS5', brand: 'Sony', price: 38, stock: 10, condition: 'good' },
  { name: 'Gran Turismo 7', category: 'PS5 Games', platform: 'PS5', brand: 'Sony', price: 32, stock: 0, condition: 'good' },
  { name: 'The Last of Us Part II', category: 'PS4 Games', platform: 'PS4', brand: 'Sony', price: 18, salePrice: 14, stock: 16, condition: 'good' },
  { name: 'Red Dead Redemption 2', category: 'PS4 Games', platform: 'PS4', brand: 'Rockstar', price: 22, stock: 12, condition: 'very_good' },
  { name: 'Xbox Series X 1TB', category: 'Xbox Consoles', platform: 'Xbox Series X', brand: 'Microsoft', price: 359, salePrice: 329, stock: 3, condition: 'like_new', featured: true },
  { name: 'Forza Horizon 5', category: 'Xbox Series Games', platform: 'Xbox Series X', brand: 'Microsoft', price: 29, stock: 15, condition: 'very_good' },
  { name: 'Halo Infinite', category: 'Xbox Series Games', platform: 'Xbox Series X', brand: 'Microsoft', price: 21, salePrice: 16, stock: 18, condition: 'good' },
  { name: 'Wii Console, White, No Game, Discounted', category: 'Wii Consoles', platform: 'Wii', brand: 'Nintendo', price: 52, salePrice: 45, stock: 5, condition: 'good', featured: true },
  { name: 'Wii Remote Official, White', category: 'Wii Controllers', platform: 'Wii', brand: 'Nintendo', price: 32, salePrice: 28, stock: 20, condition: 'very_good' },
  { name: 'Wii Sports Resort', category: 'Wii Games', platform: 'Wii', brand: 'Nintendo', price: 14, stock: 24, condition: 'good' },
  { name: 'Mario Kart Wii', category: 'Wii Games', platform: 'Wii', brand: 'Nintendo', price: 26, stock: 1, condition: 'good' },
  { name: 'Super Nintendo Console, Boxed', category: 'SNES', platform: 'SNES', brand: 'Nintendo', price: 165, stock: 2, condition: 'good', featured: true },
  { name: 'Super Mario World, Cartridge Only', category: 'SNES', platform: 'SNES', brand: 'Nintendo', price: 38, salePrice: 32, stock: 6, condition: 'fair' },
  { name: 'Sonic the Hedgehog 2, Mega Drive', category: 'Mega Drive', platform: 'Mega Drive', brand: 'Sega', price: 19, stock: 8, condition: 'good' },
  { name: 'Game Boy Color, Berry', category: 'Game Boy', platform: 'Game Boy', brand: 'Nintendo', price: 72, salePrice: 64, stock: 4, condition: 'good' },
  { name: 'Pokemon Red, Cartridge Only', category: 'Game Boy', platform: 'Game Boy', brand: 'Nintendo', price: 48, stock: 3, condition: 'fair' },
  { name: 'iPhone 15 128GB, Unlocked', category: 'Mobile Phones', platform: 'iOS', brand: 'Apple', price: 529, salePrice: 489, stock: 5, condition: 'like_new', featured: true },
  { name: 'iPad Air 5th Gen 64GB WiFi', category: 'iPad & Tablets', platform: 'iPadOS', brand: 'Apple', price: 389, stock: 6, condition: 'very_good', featured: true },
  { name: 'Samsung Galaxy S23 256GB', category: 'Mobile Phones', platform: 'Android', brand: 'Samsung', price: 419, salePrice: 379, stock: 7, condition: 'very_good' },
  { name: 'iPad 9th Gen 64GB, Space Grey', category: 'iPad & Tablets', platform: 'iPadOS', brand: 'Apple', price: 219, stock: 9, condition: 'good' },
];

const BANNERS = [
  { title: 'Shop iPads', subtitle: 'Certified pre-owned, from £219', placement: 'home_hero', ctaLabel: 'Shop iPads', linkUrl: '/category/ipad-tablets', sortOrder: 0 },
  { title: 'Switch 2 has landed', subtitle: 'Trade in your old console and save', placement: 'home_hero', ctaLabel: 'Shop Switch 2', linkUrl: '/category/switch-consoles', sortOrder: 1 },
  { title: 'Retro classics', subtitle: 'SNES, Mega Drive and Game Boy', placement: 'home_hero', ctaLabel: 'Browse retro', linkUrl: '/category/retro', sortOrder: 2 },
  { title: 'Rated GREAT', subtitle: '500k+ reviews on Trustpilot', placement: 'home_side', sortOrder: 0 },
  { title: 'Warranty included', subtitle: 'Every item tested before dispatch', placement: 'promo_strip', sortOrder: 0 },
  { title: 'Free delivery over £50', subtitle: 'Tracked 48 hour shipping', placement: 'promo_strip', sortOrder: 1 },
  { title: 'Trade in for cash', subtitle: 'Instant quotes in store', placement: 'promo_strip', sortOrder: 2 },
];

const CUSTOMERS = [
  { firstName: 'Marc', lastName: 'Carty', email: 'marc@example.com', phone: '+447700900111' },
  { firstName: 'Priya', lastName: 'Nair', email: 'priya@example.com', phone: '+447700900222' },
  { firstName: 'Tom', lastName: 'Walsh', email: 'tom@example.com', phone: '+447700900333' },
  { firstName: 'Sofia', lastName: 'Reyes', email: 'sofia@example.com', phone: '+447700900444' },
  { firstName: 'Danny', lastName: 'Okafor', email: 'danny@example.com', phone: '+447700900555' },
];

const REQUESTS = [
  { title: 'Chrono Trigger, SNES boxed', platform: 'SNES', notes: 'Happy to pay over the odds for a complete copy.', status: 'sourcing' },
  { title: 'Fire Emblem: Three Houses', platform: 'Switch', notes: 'Cartridge only is fine.', status: 'pending' },
  { title: 'Silent Hill 2, PS2 black label', platform: 'PS2', notes: 'Been after this for years.', status: 'found' },
  { title: 'Xenoblade Chronicles X', platform: 'Wii U', status: 'pending' },
];

const round = (value) => Math.round(value * 100) / 100;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const seedCategories = async () => {
  const created = new Map();
  let index = 0;

  for (const [rootIndex, root] of CATEGORIES.entries()) {
    const image = writeTile('categories', `${slugifyFile(root.name)}.svg`, {
      label: root.name,
      width: 600,
      height: 600,
      index: rootIndex,
    });

    const parent = await Category.create({
      name: root.name,
      slug: await uniqueSlug(Category, root.name),
      description: `Everything ${root.name}, fully tested and covered by our warranty.`,
      image,
      sortOrder: rootIndex,
      isActive: true,
      isFeatured: Boolean(root.featured),
    });
    created.set(root.name, parent);

    for (const [childIndex, childName] of root.children.entries()) {
      const child = await Category.create({
        name: childName,
        slug: await uniqueSlug(Category, childName),
        parentId: parent.id,
        image: writeTile('categories', `${slugifyFile(childName)}.svg`, {
          label: childName,
          width: 600,
          height: 600,
          index: index + childIndex,
        }),
        sortOrder: childIndex,
        isActive: true,
      });
      created.set(childName, child);
    }

    index += root.children.length;
  }

  return created;
};

const seedProducts = async (categories) => {
  const products = [];

  for (const [index, entry] of PRODUCTS.entries()) {
    const category = categories.get(entry.category);
    if (!category) continue;

    const product = await Product.create({
      name: entry.name,
      slug: await uniqueSlug(Product, entry.name),
      sku: `RS-${String(index + 1).padStart(4, '0')}`,
      categoryId: category.id,
      brand: entry.brand,
      platform: entry.platform,
      condition: entry.condition,
      shortDescription: `${entry.name} in ${entry.condition.replace('_', ' ')} condition, tested and ready to play.`,
      description: `${entry.name} supplied by Retro Shop. Every item is cleaned, fully tested and covered by the warranty shown on the product page. Discs and cartridges are checked for readability, and consoles ship with the cables you need to get going.`,
      price: entry.price,
      salePrice: entry.salePrice ?? null,
      costPrice: round(entry.price * 0.55),
      tradeInPrice: round(entry.price * 0.35),
      stock: entry.stock,
      lowStockThreshold: 3,
      warrantyMonths: 60,
      isActive: true,
      isFeatured: Boolean(entry.featured),
      ratingAverage: round(3.9 + Math.random() * 1.1),
      ratingCount: Math.floor(5 + Math.random() * 120),
      soldCount: Math.floor(Math.random() * 40),
    });

    const shots = ['front', 'back'];
    for (const [shotIndex, shot] of shots.entries()) {
      await ProductImage.create({
        productId: product.id,
        url: writeTile('products', `${product.slug}-${shot}.svg`, {
          label: entry.platform,
          sub: entry.name.slice(0, 34),
          index: index + shotIndex,
        }),
        alt: `${entry.name} ${shot}`,
        sortOrder: shotIndex,
        isPrimary: shotIndex === 0,
      });
    }

    if (product.stock > 0) {
      await InventoryLog.create({
        productId: product.id,
        type: 'restock',
        quantityChange: product.stock,
        stockAfter: product.stock,
        note: 'Opening stock',
      });
    }

    products.push(product);
  }

  return products;
};

const seedBanners = async () => {
  for (const [index, entry] of BANNERS.entries()) {
    const isHero = entry.placement === 'home_hero';
    await Banner.create({
      ...entry,
      image: writeTile('banners', `${slugifyFile(entry.title)}.svg`, {
        label: entry.title,
        sub: entry.subtitle,
        width: isHero ? 1400 : 700,
        height: isHero ? 500 : 500,
        index,
      }),
      mobileImage: writeTile('banners', `${slugifyFile(entry.title)}-mobile.svg`, {
        label: entry.title,
        sub: entry.subtitle,
        width: 800,
        height: 700,
        index,
      }),
      isActive: true,
    });
  }
};

const seedCustomersAndOrders = async (products) => {
  const passwordHash = await bcrypt.hash('Password@123', 12);
  const inStock = products.filter((product) => product.stock > 0);
  const customers = [];

  for (const entry of CUSTOMERS) {
    const user = await User.create({
      ...entry,
      passwordHash,
      isVerified: true,
      isActive: true,
      marketingOptIn: Math.random() > 0.5,
      lastLoginAt: daysAgo(Math.floor(Math.random() * 10)),
    });

    await Address.create({
      userId: user.id,
      label: 'Home',
      fullName: `${user.firstName} ${user.lastName}`,
      phone: user.phone,
      line1: `${Math.floor(1 + Math.random() * 120)} High Street`,
      city: pick(['Manchester', 'Leeds', 'Bristol', 'Glasgow', 'Cardiff']),
      postcode: pick(['M1 4BT', 'LS1 5AA', 'BS1 3BN', 'G1 2FF', 'CF10 1EP']),
      country: 'United Kingdom',
      isDefault: true,
    });

    customers.push(user);
  }

  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'cancelled'];
  let orderIndex = 0;

  for (const customer of customers) {
    const orderCount = 1 + Math.floor(Math.random() * 4);

    for (let i = 0; i < orderCount; i += 1) {
      const lineCount = 1 + Math.floor(Math.random() * 3);
      const chosen = [];
      while (chosen.length < lineCount && chosen.length < inStock.length) {
        const candidate = pick(inStock);
        if (!chosen.includes(candidate)) chosen.push(candidate);
      }

      const lines = chosen.map((product) => {
        const unitPrice = product.salePrice && product.salePrice > 0 ? product.salePrice : product.price;
        const quantity = 1 + Math.floor(Math.random() * 2);
        return {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          condition: product.condition,
          unitPrice,
          quantity,
          lineTotal: round(unitPrice * quantity),
        };
      });

      const subtotal = round(lines.reduce((sum, line) => sum + line.lineTotal, 0));
      const shippingFee = subtotal >= 50 ? 0 : 3.95;
      const status = statuses[orderIndex % statuses.length];
      const placedAt = daysAgo(Math.floor(Math.random() * 45));
      const address = await Address.findOne({ where: { userId: customer.id } });

      const order = await Order.create({
        orderNumber: `RS-DEMO${String(1000 + orderIndex)}`,
        userId: customer.id,
        status,
        paymentStatus: status === 'cancelled' ? 'refunded' : 'paid',
        paymentMethod: pick(['card', 'card', 'cash_on_delivery']),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        subtotal,
        shippingFee,
        discount: 0,
        total: round(subtotal + shippingFee),
        shippingAddress: {
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          city: address.city,
          postcode: address.postcode,
          country: address.country,
        },
        placedAt,
        paidAt: placedAt,
        shippedAt: ['shipped', 'delivered'].includes(status) ? placedAt : null,
        deliveredAt: status === 'delivered' ? placedAt : null,
        cancelledAt: status === 'cancelled' ? placedAt : null,
        createdAt: placedAt,
        updatedAt: placedAt,
      });

      for (const line of lines) {
        await OrderItem.create({ ...line, orderId: order.id });
      }

      await OrderEvent.create({
        orderId: order.id,
        status,
        note: 'Seeded demo order',
        createdAt: placedAt,
      });

      orderIndex += 1;
    }
  }

  for (const [index, entry] of REQUESTS.entries()) {
    await GameRequest.create({
      ...entry,
      userId: customers[index % customers.length].id,
      conditionPreference: 'any',
      maxBudget: round(20 + Math.random() * 80),
      adminResponse:
        entry.status === 'found' ? 'Found a copy at one of our suppliers, holding it for you.' : null,
      respondedAt: entry.status === 'pending' ? null : daysAgo(2),
    });
  }

  return customers;
};

const seedStaff = async (superAdmin) => {
  const existing = await AdminUser.findOne({ where: { email: 'staff@retroshop.dev' } });
  if (existing) return;

  await AdminUser.create({
    name: 'Jess Fielding',
    email: 'staff@retroshop.dev',
    jobTitle: 'Store manager',
    role: 'staff',
    permissions: [...DEFAULT_STAFF_PERMISSIONS, 'categories:view', 'requests:view', 'requests:update'],
    passwordHash: await bcrypt.hash('Staff@12345', 12),
    isActive: true,
    createdById: superAdmin.id,
  });
};

const run = async () => {
  await connectDB();

  const force = process.argv.includes('--force');
  const productCount = await Product.count();

  if (productCount > 0 && !force) {
    console.log(
      `Database already has ${productCount} products. Re-run with --force to wipe and reseed.`
    );
    await sequelize.close();
    return;
  }

  if (force) {
    console.log('Clearing existing demo data...');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const model of [
      OrderEvent,
      OrderItem,
      Order,
      InventoryLog,
      GameRequest,
      ProductImage,
      Product,
      Category,
      Banner,
      Address,
      User,
    ]) {
      await model.destroy({ where: {}, truncate: true, force: true });
    }
    await AdminUser.destroy({ where: { role: 'staff' }, force: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const superAdmin = await ensureSuperAdmin();

  console.log('Seeding categories...');
  const categories = await seedCategories();

  console.log('Seeding products...');
  const products = await seedProducts(categories);

  console.log('Seeding banners...');
  await seedBanners();

  console.log('Seeding customers, orders and requests...');
  const customers = await seedCustomersAndOrders(products);

  console.log('Seeding staff account...');
  await seedStaff(superAdmin);

  console.log('');
  console.log('Seed complete');
  console.log(`  categories: ${categories.size}`);
  console.log(`  products:   ${products.length}`);
  console.log(`  customers:  ${customers.length}`);
  console.log('');
  console.log('Sign in details');
  console.log('  super admin : admin@retroshop.dev / Admin@12345');
  console.log('  staff       : staff@retroshop.dev / Staff@12345');
  console.log('  customer    : marc@example.com / Password@123');

  await sequelize.close();
};

run().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
