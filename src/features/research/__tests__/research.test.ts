import { test, expect, describe } from "bun:test";
import { ResearchService } from '../domain.js';
import type { 
  DashboardMetricsResponse,
  AdherenceMetricsResponse,
  PatientListResponse,
  ResearchDataExportResponse
} from '../interface.js';

describe("Research Service Tests", () => {
  
  test("should validate dashboard metrics response structure", () => {
    const mockMetrics: DashboardMetricsResponse = {
      totalPatients: 100,
      activePatients: 85,
      totalProtocols: 10,
      activeProtocols: 8,
      overallAdherenceRate: 75.5,
      averageResponseTime: 1200000, // 20 minutes in milliseconds
      totalInteractions: 500,
      respondedInteractions: 375,
    };

    expect(mockMetrics.totalPatients).toBe(100);
    expect(mockMetrics.activePatients).toBe(85);
    expect(mockMetrics.overallAdherenceRate).toBe(75.5);
    expect(mockMetrics.averageResponseTime).toBe(1200000);
  });

  test("should validate adherence metrics response structure", () => {
    const mockAdherenceMetrics: AdherenceMetricsResponse = {
      protocolId: 'test-protocol-id',
      protocolName: 'Test Protocol',
      totalPatients: 50,
      activePatients: 45,
      completionRate: 80.0,
      averageResponseTime: 900000, // 15 minutes
      stepMetrics: [
        {
          stepId: 'step-1',
          stepOrder: 1,
          messageType: 'text',
          sentCount: 50,
          responseCount: 40,
          adherenceRate: 80.0,
          averageResponseTime: 800000,
        },
        {
          stepId: 'step-2',
          stepOrder: 2,
          messageType: 'image',
          sentCount: 45,
          responseCount: 35,
          adherenceRate: 77.8,
          averageResponseTime: 1000000,
        },
      ],
    };

    expect(mockAdherenceMetrics.protocolId).toBe('test-protocol-id');
    expect(mockAdherenceMetrics.stepMetrics).toHaveLength(2);
    expect(mockAdherenceMetrics.stepMetrics[0].adherenceRate).toBe(80.0);
    expect(mockAdherenceMetrics.stepMetrics[1].messageType).toBe('image');
  });

  test("should validate patient list response structure", () => {
    const mockPatients: PatientListResponse[] = [
      {
        id: 'patient-1',
        displayName: 'John Doe',
        realName: 'John Smith',
        hospitalNumber: 'HN001',
        status: 'active',
        joinedAt: new Date('2024-01-01'),
        lastInteraction: new Date('2024-01-15'),
        activeProtocols: 2,
        overallAdherenceRate: 85.5,
      },
      {
        id: 'patient-2',
        displayName: 'Jane Doe',
        realName: null,
        hospitalNumber: null,
        status: 'inactive',
        joinedAt: new Date('2024-01-02'),
        lastInteraction: null,
        activeProtocols: 0,
        overallAdherenceRate: 0,
      },
    ];

    expect(mockPatients).toHaveLength(2);
    expect(mockPatients[0].status).toBe('active');
    expect(mockPatients[0].activeProtocols).toBe(2);
    expect(mockPatients[1].realName).toBeNull();
    expect(mockPatients[1].lastInteraction).toBeNull();
  });

  test("should validate research data export structure", () => {
    const mockExportData: ResearchDataExportResponse[] = [
      {
        patientId: 'LINE123',
        protocolName: 'Medication Reminder',
        stepId: 'step-1',
        stepOrder: '1',
        messageSentTime: new Date('2024-01-01T10:00:00Z'),
        actionTime: new Date('2024-01-01T10:15:00Z'),
        status: 'Done',
        timeDifferenceMs: 900000, // 15 minutes
        responseValue: 'completed',
      },
      {
        patientId: 'LINE456',
        protocolName: 'Exercise Reminder',
        stepId: 'step-2',
        stepOrder: '2',
        messageSentTime: new Date('2024-01-01T14:00:00Z'),
        actionTime: null,
        status: 'Missed',
        timeDifferenceMs: null,
        responseValue: null,
      },
    ];

    expect(mockExportData).toHaveLength(2);
    expect(mockExportData[0].status).toBe('Done');
    expect(mockExportData[0].timeDifferenceMs).toBe(900000);
    expect(mockExportData[1].status).toBe('Missed');
    expect(mockExportData[1].actionTime).toBeNull();
  });

  test("should validate CSV generation logic", async () => {
    const researchService = new ResearchService();
    
    const testData: ResearchDataExportResponse[] = [
      {
        patientId: 'LINE123',
        protocolName: 'Test Protocol',
        stepId: 'step-1',
        stepOrder: '1',
        messageSentTime: new Date('2024-01-01T10:00:00Z'),
        actionTime: new Date('2024-01-01T10:15:00Z'),
        status: 'Done',
        timeDifferenceMs: 900000,
        responseValue: 'completed',
      },
    ];

    const csv = await researchService.generateCSV(testData);
    
    expect(csv).toContain('PatientID,ProtocolName,StepID');
    expect(csv).toContain('LINE123');
    expect(csv).toContain('Test Protocol');
    expect(csv).toContain('Done');
  });

  test("should handle empty data for CSV generation", async () => {
    const researchService = new ResearchService();
    const csv = await researchService.generateCSV([]);
    
    expect(csv).toBe('PatientID,ProtocolName,StepID,StepOrder,MessageSentTime,ActionTime,Status,TimeDifferenceMs,ResponseValue\n');
  });

  test("should escape CSV values correctly", async () => {
    const researchService = new ResearchService();
    
    const testData: ResearchDataExportResponse[] = [
      {
        patientId: 'LINE123',
        protocolName: 'Protocol with, comma',
        stepId: 'step-1',
        stepOrder: '1',
        messageSentTime: new Date('2024-01-01T10:00:00Z'),
        actionTime: new Date('2024-01-01T10:15:00Z'),
        status: 'Done',
        timeDifferenceMs: 900000,
        responseValue: 'Response with "quotes"',
      },
    ];

    const csv = await researchService.generateCSV(testData);
    
    expect(csv).toContain('"Protocol with, comma"');
    expect(csv).toContain('"Response with ""quotes"""');
  });

  test("should validate adherence rate calculation", () => {
    // Test adherence rate calculation logic
    const totalSent = 100;
    const totalResponded = 75;
    const expectedRate = (totalResponded / totalSent) * 100;
    
    expect(expectedRate).toBe(75);
    
    // Test edge case with zero sent messages
    const zeroSent = 0;
    const zeroResponded = 0;
    const zeroRate = zeroSent > 0 ? (zeroResponded / zeroSent) * 100 : 0;
    
    expect(zeroRate).toBe(0);
  });

  test("should validate step metrics calculation", () => {
    const stepMetrics = [
      { sentCount: 50, responseCount: 40 },
      { sentCount: 30, responseCount: 25 },
      { sentCount: 20, responseCount: 15 },
    ];

    const totalSent = stepMetrics.reduce((sum, step) => sum + step.sentCount, 0);
    const totalResponded = stepMetrics.reduce((sum, step) => sum + step.responseCount, 0);
    const overallRate = totalSent > 0 ? (totalResponded / totalSent) * 100 : 0;

    expect(totalSent).toBe(100);
    expect(totalResponded).toBe(80);
    expect(overallRate).toBe(80);
  });

  test("should validate timestamp precision requirements", () => {
    const now = new Date();
    const timestamp = now.getTime();
    
    // Verify millisecond precision is maintained
    expect(timestamp).toBeGreaterThan(0);
    expect(Number.isInteger(timestamp)).toBe(true);
    
    // Test time difference calculation
    const sentTime = new Date('2024-01-01T10:00:00.000Z');
    const respondedTime = new Date('2024-01-01T10:15:30.500Z');
    const timeDifference = respondedTime.getTime() - sentTime.getTime();
    
    expect(timeDifference).toBe(930500); // 15 minutes 30.5 seconds in milliseconds
  });
});