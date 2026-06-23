import nodemailer from 'nodemailer';
import { emailVerification, passwordReset } from '../templates/email.templates';

let transporter: nodemailer.Transporter | null = null;
let fromAddress: string;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;
  } else {
    const testAccount = await nodemailer.createTestAccount();
    fromAddress = testAccount.user;
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }

  return transporter;
};

const sendMail = async (to: string, subject: string, html: string) => {
  await getTransporter();
  const info = await transporter!.sendMail({ from: fromAddress, to, subject, html });
  console.log('Message sent: %s', info.messageId);
  if (!process.env.SMTP_HOST) {
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  }
};

export const sendEmailVerification = async (to: string, token: string) => {
  const verificationLink = `${process.env.BACKEND_URL}/api/auth/verify-email/${token}`;
  await sendMail(to, 'Email Verification', emailVerification(verificationLink));
};

export const sendPasswordReset = async (to: string, token: string) => {
  const resetLink = `${process.env.BACKEND_URL}/api/auth/reset-password/${token}`;
  const expiresAt = new Date(Date.now() + 3600000).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  await sendMail(to, 'Password Reset', passwordReset(resetLink, expiresAt));
};
