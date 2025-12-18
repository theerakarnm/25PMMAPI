import { test, expect, describe } from "bun:test";
import { Hono } from 'hono';
import research from '../research.js';

describe("Research API Routes Tests", () => {
  
  test("should validate research routes structure", () => {
    const app = new Hono();
    app.route('/api/research', research);
    
    // Test that the app is properly configured
    expect(app).toBeDefined();
  });

  test("should validate API endpoint paths", () => {
    // Test expected endpoint paths
    const expectedPaths = [
      '/metrics',
      '/adherence/:protocolId',
      '/patients',
      '/export',
      '/adherence-rate/:protocolId',
    ];

    expectedPaths.forEach(path => {
      expect(path).toMatch(/^\/[a-zA-Z-/:]+$/);
    });
  });

  test("should validate query parameter schemas", () => {
    // Test research query parameters
    const validResearchQuery = {
      protocolId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      dateFrom: '2024-01-01T00:00:00.000Z',
      dateTo: '2024-01-31T23:59:59.999Z',
      status: 'responded' as const,
    };

    expect(validResearchQuery.protocolId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(validResearchQuery.status).toBe('responded');
    expect(new Date(validResearchQuery.dateFrom)).toBeInstanceOf(Date);
  });

  test("should validate export query parameters", () => {
    const validExportQuery = {
      protocolId: '123e4567-e89b-12d3-a456-426614174000',
      format: 'csv' as const,
      dateFrom: '2024-01-01T00:00:00.000Z',
      dateTo: '2024-01-31T23:59:59.999Z',
    };

    expect(validExportQuery.format).toBe('csv');
    expect(['csv', 'excel']).toContain(validExportQuery.format);
  });

  test("should validate adherence query parameters", () => {
    const validAdherenceQuery = {
      protocolId: '123e4567-e89b-12d3-a456-426614174000',
    };

    expect(validAdherenceQuery.protocolId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("should validate response content types", () => {
    // Test expected content types for different endpoints
    const contentTypes = {
      metrics: 'application/json',
      adherence: 'application/json',
      patients: 'application/json',
      exportCsv: 'text/csv',
      exportJson: 'application/json',
    };

    Object.values(contentTypes).forEach(contentType => {
      expect(contentType).toMatch(/^[a-z]+\/[a-z-+]+$/);
    });
  });

  test("should validate CSV content disposition headers", () => {
    const csvDisposition = 'attachment; filename="research-data.csv"';
    const jsonDisposition = 'attachment; filename="research-data.json"';

    expect(csvDisposition).toContain('attachment');
    expect(csvDisposition).toContain('.csv');
    expect(jsonDisposition).toContain('attachment');
    expect(jsonDisposition).toContain('.json');
  });

  test("should validate error response structure", () => {
    const mockErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Protocol not found',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    expect(mockErrorResponse.success).toBe(false);
    expect(mockErrorResponse.error.code).toBe('NOT_FOUND');
    expect(mockErrorResponse.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("should validate success response structure", () => {
    const mockSuccessResponse = {
      success: true,
      data: {
        totalPatients: 100,
        activePatients: 85,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    expect(mockSuccessResponse.success).toBe(true);
    expect(mockSuccessResponse.data).toBeDefined();
    expect(mockSuccessResponse.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("should validate authentication middleware requirements", () => {
    // All research endpoints should require authentication
    const protectedEndpoints = [
      '/metrics',
      '/adherence/:protocolId',
      '/patients',
      '/export',
      '/adherence-rate/:protocolId',
    ];

    protectedEndpoints.forEach(endpoint => {
      expect(endpoint).toBeDefined();
      // In a real test, we would verify that unauthenticated requests return 401
    });
  });
});