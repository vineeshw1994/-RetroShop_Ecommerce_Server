import { Op } from 'sequelize';
import {
  ReturnRequest,
  Order,
  User,
  AdminUser,
} from '../../models/index.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { applyOrderRefund } from '../../services/orderRefund.service.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

const customerInclude = {
  model: User,
  as: 'customer',
  attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
};

const orderInclude = {
  model: Order,
  as: 'order',
  attributes: ['id', 'orderNumber', 'status', 'paymentStatus', 'total', 'deliveredAt'],
  include: [customerInclude],
};

export const listReturnRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 15);
  const where = {};

  if (req.query.status) where.status = String(req.query.status).split(',').filter(Boolean);

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { reason: { [Op.like]: term } },
      { '$order.orderNumber$': { [Op.like]: term } },
      { '$order.customer.email$': { [Op.like]: term } },
      { '$order.customer.firstName$': { [Op.like]: term } },
      { '$order.customer.lastName$': { [Op.like]: term } },
    ];
  }

  const { rows, count } = await ReturnRequest.findAndCountAll({
    where,
    include: [
      orderInclude,
      { model: AdminUser, as: 'handledBy', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  res.json({
    success: true,
    data: rows,
    meta: buildMeta({ count, page, limit }),
  });
});

export const respondToReturnRequest = asyncHandler(async (req, res) => {
  const { status, adminNote, issueRefund = false } = req.body;

  if (!['approved', 'rejected', 'completed'].includes(status)) {
    throw new AppError('Status must be approved, rejected, or completed', 400);
  }

  const request = await ReturnRequest.findByPk(req.params.id, {
    include: [{ model: Order, as: 'order' }],
  });

  if (!request) throw new AppError('Return request not found', 404);

  if (request.status === 'rejected') {
    throw new AppError('This return request has already been rejected', 409);
  }

  if (status === 'approved' && request.status !== 'pending') {
    throw new AppError('Only pending requests can be approved', 409);
  }

  if (status === 'completed' && !['approved', 'pending'].includes(request.status)) {
    throw new AppError('Only approved or pending requests can be marked completed', 409);
  }

  if (issueRefund && ['approved', 'completed'].includes(status)) {
    await applyOrderRefund({
      orderId: request.orderId,
      adminId: req.admin.id,
      note: adminNote || 'Return approved — payment refunded',
    });
  }

  await request.update({
    status,
    adminNote: adminNote ?? request.adminNote,
    handledById: req.admin.id,
    respondedAt: new Date(),
  });

  const full = await ReturnRequest.findByPk(request.id, {
    include: [
      orderInclude,
      { model: AdminUser, as: 'handledBy', attributes: ['id', 'name'] },
    ],
  });

  res.json({
    success: true,
    message: 'Return request updated',
    data: full,
  });
});
