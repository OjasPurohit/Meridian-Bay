import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig } from '../../config';

const valid = {
  JWT_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgresql://user:hunter2@localhost:5432/champions_club',
};

describe('config', () => {
  it('applies the documented defaults', () => {
    const c = loadConfig(valid);
    assert.equal(c.node_env, 'development');
    assert.equal(c.port, 4000);
    assert.equal(c.jwt_expires_in, '8h');
    assert.equal(c.bcrypt_rounds, 10);
    assert.equal(c.database_ssl, false);
    assert.equal(c.payment_provider, 'mock');
    assert.deepEqual(c.cors_origins, ['http://localhost:5173']);
  });

  it('parses explicit values', () => {
    const c = loadConfig({ ...valid, PORT: '5000', DATABASE_SSL: 'true', CORS_ORIGINS: 'http://a.test, https://b.test ,', BCRYPT_ROUNDS: '4', NODE_ENV: 'test' });
    assert.equal(c.port, 5000);
    assert.equal(c.database_ssl, true);
    assert.deepEqual(c.cors_origins, ['http://a.test', 'https://b.test']);
    assert.equal(c.bcrypt_rounds, 4);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(loadConfig(valid)));
  });

  it('fails fast naming each problem variable', () => {
    assert.throws(() => loadConfig({}), (e: unknown) => {
      assert.ok(e instanceof ConfigError);
      assert.match(e.message, /JWT_SECRET/);
      assert.match(e.message, /DATABASE_URL/);
      return true;
    });
  });

  it('rejects a short JWT secret and a non-postgres URL, without echoing their values', () => {
    const secret = 'short-secret';
    const url = 'mysql://root:topsecretpw@localhost/db';
    try {
      loadConfig({ JWT_SECRET: secret, DATABASE_URL: url });
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof ConfigError);
      assert.match(e.message, /JWT_SECRET: must be at least 32/);
      assert.match(e.message, /DATABASE_URL: must be a postgresql/);
      assert.ok(!e.message.includes(secret));
      assert.ok(!e.message.includes('topsecretpw'));
    }
  });

  it('rejects a truncated DATABASE_URL (no host / database) without echoing it', () => {
    for (const bad of ['postgresql://postgres:s3cretpw@', 'postgresql://postgres:s3cretpw@localhost:5432', 'postgresql://postgres:p@ss#word@localhost:5432/db']) {
      try {
        loadConfig({ ...valid, DATABASE_URL: bad });
        assert.fail(`should have thrown for ${bad.length}-char url`);
      } catch (e) {
        assert.ok(e instanceof ConfigError);
        assert.match(e.message, /DATABASE_URL: is not a complete connection string/);
        assert.ok(!e.message.includes('s3cretpw') && !e.message.includes('p@ss'));
      }
    }
  });

  it('rejects invalid PORT, BCRYPT_ROUNDS, DATABASE_SSL and PAYMENT_PROVIDER', () => {
    assert.throws(() => loadConfig({ ...valid, PORT: '70000' }), /PORT/);
    assert.throws(() => loadConfig({ ...valid, BCRYPT_ROUNDS: '2' }), /BCRYPT_ROUNDS/);
    assert.throws(() => loadConfig({ ...valid, DATABASE_SSL: 'yes' }), /DATABASE_SSL/);
    assert.throws(() => loadConfig({ ...valid, PAYMENT_PROVIDER: 'stripe' }), /PAYMENT_PROVIDER/);
  });

  it('refuses the .env.example placeholder secret in production only', () => {
    const placeholder = 'replace-with-a-long-random-string-at-least-32-chars';
    assert.throws(() => loadConfig({ ...valid, JWT_SECRET: placeholder, NODE_ENV: 'production' }), /JWT_SECRET: must not be the \.env\.example placeholder/);
    assert.doesNotThrow(() => loadConfig({ ...valid, JWT_SECRET: placeholder, NODE_ENV: 'development' }));
  });

  it('treats blank optional variables from .env.example as unset', () => {
    assert.doesNotThrow(() => loadConfig({ ...valid, SUPABASE_URL: '', PAYMENT_PROVIDER_KEY: '', PAYMENT_WEBHOOK_SECRET: '' }));
  });
});
