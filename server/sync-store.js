/** PostgreSQL-only revision-safe store; ciphertext never appears in SQL text. */
export function createPgSyncStore(pool) {
  if (!pool?.query) throw Error("A PostgreSQL pool is required.");
  return {
    async get(accountKey) {
      const result = await pool.query(
        'SELECT revision, snapshot, updated_at AS "updatedAt" ' +
        "FROM telvyo.sync_snapshots WHERE account_key = $1",
        [accountKey],
      );
      return result.rows[0] || null;
    },
    async save(accountKey, expectedRevision, ciphertext) {
      const version = expectedRevision + 1;
      // Compare-and-swap. Concurrent writers cannot replace unseen changes.
      let result = await pool.query(
        'UPDATE telvyo.sync_snapshots SET revision = $2, snapshot = $3, ' +
        'updated_at = clock_timestamp() WHERE account_key = $1 ' +
        'AND revision = $4 RETURNING revision, updated_at AS "updatedAt"',
        [accountKey, version, ciphertext, expectedRevision],
      );
      if (result.rows.length) return { saved: true, ...result.rows[0] };
      if (expectedRevision === 0) {
        result = await pool.query(
          "INSERT INTO telvyo.sync_snapshots (account_key, revision, snapshot) " +
          'VALUES ($1, 1, $2) ON CONFLICT (account_key) DO NOTHING ' +
          'RETURNING revision, updated_at AS "updatedAt"',
          [accountKey, ciphertext],
        );
        if (result.rows.length) return { saved: true, ...result.rows[0] };
      }
      const current = await this.get(accountKey);
      return { saved: false, revision: Number(current?.revision ?? 0) };
    },
    async clear(accountKey) {
      // Tombstone prevents stale devices with expectedRevision=0 resurrecting
      // the deleted ciphertext. No original ledger data is retained.
      const result = await pool.query(
        "INSERT INTO telvyo.sync_snapshots (account_key, revision, snapshot) " +
        "VALUES ($1, 1, NULL) ON CONFLICT (account_key) " +
        "DO UPDATE SET revision = telvyo.sync_snapshots.revision + 1, " +
        'snapshot = NULL, updated_at = clock_timestamp() ' +
        'RETURNING revision, updated_at AS "updatedAt"',
        [accountKey],
      );
      return result.rows[0];
    },
  };
}
