import express from 'express'
import rateLimit from 'express-rate-limit'
import controllers from '../controllers/auth.controllers'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { registerSchema, loginSchema } from '../validators/auth.validator'

const router = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again in 15 minutes.',
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts, please try again in 60 minutes.',
})

router.post('/', registerLimiter, validate(registerSchema), controllers.register)
router.post('/login', loginLimiter, validate(loginSchema), controllers.login)
router.post('/logout', authMiddleware, controllers.logout)

export default router;
