const mockTransporter = {
  sendMail: () => Promise.resolve({ messageId: 'mock-message-id' }),
};

const nodemailer = {
  createTransport: () => mockTransporter,
  createTestAccount: () => Promise.resolve({
    user: 'mock@ethereal.email',
    pass: 'mockpass',
  }),
  getTestMessageUrl: () => 'https://ethereal.email/mock',
};

export default nodemailer;
export { mockTransporter };
