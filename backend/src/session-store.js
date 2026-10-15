import session from 'express-session';

export class PostgresSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  get(sid, callback) {
    this.pool.query('SELECT data FROM teacher_sessions WHERE sid = $1 AND expires_at > NOW()', [sid]).then(result => callback(null, result.rows[0]?.data || null), callback);
  }

  set(sid, data, callback = () => {}) {
    const expires = new Date(data.cookie.expires || Date.now() + 8 * 60 * 60 * 1000);
    this.pool.query('INSERT INTO teacher_sessions(sid, data, expires_at) VALUES ($1, $2, $3) ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at', [sid, JSON.stringify(data), expires]).then(() => callback(null), callback);
  }

  touch(sid, data, callback = () => {}) {
    const expires = new Date(data.cookie.expires || Date.now() + 8 * 60 * 60 * 1000);
    this.pool.query('UPDATE teacher_sessions SET expires_at = $2 WHERE sid = $1', [sid, expires]).then(() => callback(null), callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.query('DELETE FROM teacher_sessions WHERE sid = $1', [sid]).then(() => callback(null), callback);
  }
}
