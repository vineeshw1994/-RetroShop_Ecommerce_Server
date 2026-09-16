import config from '../config/index.js';
import { ContactMessage } from '../models/index.js';
import { sendContactNotification } from '../services/email.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    throw new AppError('Please fill in your name, email, subject and message', 422);
  }

  const row = await ContactMessage.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    subject: subject.trim(),
    message: message.trim(),
  });

  await sendContactNotification(row, config.smtp.user || config.smtp.from);

  res.status(201).json({
    success: true,
    message: 'Thanks, we have received your message and will reply by email.',
    data: { id: row.id },
  });
});
