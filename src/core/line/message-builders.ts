import { FlexMessage, Message } from '@line/bot-sdk';
import { FeedbackConfig, FeedbackButton } from '../database/schema/protocols.js';
import { AppError } from '../errors/app-error.js';

export interface MessageContent {
  type: 'text' | 'image' | 'flex' | 'link';
  payload: any;
}

export interface FeedbackMessageOptions {
  question: string;
  buttons: FeedbackButton[];
  protocolId: string;
  stepId: string;
}

/**
 * Message builder for creating different types of LINE messages
 */
export class MessageBuilder {
  /**
   * Build a text message
   */
  static buildTextMessage(text: string): Message {
    if (!text || text.trim().length === 0) {
      throw new AppError(
        'Text message content cannot be empty',
        400,
        'INVALID_MESSAGE_CONTENT'
      );
    }

    return {
      type: 'text',
      text: text.trim(),
    };
  }

  /**
   * Build an image message
   */
  static buildImageMessage(
    originalContentUrl: string,
    previewImageUrl?: string
  ): Message {
    if (!originalContentUrl) {
      throw new AppError(
        'Image URL is required for image messages',
        400,
        'INVALID_MESSAGE_CONTENT'
      );
    }

    // Use original URL as preview if not provided
    const preview = previewImageUrl || originalContentUrl;

    return {
      type: 'image',
      originalContentUrl,
      previewImageUrl: preview,
    };
  }

  /**
   * Build a flex message
   */
  static buildFlexMessage(altText: string, contents: FlexMessage['contents']): Message {
    if (!altText || !contents) {
      throw new AppError(
        'Alt text and contents are required for flex messages',
        400,
        'INVALID_MESSAGE_CONTENT'
      );
    }

    return {
      type: 'flex',
      altText,
      contents,
    };
  }

  /**
   * Build a link message (using flex message with button)
   */
  static buildLinkMessage(text: string, url: string, linkText?: string): Message {
    if (!text || !url) {
      throw new AppError(
        'Text and URL are required for link messages',
        400,
        'INVALID_MESSAGE_CONTENT'
      );
    }

    const buttonText = linkText || 'เปิดลิงก์';

    const flexContents: FlexMessage['contents'] = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text,
            wrap: true,
            size: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: buttonText,
              uri: url,
            },
            style: 'primary',
          },
        ],
      },
    };

    return this.buildFlexMessage(text, flexContents);
  }

  /**
   * Build a feedback button template message
   */
  static buildFeedbackMessage(options: FeedbackMessageOptions): Message {
    const { question, buttons, protocolId, stepId } = options;

    if (!question || buttons.length === 0) {
      throw new AppError(
        'Question and buttons are required for feedback messages',
        400,
        'INVALID_FEEDBACK_CONFIG'
      );
    }

    if (buttons.length > 4) {
      throw new AppError(
        'Maximum 4 buttons allowed for feedback messages',
        400,
        'TOO_MANY_BUTTONS'
      );
    }

    // Create postback actions for each button
    const actions = buttons.map((button) => ({
      type: 'postback' as const,
      label: button.label,
      data: `${protocolId}:${stepId}:${button.value}`,
    }));

    return {
      type: 'template',
      altText: question,
      template: {
        type: 'buttons',
        text: question,
        actions,
      },
    };
  }

  /**
   * Build message from content payload based on message type
   */
  static buildFromContent(messageType: string, contentPayload: any): Message {
    switch (messageType) {
      case 'text':
        if (typeof contentPayload === 'string') {
          return this.buildTextMessage(contentPayload);
        } else if (contentPayload?.text) {
          return this.buildTextMessage(contentPayload.text);
        }
        throw new AppError(
          'Invalid text message payload',
          400,
          'INVALID_MESSAGE_CONTENT'
        );

      case 'image':
        if (typeof contentPayload === 'string') {
          return this.buildImageMessage(contentPayload);
        } else if (contentPayload?.originalContentUrl) {
          return this.buildImageMessage(
            contentPayload.originalContentUrl,
            contentPayload.previewImageUrl
          );
        }
        throw new AppError(
          'Invalid image message payload',
          400,
          'INVALID_MESSAGE_CONTENT'
        );

      case 'flex':
        if (contentPayload?.altText && contentPayload?.contents) {
          return this.buildFlexMessage(contentPayload.altText, contentPayload.contents);
        }
        throw new AppError(
          'Invalid flex message payload',
          400,
          'INVALID_MESSAGE_CONTENT'
        );

      case 'link':
        if (contentPayload?.text && contentPayload?.url) {
          return this.buildLinkMessage(
            contentPayload.text,
            contentPayload.url,
            contentPayload.linkText
          );
        }
        throw new AppError(
          'Invalid link message payload',
          400,
          'INVALID_MESSAGE_CONTENT'
        );

      default:
        throw new AppError(
          `Unsupported message type: ${messageType}`,
          400,
          'UNSUPPORTED_MESSAGE_TYPE'
        );
    }
  }
}

/**
 * Feedback configuration builder for creating standardized feedback options
 */
export class FeedbackConfigBuilder {
  /**
   * Create default feedback configuration for medication reminders
   */
  static createMedicationFeedback(): FeedbackConfig {
    return {
      question: 'คุณได้รับประทานยาตามเวลาที่กำหนดแล้วหรือยัง?',
      buttons: [
        {
          label: 'เรียบร้อยแล้ว ✅',
          value: 'completed',
          action: 'complete',
        },
        {
          label: 'ยังไม่ทำ/เลื่อนไปก่อน ⏰',
          value: 'postpone',
          action: 'postpone',
        },
      ],
    };
  }

  /**
   * Create default feedback configuration for exercise reminders
   */
  static createExerciseFeedback(): FeedbackConfig {
    return {
      question: 'คุณได้ออกกำลังกายตามที่แนะนำแล้วหรือยัง?',
      buttons: [
        {
          label: 'ทำเสร็จแล้ว 💪',
          value: 'completed',
          action: 'complete',
        },
        {
          label: 'ยังไม่ได้ทำ ⏰',
          value: 'postpone',
          action: 'postpone',
        },
        {
          label: 'ข้ามไปก่อน 🔄',
          value: 'skip',
          action: 'skip',
        },
      ],
    };
  }

  /**
   * Create default feedback configuration for appointment reminders
   */
  static createAppointmentFeedback(): FeedbackConfig {
    return {
      question: 'คุณได้รับทราบการนัดหมายนี้แล้วหรือยัง?',
      buttons: [
        {
          label: 'รับทราบแล้ว ✅',
          value: 'acknowledged',
          action: 'complete',
        },
        {
          label: 'ต้องเลื่อนนัด 📅',
          value: 'reschedule',
          action: 'postpone',
        },
      ],
    };
  }

  /**
   * Create custom feedback configuration
   */
  static createCustomFeedback(
    question: string,
    buttons: Array<{
      label: string;
      value: string;
      action: 'complete' | 'postpone' | 'skip';
    }>
  ): FeedbackConfig {
    if (!question || buttons.length === 0) {
      throw new AppError(
        'Question and at least one button are required',
        400,
        'INVALID_FEEDBACK_CONFIG'
      );
    }

    if (buttons.length > 4) {
      throw new AppError(
        'Maximum 4 buttons allowed',
        400,
        'TOO_MANY_BUTTONS'
      );
    }

    return {
      question,
      buttons: buttons.map((button) => ({
        label: button.label,
        value: button.value,
        action: button.action,
      })),
    };
  }
}

/**
 * Confirmation message builder for automatic responses
 */
export class ConfirmationMessageBuilder {
  /**
   * Get confirmation message based on feedback action
   */
  static getConfirmationMessage(action: string, customMessage?: string): string {
    if (customMessage) {
      return customMessage;
    }

    switch (action) {
      case 'completed':
      case 'complete':
        return 'เยี่ยมมาก! บันทึกการทำกิจกรรมเรียบร้อยแล้ว ✅\nขอบคุณที่ดูแลสุขภาพอย่างสม่ำเสมอ';

      case 'acknowledged':
        return 'รับทราบแล้ว ขอบคุณครับ 🙏\nหากมีคำถามเพิ่มเติม สามารถติดต่อทีมแพทย์ได้เสมอ';

      case 'postpone':
        return 'ไม่เป็นไร สามารถทำในภายหลังได้ครับ 📝\nอย่าลืมดูแลสุขภาพตัวเองนะครับ';

      case 'reschedule':
        return 'เข้าใจครับ กรุณาติดต่อทีมแพทย์เพื่อนัดหมายใหม่ 📞\nขอบคุณที่แจ้งให้ทราบล่วงหน้า';

      case 'skip':
        return 'เข้าใจครับ ไม่เป็นไร 🔄\nหากสามารถทำได้ในครั้งต่อไป จะดีมากครับ';

      default:
        return 'บันทึกข้อมูลเรียบร้อย ขอบคุณครับ 🙏\nขอให้มีสุขภาพที่ดีเสมอ';
    }
  }

  /**
   * Build confirmation message with additional context
   */
  static buildContextualConfirmation(
    action: string,
    protocolName?: string,
    stepDescription?: string
  ): string {
    const baseMessage = this.getConfirmationMessage(action);
    
    if (protocolName && stepDescription) {
      return `${baseMessage}\n\n📋 โปรแกรม: ${protocolName}\n📝 กิจกรรม: ${stepDescription}`;
    } else if (protocolName) {
      return `${baseMessage}\n\n📋 โปรแกรม: ${protocolName}`;
    }
    
    return baseMessage;
  }
}