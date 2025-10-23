import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { EnvService } from '@env/env.service';
import {
  approvalRequestTemplate,
  ApprovalEmailData,
} from './templates/approval-request.template';
import {
  magicLinkTemplate,
  MagicLinkEmailData,
} from './templates/magic-link.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;
  private readonly allowedOrigins: string[];

  constructor(private readonly envService: EnvService) {
    const apiKey = this.envService.get('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    this.fromEmail = this.envService.get('EMAIL_FROM');
    this.frontendUrl = this.envService.get('FRONTEND_URL');
    this.allowedOrigins = this.envService.getCorsOrigins();
  }

  /**
   * Validate and get origin from request header
   * Falls back to FRONTEND_URL if origin is not in CORS_ORIGINS
   */
  private validateAndGetOrigin(origin?: string): string {
    if (!origin) {
      return this.frontendUrl;
    }

    // Check if origin is in allowed CORS origins
    const isAllowed = this.allowedOrigins.some(
      (allowedOrigin) => allowedOrigin === origin || origin.startsWith(allowedOrigin),
    );

    if (isAllowed) {
      this.logger.debug(`Using origin from request: ${origin}`);
      return origin;
    }

    this.logger.warn(`Origin ${origin} not in CORS_ORIGINS, falling back to FRONTEND_URL`);
    return this.frontendUrl;
  }

  /**
   * Send approval request email to owner with 4 action buttons
   */
  async sendApprovalRequest(params: {
    ownerEmail: string;
    userEmail: string;
    userName: string;
    approvalToken: string;
    origin?: string;
  }): Promise<void> {
    const baseUrl = this.validateAndGetOrigin(params.origin);

    const emailData: ApprovalEmailData = {
      userEmail: params.userEmail,
      userName: params.userName,
      requestedAt: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      approveAdminUrl: `${baseUrl}/approval/accept?token=${params.approvalToken}&role=ADMIN`,
      approveStaffUrl: `${baseUrl}/approval/accept?token=${params.approvalToken}&role=STAFF`,
      approveViewerUrl: `${baseUrl}/approval/accept?token=${params.approvalToken}&role=VIEWER`,
      rejectUrl: `${baseUrl}/approval/reject?token=${params.approvalToken}`,
    };

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: params.ownerEmail,
        subject: `New User Registration Request - ${params.userEmail}`,
        html: approvalRequestTemplate(emailData),
      });

      this.logger.log(
        `Approval email sent to ${params.ownerEmail} for user ${params.userEmail}. Email ID: ${result.data?.id}`,
      );
    } catch (error) {
      this.logger.error('Failed to send approval email:', error);
      throw new Error('Failed to send approval email');
    }
  }

  /**
   * Send magic link email to owner for 2FA login
   */
  async sendMagicLink(params: {
    email: string;
    token: string;
    ipAddress?: string;
    userAgent?: string;
    origin?: string;
  }): Promise<void> {
    const baseUrl = this.validateAndGetOrigin(params.origin);

    const emailData: MagicLinkEmailData = {
      verifyUrl: `${baseUrl}/verify-login?token=${params.token}`,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    };

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: params.email,
        subject: 'Complete Your Login - Ecomate Admin',
        html: magicLinkTemplate(emailData),
      });

      this.logger.log(
        `Magic link email sent to ${params.email}. Email ID: ${result.data?.id}`,
      );
    } catch (error) {
      this.logger.error('Failed to send magic link email:', error);
      throw new Error('Failed to send magic link email');
    }
  }
}
