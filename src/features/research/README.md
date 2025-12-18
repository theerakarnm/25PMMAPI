# Research Dashboard API

This module provides comprehensive research analytics and data export functionality for the Patient Notification System.

## Features

### Dashboard Metrics
- **Endpoint**: `GET /api/research/metrics`
- **Description**: Provides overview statistics for the research dashboard
- **Response**: Total patients, active patients, protocols, adherence rates, and interaction statistics

### Adherence Analytics
- **Endpoint**: `GET /api/research/adherence/:protocolId`
- **Description**: Detailed adherence metrics for a specific protocol
- **Response**: Protocol-specific completion rates, step-by-step metrics, and patient engagement data

### Patient Management
- **Endpoint**: `GET /api/research/patients`
- **Description**: Complete patient list with status and adherence information
- **Response**: Patient details, active protocols, and overall adherence rates

### Data Export
- **Endpoint**: `POST /api/research/export` or `GET /api/research/export`
- **Description**: Export research data in CSV or JSON format
- **Features**: 
  - Filtering by protocol, user, date range, and status
  - CSV format with proper escaping
  - Research-ready data structure

### Adherence Rate Calculation
- **Endpoint**: `GET /api/research/adherence-rate/:protocolId`
- **Description**: Calculate and return adherence rate for a specific protocol
- **Response**: Precise adherence percentage with protocol information

## Data Models

### Dashboard Metrics
```typescript
interface DashboardMetricsResponse {
  totalPatients: number;
  activePatients: number;
  totalProtocols: number;
  activeProtocols: number;
  overallAdherenceRate: number;
  averageResponseTime: number;
  totalInteractions: number;
  respondedInteractions: number;
}
```

### Adherence Metrics
```typescript
interface AdherenceMetricsResponse {
  protocolId: string;
  protocolName: string;
  totalPatients: number;
  activePatients: number;
  completionRate: number;
  averageResponseTime: number;
  stepMetrics: StepMetricResponse[];
}
```

### Research Data Export
```typescript
interface ResearchDataExportResponse {
  patientId: string | null;
  protocolName: string | null;
  stepId: string;
  stepOrder: string | null;
  messageSentTime: Date;
  actionTime: Date | null;
  status: string; // 'Done' or 'Missed'
  timeDifferenceMs: number | null;
  responseValue: string | null;
}
```

## Query Parameters

### Research Query
- `protocolId`: Filter by specific protocol (UUID)
- `userId`: Filter by specific user (UUID)
- `dateFrom`: Start date filter (ISO 8601)
- `dateTo`: End date filter (ISO 8601)
- `status`: Filter by interaction status ('sent', 'delivered', 'read', 'responded', 'missed')

### Export Query
- All research query parameters plus:
- `format`: Export format ('csv' or 'excel')

## Authentication

All research endpoints require authentication via the `authMiddleware`. Ensure valid JWT tokens are provided in requests.

## Error Handling

The API follows standard HTTP status codes:
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `404`: Not Found (protocol/resource not found)
- `500`: Internal Server Error

## Usage Examples

### Get Dashboard Metrics
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/research/metrics
```

### Export Protocol Data as CSV
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"protocolId": "uuid", "format": "csv"}' \
  http://localhost:3001/api/research/export
```

### Get Patient List
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/research/patients
```

## Requirements Validation

This implementation addresses the following requirements:

- **4.1**: Dashboard overview metrics with patient and protocol statistics
- **4.2**: Adherence rate calculation with visual compliance data
- **4.3**: Patient list management with status tracking
- **4.4**: Research data export with CSV/Excel generation
- **4.5**: Timing data preservation with millisecond precision
- **6.4**: Timestamp precision maintenance for research analysis

## Testing

The module includes comprehensive unit tests covering:
- Data structure validation
- CSV generation and escaping
- Adherence rate calculations
- API endpoint validation
- Error handling scenarios

Run tests with:
```bash
bun test src/features/research/__tests__/
```