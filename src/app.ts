import express from 'express'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.routes'
import profileRoutes from './routes/profile.routes'
import {config} from 'dotenv'
import cookieParser from 'cookie-parser'
config()
const app = express()

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts, please try again later.'
});

const profileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many profile requests, please try again later.'
});

app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/profile', profileLimiter, profileRoutes)

export default app;