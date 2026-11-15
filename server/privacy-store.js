/**
 * PostgreSQL-only consent history for a server-verified, pseudonymous user.
 * The caller injects an existing Pool; never accept account keys from clients.
 */
export function createPgPrivacyStore(pool) {
  if (!pool?.query) throw new Error("A PostgreSQL pool is required.");
  return {
    async latest(accountKey, purpose) {
      const result = await pool.query(
        'SELECT granted, policy_version AS "policyVersion", ' +
        'recorded_at AS at FROM telvyo.consent_events ' +
        'WHERE account_key = $1 AND purpose = $2 ORDER BY id DESC LIMIT 1',
        [accountKey, purpose],
      );
      return result.rows[0] || null;
    },
    async append(accountKey, purpose, granted, policyVersion) {
      const result = await pool.query(
        "INSERT INTO telvyo.consent_events " +
        "(account_key, purpose, granted, policy_version) " +
        "VALUES ($1, $2, $3, $4) RETURNING recorded_at AS at",
        [accountKey, purpose, granted, policyVersion],
      );
      return result.rows[0];
    },
    async clear(accountKey) {
      const result = await pool.query(
        "DELETE FROM telvyo.consent_events WHERE account_key = $1",
        [accountKey],
      );
      return result.rowCount;
    },
  };
}
