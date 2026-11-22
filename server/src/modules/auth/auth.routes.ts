import { Router, type Request } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth, currentUserId } from '../../middlewares/auth';
import { HttpError, unauthorized } from '../../lib/errors';
import { SESSION_COOKIE } from '../../lib/session';
import * as authService from './auth.service';

export const authRouter = Router();

// Chỉ đếm các lần thất bại, đăng nhập đúng không bị tính
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Bạn thử quá nhiều lần, vui lòng đợi 15 phút rồi thử lại')),
});

const email = z.string().trim().toLowerCase().email('Email không hợp lệ').max(254);

const registerBody = z.object({
  email,
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(72),
  name: z.string().trim().min(1, 'Tên không được trống').max(60),
});

const loginBody = z.object({
  email,
  password: z.string().min(1).max(72),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(72),
});

// Tạo session id mới sau khi đăng nhập để tránh session fixation
function startSession(req: Request, userId: string) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = registerBody.parse(req.body);
  const user = await authService.register(body);
  await startSession(req, user.id);
  res.status(201).json({ user });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await authService.login(body);
  await startSession(req, user.id);
  res.json({ user });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await authService.getUser(currentUserId(req));
  if (!user) throw unauthorized();
  res.json({ user });
});

// Sai mật khẩu hiện tại cũng bị đếm vào giới hạn, tránh dò mật khẩu bằng phiên bị lộ
authRouter.patch('/password', requireAuth, authLimiter, async (req, res) => {
  const body = changePasswordBody.parse(req.body);
  const revokedSessions = await authService.changePassword(currentUserId(req), req.sessionID, body);
  res.json({ revokedSessions });
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  const revokedSessions = await authService.revokeOtherSessions(currentUserId(req), req.sessionID);
  res.json({ revokedSessions });
});
