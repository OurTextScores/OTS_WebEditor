import { test, expect } from '@playwright/test';

/**
 * Embed Integration Tests
 *
 * Tests targeting the test-embed server (port 8080) to validate
 * analytics stub, trace header forwarding, and music proxy behavior.
 * Separate from embed-mode.spec.ts which tests UI against the dev server.
 */

const BASE = 'http://localhost:8080';

test.describe('Analytics Stub', () => {
  test.beforeEach(async ({ request }) => {
    // Clear captured events before each test
    await request.delete(`${BASE}/api/analytics/__test-log`);
  });

  test('POST /api/analytics/events returns 201 with valid payload', async ({ request }) => {
    const response = await request.post(`${BASE}/api/analytics/events`, {
      data: {
        events: [
          { event: 'score_editor_test_event', properties: { foo: 'bar' } },
        ],
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  test('captured events appear in GET /api/analytics/__test-log', async ({ request }) => {
    // Send an event
    await request.post(`${BASE}/api/analytics/events`, {
      data: {
        events: [
          { event: 'score_editor_page_view', properties: { page: '/editor' } },
        ],
      },
    });

    // Retrieve captured events
    const response = await request.get(`${BASE}/api/analytics/__test-log`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].payload.events[0].event).toBe('score_editor_page_view');
  });

  test('DELETE /api/analytics/__test-log clears the log', async ({ request }) => {
    // Send two events
    await request.post(`${BASE}/api/analytics/events`, {
      data: { events: [{ event: 'ev1' }] },
    });
    await request.post(`${BASE}/api/analytics/events`, {
      data: { events: [{ event: 'ev2' }] },
    });

    // Verify two events captured
    let response = await request.get(`${BASE}/api/analytics/__test-log`);
    let body = await response.json();
    expect(body.events).toHaveLength(2);

    // Clear
    const delResponse = await request.delete(`${BASE}/api/analytics/__test-log`);
    expect(delResponse.status()).toBe(200);
    const delBody = await delResponse.json();
    expect(delBody.cleared).toBe(true);

    // Verify empty
    response = await request.get(`${BASE}/api/analytics/__test-log`);
    body = await response.json();
    expect(body.events).toHaveLength(0);
  });
});

test.describe('Trace Header Capture', () => {
  test.beforeEach(async ({ request }) => {
    await request.delete(`${BASE}/api/analytics/__test-log`);
  });

  test('analytics stub captures trace headers from request', async ({ request }) => {
    const traceHeaders = {
      'x-request-id': 'test-req-id-12345',
      'traceparent': '00-abcdef1234567890abcdef1234567890-abcdef1234567890-01',
    };

    await request.post(`${BASE}/api/analytics/events`, {
      data: { events: [{ event: 'trace_test' }] },
      headers: traceHeaders,
    });

    const response = await request.get(`${BASE}/api/analytics/__test-log`);
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].traceHeaders['x-request-id']).toBe('test-req-id-12345');
    expect(body.events[0].traceHeaders['traceparent']).toBe(
      '00-abcdef1234567890abcdef1234567890-abcdef1234567890-01'
    );
  });
});

test.describe('Music Proxy (requires TEST_EMBED_EDITOR_API_ORIGIN)', () => {
  const skip = !process.env.TEST_EMBED_EDITOR_API_ORIGIN;

  test.skip(skip, 'TEST_EMBED_EDITOR_API_ORIGIN not set — skipping music proxy tests');

  test('/api/score-editor/music/__proxy-health returns upstream status', async ({ request }) => {
    const response = await request.get(`${BASE}/api/score-editor/music/__proxy-health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.configured).toBe(true);
  });
});
