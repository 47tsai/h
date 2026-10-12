import { describe, expect, it, vi } from 'vitest';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import worker from './index.js';

function passwordHash(password) {
  const salt = randomBytes(16);
  const iterations = 100_000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function request(body) {
  return new Request('https://worker.example/api/sync', {
    method: 'POST',
    headers: {
      origin: 'https://h.chi.qzz.io',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('Worker sync authentication', () => {
  it('rejects requests without a password before any GitHub access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(request({ action: 'sync', document: {} }), {
      ALLOWED_ORIGIN: 'https://h.chi.qzz.io',
      SYNC_PASSWORD_HASH: passwordHash('a-long-test-password'),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: 'AUTH_FAILED' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects an incorrect password before reading the remote document', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(request({
      action: 'sync',
      password: 'wrong-password',
      document: {},
    }), {
      ALLOWED_ORIGIN: 'https://h.chi.qzz.io',
      SYNC_PASSWORD_HASH: passwordHash('the-correct-test-password'),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: 'AUTH_FAILED' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fails closed when the password hash is not configured', async () => {
    const response = await worker.fetch(request({ action: 'check-auth', password: 'anything' }), {
      ALLOWED_ORIGIN: 'https://h.chi.qzz.io',
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: 'SERVER_NOT_CONFIGURED' });
  });

  it('accepts a correct password for the authentication check', async () => {
    const response = await worker.fetch(request({
      action: 'check-auth',
      password: 'the-correct-test-password',
    }), {
      ALLOWED_ORIGIN: 'https://h.chi.qzz.io',
      SYNC_PASSWORD_HASH: passwordHash('the-correct-test-password'),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
});
