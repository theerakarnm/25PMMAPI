import { WebhookEvent, FollowEvent, PostbackEvent, MessageEvent } from '@line/bot-sdk';
import { lineClient } from './client.js';
import { database } from '../database/connection.js';
import { users, interactionLogs } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors/app-error.js';
import { v4 as uuidv4 } from 'uuid';

export class LineWebhookHandler {
  /**
   * Process incoming webhook events from LINE
   */
  static async handleEvents(events: WebhookEvent[]): Promise<void> {
    for (const event of events) {
      try {
        switch (event.type) {
          case 'follow':
            await this.handleFollowEvent(event);
            break;
          case 'postback':
            await this.handlePostbackEvent(event);
            break;
          case 'message':
            await this.handleMessageEvent(event);
            break;
          case 'unfollow':
            await this.handleUnfollowEvent(event);
            break;
          default:
            console.log(`Unhandled event type: ${event.type}`);
        }
      } catch (error) {
        console.error(`Error handling event ${event.type}:`, error);
        // Continue processing other events even if one fails
      }
    }
  }

  /**
   * Handle follow events (user adds bot as friend)
   */
  private static async handleFollowEvent(event: FollowEvent): Promise<void> {
    const userId = event.source.userId;
    if (!userId) return;

    try {
      // Get user profile from LINE
      const profile = await lineClient.getUserProfile(userId);
      
      // Check if user already exists
      const existingUser = await database
        .select()
        .from(users)
        .where(eq(users.lineUserId, userId))
        .limit(1);

      if (existingUser.length === 0) {
        // Create new user record
        await database.insert(users).values({
          id: uuidv4(),
          lineUserId: userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          status: 'active',
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Send welcome message
        await lineClient.sendTextMessage(
          userId,
          'ยินดีต้อนรับสู่ระบบแจ้งเตือนการดูแลผู้ป่วย! 🏥\n\nเราจะส่งข้อความแจ้งเตือนเกี่ยวกับการดูแลสุขภาพของคุณ หากมีคำถามสามารถติดต่อทีมแพทย์ได้เสมอ'
        );
      } else {
        // Reactivate existing user
        await database
          .update(users)
          .set({
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(users.lineUserId, userId));

        // Send welcome back message
        await lineClient.sendTextMessage(
          userId,
          'ยินดีต้อนรับกลับ! 🎉\n\nเราจะเริ่มส่งข้อความแจ้งเตือนการดูแลสุขภาพให้คุณอีกครั้ง'
        );
      }
    } catch (error) {
      console.error('Error handling follow event:', error);
      throw new AppError(
        'Failed to process follow event',
        500,
        'WEBHOOK_PROCESSING_ERROR'
      );
    }
  }

  /**
   * Handle postback events (button clicks)
   */
  private static async handlePostbackEvent(event: PostbackEvent): Promise<void> {
    const userId = event.source.userId;
    if (!userId) return;

    try {
      const postbackData = event.postback.data;
      const timestamp = new Date(event.timestamp);

      // Parse postback data (format: "protocol_id:step_id:action")
      const [protocolId, stepId, action] = postbackData.split(':');

      if (!protocolId || !stepId || !action) {
        console.error('Invalid postback data format:', postbackData);
        return;
      }

      // Get user from database
      const user = await database
        .select()
        .from(users)
        .where(eq(users.lineUserId, userId))
        .limit(1);

      if (user.length === 0) {
        console.error('User not found for postback event:', userId);
        return;
      }

      // Log the interaction
      await database.insert(interactionLogs).values({
        id: uuidv4(),
        userId: user[0].id,
        protocolId,
        stepId,
        assignmentId: '', // Will be populated when protocol assignments are implemented
        sentAt: timestamp, // This should be the original sent time, will be updated later
        respondedAt: timestamp,
        responseValue: action,
        responseAction: action,
        status: 'responded',
        createdAt: new Date(),
      });

      // Send confirmation message based on action
      let confirmationMessage = 'บันทึกข้อมูลเรียบร้อย ขอบคุณครับ 🙏';
      
      if (action === 'completed') {
        confirmationMessage = 'เยี่ยมมาก! บันทึกการทำกิจกรรมเรียบร้อยแล้ว ✅';
      } else if (action === 'postpone') {
        confirmationMessage = 'ไม่เป็นไร สามารถทำในภายหลังได้ครับ 📝';
      }

      await lineClient.sendTextMessage(userId, confirmationMessage);
    } catch (error) {
      console.error('Error handling postback event:', error);
      throw new AppError(
        'Failed to process postback event',
        500,
        'WEBHOOK_PROCESSING_ERROR'
      );
    }
  }

  /**
   * Handle message events (user sends text message)
   */
  private static async handleMessageEvent(event: MessageEvent): Promise<void> {
    const userId = event.source.userId;
    if (!userId || event.message.type !== 'text') return;

    try {
      // For now, just acknowledge the message
      // This can be expanded later for more interactive features
      await lineClient.sendTextMessage(
        userId,
        'ขอบคุณสำหรับข้อความ หากต้องการความช่วยเหลือ กรุณาติดต่อทีมแพทย์โดยตรงครับ 👨‍⚕️'
      );
    } catch (error) {
      console.error('Error handling message event:', error);
    }
  }

  /**
   * Handle unfollow events (user blocks or removes bot)
   */
  private static async handleUnfollowEvent(event: any): Promise<void> {
    const userId = event.source.userId;
    if (!userId) return;

    try {
      // Deactivate user
      await database
        .update(users)
        .set({
          status: 'inactive',
          updatedAt: new Date(),
        })
        .where(eq(users.lineUserId, userId));
    } catch (error) {
      console.error('Error handling unfollow event:', error);
    }
  }
}