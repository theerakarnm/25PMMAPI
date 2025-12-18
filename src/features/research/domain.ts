import { ResearchRepository } from './repository.js';
import type { 
  DashboardMetricsResponse,
  AdherenceMetricsResponse,
  PatientListResponse,
  ResearchDataExportResponse,
  ResearchQuery
} from './interface.js';
import { NotFoundError } from '../../core/errors/app-error.js';

export class ResearchService {
  private repository: ResearchRepository;

  constructor() {
    this.repository = new ResearchRepository();
  }

  async getDashboardMetrics(): Promise<DashboardMetricsResponse> {
    return await this.repository.getDashboardMetrics();
  }

  async getAdherenceMetrics(protocolId: string): Promise<AdherenceMetricsResponse> {
    try {
      return await this.repository.getAdherenceMetrics(protocolId);
    } catch (error: any) {
      if (error.message === 'Protocol not found') {
        throw new NotFoundError('Protocol not found');
      }
      throw error;
    }
  }

  async getPatientList(): Promise<PatientListResponse[]> {
    return await this.repository.getPatientList();
  }

  async exportResearchData(filter: ResearchQuery = {}): Promise<ResearchDataExportResponse[]> {
    return await this.repository.exportResearchData(filter);
  }

  async generateCSV(data: ResearchDataExportResponse[]): Promise<string> {
    if (data.length === 0) {
      return 'PatientID,ProtocolName,StepID,StepOrder,MessageSentTime,ActionTime,Status,TimeDifferenceMs,ResponseValue\n';
    }

    const headers = [
      'PatientID',
      'ProtocolName', 
      'StepID',
      'StepOrder',
      'MessageSentTime',
      'ActionTime',
      'Status',
      'TimeDifferenceMs',
      'ResponseValue'
    ];

    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = [
        this.escapeCsvValue(row.patientId || ''),
        this.escapeCsvValue(row.protocolName || ''),
        this.escapeCsvValue(row.stepId),
        this.escapeCsvValue(row.stepOrder?.toString() || ''),
        this.escapeCsvValue(row.messageSentTime.toISOString()),
        this.escapeCsvValue(row.actionTime?.toISOString() || ''),
        this.escapeCsvValue(row.status),
        this.escapeCsvValue(row.timeDifferenceMs?.toString() || ''),
        this.escapeCsvValue(row.responseValue || ''),
      ];
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async calculateAdherenceRate(protocolId: string): Promise<number> {
    const metrics = await this.getAdherenceMetrics(protocolId);
    
    // Calculate overall adherence rate from step metrics
    const totalSent = metrics.stepMetrics.reduce((sum, step) => sum + step.sentCount, 0);
    const totalResponded = metrics.stepMetrics.reduce((sum, step) => sum + step.responseCount, 0);
    
    return totalSent > 0 ? (totalResponded / totalSent) * 100 : 0;
  }

  async getPatientAdherenceData(userId: string): Promise<{
    overallRate: number;
    protocolRates: Array<{
      protocolId: string;
      protocolName: string;
      adherenceRate: number;
    }>;
  }> {
    // This would require additional repository methods to get user-specific data
    // For now, return a basic structure
    return {
      overallRate: 0,
      protocolRates: [],
    };
  }
}