export interface ApprovalEmailData {
  userEmail: string;
  userName: string;
  requestedAt: string;
  approveAdminUrl: string;
  approveStaffUrl: string;
  approveViewerUrl: string;
  rejectUrl: string;
}

export const approvalRequestTemplate = (data: ApprovalEmailData): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New User Registration Request</title>
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
    .user-info {
      background-color: #f9fafb;
      border-left: 4px solid #10b981;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .user-info p {
      margin: 8px 0;
    }
    .user-info strong {
      color: #111;
      font-weight: 600;
    }
    .buttons {
      margin: 32px 0;
    }
    .button-group {
      margin-bottom: 16px;
    }
    .button-label {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 8px;
      display: block;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      margin: 4px 4px 4px 0;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
    }
    .btn-admin {
      background-color: #7c3aed;
      color: #ffffff;
    }
    .btn-admin:hover {
      background-color: #6d28d9;
    }
    .btn-staff {
      background-color: #3b82f6;
      color: #ffffff;
    }
    .btn-staff:hover {
      background-color: #2563eb;
    }
    .btn-viewer {
      background-color: #10b981;
      color: #ffffff;
    }
    .btn-viewer:hover {
      background-color: #059669;
    }
    .btn-reject {
      background-color: #ef4444;
      color: #ffffff;
    }
    .btn-reject:hover {
      background-color: #dc2626;
    }
    .info {
      margin-top: 32px;
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌱 Ecomate</div>
      <h1>New User Registration Request</h1>
    </div>

    <p>Hi Owner,</p>
    <p>A new user has requested access to the Ecomate Admin Panel:</p>

    <div class="user-info">
      <p><strong>Email:</strong> ${data.userEmail}</p>
      <p><strong>Full Name:</strong> ${data.userName}</p>
      <p><strong>Requested at:</strong> ${data.requestedAt}</p>
    </div>

    <p>Please approve this user with a role, or reject the request:</p>

    <div class="buttons">
      <div class="button-group">
        <span class="button-label">Accept with role:</span>
        <a href="${data.approveAdminUrl}" class="button btn-admin">✓ Accept as ADMIN</a>
        <a href="${data.approveStaffUrl}" class="button btn-staff">✓ Accept as STAFF</a>
        <a href="${data.approveViewerUrl}" class="button btn-viewer">✓ Accept as VIEWER</a>
      </div>

      <div class="button-group">
        <span class="button-label">Or reject:</span>
        <a href="${data.rejectUrl}" class="button btn-reject">✗ Reject Request</a>
      </div>
    </div>

    <div class="info">
      <p><strong>⏰ This approval link will expire in 3 days.</strong></p>
      <p>If you didn't expect this request or if something looks suspicious, please reject it or contact your system administrator.</p>
    </div>

    <div class="footer">
      <p>© 2025 Ecomate. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};
