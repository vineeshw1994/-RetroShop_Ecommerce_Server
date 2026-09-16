import { Op, fn, col } from 'sequelize';
import { GameRequest, User, Product, AdminUser } from '../../models/index.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { sendGameRequestUpdateEmail } from '../../services/email.service.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const listRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.status) where.status = String(req.query.status).split(',').filter(Boolean);
  if (req.query.platform) where.platform = req.query.platform;

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [{ title: { [Op.like]: term } }, { notes: { [Op.like]: term } }];
  }

  const { rows, count } = await GameRequest.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
      { model: AdminUser, as: 'handledBy', attributes: ['id', 'name'] },
      { model: Product, as: 'linkedProduct', attributes: ['id', 'name', 'slug'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const statusCounts = await GameRequest.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true,
  });

  res.json({
    success: true,
    data: rows,
    meta: buildMeta({ count, page, limit }),
    summary: {
      statusCounts: statusCounts.reduce(
        (acc, row) => ({ ...acc, [row.status]: Number(row.count) }),
        {}
      ),
    },
  });
});

export const respondToRequest = asyncHandler(async (req, res) => {
  const request = await GameRequest.findByPk(req.params.id, {
    include: [{ model: User, as: 'user', attributes: ['email', 'firstName'] }],
  });

  if (!request) throw new AppError('Request not found', 404);

  const updates = { handledById: req.admin.id, respondedAt: new Date() };

  if (req.body.status !== undefined) {
    const allowed = ['pending', 'sourcing', 'found', 'unavailable', 'fulfilled'];
    if (!allowed.includes(req.body.status)) throw new AppError('Choose a valid status', 422);
    updates.status = req.body.status;
  }

  if (req.body.adminResponse !== undefined) updates.adminResponse = req.body.adminResponse;

  if (req.body.linkedProductId !== undefined) {
    const productId = req.body.linkedProductId ? Number(req.body.linkedProductId) : null;
    if (productId) {
      const product = await Product.findByPk(productId);
      if (!product) throw new AppError('Linked product not found', 422);
    }
    updates.linkedProductId = productId;
  }

  await request.update(updates);

  if (req.body.notifyCustomer !== false && request.user?.email) {
    await sendGameRequestUpdateEmail(request.user.email, request);
  }

  res.json({ success: true, message: 'Request updated', data: request });
});

export const deleteRequest = asyncHandler(async (req, res) => {
  const request = await GameRequest.findByPk(req.params.id);
  if (!request) throw new AppError('Request not found', 404);

  await request.destroy();

  res.json({ success: true, message: 'Request deleted' });
});
