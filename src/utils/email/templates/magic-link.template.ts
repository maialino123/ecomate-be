export interface MagicLinkEmailData {
  verifyUrl: string;
  ipAddress?: string;
  userAgent?: string;
}

export const magicLinkTemplate = (data: MagicLinkEmailData): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Login - Ecomate</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #10b981;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 16px 0;
      color: #111;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #10b981;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.2s;
    }
    .button:hover {
      background-color: #059669;
    }
    .security-info {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
      font-size: 14px;
    }
    .security-info p {
      margin: 4px 0;
    }
    .info {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }
    .footer {
      margin-top: 32px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }
    code {
      background-color: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌱 Ecomate</div>
      <h1>Complete Your Login</h1>
    </div>

    <p>Hi Owner,</p>
    <p>Click the button below to complete your login to Ecomate Admin Panel:</p>

    <div class="button-container">
      <a href="${data.verifyUrl}" class="button">🔐 Verify & Login</a>
    </div>

    ${
      data.ipAddress || data.userAgent
        ? `
    <div class="security-info">
      <p><strong>⚠️ Login attempt details:</strong></p>
      ${data.ipAddress ? `<p>IP Address: <code>${data.ipAddress}</code></p>` : ''}
      ${data.userAgent ? `<p>Device: <code>${data.userAgent}</code></p>` : ''}
    </div>
    `
        : ''
    }

    <div class="info">
      <p><strong>⏰ This link will expire in 5 minutes for security reasons.</strong></p>
      <p>If you didn't request this login, please ignore this email or contact support if you're concerned about your account security.</p>
      <p>Never share this link with anyone. Ecomate will never ask you for this link.</p>
    </div>

    <div class="footer">
      <p>© 2025 Ecomate. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};
