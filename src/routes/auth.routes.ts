import express from 'express'
import controllers from '../controllers/auth.controllers'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { registerShema, loginSchema } from '../validators/auth.validator'
const router = express.Router()

router.post('/',validate(registerShema),controllers.register)
router.post('/login',validate(loginSchema),controllers.login)
router.post('/logout',authMiddleware,controllers.logout)

export default router;
