import { Op } from 'sequelize';
import { ContactMessage, AdminUser } from '../../models/index.js';
import { sendContactNotification, sendContactReply } from '../../services/email.service.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import AppError from '../../utils/AppError.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const listContacts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query, 20);
  const where = {};

  if (req.query.search) {
    const term = `%${req.query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { email: { [Op.like]: term } },
      { subject: { [Op.like]: term } },
    ];
  }
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await ContactMessage.findAndCountAll({
    where,
    include: [{ model: AdminUser, as: 'repliedBy', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const unread = await ContactMessage.count({ where: { status: 'new' } });

  res.json({
    success: true,
    data: rows,
    meta: buildMeta({ count, page, limit }),
    summary: { unread },
  });
});

export const getContact = asyncHandler(async (req, res) => {
  const message = await ContactMessage.findByPk(req.params.id, {
    include: [{ model: AdminUser, as: 'repliedBy', attributes: ['id', 'name'] }],
  });
  if (!message) throw new AppError('Message not found', 404);
  res.json({ success: true, data: message });
});

export const replyToContact = asyncHandler(async (req, res) => {
  const message = await ContactMessage.findByPk(req.params.id);
  if (!message) throw new AppError('Message not found', 404);

  const reply = String(req.body.reply || '').trim();
  if (reply.length < 8) throw new AppError('Write a longer reply before sending', 422);

  await sendContactReply(message, reply);

  await message.update({
    status: 'replied',
    replyBody: reply,
    repliedAt: new Date(),
    repliedById: req.admin.id,
  });

  res.json({ success: true, message: 'Reply sent', data: message });
});
