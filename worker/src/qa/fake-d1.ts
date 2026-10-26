// worker/src/qa/fake-d1.ts — test-only in-memory D1 stand-in for the qa/*
// modules (oauth.ts, routes.ts, checkpointer.ts, auth.ts rate limiting).
//
// It understands exactly the SQL shapes those modules emit; an unknown
// statement throws, which keeps the fake honest about its coverage. Not
// imported by src/index.ts, so it never ships in the Worker bundle.

type Row = Record<string, string | number | null>;

export class FakeD1 {
  oauthStates = new Map<string, Row>();
  users = new Map<string, Row>();
  sessions = new Map<string, Row>(); // keyed by token_hash
  messages: Row[] = [];
  checkpoints = new Map<string, Row>();
  counters = new Map<string, number>();
  private nextMessageId = 1;

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  allocMessageId(): number {
    return this.nextMessageId++;
  }
}

class FakeStatement {
  private params: unknown[] = [];
  constructor(
    private db: FakeD1,
    private sql: string,
  ) {}

  bind(...params: unknown[]): FakeStatement {
    this.params = params;
    return this;
  }

  private normalized(): string {
    return this.sql.replace(/\s+/g, ' ').trim().toUpperCase();
  }

  private p(i: number): string {
    const v = this.params[i];
    if (typeof v !== 'string') throw new Error(`FakeD1: expected string param ${i}, got ${typeof v}`);
    return v;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.normalized();
    if (sql.startsWith('SELECT STATE_HASH, EXPIRES_AT FROM QA_OAUTH_STATES WHERE STATE_HASH = ?')) {
      return (this.db.oauthStates.get(this.p(0)) as T | undefined) ?? null;
    }
    if (sql.startsWith('SELECT S.GITHUB_ID AS GITHUB_ID,')) {
      const session = this.db.sessions.get(this.p(0));
      if (!session) return null;
      const user = this.db.users.get(session['github_id'] as string);
      if (!user) return null;
      return {
        github_id: session['github_id'],
        expires_at: session['expires_at'],
        login: user['login'],
      } as T;
    }
    if (sql.startsWith('SELECT COUNT(*) AS COUNT FROM QA_MESSAGES')) {
      const count = this.db.messages.filter(
        (m) =>
          m['github_id'] === this.params[0] &&
          m['role'] === 'user' &&
          (m['created_at'] as string) >= (this.params[1] as string),
      ).length;
      return { count } as T;
    }
    if (sql.startsWith('SELECT STATE, UPDATED_AT FROM QA_CHECKPOINTS WHERE THREAD_ID = ?')) {
      return (this.db.checkpoints.get(this.p(0)) as T | undefined) ?? null;
    }
    if (sql.startsWith('INSERT INTO RATE_LIMIT_COUNTERS')) {
      const key = `${this.params[0]}|${this.params[1]}`;
      const count = (this.db.counters.get(key) ?? 0) + 1;
      this.db.counters.set(key, count);
      return { count } as T;
    }
    if (sql.startsWith('INSERT INTO QA_MESSAGES')) {
      // INSERT ... RETURNING id (insertMessage in routes.ts).
      const id = this.db.allocMessageId();
      this.db.messages.push({
        id,
        github_id: this.p(0),
        role: this.p(1),
        content: this.p(2),
        created_at: this.p(3),
      });
      return { id } as T;
    }
    throw new Error(`FakeD1.first: unsupported SQL: ${this.sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = this.normalized();
    if (sql.startsWith('SELECT GITHUB_ID FROM QA_SESSIONS GROUP BY GITHUB_ID HAVING MAX(EXPIRES_AT) < ?')) {
      // Retention sweep: users whose most recent session expired before
      // the cutoff (retention.ts).
      const cutoff = this.p(0);
      const maxByUser = new Map<string, string>();
      for (const s of this.db.sessions.values()) {
        const gid = s['github_id'] as string;
        const exp = s['expires_at'] as string;
        if (exp > (maxByUser.get(gid) ?? '')) maxByUser.set(gid, exp);
      }
      const results = [...maxByUser.entries()]
        .filter(([, max]) => max < cutoff)
        .map(([github_id]) => ({ github_id })) as T[];
      return { results };
    }
    throw new Error(`FakeD1.all: unsupported SQL: ${this.sql}`);
  }

  async run(): Promise<{ success: boolean }> {
    const sql = this.normalized();
    if (sql.startsWith('INSERT INTO QA_OAUTH_STATES')) {
      this.db.oauthStates.set(this.p(0), {
        state_hash: this.p(0),
        created_at: this.p(1),
        expires_at: this.p(2),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_OAUTH_STATES WHERE STATE_HASH = ?')) {
      this.db.oauthStates.delete(this.p(0));
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_USERS')) {
      const githubId = this.p(0);
      const existing = this.db.users.get(githubId);
      this.db.users.set(githubId, {
        github_id: githubId,
        login: this.p(1),
        avatar_url: this.params[2] as string | null,
        created_at: existing?.['created_at'] ?? this.p(3),
        last_seen_at: this.p(4),
      });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_SESSIONS')) {
      this.db.sessions.set(this.p(0), {
        token_hash: this.p(0),
        github_id: this.p(1),
        created_at: this.p(2),
        expires_at: this.p(3),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_SESSIONS WHERE TOKEN_HASH = ?')) {
      this.db.sessions.delete(this.p(0));
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_MESSAGES')) {
      this.db.messages.push({
        id: this.db.allocMessageId(),
        github_id: this.p(0),
        role: this.p(1),
        content: this.p(2),
        created_at: this.p(3),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_MESSAGES WHERE GITHUB_ID = ?')) {
      this.db.messages = this.db.messages.filter((m) => m['github_id'] !== this.params[0]);
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_MESSAGES WHERE ID = ?')) {
      const id = this.params[0] as number;
      this.db.messages = this.db.messages.filter((m) => m['id'] !== id);
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_SESSIONS WHERE GITHUB_ID = ?')) {
      for (const [hash, s] of this.db.sessions) {
        if (s['github_id'] === this.params[0]) this.db.sessions.delete(hash);
      }
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_OAUTH_STATES WHERE EXPIRES_AT < ?')) {
      for (const [hash, s] of this.db.oauthStates) {
        if ((s['expires_at'] as string) < this.p(0)) this.db.oauthStates.delete(hash);
      }
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO QA_CHECKPOINTS')) {
      this.db.checkpoints.set(this.p(0), {
        thread_id: this.p(0),
        state: this.p(1),
        updated_at: this.p(2),
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM QA_CHECKPOINTS WHERE THREAD_ID = ?')) {
      this.db.checkpoints.delete(this.p(0));
      return { success: true };
    }
    throw new Error(`FakeD1.run: unsupported SQL: ${this.sql}`);
  }
}

export const asD1 = (db: FakeD1): D1Database => db as unknown as D1Database;
