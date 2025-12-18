# Data Integrity and Referential Consistency

This module provides comprehensive data integrity management for the Patient Notification System, including referential integrity checks, data validation, constraint enforcement, and migration utilities.

## Overview

The data integrity system consists of several key components:

- **DataIntegrityService**: Handles referential integrity checks and orphaned record detection
- **DataValidationService**: Provides enhanced validation with database constraints
- **DataMigrationService**: Manages data cleanup and migration operations
- **ComprehensiveDataIntegrityService**: Unified interface combining all integrity functionality

## Features

### 1. Referential Integrity Checks

Validates foreign key relationships and prevents orphaned records:

```typescript
import { dataIntegrityService } from './data-integrity-service.js';

// Validate protocol assignment creation
await dataIntegrityService.validateProtocolAssignment(userId, protocolId);

// Check if user can be safely deleted
await dataIntegrityService.validateUserDeletion(userId);

// Validate interaction log creation
await dataIntegrityService.validateInteractionLog(userId, protocolId, stepId, assignmentId);
```

### 2. Data Validation and Constraints

Enhanced validation beyond basic schema validation:

```typescript
// Validate user data with database constraints
await dataIntegrityService.validateUser(userData, isUpdate, userId);

// Validate protocol data with business rules
await dataIntegrityService.validateProtocol(protocolData, isUpdate, protocolId);

// Validate status transitions
await dataIntegrityService.validateStatusTransition('protocols', protocolId, 'active');
```

### 3. Data Migration and Cleanup

Automated cleanup and migration utilities:

```typescript
// Fix all data integrity issues
const result = await dataIntegrityService.fixDataIntegrityIssues({
  dryRun: false,
  batchSize: 1000,
  continueOnError: true
});

// Clean up orphaned records
const cleanup = await dataIntegrityService.cleanupOrphanedRecords(false);

// Recalculate adherence rates
const adherence = await dataIntegrityService.recalculateAdherenceRates();
```

### 4. Comprehensive Reporting

Generate detailed integrity and consistency reports:

```typescript
// Generate comprehensive integrity report
const report = await dataIntegrityService.generateIntegrityReport({
  validateReferentialIntegrity: true,
  validateConstraints: true,
  runMigrations: false
});

// Get detailed consistency report
const consistency = await dataIntegrityService.getConsistencyReport();
```

## API Endpoints

The system exposes REST API endpoints for data integrity operations:

### Reports
- `GET /api/data-integrity/report` - Generate comprehensive integrity report
- `GET /api/data-integrity/consistency-report` - Get detailed consistency report

### Maintenance Operations
- `POST /api/data-integrity/fix-issues` - Fix all data integrity issues
- `POST /api/data-integrity/cleanup-orphaned` - Clean up orphaned records
- `POST /api/data-integrity/recalculate-adherence` - Recalculate adherence rates

### Cleanup Operations
- `POST /api/data-integrity/cleanup-old-logs` - Clean up old interaction logs
- `POST /api/data-integrity/cleanup-soft-deleted` - Clean up soft-deleted records
- `POST /api/data-integrity/fix-step-ordering` - Fix protocol step ordering
- `POST /api/data-integrity/fix-timestamps` - Fix timestamp consistency

### Validation Operations
- `POST /api/data-integrity/validate-status-transition` - Validate status transitions
- `POST /api/data-integrity/validate-user-deletion/:id` - Check if user can be deleted
- `POST /api/data-integrity/validate-protocol-deletion/:id` - Check if protocol can be deleted
- `POST /api/data-integrity/validate-admin-deletion/:id` - Check if admin can be deleted

## CLI Tool

A command-line interface is available for data integrity operations:

```bash
# Generate integrity report
bun run data-integrity report

# Clean up orphaned records (dry run)
bun run data-integrity cleanup-orphaned --dry-run

# Fix all issues with custom batch size
bun run data-integrity fix-all --no-dry-run --batch-size 500

# Clean up old logs older than 180 days
bun run data-integrity cleanup-old-logs --no-dry-run --older-than-days 180

# Generate consistency report with verbose output
bun run data-integrity consistency-report --verbose
```

### Available CLI Commands

- `report` - Generate comprehensive data integrity report
- `consistency-report` - Generate detailed data consistency report
- `fix-all` - Fix all data integrity issues
- `cleanup-orphaned` - Clean up orphaned records
- `cleanup-old-logs` - Clean up old interaction logs
- `cleanup-soft-deleted` - Clean up soft-deleted records
- `recalculate-adherence` - Recalculate adherence rates
- `fix-step-ordering` - Fix protocol step ordering issues
- `fix-timestamps` - Fix timestamp consistency issues

### CLI Options

- `--dry-run` / `--no-dry-run` - Run in dry-run mode (default: true for cleanup operations)
- `--batch-size <number>` - Batch size for processing (default: 1000)
- `--older-than-days <n>` - Only process records older than N days
- `--continue-on-error` / `--no-continue-on-error` - Continue processing on errors (default: true)
- `--verbose` - Show detailed output

## Error Handling

The system includes specialized error classes for different integrity violations:

- `ReferentialIntegrityError` - Foreign key constraint violations
- `ConstraintViolationError` - Database constraint violations
- `DataConsistencyError` - Data consistency issues
- `OrphanedRecordError` - Orphaned record detection
- `InvalidStatusTransitionError` - Invalid status transitions

## Data Validation Rules

### User Validation
- LINE User ID must be unique and non-empty
- Display name is required (max 255 characters)
- Picture URL must be valid URL or empty
- Hospital number follows format HN + 6-10 digits
- Status must be 'active' or 'inactive'

### Protocol Validation
- Name is required (max 255 characters)
- Created by admin must exist and be active
- Status transitions follow defined rules:
  - draft → active
  - active → paused, completed
  - paused → active, completed
  - completed → (no transitions)

### Protocol Step Validation
- Step order must be unique within protocol
- Trigger type validation:
  - delay: format like "1h", "30m", "2d"
  - scheduled: format like "09:00", "14:30"
  - immediate: "0" or empty
- Content payload validation based on message type
- Feedback configuration consistency

### Protocol Assignment Validation
- User must exist and be active
- Protocol must exist and be active
- No duplicate assignments for same user/protocol
- Protocol must have steps defined

## Migration Operations

### Referential Integrity Migration
- Removes orphaned protocol steps
- Removes orphaned protocol assignments
- Removes orphaned interaction logs

### Data Cleanup
- Old interaction logs (configurable age)
- Soft-deleted records (configurable age)
- Invalid status values
- Missing required data

### Data Fixes
- Protocol step ordering (sequential numbering)
- Timestamp consistency (respondedAt >= sentAt)
- Adherence rate recalculation
- Foreign key relationship validation

## Performance Considerations

- All operations support batch processing to avoid memory issues
- Configurable batch sizes (default: 1000 records)
- Transaction support for data consistency
- Dry-run mode for safe testing
- Continue-on-error option for resilient processing

## Testing

The module includes comprehensive unit tests:

```bash
# Run validation unit tests
bun test src/core/database/__tests__/validation-unit.test.ts

# Run integrity unit tests  
bun test src/core/database/__tests__/integrity-unit.test.ts
```

## Usage Examples

### Basic Validation

```typescript
import { dataIntegrityService } from './data-integrity-service.js';

try {
  // Validate user data before creation
  await dataIntegrityService.validateUser({
    lineUserId: 'user123',
    displayName: 'John Doe',
    status: 'active'
  });
  
  // Create user...
} catch (error) {
  if (error instanceof ConstraintViolationError) {
    console.log('Validation failed:', error.details.errors);
  }
}
```

### Integrity Checks

```typescript
try {
  // Check if protocol can be safely deleted
  await dataIntegrityService.validateProtocolDeletion(protocolId);
  
  // Safe to delete
  await protocolRepository.delete(protocolId);
} catch (error) {
  if (error instanceof ReferentialIntegrityError) {
    console.log('Cannot delete protocol:', error.message);
  }
}
```

### Maintenance Operations

```typescript
// Run comprehensive maintenance
const result = await dataIntegrityService.fixDataIntegrityIssues({
  dryRun: false,
  batchSize: 500,
  continueOnError: true
});

console.log(`Processed: ${result.recordsProcessed}`);
console.log(`Updated: ${result.recordsUpdated}`);
console.log(`Errors: ${result.errors.length}`);
```

## Configuration

The data integrity system can be configured through environment variables and options:

- Batch sizes for processing
- Age thresholds for cleanup operations
- Error handling behavior
- Dry-run defaults
- Logging levels

## Best Practices

1. **Always validate before operations**: Use validation methods before creating or updating records
2. **Check integrity before deletion**: Validate deletion constraints before removing records
3. **Use dry-run mode first**: Test cleanup operations in dry-run mode before executing
4. **Monitor batch sizes**: Adjust batch sizes based on system performance
5. **Regular maintenance**: Schedule regular integrity checks and cleanup operations
6. **Error handling**: Implement proper error handling for integrity violations
7. **Logging**: Enable detailed logging for troubleshooting integrity issues

## Monitoring and Alerting

Consider implementing monitoring for:
- Orphaned record counts
- Failed integrity checks
- Migration operation results
- Constraint violation frequencies
- Data consistency metrics

This ensures proactive identification and resolution of data integrity issues.