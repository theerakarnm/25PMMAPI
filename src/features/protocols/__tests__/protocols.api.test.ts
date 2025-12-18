import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import app from '../../../index.js';
import { database } from '../../../core/database/connection.js';
import { admins, protocols, protocolSteps } from '../../../core/database/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('Protocol API Endpoints', () => {
  let adminId: string;
  let authToken: string;

  beforeAll(async () => {
    // Create a test admin user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    const [admin] = await database
      .insert(admins)
      .values({
        email: 'protocol-test@example.com',
        passwordHash: hashedPassword,
        name: 'Protocol Test Admin',
        role: 'admin',
      })
      .returning();
    
    adminId = admin.id;

    // Get auth token
    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'protocol-test@example.com',
        password: 'testpassword',
      }),
    });

    const loginData = await loginResponse.json();
    authToken = loginData.data.token;
  });

  afterAll(async () => {
    // Clean up test data
    await database.delete(protocolSteps);
    await database.delete(protocols);
    await database.delete(admins).where(eq(admins.id, adminId));
  });

  describe('Protocol CRUD Operations', () => {
    let protocolId: string;

    it('should create a new protocol', async () => {
      const protocolData = {
        name: 'Test Protocol',
        description: 'A test protocol for validation',
        createdBy: adminId,
        status: 'draft' as const,
      };

      const response = await app.request('/api/protocols', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(protocolData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        name: protocolData.name,
        description: protocolData.description,
        createdBy: adminId,
        status: 'draft',
      });
      expect(data.data.id).toBeDefined();
      
      protocolId = data.data.id;
    });

    it('should get all protocols', async () => {
      const response = await app.request('/api/protocols', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('should get a specific protocol', async () => {
      const response = await app.request(`/api/protocols/${protocolId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(protocolId);
      expect(data.data.name).toBe('Test Protocol');
    });

    it('should update a protocol', async () => {
      const updateData = {
        name: 'Updated Test Protocol',
        description: 'Updated description',
      };

      const response = await app.request(`/api/protocols/${protocolId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updateData.name);
      expect(data.data.description).toBe(updateData.description);
    });

    it('should validate a protocol', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('isValid');
      expect(data.data).toHaveProperty('errors');
      expect(Array.isArray(data.data.errors)).toBe(true);
    });

    it('should delete a protocol', async () => {
      const response = await app.request(`/api/protocols/${protocolId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Protocol deleted successfully');
    });

    it('should return 404 for non-existent protocol', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      
      const response = await app.request(`/api/protocols/${fakeId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Protocol Steps Operations', () => {
    let protocolId: string;
    let stepId: string;

    beforeAll(async () => {
      // Create a protocol for step testing
      const [protocol] = await database
        .insert(protocols)
        .values({
          name: 'Step Test Protocol',
          description: 'Protocol for testing steps',
          createdBy: adminId,
          status: 'draft',
        })
        .returning();
      
      protocolId = protocol.id;
    });

    it('should create a protocol step', async () => {
      const stepData = {
        stepOrder: '1',
        triggerType: 'immediate' as const,
        triggerValue: '0',
        messageType: 'text' as const,
        contentPayload: { text: 'Hello, this is step 1' },
        requiresAction: false,
      };

      const response = await app.request(`/api/protocols/${protocolId}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(stepData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        protocolId,
        stepOrder: '1',
        triggerType: 'immediate',
        messageType: 'text',
        requiresAction: false,
      });
      expect(data.data.id).toBeDefined();
      
      stepId = data.data.id;
    });

    it('should get all steps for a protocol', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/steps`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(1);
      expect(data.data[0].id).toBe(stepId);
    });

    it('should get a specific protocol step', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/steps/${stepId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(stepId);
      expect(data.data.protocolId).toBe(protocolId);
    });

    it('should update a protocol step', async () => {
      const updateData = {
        contentPayload: { text: 'Updated step content' },
        requiresAction: true,
        feedbackConfig: {
          question: 'Did you complete this task?',
          buttons: [
            { label: 'Yes', value: 'yes', action: 'complete' },
            { label: 'No', value: 'no', action: 'postpone' },
          ],
        },
      };

      const response = await app.request(`/api/protocols/${protocolId}/steps/${stepId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requiresAction).toBe(true);
      expect(data.data.feedbackConfig).toMatchObject(updateData.feedbackConfig);
    });

    it('should get protocol with steps', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/with-steps`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(protocolId);
      expect(data.data.steps).toBeDefined();
      expect(Array.isArray(data.data.steps)).toBe(true);
      expect(data.data.steps.length).toBe(1);
    });

    it('should delete a protocol step', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/steps/${stepId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Protocol step deleted successfully');
    });
  });

  describe('Protocol Activation', () => {
    let protocolId: string;

    beforeAll(async () => {
      // Create a protocol with steps for activation testing
      const [protocol] = await database
        .insert(protocols)
        .values({
          name: 'Activation Test Protocol',
          description: 'Protocol for testing activation',
          createdBy: adminId,
          status: 'draft',
        })
        .returning();
      
      protocolId = protocol.id;

      // Add a step to make it activatable
      await database
        .insert(protocolSteps)
        .values({
          protocolId,
          stepOrder: '1',
          triggerType: 'immediate',
          triggerValue: '0',
          messageType: 'text',
          contentPayload: { text: 'Test step' },
          requiresAction: false,
        });
    });

    it('should activate a protocol with steps', async () => {
      const response = await app.request(`/api/protocols/${protocolId}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('active');
    });

    it('should not activate a protocol without steps', async () => {
      // Create a protocol without steps
      const [emptyProtocol] = await database
        .insert(protocols)
        .values({
          name: 'Empty Protocol',
          description: 'Protocol without steps',
          createdBy: adminId,
          status: 'draft',
        })
        .returning();

      const response = await app.request(`/api/protocols/${emptyProtocol.id}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Cannot activate protocol without steps');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid UUID format', async () => {
      const response = await app.request('/api/protocols/invalid-uuid', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await app.request('/api/protocols', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should validate request body for protocol creation', async () => {
      const invalidData = {
        name: '', // Empty name should fail validation
        createdBy: 'invalid-uuid',
      };

      const response = await app.request('/api/protocols', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(invalidData),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});