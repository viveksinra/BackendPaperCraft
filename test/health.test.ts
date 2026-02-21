import './testSetup';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

let buildApp: (() => import('express').Express) | undefined;
let app: import('express').Express;

beforeAll(async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/papercraft';
  process.env.APP_NAME = process.env.APP_NAME || 'PaperCraft';
  process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';
  const mod = await import('../src/api/server');
  buildApp = mod.buildApp;
  app = buildApp();
});

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.myData.status).toBe('ok');
    expect(res.body.meta.requestId).toBeTruthy();
  });
});
