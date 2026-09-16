import { CartItem, Product, ProductImage } from '../models/index.js';
import { serializeProduct } from '../helpers/serializers.js';

const round = (value) => Math.round(value * 100) / 100;

/**
 * Load a basket and price it. Lines whose product went inactive or out of
 * stock are flagged rather than silently dropped so the UI can explain itself.
 */
export const loadBasket = async (userId) => {
  const items = await CartItem.findAll({
    where: { userId },
    include: [
      {
        model: Product,
        as: 'product',
        include: [
          {
            model: ProductImage,
            as: 'images',
            attributes: ['url', 'isPrimary', 'sortOrder'],
          },
        ],
      },
    ],
    order: [['createdAt', 'ASC']],
  });

  const lines = items.map((item) => {
    const product = serializeProduct(item.product);
    const unitPrice = product.effectivePrice;
    const available = product.isActive ? product.stock : 0;
    const quantity = item.quantity;

    return {
      id: item.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      image: product.cardImage || product.primaryImage,
      condition: product.condition,
      platform: product.platform,
      categoryId: product.categoryId,
      unitPrice,
      listPrice: product.price,
      quantity,
      lineTotal: round(unitPrice * quantity),
      stock: available,
      maxQuantity: Math.max(0, available),
      isUnavailable: available === 0,
      exceedsStock: quantity > available,
    };
  });

  const purchasable = lines.filter((line) => !line.isUnavailable);
  const subtotal = round(
    purchasable.reduce((sum, line) => sum + line.unitPrice * Math.min(line.quantity, line.stock), 0)
  );
  const itemCount = purchasable.reduce(
    (sum, line) => sum + Math.min(line.quantity, line.stock),
    0
  );

  const shippingFee = 0;

  return {
    lines,
    summary: {
      itemCount,
      lineCount: lines.length,
      subtotal,
      shippingFee: 0,
      discount: 0,
      total: round(subtotal),
      currency: 'GBP',
      freeShippingThreshold: 0,
      amountToFreeShipping: 0,
      hasIssues: lines.some((line) => line.isUnavailable || line.exceedsStock),
    },
  };
};

export default loadBasket;
