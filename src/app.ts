import express from 'express'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.routes'
import {config} from 'dotenv'
import cookieParser from 'cookie-parser'
config()
const app = express()

// REQUEST LIMITERS
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 requests per windowMs
    message: 'Too many authentication attempts, please try again later.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login requests per windowMs
    message: 'Too many login attempts, please try again in 15 minutes.'
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 60 minutes
    max: 3, // limit each IP to 3 register requests per windowMs
    message: 'Too many registration attempts, please try again in 60 minutes.'
});

// MIDDLEWARES
app.use(express.json())
app.use(cookieParser())

// ROUTES
app.use('/api/auth', authLimiter, authRoutes)

export default app;