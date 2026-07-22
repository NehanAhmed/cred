export const emailVerification = (verificationLink: string) => {
  return `
        <h1>Cred</h1>
        <p>Hi,</p>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
    `;
};

export const passwordReset = (resetLink: string, expiresAt: string) => {
  return `
        <h1>Cred</h1>
        <p>Hi,</p>
        <p>Please click the link below to reset your password:</p>
        <a href="${resetLink}">Reset Password</a>
        <p>This link will expire at ${expiresAt}</p>
    `;
};
