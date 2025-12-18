#!/usr/bin/env bun
/**
 * Data Integrity Management CLI
 * 
 * This script provides command-line access to data integrity operations
 * including validation, cleanup, and migration utilities.
 */

import { dataIntegrityService } from '../src/core/database/data-integrity-service.js';
import { logger } from '../src/core/logging/logger.js';

interface CLIOptions {
  command: string;
  dryRun?: boolean;
  batchSize?: number;
  olderThanDays?: number;
  continueOnError?: boolean;
  verbose?: boolean;
}

class DataIntegrityCLI {
  private options: CLIOptions;

  constructor(options: CLIOptions) {
    this.options = options;
  }

  async run(): Promise<void> {
    try {
      logger.info(`Starting data integrity operation: ${this.options.command}`);

      switch (this.options.command) {
        case 'report':
          await this.generateReport();
          break;
        case 'fix-all':
          await this.fixAllIssues();
          break;
        case 'cleanup-orphaned':
          await this.cleanupOrphaned();
          break;
        case 'cleanup-old-logs':
          await this.cleanupOldLogs();
          break;
        case 'cleanup-soft-deleted':
          await this.cleanupSoftDeleted();
          break;
        case 'recalculate-adherence':
          await this.recalculateAdherence();
          break;
        case 'fix-step-ordering':
          await this.fixStepOrdering();
          break;
        case 'fix-timestamps':
          await this.fixTimestamps();
          break;
        case 'consistency-report':
          await this.consistencyReport();
          break;
        default:
          this.showHelp();
          process.exit(1);
      }

      logger.info(`Data integrity operation completed: ${this.options.command}`);
    } catch (error) {
      logger.error(`Data integrity operation failed: ${this.options.command}`, error as Error);
      process.exit(1);
    }
  }

  private async generateReport(): Promise<void> {
    console.log('🔍 Generating comprehensive data integrity report...\n');

    const report = await dataIntegrityService.generateIntegrityReport({
      validateReferentialIntegrity: true,
      validateConstraints: true,
      runMigrations: false
    });

    console.log('📊 Data Integrity Report');
    console.log('========================\n');

    console.log('🔗 Referential Integrity:');
    console.log(`   Status: ${report.integrity.isValid ? '✅ Valid' : '❌ Issues Found'}`);
    if (report.integrity.errors.length > 0) {
      console.log('   Errors:');
      report.integrity.errors.forEach(error => console.log(`     - ${error}`));
    }
    if (report.integrity.warnings.length > 0) {
      console.log('   Warnings:');
      report.integrity.warnings.forEach(warning => console.log(`     - ${warning}`));
    }
    console.log();

    console.log('✅ Data Validation:');
    console.log(`   Status: ${report.validation.isValid ? '✅ Valid' : '❌ Issues Found'}`);
    if (report.validation.errors.length > 0) {
      console.log('   Errors:');
      report.validation.errors.forEach(error => console.log(`     - ${error}`));
    }
    if (report.validation.warnings.length > 0) {
      console.log('   Warnings:');
      report.validation.warnings.forEach(warning => console.log(`     - ${warning}`));
    }
    console.log();

    console.log(`📅 Report Generated: ${report.timestamp.toISOString()}`);
  }

  private async consistencyReport(): Promise<void> {
    console.log('🔍 Generating data consistency report...\n');

    const report = await dataIntegrityService.getConsistencyReport();

    console.log('📊 Data Consistency Report');
    console.log('===========================\n');

    console.log(`🔗 Orphaned Records: ${report.orphanedRecords.length}`);
    if (report.orphanedRecords.length > 0) {
      console.log('   Details:');
      report.orphanedRecords.forEach(record => {
        console.log(`     - ${record.table}[${record.id}] -> ${record.referencedTable}[${record.referencedId}]`);
      });
    }
    console.log();

    console.log(`📋 Duplicate Records: ${report.duplicateRecords.length}`);
    if (report.duplicateRecords.length > 0) {
      console.log('   Details:');
      report.duplicateRecords.forEach(dup => {
        console.log(`     - ${dup.table}.${dup.field}: "${dup.value}" (${dup.count} occurrences)`);
      });
    }
    console.log();

    console.log(`⚠️  Invalid Statuses: ${report.invalidStatuses.length}`);
    if (report.invalidStatuses.length > 0) {
      console.log('   Details:');
      report.invalidStatuses.forEach(status => {
        console.log(`     - ${status.table}[${status.id}].${status.field}: "${status.value}"`);
      });
    }
    console.log();

    console.log(`❓ Missing Required Data: ${report.missingRequiredData.length}`);
    if (report.missingRequiredData.length > 0) {
      console.log('   Details:');
      report.missingRequiredData.forEach(missing => {
        console.log(`     - ${missing.table}[${missing.id}].${missing.field}`);
      });
    }
  }

  private async fixAllIssues(): Promise<void> {
    console.log('🔧 Fixing all data integrity issues...\n');

    const result = await dataIntegrityService.fixDataIntegrityIssues({
      dryRun: this.options.dryRun ?? false,
      batchSize: this.options.batchSize ?? 1000,
      continueOnError: this.options.continueOnError ?? true
    });

    this.printMigrationResult('Fix All Issues', result);
  }

  private async cleanupOrphaned(): Promise<void> {
    console.log('🧹 Cleaning up orphaned records...\n');

    const result = await dataIntegrityService.cleanupOrphanedRecords(
      this.options.dryRun ?? true
    );

    console.log('🧹 Orphaned Records Cleanup');
    console.log('============================\n');
    console.log(`📊 Records Found: ${result.deletedRecords.length}`);
    console.log(`🗑️  Records ${this.options.dryRun ? 'Would Be ' : ''}Deleted: ${result.deletedCount}`);
    
    if (result.deletedRecords.length > 0 && this.options.verbose) {
      console.log('\n📋 Deleted Records:');
      result.deletedRecords.forEach(record => {
        console.log(`   - ${record.table}[${record.id}] (${record.foreignKey} -> ${record.referencedTable})`);
      });
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    console.log('🧹 Cleaning up old interaction logs...\n');

    const result = await dataIntegrityService.cleanupOldLogs({
      dryRun: this.options.dryRun ?? true,
      batchSize: this.options.batchSize ?? 1000,
      olderThanDays: this.options.olderThanDays ?? 365
    });

    this.printMigrationResult('Old Logs Cleanup', result);
  }

  private async cleanupSoftDeleted(): Promise<void> {
    console.log('🧹 Cleaning up soft-deleted records...\n');

    const result = await dataIntegrityService.cleanupSoftDeletedRecords({
      dryRun: this.options.dryRun ?? true,
      batchSize: this.options.batchSize ?? 1000,
      olderThanDays: this.options.olderThanDays ?? 90
    });

    this.printMigrationResult('Soft-Deleted Records Cleanup', result);
  }

  private async recalculateAdherence(): Promise<void> {
    console.log('📊 Recalculating adherence rates...\n');

    const result = await dataIntegrityService.recalculateAdherenceRates({
      batchSize: this.options.batchSize ?? 100,
      continueOnError: this.options.continueOnError ?? true
    });

    this.printMigrationResult('Adherence Rate Recalculation', result);
  }

  private async fixStepOrdering(): Promise<void> {
    console.log('🔢 Fixing protocol step ordering...\n');

    const result = await dataIntegrityService.fixProtocolStepOrdering({
      batchSize: this.options.batchSize ?? 50,
      continueOnError: this.options.continueOnError ?? true
    });

    this.printMigrationResult('Protocol Step Ordering Fix', result);
  }

  private async fixTimestamps(): Promise<void> {
    console.log('🕐 Fixing timestamp consistency...\n');

    const result = await dataIntegrityService.fixTimestampConsistency({
      batchSize: this.options.batchSize ?? 1000,
      continueOnError: this.options.continueOnError ?? true
    });

    this.printMigrationResult('Timestamp Consistency Fix', result);
  }

  private printMigrationResult(title: string, result: any): void {
    console.log(`🔧 ${title}`);
    console.log('='.repeat(title.length + 3) + '\n');
    console.log(`✅ Success: ${result.success ? 'Yes' : 'No'}`);
    console.log(`📊 Records Processed: ${result.recordsProcessed}`);
    console.log(`🔄 Records Updated: ${result.recordsUpdated}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error: string) => console.log(`   - ${error}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach((warning: string) => console.log(`   - ${warning}`));
    }
    
    console.log();
  }

  public showHelp(): void {
    console.log(`
📋 Data Integrity Management CLI

Usage: bun run scripts/data-integrity.ts <command> [options]

Commands:
  report                  Generate comprehensive data integrity report
  consistency-report      Generate detailed data consistency report
  fix-all                 Fix all data integrity issues
  cleanup-orphaned        Clean up orphaned records
  cleanup-old-logs        Clean up old interaction logs
  cleanup-soft-deleted    Clean up soft-deleted records
  recalculate-adherence   Recalculate adherence rates for all assignments
  fix-step-ordering       Fix protocol step ordering issues
  fix-timestamps          Fix timestamp consistency issues

Options:
  --dry-run              Run in dry-run mode (default: true for cleanup operations)
  --batch-size <number>  Batch size for processing (default: 1000)
  --older-than-days <n>  Only process records older than N days (default: varies by command)
  --continue-on-error    Continue processing even if errors occur (default: true)
  --verbose              Show detailed output
  --help                 Show this help message

Examples:
  # Generate integrity report
  bun run scripts/data-integrity.ts report

  # Clean up orphaned records (dry run)
  bun run scripts/data-integrity.ts cleanup-orphaned --dry-run

  # Actually clean up old logs older than 180 days
  bun run scripts/data-integrity.ts cleanup-old-logs --no-dry-run --older-than-days 180

  # Fix all issues with custom batch size
  bun run scripts/data-integrity.ts fix-all --no-dry-run --batch-size 500

  # Generate consistency report with verbose output
  bun run scripts/data-integrity.ts consistency-report --verbose
`);
  }
}

// Parse command line arguments
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    return { command: 'help' };
  }

  const options: CLIOptions = {
    command: args[0],
    dryRun: !args.includes('--no-dry-run'),
    verbose: args.includes('--verbose'),
    continueOnError: !args.includes('--no-continue-on-error')
  };

  // Parse numeric options
  const batchSizeIndex = args.indexOf('--batch-size');
  if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
    options.batchSize = parseInt(args[batchSizeIndex + 1], 10);
  }

  const olderThanIndex = args.indexOf('--older-than-days');
  if (olderThanIndex !== -1 && args[olderThanIndex + 1]) {
    options.olderThanDays = parseInt(args[olderThanIndex + 1], 10);
  }

  return options;
}

// Main execution
async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.command === 'help') {
    new DataIntegrityCLI(options).showHelp();
    return;
  }

  const cli = new DataIntegrityCLI(options);
  await cli.run();
}

// Run the CLI
main().catch((error) => {
  console.error('❌ CLI execution failed:', error);
  process.exit(1);
});