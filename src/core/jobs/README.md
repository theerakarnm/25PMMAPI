# Job Scheduling and Message Delivery System

## Overview

The job scheduling and message delivery system provides a comprehensive solution for automated protocol message delivery with robust error handling, retry logic, and monitoring capabilities.

## Components

### 1. Message Delivery Service (`message-delivery-service.ts`)

Handles the actual delivery of messages to patients via LINE API with comprehensive error handling.

**Key Features:**
- Multiple message type support (text, image, flex, template)
- Automatic interaction logging
- Retry logic for transient failures
- Delivery statistics and monitoring
- Error classification (retryable vs non-retryable)

**Usage Example:**
```typescript
import { MessageDeliveryService } from './message-delivery-service.js';

const result = await MessageDeliveryService.deliverMessage({
  userId: 'user-line-id',
  protocolId: 'protocol-uuid',
  stepId: 'step-uuid',
  assignmentId: 'assignment-uuid',
  messageType: 'text',
  content: { text: 'Hello, this is a reminder!' },
  requiresFeedback: false,
});

if (result.success) {
  console.log('Message delivered:', result.messageId);
} else {
  console.error('Delivery failed:', result.error);
}
```

### 2. Job Queue (`queue.ts`)

Manages message delivery jobs using BullMQ with Redis backend.

**Key Features:**
- Immediate message delivery
- Delayed message delivery
- Scheduled message delivery
- Recurring message delivery
- Automatic retry with exponential backoff
- Job cancellation and cleanup
- Queue statistics and monitoring

**Queue Configuration:**
- **Concurrency**: 10 workers for message delivery
- **Retry Attempts**: 3 attempts with exponential backoff (2s, 4s, 8s)
- **Job Retention**: Last 100 completed jobs, last 50 failed jobs

**Usage Example:**
```typescript
import { JobManager } from './queue.js';

// Schedule immediate delivery
await JobManager.scheduleImmediateMessage({
  userId: 'user-line-id',
  protocolId: 'protocol-uuid',
  stepId: 'step-uuid',
  assignmentId: 'assignment-uuid',
  messageType: 'text',
  content: { text: 'Immediate message' },
  requiresFeedback: false,
});

// Schedule delayed delivery (5 minutes)
await JobManager.scheduleDelayedMessage(messageData, 5 * 60 * 1000);

// Schedule at specific time
await JobManager.scheduleMessageAt(messageData, new Date('2024-01-01T09:00:00Z'));

// Schedule recurring (daily at 9 AM)
await JobManager.scheduleRecurringMessage(messageData, '0 9 * * *');
```

### 3. Protocol Scheduler (`scheduler.ts`)

Orchestrates protocol execution by processing scheduled steps and managing protocol lifecycles.

**Key Features:**
- Automatic protocol step processing (runs every minute)
- Support for immediate, delayed, and scheduled triggers
- Failed delivery retry (runs every 15 minutes)
- Maintenance tasks (runs hourly)
- Protocol assignment lifecycle management

**Trigger Types:**
- **Immediate**: Send when protocol starts
- **Delay**: Send after specified delay (e.g., "1h", "30m", "2d")
- **Scheduled**: Send at specific times (e.g., "09:00", "14:30")

**Usage Example:**
```typescript
import { ProtocolScheduler } from './scheduler.js';

// Initialize scheduler (called on app startup)
ProtocolScheduler.initialize();

// Start a protocol assignment
await ProtocolScheduler.startProtocolAssignment('assignment-uuid');

// Pause a protocol assignment
await ProtocolScheduler.pauseProtocolAssignment('assignment-uuid');

// Complete a protocol assignment
await ProtocolScheduler.completeProtocolAssignment('assignment-uuid');

// Get scheduler statistics
const stats = await ProtocolScheduler.getStats();
```

## Monitoring and Management

### API Endpoints (`/api/jobs`)

All endpoints require authentication.

#### Get Job Statistics
```
GET /api/jobs/stats
```
Returns comprehensive statistics about job queues and scheduler.

#### Get Delivery Statistics
```
GET /api/jobs/delivery-stats?from=2024-01-01&to=2024-01-31
```
Returns delivery statistics for a specific time range.

#### Get Failed Deliveries
```
GET /api/jobs/failed-deliveries?limit=50
```
Returns list of failed deliveries for manual review.

#### Retry Failed Deliveries
```
POST /api/jobs/retry-failed?limit=20
```
Manually trigger retry of failed deliveries.

#### Run Maintenance Tasks
```
POST /api/jobs/maintenance
```
Manually trigger maintenance tasks (cleanup, retry processing).

#### Cleanup Old Jobs
```
POST /api/jobs/cleanup?hours=24
```
Remove completed and failed jobs older than specified hours.

#### Health Check
```
GET /api/jobs/health
```
Check if job system is healthy and responsive.

## Error Handling

### Retryable Errors
The system automatically retries these errors:
- LINE API rate limiting (429)
- Temporary server errors (5xx)
- Network errors (ECONNRESET, ETIMEDOUT)
- LINE API temporary unavailability

### Non-Retryable Errors
These errors are logged but not retried:
- Invalid credentials (401)
- Invalid message format (400)
- User blocked the bot (403)
- Invalid LINE user ID (404)

### Retry Strategy
- **Attempts**: 3 retries
- **Backoff**: Exponential (2s, 4s, 8s)
- **Failed Delivery Processing**: Every 15 minutes
- **Manual Retry**: Available via API endpoint

## Maintenance Tasks

### Automatic Maintenance (Hourly)
- Clean up old completed jobs (>24 hours)
- Clean up old failed jobs (>24 hours)
- Process failed deliveries for retry

### Manual Maintenance
Use the `/api/jobs/maintenance` endpoint to trigger maintenance tasks manually.

## Database Schema

### Interaction Logs
All message deliveries are logged in the `interaction_logs` table:

```sql
CREATE TABLE interaction_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  protocol_id UUID NOT NULL,
  step_id UUID NOT NULL,
  assignment_id UUID NOT NULL,
  message_id VARCHAR(255),
  sent_at TIMESTAMP NOT NULL,
  delivered_at TIMESTAMP,
  responded_at TIMESTAMP,
  response_value TEXT,
  response_action VARCHAR(50),
  time_difference_ms INTEGER,
  status VARCHAR(20) NOT NULL, -- 'sent', 'delivered', 'read', 'responded', 'missed', 'failed'
  created_at TIMESTAMP NOT NULL
);
```

## Performance Considerations

### Concurrency
- **Message Workers**: 10 concurrent workers
- **Scheduled Workers**: 5 concurrent workers
- **Cron Jobs**: 3 scheduled tasks (protocol processing, maintenance, retry)

### Scalability
- Redis-backed job queue supports horizontal scaling
- Worker processes can be distributed across multiple servers
- Database indexes optimize query performance

### Resource Management
- Automatic job cleanup prevents queue bloat
- Connection pooling for database and Redis
- Graceful shutdown handling

## Monitoring Metrics

### Queue Metrics
- Active jobs count
- Waiting jobs count
- Completed jobs count
- Failed jobs count
- Delayed jobs count

### Delivery Metrics
- Total messages sent
- Successful deliveries
- Failed deliveries
- Average delivery time
- Response rate

### System Health
- Queue responsiveness
- Worker status
- Redis connection status
- Database connection status

## Best Practices

### 1. Message Scheduling
- Use immediate delivery for time-sensitive messages
- Use delayed delivery for follow-ups
- Use scheduled delivery for daily reminders
- Use recurring delivery for ongoing protocols

### 2. Error Handling
- Monitor failed deliveries regularly
- Review non-retryable errors for pattern analysis
- Set up alerts for high failure rates
- Keep LINE API credentials secure

### 3. Performance Optimization
- Run maintenance tasks during low-traffic periods
- Monitor queue depth and adjust worker concurrency
- Use database indexes for query optimization
- Implement caching for frequently accessed data

### 4. Testing
- Test message delivery with different content types
- Verify retry logic with simulated failures
- Test scheduler with various trigger types
- Monitor delivery statistics in production

## Troubleshooting

### High Failure Rate
1. Check LINE API credentials
2. Verify Redis connection
3. Review error logs for patterns
4. Check LINE API status

### Delayed Message Delivery
1. Check worker concurrency settings
2. Verify Redis performance
3. Review queue depth
4. Check database query performance

### Missing Messages
1. Verify protocol assignment status
2. Check scheduler logs
3. Review interaction logs
4. Verify trigger configuration

### Memory Issues
1. Run cleanup tasks more frequently
2. Reduce job retention limits
3. Monitor Redis memory usage
4. Optimize database queries

## Future Enhancements

- [ ] Add message delivery webhooks for real-time status updates
- [ ] Implement message priority levels
- [ ] Add support for message templates
- [ ] Implement A/B testing for message content
- [ ] Add delivery time optimization based on user engagement patterns
- [ ] Implement message batching for bulk operations
- [ ] Add support for message scheduling based on user timezone
- [ ] Implement delivery rate limiting per user
