import express from 'express'
import { configDotenv } from 'dotenv'
import { credExpress } from '@cred/express'
configDotenv({ path: '../.env.local' })
const PORT = 5000
const app = express()

const BACKEND_URL = process.env.BACKEND_URL as string;
const CLIENT_URL = process.env.CLIENT_URL as string;
const EMAIL_FROM = process.env.EMAIL_FROM as string;
const JWT_SECRET = process.env.JWT_SECRET as string;
const MONGO_URI = process.env.MONGO_URI as string;
if (!BACKEND_URL && !CLIENT_URL && !EMAIL_FROM && !JWT_SECRET && !MONGO_URI) {
    throw new Error("All env secrets are required!")
}
const cred = await credExpress({
    database: { uri: MONGO_URI },
    email: {
        SMTP_HOST: 'smtp.ethereal.email',
        SMTP_PASS: 'ruCqjcKcKU55dYKE4b',
        EMAIL_FROM: "nehan",
        SMTP_PORT: "587",
        SMTP_USER: "alek75@ethereal.email",
        BACKEND_URL: BACKEND_URL,
    },
    jwtSecret: JWT_SECRET,
    clientUrl: CLIENT_URL,
    backendUrl: BACKEND_URL,
})

app.use('/api', cred)

app.listen(PORT, () => {
    console.log(`Server is Running at ${PORT}`);
})