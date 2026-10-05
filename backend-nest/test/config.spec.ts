import * as path from 'node:path';
import { loadConfig } from '../src/config/config';

describe('loadConfig', () => {
  it('fails with a clear message when SECRET_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/SECRET_KEY environment variable is required/);
  });

  it('fails when SECRET_KEY is blank', () => {
    expect(() => loadConfig({ SECRET_KEY: '   ' })).toThrow(/SECRET_KEY/);
  });

  it('applies defaults', () => {
    const config = loadConfig({ SECRET_KEY: 'x' });
    expect(config.port).toBe(8000);
    expect(config.debug).toBe(false);
    expect(config.dbPath).toBe(path.resolve(__dirname, '..', 'db.sqlite3'));
  });

  it('reads PORT, DB_PATH and DEBUG', () => {
    const config = loadConfig({ SECRET_KEY: 'x', PORT: '1234', DB_PATH: '/tmp/some.sqlite3', DEBUG: 'true' });
    expect(config).toMatchObject({ port: 1234, dbPath: '/tmp/some.sqlite3', debug: true });
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ SECRET_KEY: 'x', PORT: 'abc' })).toThrow(/PORT/);
  });
});
