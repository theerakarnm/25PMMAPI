import { Client, ClientConfig, WebhookEvent, validateSignature } from '@line/bot-sdk';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

export interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
}

export class LineClient {
  private client: Client;
  private config: LineConfig;

  constructor() {
    this.config = {
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: env.LINE_CHANNEL_SECRET,
    };

    const clientConfig: ClientConfig = {
      channelAccessToken: this.config.channelAccessToken,
      channelSecret: this.config.channelSecret,
    };

    this.client = new Client(clientConfig);
  }

  /**
   * Send a text message to a user
   */
  async sendTextMessage(userId: string, text: string): Promise<void> {
    try {
      await this.client.pushMessage(userId, {
        type: 'text',
        text,
      });
    } catch (error) {
      throw new AppError(
        `Failed to send text message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send an image message to a user
   */
  async sendImageMessage(
    userId: string,
    originalContentUrl: string,
    previewImageUrl: string
  ): Promise<void> {
    try {
      await this.client.pushMessage(userId, {
        type: 'image',
        originalContentUrl,
        previewImageUrl,
      });
    } catch (error) {
      throw new AppError(
        `Failed to send image message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send a flex message to a user
   */
  async sendFlexMessage(userId: string, altText: string, contents: any): Promise<void> {
    try {
      await this.client.pushMessage(userId, {
        type: 'flex',
        altText,
        contents,
      });
    } catch (error) {
      throw new AppError(
        `Failed to send flex message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send a template message with buttons for feedback
   */
  async sendButtonTemplate(
    userId: string,
    text: string,
    buttons: Array<{
      type: 'postback';
      label: string;
      data: string;
    }>
  ): Promise<void> {
    try {
      await this.client.pushMessage(userId, {
        type: 'template',
        altText: text,
        template: {
          type: 'buttons',
          text,
          actions: buttons,
        },
      });
    } catch (error) {
      throw new AppError(
        `Failed to send button template: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(userId: string) {
    try {
      return await this.client.getProfile(userId);
    } catch (error) {
      throw new AppError(
        `Failed to get user profile: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Validate webhook signature
   */
  validateSignature(body: string, signature: string): boolean {
    try {
      return validateSignature(body, this.config.channelSecret, signature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the LINE client instance for advanced operations
   */
  getClient(): Client {
    return this.client;
  }
}

// Export singleton instance
export const lineClient = new LineClient();