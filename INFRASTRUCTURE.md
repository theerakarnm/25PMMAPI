# Patient Notification System - Infrastructure Setup

## Overview

This document describes the core infrastructure components that have been implemented for the Patient Notification System API.

## ✅ Implemented Components

### 1. Database Connection & Configuration Management
- **Location**: `src/core/database/connection.ts`
- **Features**:
  - PostgreSQL connection with Drizzle ORM
  - Environment-based configuration
  - Schema integration with type safety
- **Schema**: `src/core/database/schema.ts`
  - Users, Admins, Protocols, Protocol Steps, Protocol Assignments, Interaction Logs

### 2. Authentication Middleware & Session Handling
- **JWT Service**: `src/core/auth/jwt.ts`
  - Token generation and validation
  - Secure session management
- **Auth Middleware**: `src/middleware/auth.ts`
  - Route protection
  - Token extraction and validation
  - Optional authentication support

### 3. LINE API Client & Webhook Infrastructure
- **LINE Client**: `src/core/line/client.ts`
  - Text, image, flex, and template message sending
  - User profile retrieval
  - Webhook signature validation
- **Webhook Handler**: `src/core/line/webhook-handler.ts`
  - Follow/unfollow event processing
  - Postback event handling (button clicks)
  - Message event processing
  - Automatic user registration
- **LINE Routes**: `src/routes/line.ts`
  - Webhook endpoint (`/api/line/webhook`)
  - Status checking (`/api/line/status`)
  - Test messaging (`/api/line/test-message`)

### 4. Job Scheduling with BullMQ
- **Queue Manager**: `src/core/jobs/queue.ts`
  - Redis-backed job queues
  - Message delivery processing
  - Retry logic and error handling
  - Job statistics and monitoring
- **Protocol Scheduler**: `src/core/jobs/scheduler.ts`
  - Cron-based protocol execution
  - Immediate, delayed, and scheduled messaging
  - Protocol assignment lifecycle management
  - Automatic message timing

### 5. Database Migration & Setup Scripts
- **Migration Script**: `scripts/migrate.ts`
  - Automated database schema updates
  - Safe migration execution
- **Startup Script**: `scripts/startup.ts`
  - Complete system initialization
  - Environment validation
- **Verification Script**: `scripts/verify-infrastructure.ts`
  - Infrastructure health checks
  - Component validation

## 🚀 Getting Started

### Prerequisites
- Bun
- PostgreSQL database
- Redis server
- LINE Official Account credentials

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure all required environment variables:
   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/patient_notification
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
   LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
   LINE_CHANNEL_SECRET=your-line-channel-secret
   LINE_WEBHOOK_URL=https://your-domain.com/api/line/webhook
   ```

### Installation & Verification
```bash
# Install dependencies
npm install

# Verify infrastructure
npm run verify

# Run database migrations
npm run db:migrate

# Create initial admin user
npm run init-admin

# Start development server
npm run dev
```

## 📋 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run verify` | Verify infrastructure setup |
| `npm run startup` | Complete system initialization |
| `npm run db:generate` | Generate database migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run init-admin` | Create initial admin user |

## 🏗️ Architecture

### Core Components
```
src/
├── core/
│   ├── auth/           # JWT authentication
│   ├── config/         # Environment configuration
│   ├── database/       # Database connection & schema
│   ├── errors/         # Error handling
│   ├── jobs/           # Job queue & scheduling
│   ├── line/           # LINE API integration
│   └── response/       # API response formatting
├── middleware/         # Express-style middleware
├── routes/            # API route definitions
└── index.ts           # Application entry point
```

### External Integrations
- **PostgreSQL**: Primary database with Drizzle ORM
- **Redis**: Job queue backend with BullMQ
- **LINE Messaging API**: Patient communication platform

## 🔧 Configuration

### Database Schema
The system uses 6 main tables:
- `users`: Patient accounts with LINE integration
- `admins`: Healthcare administrators
- `protocols`: Care workflow definitions
- `protocol_steps`: Individual protocol actions
- `protocol_assignments`: User-protocol relationships
- `interaction_logs`: Patient interaction tracking

### Job Queue System
- **Message Queue**: Immediate message delivery
- **Scheduled Queue**: Time-based message scheduling
- **Retry Logic**: Exponential backoff for failed deliveries
- **Monitoring**: Queue statistics and job tracking

### LINE Integration
- **Webhook Events**: Follow, postback, message, unfollow
- **Message Types**: Text, image, flex, template/buttons
- **User Management**: Automatic registration and profile sync
- **Feedback System**: Interactive button responses

## 🛡️ Security Features

- JWT-based authentication with configurable expiration
- Secure password hashing with bcryptjs
- LINE webhook signature validation
- Environment-based configuration management
- SQL injection prevention with Drizzle ORM
- Error handling without sensitive data exposure

## 📊 Monitoring & Logging

- Comprehensive error logging with context
- Job queue statistics and monitoring
- LINE API interaction tracking
- Database query logging (development)
- Health check endpoints for system status

## 🔄 Next Steps

With the infrastructure complete, you can now:
1. Implement protocol management features
2. Build the admin dashboard frontend
3. Add research analytics and reporting
4. Implement comprehensive testing
5. Deploy to production environment

## 🆘 Troubleshooting

### Common Issues
1. **Database Connection**: Verify PostgreSQL is running and DATABASE_URL is correct
2. **Redis Connection**: Ensure Redis server is accessible at REDIS_URL
3. **LINE API**: Check channel access token and webhook URL configuration
4. **Environment Variables**: Run `npm run verify` to check configuration

### Debug Commands
```bash
# Check database connection
npm run db:studio

# Verify all components
npm run verify

# Check job queue status
# (Access via API: GET /api/line/status)
```

For additional support, check the logs in the console output when running `npm run dev`.