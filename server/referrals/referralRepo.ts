import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabasePool } from '../db/pool.js';
import {
  DEFAULT_REFERRAL_CONFIG,
  calculateReferralPayouts,
  checkReferralBudgetCaps,
  computeTopReferrers,
  evaluateReferralFraudSignals,
  isRealCashTopUpRow,
  isValidVanityReferralCode,
  normalizeReferralCodeInput,
  normalizeReferralConfig,
  normalizeReferralLedgerRow,
  type ReferralLedgerEntry,
  type ReferralPayoutTarget,
  type ReferralProgramConfig,
  type ReferralSummary,
  type ReferredUser,
  type TopReferrerEntry,
} from './referralLogic.js';

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

interface TypedDatabaseClient {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResultLike<T>>;
  release(err?: Error | boolean): void;
}

export class ReferralNotFoundError extends Error {
  constructor(message = 'Record not found.') {
    super(message);
    this.name = 'ReferralNotFoundError';
  }
}

export class ReferralValidationError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ReferralValidationError';
    this.code = code;
  }
}

export class ReferralForbiddenError extends Error {
  constructor(message = 'Access denied.') {
    super(message);
    this.name = 'ReferralForbiddenError';
  }
}

export class ReferralConflictError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CONFLICT') {
    super(message);
    this.name = 'ReferralConflictError';
    this.code = code;
  }
}

interface RawUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  status: string;
  email_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  signup_ip: string | null;
  device_fingerprint: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawWalletRow {
  customer_id: string;
  balance: string | number;
  referral_bonus_balance: string | number;
  free_play_balance?: string | number;
  pending_withdrawal: string | number;
  pending_deposit: string | number;
  total_deposited: string | number;
  total_withdrawn: string | number;
  currency: string;
  updated_at: Date | string;
}

interface RawTopupRow {
  id: string;
  customer_id: string;
  amount: string | number;
  status: string;
  payment_method_id: string;
  created_at: Date | string;
}

interface RawTransactionRow {
  id: string;
  customer_id: string;
  amount: string | number;
  type: string;
  status: string;
  description?: string;
  reference_id: string | null;
  created_at: Date | string;
}

interface RawReferralAwardRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  referral_code_used: string;
  source: string;
  reward_mode: string;
  payout_target: string;
  referrer_reward_amount: string | number;
  referee_reward_amount: string | number;
  qualifying_deposit_id: string | null;
  qualifying_deposit_amount: string | number;
  status: string;
  fraud_flags: unknown;
  staff_reason: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  rewarded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AttributeReferralInput {
  refereeId: string;
  referralCode?: string;
  deviceFingerprint?: string | null;
  signupIp?: string | null;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface AttributeReferralResult {
  success: true;
  organic?: boolean;
  message?: string;
  referrerId?: string;
  referralCodeUsed?: string;
  fraudFlags?: string[];
}

export interface EvaluateReferralInput {
  refereeId: string;
  contextIp?: string | null;
  contextFingerprint?: string | null;
}

export interface EvaluateReferralResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  alreadyFinalized?: boolean;
  alreadyHeld?: boolean;
  depositSynced?: boolean;
  reconciled?: boolean;
  depositTotal?: number;
  minimumRequired?: number;
  qualified?: boolean;
  blocked?: boolean;
  status?: string;
  message?: string;
  error?: string;
  award?: ReferralLedgerEntry | null;
}

export interface ReferralSummaryQueryInput {
  targetUserId: string;
  requestOrigin: string;
  contextIp?: string | null;
}

export interface AdminReferralLedgerQuery {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface AdminReferralLedgerResult {
  success: true;
  awards: ReferralLedgerEntry[];
  topReferrers: TopReferrerEntry[];
  total: number;
  hasMore: boolean;
  stats: {
    totalCount: number;
    heldCount: number;
    rewardedCount: number;
    totalReferrerPaid: number;
    totalFriendPaid: number;
    dailyPaidToday: number;
  };
}

export interface ManualAssignReferralInput {
  refereeId: string;
  referrerQuery: string;
  mode: 'link_only' | 'link_and_reward';
  reason?: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface VanityCodeInput {
  userId: string;
  vanityCode: string;
  actorId: string;
  actorName: string;
}

export interface ReviewReferralInput {
  awardId: string;
  decision: 'approve' | 'reject';
  reviewNotes?: string;
  actorId: string;
  actorName: string;
}

export interface ReconcileReferralsInput {
  userId?: string;
  awardIds?: string[];
  limit: number;
  actorId: string;
  actorName: string;
  actorRole: string;
}

export interface ReconcileReferralsResult {
  success: true;
  scanned: number;
  reconciledCount: number;
  skippedCount: number;
  checkedAwards: number;
  reconciledAwards: number;
  creditedLegs: number;
  totalCreditedAmount: number;
  details: Array<{
    awardId: string;
    referrerId: string;
    refereeId: string;
    referrerCredited: number;
    refereeCredited: number;
    walletBalanceRestored?: number;
    reason?: string;
  }>;
}

function roundMoney(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function toIsoString(val: Date | string | null | undefined, fallbackNow = false): string | undefined {
  if (!val) return fallbackNow ? new Date().toISOString() : undefined;
  if (val instanceof Date) return val.toISOString();
  const parsed = Date.parse(String(val));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(val);
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function normalizeAwardRowForSharedHelper(row: RawReferralAwardRow): Record<string, unknown> {
  let flags: string[] = [];
  if (Array.isArray(row.fraud_flags)) {
    flags = row.fraud_flags.map((f) => String(f));
  } else if (typeof row.fraud_flags === 'string') {
    try {
      const parsed = JSON.parse(row.fraud_flags);
      if (Array.isArray(parsed)) flags = parsed.map((f) => String(f));
    } catch {
      flags = [];
    }
  }
  return {
    ...row,
    fraud_flags: flags,
    rewarded_at: toIsoString(row.rewarded_at) ?? null,
    created_at: toIsoString(row.created_at, true),
    updated_at: toIsoString(row.updated_at, true),
  };
}

function computeRefereeDepositsFromRows(rows: RawTopupRow[]): {
  realDepositTotal: number;
  qualifyingDepositId: string | null;
  qualifyingDepositAmount: number;
} {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(toIsoString(a.created_at, true)!).getTime() -
      new Date(toIsoString(b.created_at, true)!).getTime(),
  );
  let realDepositTotal = 0;
  let qualifyingDepositId: string | null = null;
  let qualifyingDepositAmount = 0;

  for (const row of sorted) {
    if (!isRealCashTopUpRow(row)) continue;
    const amt = roundMoney(row.amount);
    if (amt <= 0) continue;
    realDepositTotal = roundMoney(realDepositTotal + amt);
    if (!qualifyingDepositId) {
      qualifyingDepositId = String(row.id);
    }
    qualifyingDepositAmount = realDepositTotal;
  }

  return {
    realDepositTotal,
    qualifyingDepositId,
    qualifyingDepositAmount,
  };
}

function getAwardCreditedStatus(
  awardId: string,
  txRows: RawTransactionRow[],
  referrerId: string,
  refereeId: string,
): {
  referrerCredited: boolean;
  refereeCredited: boolean;
  referrerAmount: number;
  refereeAmount: number;
  referrerTxId?: string;
  refereeTxId?: string;
} {
  const completedRefTxs = txRows.filter(
    (tx) => tx.type === 'referral_reward' && String(tx.status || '').toLowerCase() === 'completed',
  );
  const refTx = completedRefTxs.find(
    (tx) =>
      tx.id === `tx_ref_r_${awardId}` ||
      (tx.reference_id === awardId && tx.customer_id === referrerId),
  );
  const eeTx = completedRefTxs.find(
    (tx) =>
      tx.id === `tx_ref_f_${awardId}` ||
      (tx.reference_id === awardId && tx.customer_id === refereeId),
  );

  return {
    referrerCredited: Boolean(refTx),
    refereeCredited: Boolean(eeTx),
    referrerAmount: refTx ? roundMoney(refTx.amount) : 0,
    refereeAmount: eeTx ? roundMoney(eeTx.amount) : 0,
    referrerTxId: refTx ? String(refTx.id) : undefined,
    refereeTxId: eeTx ? String(eeTx.id) : undefined,
  };
}

export class ReferralRepo {
  private readonly pool: Pick<TypedDatabaseClient, 'query'> &
    Partial<Pick<DatabasePool, 'connect'>>;

  constructor(
    pool: Pick<DatabasePool, 'query'> & Partial<Pick<DatabasePool, 'connect'>>,
  ) {
    this.pool = pool as unknown as Pick<TypedDatabaseClient, 'query'> &
      Partial<Pick<DatabasePool, 'connect'>>;
  }

  private async withTransaction<T>(
    fn: (client: TypedDatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect === 'function') {
      const client = (await this.pool.connect()) as unknown as TypedDatabaseClient;
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore secondary rollback failure
        }
        throw err;
      } finally {
        client.release();
      }
    }

    const fallbackClient: TypedDatabaseClient = {
      query: <T = Record<string, unknown>>(text: string, values?: unknown[]) =>
        this.pool.query<T>(text, values),
      release: () => {},
    };
    await fallbackClient.query('BEGIN');
    try {
      const result = await fn(fallbackClient);
      await fallbackClient.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await fallbackClient.query('ROLLBACK');
      } catch {
        // Ignore secondary rollback failure
      }
      throw err;
    }
  }

  private async loadConfig(db: Pick<TypedDatabaseClient, 'query'>): Promise<ReferralProgramConfig> {
    const res = await db.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1`,
    );
    const data = res.rows[0]?.data;
    return normalizeReferralConfig(data?.referralProgram || DEFAULT_REFERRAL_CONFIG);
  }

  private async insertAuditLog(
    db: Pick<TypedDatabaseClient, 'query'>,
    input: {
      actorId: string;
      actorName: string;
      actorRole: string;
      action: string;
      entityType: string;
      entityId: string;
      details: string;
    },
  ): Promise<void> {
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.query(
      `INSERT INTO public.audit_logs (
         id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, timezone('utc'::text, now()))`,
      [
        id,
        input.actorId,
        input.actorName,
        input.actorRole,
        input.action,
        input.entityType,
        input.entityId,
        input.details,
      ],
    );
  }

  private async maybeInsertNotification(
    db: Pick<TypedDatabaseClient, 'query'>,
    input: {
      id: string;
      userId: string;
      title: string;
      message: string;
      type: string;
      linkTab: string;
      linkRequestId?: string;
    },
  ): Promise<void> {
    const regRes = await db.query<{ reg: string | null }>(
      `SELECT to_regclass('public.notifications') AS reg`,
    );
    if (!regRes.rows[0]?.reg) return;
    await db.query(
      `INSERT INTO public.notifications (
         id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, timezone('utc'::text, now()))
       ON CONFLICT (id) DO NOTHING`,
      [
        input.id,
        input.userId,
        input.title,
        input.message,
        input.type,
        input.linkTab,
        input.linkRequestId ?? null,
      ],
    );
  }

  private async computeBudgetUsage(
    db: Pick<TypedDatabaseClient, 'query'>,
    referrerId: string,
  ): Promise<{ referrerRewardedCount: number; dailyTotalPaidToday: number }> {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const [countRes, todayRes] = await Promise.all([
      db.query<{ cnt: string | number }>(
        `SELECT COUNT(*)::int AS cnt
         FROM public.referral_awards
         WHERE referrer_id = $1 AND status = 'rewarded'`,
        [referrerId],
      ),
      db.query<{
        referrer_reward_amount: string | number;
        referee_reward_amount: string | number;
      }>(
        `SELECT referrer_reward_amount, referee_reward_amount
         FROM public.referral_awards
         WHERE status = 'rewarded'
           AND rewarded_at >= ($1::date)::timestamptz
           AND rewarded_at < (($1::date + INTERVAL '1 day'))::timestamptz`,
        [todayPrefix],
      ),
    ]);

    const referrerRewardedCount = Number(countRes.rows[0]?.cnt ?? 0);
    const dailyTotalPaidToday = roundMoney(
      todayRes.rows.reduce(
        (sum, row) =>
          sum +
          roundMoney(row.referrer_reward_amount) +
          roundMoney(row.referee_reward_amount),
        0,
      ),
    );
    return { referrerRewardedCount, dailyTotalPaidToday };
  }

  private async resolveUserByIdentifier(
    db: Pick<TypedDatabaseClient, 'query'>,
    identifier: string,
  ): Promise<RawUserRow | null> {
    const clean = String(identifier || '').trim();
    if (!clean) return null;

    const byId = await db.query<RawUserRow>(
      `SELECT id, email, display_name, role, phone, status, email_verified,
              referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
       FROM public.users
       WHERE id = $1
       LIMIT 1`,
      [clean],
    );
    if (byId.rows[0]) return byId.rows[0];

    if (clean.includes('@')) {
      const byEmail = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE lower(email) = $1
         LIMIT 1`,
        [clean.toLowerCase()],
      );
      if (byEmail.rows[0]) return byEmail.rows[0];
    }

    const normalizedCode = normalizeReferralCodeInput(clean);
    if (normalizedCode) {
      const byCode = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE upper(referral_code) = upper($1)
         LIMIT 1`,
        [normalizedCode],
      );
      if (byCode.rows[0]) return byCode.rows[0];
    }

    return null;
  }

  private async creditReferralAwardInTx(
    db: TypedDatabaseClient,
    params: {
      awardId: string;
      referrerId: string;
      refereeId: string;
      referralCodeUsed: string;
      source: string;
      rewardMode: string;
      payoutTarget: ReferralPayoutTarget;
      referrerRewardAmount: number;
      refereeRewardAmount: number;
      qualifyingDepositId: string | null;
      qualifyingDepositAmount: number;
      fraudFlags: string[];
      staffReason?: string | null;
      assignedBy?: string | null;
      assignedByName?: string | null;
      reviewedBy?: string | null;
      reviewedByName?: string | null;
      reviewNotes?: string | null;
      referrerDescription: string;
      refereeDescription: string;
      referrerNotifTitle: string;
      referrerNotifMessage: string;
      refereeNotifTitle: string;
      refereeNotifMessage: string;
    },
  ): Promise<{
    alreadyFinalized: boolean;
    awardRow: RawReferralAwardRow;
  }> {
    const existingRes = await db.query<RawReferralAwardRow>(
      `SELECT * FROM public.referral_awards WHERE id = $1 FOR UPDATE`,
      [params.awardId],
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status === 'rewarded') {
      return { alreadyFinalized: true, awardRow: existing };
    }

    const refAmt = roundMoney(Math.max(0, params.referrerRewardAmount));
    const eeAmt = roundMoney(Math.max(0, params.refereeRewardAmount));
    const targetCol =
      params.payoutTarget === 'available_balance' ? 'balance' : 'referral_bonus_balance';
    const refTxId = `tx_ref_r_${params.awardId}`;
    const eeTxId = `tx_ref_f_${params.awardId}`;

    // Deadlock-free ordered wallet provisioning + locking
    const walletIds = Array.from(new Set([params.referrerId, params.refereeId])).sort();
    for (const cid of walletIds) {
      await db.query(
        `INSERT INTO public.wallets (
           customer_id, balance, referral_bonus_balance, free_play_balance,
           pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
           currency, updated_at
         ) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 'USD', timezone('utc'::text, now()))
         ON CONFLICT (customer_id) DO NOTHING`,
        [cid],
      );
      await db.query(
        `SELECT customer_id FROM public.wallets WHERE customer_id = $1 FOR UPDATE`,
        [cid],
      );
    }

    const existingTxsRes = await db.query<RawTransactionRow>(
      `SELECT id, customer_id, amount, type, status, reference_id, created_at
       FROM public.transactions
       WHERE (reference_id = $1 AND type = 'referral_reward')
          OR id IN ($2, $3)`,
      [params.awardId, refTxId, eeTxId],
    );
    const credited = getAwardCreditedStatus(
      params.awardId,
      existingTxsRes.rows,
      params.referrerId,
      params.refereeId,
    );

    if (refAmt > 0 && !credited.referrerCredited) {
      await db.query(
        `UPDATE public.wallets
         SET ${targetCol} = ${targetCol} + $2,
             updated_at = timezone('utc'::text, now())
         WHERE customer_id = $1`,
        [params.referrerId, refAmt],
      );
      await db.query(
        `INSERT INTO public.transactions (
           id, customer_id, amount, type, status, description, reference_id, game_name, created_at
         ) VALUES ($1, $2, $3, 'referral_reward', 'completed', $4, $5, 'Swift Sweeps Referral', timezone('utc'::text, now()))
         ON CONFLICT (id) DO UPDATE SET
           amount = EXCLUDED.amount,
           status = 'completed',
           description = EXCLUDED.description,
           reference_id = EXCLUDED.reference_id,
           game_name = EXCLUDED.game_name,
           created_at = EXCLUDED.created_at`,
        [refTxId, params.referrerId, refAmt, params.referrerDescription, params.awardId],
      );
      await this.maybeInsertNotification(db, {
        id: `notif_ref_r_${params.awardId}`,
        userId: params.referrerId,
        title: params.referrerNotifTitle,
        message: params.referrerNotifMessage,
        type: 'referral',
        linkTab: 'referrals',
        linkRequestId: params.awardId,
      });
    }

    if (eeAmt > 0 && !credited.refereeCredited) {
      await db.query(
        `UPDATE public.wallets
         SET ${targetCol} = ${targetCol} + $2,
             updated_at = timezone('utc'::text, now())
         WHERE customer_id = $1`,
        [params.refereeId, eeAmt],
      );
      await db.query(
        `INSERT INTO public.transactions (
           id, customer_id, amount, type, status, description, reference_id, game_name, created_at
         ) VALUES ($1, $2, $3, 'referral_reward', 'completed', $4, $5, 'Swift Sweeps Referral', timezone('utc'::text, now()))
         ON CONFLICT (id) DO UPDATE SET
           amount = EXCLUDED.amount,
           status = 'completed',
           description = EXCLUDED.description,
           reference_id = EXCLUDED.reference_id,
           game_name = EXCLUDED.game_name,
           created_at = EXCLUDED.created_at`,
        [eeTxId, params.refereeId, eeAmt, params.refereeDescription, params.awardId],
      );
      await this.maybeInsertNotification(db, {
        id: `notif_ref_f_${params.awardId}`,
        userId: params.refereeId,
        title: params.refereeNotifTitle,
        message: params.refereeNotifMessage,
        type: 'referral',
        linkTab: 'wallet',
        linkRequestId: params.awardId,
      });
    }

    const upsertRes = await db.query<RawReferralAwardRow>(
      `INSERT INTO public.referral_awards (
         id, referrer_id, referee_id, referral_code_used, source, reward_mode, payout_target,
         referrer_reward_amount, referee_reward_amount, qualifying_deposit_id, qualifying_deposit_amount,
         status, fraud_flags, staff_reason, assigned_by, assigned_by_name,
         reviewed_by, reviewed_by_name, review_notes, rewarded_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         'rewarded', $12::jsonb, $13, $14, $15,
         $16, $17, $18, timezone('utc'::text, now()), timezone('utc'::text, now()), timezone('utc'::text, now())
       )
       ON CONFLICT (id) DO UPDATE SET
         referrer_id = EXCLUDED.referrer_id,
         referee_id = EXCLUDED.referee_id,
         referral_code_used = EXCLUDED.referral_code_used,
         source = EXCLUDED.source,
         reward_mode = EXCLUDED.reward_mode,
         payout_target = EXCLUDED.payout_target,
         referrer_reward_amount = EXCLUDED.referrer_reward_amount,
         referee_reward_amount = EXCLUDED.referee_reward_amount,
         qualifying_deposit_id = COALESCE(EXCLUDED.qualifying_deposit_id, public.referral_awards.qualifying_deposit_id),
         qualifying_deposit_amount = GREATEST(public.referral_awards.qualifying_deposit_amount, EXCLUDED.qualifying_deposit_amount),
         status = 'rewarded',
         fraud_flags = EXCLUDED.fraud_flags,
         staff_reason = COALESCE(EXCLUDED.staff_reason, public.referral_awards.staff_reason),
         assigned_by = COALESCE(EXCLUDED.assigned_by, public.referral_awards.assigned_by),
         assigned_by_name = COALESCE(EXCLUDED.assigned_by_name, public.referral_awards.assigned_by_name),
         reviewed_by = COALESCE(EXCLUDED.reviewed_by, public.referral_awards.reviewed_by),
         reviewed_by_name = COALESCE(EXCLUDED.reviewed_by_name, public.referral_awards.reviewed_by_name),
         review_notes = COALESCE(EXCLUDED.review_notes, public.referral_awards.review_notes),
         rewarded_at = COALESCE(public.referral_awards.rewarded_at, timezone('utc'::text, now())),
         updated_at = timezone('utc'::text, now())
       RETURNING *`,
      [
        params.awardId,
        params.referrerId,
        params.refereeId,
        params.referralCodeUsed,
        params.source,
        params.rewardMode,
        params.payoutTarget,
        refAmt,
        eeAmt,
        params.qualifyingDepositId,
        roundMoney(params.qualifyingDepositAmount),
        JSON.stringify(params.fraudFlags ?? []),
        params.staffReason ?? null,
        params.assignedBy ?? null,
        params.assignedByName ?? null,
        params.reviewedBy ?? null,
        params.reviewedByName ?? null,
        params.reviewNotes ?? null,
      ],
    );

    return {
      alreadyFinalized: false,
      awardRow: upsertRes.rows[0]!,
    };
  }

  public async attributeSignupReferral(
    input: AttributeReferralInput,
  ): Promise<AttributeReferralResult> {
    const isStaff = input.actorRole === 'admin' || input.actorRole === 'agent';
    if (!isStaff && input.refereeId !== input.actorId) {
      throw new ReferralForbiddenError(
        'Access Denied: You can only attribute a referral code to your own account.',
      );
    }

    const rawCode = normalizeReferralCodeInput(input.referralCode);

    return this.withTransaction(async (db) => {
      const refRes = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [input.refereeId],
      );
      const referee = refRes.rows[0];
      if (!referee) {
        throw new ReferralNotFoundError('Player account not found.');
      }

      const nextIp =
        input.signupIp && !referee.signup_ip ? input.signupIp : referee.signup_ip;
      const nextFp =
        input.deviceFingerprint && !referee.device_fingerprint
          ? input.deviceFingerprint.slice(0, 128)
          : referee.device_fingerprint;

      if (nextIp !== referee.signup_ip || nextFp !== referee.device_fingerprint) {
        await db.query(
          `UPDATE public.users
           SET signup_ip = COALESCE($2, signup_ip),
               device_fingerprint = COALESCE($3, device_fingerprint),
               updated_at = timezone('utc'::text, now())
           WHERE id = $1`,
          [referee.id, nextIp, nextFp],
        );
      }

      if (!rawCode) {
        return {
          success: true,
          organic: true,
          message: 'No referral code provided.',
        };
      }

      if (
        referee.referred_by &&
        normalizeReferralCodeInput(referee.referred_by) !== rawCode
      ) {
        throw new ReferralConflictError(
          'This player already has a referral code attached.',
          'ALREADY_ATTRIBUTED',
        );
      }

      const referrerRes = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE upper(referral_code) = upper($1)
         LIMIT 1`,
        [rawCode],
      );
      const referrer = referrerRes.rows[0];
      if (!referrer) {
        throw new ReferralNotFoundError(`Referral code "${rawCode}" was not found.`);
      }

      const config = await this.loadConfig(db);
      const contactRes = await db.query<Pick<RawUserRow, 'id' | 'email' | 'phone'>>(
        `SELECT id, email, phone FROM public.users LIMIT 200`,
      );

      const fraud = evaluateReferralFraudSignals({
        referrer: {
          id: referrer.id,
          email: referrer.email,
          phone: referrer.phone ?? undefined,
          signupIp: referrer.signup_ip ?? undefined,
          deviceFingerprint: referrer.device_fingerprint ?? undefined,
        },
        referee: {
          id: referee.id,
          email: referee.email,
          phone: referee.phone ?? undefined,
          signupIp: nextIp ?? undefined,
          deviceFingerprint: nextFp ?? undefined,
        },
        otherUsers: contactRes.rows.map((u) => ({
          id: u.id,
          email: u.email,
          phone: u.phone ?? undefined,
        })),
        config,
        contextIp: input.signupIp ?? undefined,
        contextFingerprint: input.deviceFingerprint ?? undefined,
      });

      if (fraud.blocked) {
        throw new ReferralValidationError(
          fraud.blockReason || 'Referral attribution rejected.',
          fraud.blockCode || 'REFERRAL_BLOCKED',
        );
      }

      const resolvedCode = normalizeReferralCodeInput(referrer.referral_code) || rawCode;
      await db.query(
        `UPDATE public.users
         SET referred_by = $2,
             updated_at = timezone('utc'::text, now())
         WHERE id = $1`,
        [referee.id, resolvedCode],
      );

      const existingAwardRes = await db.query<RawReferralAwardRow>(
        `SELECT * FROM public.referral_awards WHERE referee_id = $1 FOR UPDATE`,
        [referee.id],
      );
      if (!existingAwardRes.rows[0]) {
        const awardId = `refaw_${referee.id}`;
        await db.query(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_amount, status, fraud_flags, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, 'signup_link', $5,
             $6, 0, 0,
             0, 'registered', $7::jsonb, timezone('utc'::text, now()), timezone('utc'::text, now())
           )`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedCode,
            config.rewardMode,
            config.payoutTarget,
            JSON.stringify(fraud.fraudFlags),
          ],
        );
      }

      await this.insertAuditLog(db, {
        actorId: referee.id,
        actorName: referee.display_name || referee.email || 'Player',
        actorRole: referee.role || 'customer',
        action: 'REFERRAL_ATTRIBUTED_SIGNUP',
        entityType: 'user',
        entityId: referee.id,
        details: `Linked signup attribution for ${referee.email} under referrer ${referrer.display_name} (${resolvedCode}).${fraud.fraudFlags.length > 0 ? ` Signals: ${fraud.fraudFlags.join(', ')}` : ''}`,
      });

      return {
        success: true,
        referrerId: referrer.id,
        referralCodeUsed: resolvedCode,
        fraudFlags: fraud.fraudFlags,
      };
    });
  }

  public async evaluateReferralQualification(
    input: EvaluateReferralInput,
  ): Promise<EvaluateReferralResult> {
    let reconcileNeededAwardId: string | null = null;

    const txResult = await this.withTransaction<EvaluateReferralResult>(async (db) => {
      const config = await this.loadConfig(db);
      if (!config.enabled) {
        return { success: true, skipped: true, reason: 'Referral program disabled.' };
      }

      const refRes = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [input.refereeId],
      );
      const referee = refRes.rows[0];
      if (!referee) {
        throw new ReferralNotFoundError('Player account not found.');
      }

      const existingAwardRes = await db.query<RawReferralAwardRow>(
        `SELECT * FROM public.referral_awards WHERE referee_id = $1 FOR UPDATE`,
        [referee.id],
      );
      const existingAward = existingAwardRes.rows[0];

      const topupsRes = await db.query<RawTopupRow>(
        `SELECT id, customer_id, amount, status, payment_method_id, created_at
         FROM public.topups
         WHERE customer_id = $1
         ORDER BY created_at ASC`,
        [referee.id],
      );
      const depositProgress = computeRefereeDepositsFromRows(topupsRes.rows);

      if (
        existingAward &&
        (existingAward.status === 'rewarded' ||
          existingAward.status === 'rejected' ||
          existingAward.status === 'capped' ||
          existingAward.status === 'held_for_review')
      ) {
        let syncedAward = existingAward;
        const storedDeposit = roundMoney(existingAward.qualifying_deposit_amount);
        const nextDepositId =
          depositProgress.qualifyingDepositId || existingAward.qualifying_deposit_id || null;

        if (
          depositProgress.realDepositTotal !== storedDeposit ||
          (nextDepositId && nextDepositId !== existingAward.qualifying_deposit_id)
        ) {
          const upd = await db.query<RawReferralAwardRow>(
            `UPDATE public.referral_awards
             SET qualifying_deposit_amount = $2,
                 qualifying_deposit_id = $3,
                 updated_at = timezone('utc'::text, now())
             WHERE id = $1
             RETURNING *`,
            [existingAward.id, depositProgress.realDepositTotal, nextDepositId],
          );
          if (upd.rows[0]) syncedAward = upd.rows[0];
        }

        if (syncedAward.status === 'rewarded') {
          reconcileNeededAwardId = syncedAward.id;
        }

        return {
          success: true,
          alreadyFinalized: syncedAward.status !== 'held_for_review',
          alreadyHeld: syncedAward.status === 'held_for_review',
          depositSynced: true,
          reconciled: false,
          depositTotal: depositProgress.realDepositTotal,
          status: syncedAward.status,
          award: normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(syncedAward)),
        };
      }

      const refCode = normalizeReferralCodeInput(
        existingAward?.referral_code_used || referee.referred_by,
      );
      if (!existingAward && !refCode) {
        return { success: true, skipped: true, reason: 'No referrer attributed.' };
      }

      let referrer: RawUserRow | undefined;
      if (existingAward?.referrer_id) {
        const r = await db.query<RawUserRow>(
          `SELECT id, email, display_name, role, phone, status, email_verified,
                  referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
           FROM public.users
           WHERE id = $1
           LIMIT 1`,
          [existingAward.referrer_id],
        );
        referrer = r.rows[0];
      } else if (refCode) {
        const r = await db.query<RawUserRow>(
          `SELECT id, email, display_name, role, phone, status, email_verified,
                  referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
           FROM public.users
           WHERE upper(referral_code) = upper($1)
           LIMIT 1`,
          [refCode],
        );
        referrer = r.rows[0];
      }

      if (!referrer) {
        return { success: true, skipped: true, reason: 'Referrer profile unavailable.' };
      }

      const awardId = existingAward?.id || `refaw_${referee.id}`;
      const existingFlags = existingAward
        ? (normalizeAwardRowForSharedHelper(existingAward).fraud_flags as string[])
        : [];
      const resolvedRefCode = normalizeReferralCodeInput(referrer.referral_code) || refCode;

      if (config.requireEmailVerified && !referee.email_verified) {
        await db.query(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, 0, 0,
             $8, $9, 'registered', $10::jsonb,
             timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'registered',
             updated_at = timezone('utc'::text, now())`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            existingAward?.source || 'signup_link',
            config.rewardMode,
            config.payoutTarget,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(existingFlags),
          ],
        );
        return {
          success: true,
          qualified: false,
          status: 'registered',
          depositTotal: depositProgress.realDepositTotal,
        };
      }

      if (depositProgress.realDepositTotal < config.qualificationDepositMin) {
        await db.query(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, 0, 0,
             $8, $9, 'pending_deposit', $10::jsonb,
             timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'pending_deposit',
             updated_at = timezone('utc'::text, now())`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            existingAward?.source || 'signup_link',
            config.rewardMode,
            config.payoutTarget,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(existingFlags),
          ],
        );
        return {
          success: true,
          qualified: false,
          status: 'pending_deposit',
          depositTotal: depositProgress.realDepositTotal,
          minimumRequired: config.qualificationDepositMin,
        };
      }

      const otherUsersRes = await db.query<Pick<RawUserRow, 'id' | 'email' | 'phone'>>(
        `SELECT id, email, phone FROM public.users LIMIT 200`,
      );
      const fraud = evaluateReferralFraudSignals({
        referrer: {
          id: referrer.id,
          email: referrer.email,
          phone: referrer.phone ?? undefined,
          signupIp: referrer.signup_ip ?? undefined,
          deviceFingerprint: referrer.device_fingerprint ?? undefined,
        },
        referee: {
          id: referee.id,
          email: referee.email,
          phone: referee.phone ?? undefined,
          signupIp: referee.signup_ip ?? undefined,
          deviceFingerprint: referee.device_fingerprint ?? undefined,
        },
        otherUsers: otherUsersRes.rows.map((u) => ({
          id: u.id,
          email: u.email,
          phone: u.phone ?? undefined,
        })),
        config,
        contextIp: input.contextIp ?? undefined,
        contextFingerprint: input.contextFingerprint ?? undefined,
      });

      const combinedFlags = Array.from(new Set([...existingFlags, ...fraud.fraudFlags]));

      if (fraud.blocked) {
        await db.query(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             review_notes, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, 0, 0,
             $8, $9, 'rejected', $10::jsonb,
             $11, timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'rejected',
             fraud_flags = EXCLUDED.fraud_flags,
             review_notes = EXCLUDED.review_notes,
             updated_at = timezone('utc'::text, now())`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            existingAward?.source || 'signup_link',
            config.rewardMode,
            config.payoutTarget,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(combinedFlags),
            fraud.blockReason || 'Auto-blocked by anti-fraud policy.',
          ],
        );
        await this.insertAuditLog(db, {
          actorId: 'system',
          actorName: 'Referral Fraud Guard',
          actorRole: 'admin',
          action: 'REFERRAL_AUTO_BLOCKED',
          entityType: 'user',
          entityId: referee.id,
          details: `${fraud.blockReason} (Referrer: ${referrer.email})`,
        });
        return {
          success: false,
          blocked: true,
          status: 'rejected',
          error: fraud.blockReason,
        };
      }

      const depositBasis =
        depositProgress.qualifyingDepositAmount || depositProgress.realDepositTotal;
      const payouts = calculateReferralPayouts(config, depositBasis);
      const budget = await this.computeBudgetUsage(db, referrer.id);
      const capCheck = checkReferralBudgetCaps({
        config,
        referrerRewardedCount: budget.referrerRewardedCount,
        dailyTotalPaidToday: budget.dailyTotalPaidToday,
        payoutTotal: payouts.totalAmount,
      });

      if (!capCheck.allowed) {
        await db.query(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             review_notes, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, 0, 0,
             $8, $9, 'capped', $10::jsonb,
             $11, timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'capped',
             fraud_flags = EXCLUDED.fraud_flags,
             review_notes = EXCLUDED.review_notes,
             updated_at = timezone('utc'::text, now())`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            existingAward?.source || 'signup_link',
            config.rewardMode,
            config.payoutTarget,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(combinedFlags),
            capCheck.capReason || 'Budget cap reached.',
          ],
        );
        return {
          success: true,
          status: 'capped',
          message: capCheck.capReason,
        };
      }

      if (fraud.shouldHold || (combinedFlags.length > 0 && config.holdFlaggedForReview)) {
        const heldRes = await db.query<RawReferralAwardRow>(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             review_notes, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9,
             $10, $11, 'held_for_review', $12::jsonb,
             $13, timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             referrer_reward_amount = EXCLUDED.referrer_reward_amount,
             referee_reward_amount = EXCLUDED.referee_reward_amount,
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'held_for_review',
             fraud_flags = EXCLUDED.fraud_flags,
             review_notes = EXCLUDED.review_notes,
             updated_at = timezone('utc'::text, now())
           RETURNING *`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            existingAward?.source || 'signup_link',
            config.rewardMode,
            config.payoutTarget,
            payouts.referrerAmount,
            payouts.refereeAmount,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(combinedFlags),
            `Held automatically due to anti-fraud signal(s): ${combinedFlags.join(', ')}`,
          ],
        );
        await this.insertAuditLog(db, {
          actorId: 'system',
          actorName: 'Referral Fraud Guard',
          actorRole: 'admin',
          action: 'REFERRAL_HELD_FOR_REVIEW',
          entityType: 'user',
          entityId: referee.id,
          details: `Held referral reward ($${payouts.referrerAmount.toFixed(2)} / $${payouts.refereeAmount.toFixed(2)}) between ${referrer.display_name} and ${referee.display_name}. Flags: ${combinedFlags.join(', ')}`,
        });
        return {
          success: true,
          status: 'held_for_review',
          award: heldRes.rows[0]
            ? normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(heldRes.rows[0]))
            : null,
        };
      }

      const creditRes = await this.creditReferralAwardInTx(db, {
        awardId,
        referrerId: referrer.id,
        refereeId: referee.id,
        referralCodeUsed: resolvedRefCode,
        source: existingAward?.source || 'signup_link',
        rewardMode: config.rewardMode,
        payoutTarget: config.payoutTarget,
        referrerRewardAmount: payouts.referrerAmount,
        refereeRewardAmount: payouts.refereeAmount,
        qualifyingDepositId: depositProgress.qualifyingDepositId,
        qualifyingDepositAmount: depositProgress.realDepositTotal,
        fraudFlags: combinedFlags,
        referrerDescription: `Referral Reward: ${referee.display_name || referee.email} verified email & deposited $${depositProgress.realDepositTotal.toFixed(2)}`,
        refereeDescription: `Welcome Referral Bonus: Qualified under code ${resolvedRefCode}`,
        referrerNotifTitle: 'Referral Reward Credited',
        referrerNotifMessage: `You received $${payouts.referrerAmount.toFixed(2)} because ${referee.display_name || 'your friend'} verified their email and met the real deposit requirement.`,
        refereeNotifTitle: 'Welcome Referral Bonus Credited',
        refereeNotifMessage: `You received a $${payouts.refereeAmount.toFixed(2)} welcome referral bonus after qualifying!`,
      });

      if (!creditRes.alreadyFinalized) {
        await this.insertAuditLog(db, {
          actorId: 'system',
          actorName: 'Referral Engine',
          actorRole: 'admin',
          action: 'REFERRAL_REWARD_CREDITED',
          entityType: 'wallet',
          entityId: referrer.id,
          details: `Credited $${payouts.referrerAmount.toFixed(2)} to referrer ${referrer.display_name} and $${payouts.refereeAmount.toFixed(2)} to friend ${referee.display_name} (${config.payoutTarget}).`,
        });
      }

      return {
        success: true,
        qualified: !creditRes.alreadyFinalized ? true : undefined,
        alreadyFinalized: creditRes.alreadyFinalized || undefined,
        status: 'rewarded',
        award: normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(creditRes.awardRow)),
      };
    });

    if (reconcileNeededAwardId) {
      const recRes = await this.reconcileMissingReferralRewards({
        awardIds: [reconcileNeededAwardId],
        limit: 1,
        actorId: 'system',
        actorName: 'Referral Auto-Reconciler',
        actorRole: 'admin',
      });
      if (recRes.reconciledCount > 0) {
        txResult.reconciled = true;
      }
    }

    return txResult;
  }

  public async getReferralSummary(
    input: ReferralSummaryQueryInput,
  ): Promise<ReferralSummary> {
    const config = await this.loadConfig(this.pool);

    // Non-blocking auto-recovery for unfinalized qualified awards
    if (config.enabled) {
      try {
        await this.evaluateReferralQualification({
          refereeId: input.targetUserId,
          contextIp: input.contextIp,
        });
      } catch {
        // Non-blocking inside summary read
      }
    }

    await this.reconcileMissingReferralRewards({
      userId: input.targetUserId,
      limit: 50,
      actorId: 'system',
      actorName: 'Referral Auto-Reconciler',
      actorRole: 'admin',
    });

    const [ownerRes, walletRes, ownerTxsRes, awardsRes, refereeAwardRes] =
      await Promise.all([
        this.pool.query<RawUserRow>(
          `SELECT id, referral_code, display_name, referred_by, email_verified
           FROM public.users WHERE id = $1 LIMIT 1`,
          [input.targetUserId],
        ),
        this.pool.query<RawWalletRow>(
          `SELECT customer_id, balance, referral_bonus_balance
           FROM public.wallets WHERE customer_id = $1 LIMIT 1`,
          [input.targetUserId],
        ),
        this.pool.query<RawTransactionRow>(
          `SELECT id, customer_id, amount, type, status, reference_id, created_at
           FROM public.transactions
           WHERE customer_id = $1 AND type = 'referral_reward'
           ORDER BY created_at DESC
           LIMIT 200`,
          [input.targetUserId],
        ),
        this.pool.query<RawReferralAwardRow>(
          `SELECT * FROM public.referral_awards
           WHERE referrer_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [input.targetUserId],
        ),
        this.pool.query<RawReferralAwardRow>(
          `SELECT * FROM public.referral_awards
           WHERE referee_id = $1
           LIMIT 1`,
          [input.targetUserId],
        ),
      ]);

    const owner = ownerRes.rows[0];
    if (!owner) {
      throw new ReferralNotFoundError('Player account not found.');
    }
    const ownerWallet = walletRes.rows[0];
    const ownerTxList = ownerTxsRes.rows;
    const awardRows = awardsRes.rows;
    const refereeAward = refereeAwardRes.rows[0];

    const referralCode =
      owner.referral_code || `REF_${input.targetUserId.slice(-5).toUpperCase()}`;

    const refereeIds = Array.from(
      new Set(awardRows.map((a) => a.referee_id).filter(Boolean)),
    );

    const refereesById: Record<string, RawUserRow> = {};
    const depositTotalsById: Record<string, number> = {};

    if (refereeIds.length > 0) {
      const [refUsersRes, refTopupsRes] = await Promise.all([
        this.pool.query<RawUserRow>(
          `SELECT id, display_name, email_verified, created_at
           FROM public.users
           WHERE id = ANY($1::text[])`,
          [refereeIds],
        ),
        this.pool.query<RawTopupRow>(
          `SELECT id, customer_id, amount, status, payment_method_id, created_at
           FROM public.topups
           WHERE customer_id = ANY($1::text[])
           LIMIT 300`,
          [refereeIds],
        ),
      ]);

      for (const u of refUsersRes.rows) refereesById[u.id] = u;
      for (const t of refTopupsRes.rows) {
        if (isRealCashTopUpRow(t)) {
          depositTotalsById[t.customer_id] = roundMoney(
            (depositTotalsById[t.customer_id] || 0) + roundMoney(t.amount),
          );
        }
      }
    }

    const referredUsers: ReferredUser[] = awardRows.map((row) => {
      const refUser = refereesById[row.referee_id];
      const depositTotal = Math.max(
        roundMoney(row.qualifying_deposit_amount),
        depositTotalsById[row.referee_id] || 0,
      );
      const ledgerCredits = getAwardCreditedStatus(
        row.id,
        ownerTxList,
        input.targetUserId,
        row.referee_id,
      );
      const expectedRefAmt = roundMoney(row.referrer_reward_amount);
      const effectiveStatus =
        row.status === 'rewarded' && expectedRefAmt > 0 && !ledgerCredits.referrerCredited
          ? 'processing'
          : row.status;

      return {
        id: row.referee_id,
        displayName: refUser?.display_name || 'Invited Player',
        joinedAt:
          toIsoString(refUser?.created_at) || toIsoString(row.created_at, true)!,
        status: effectiveStatus as ReferredUser['status'],
        depositTotal,
        rewardEarned: ledgerCredits.referrerAmount,
        refereeRewardEarned: roundMoney(row.referee_reward_amount),
        emailVerified: Boolean(refUser?.email_verified),
        hasRealDepositMet: depositTotal >= config.qualificationDepositMin,
        fraudFlags: Array.isArray(row.fraud_flags)
          ? (row.fraud_flags as string[])
          : [],
        reviewNotes: row.review_notes || undefined,
        source: row.source as ReferredUser['source'],
      };
    });

    const totalRewardsEarned = roundMoney(
      referredUsers.reduce((sum, r) => sum + (r.rewardEarned || 0), 0),
    );
    const pendingRewards = roundMoney(
      awardRows
        .filter((r) => r.status === 'held_for_review' || r.status === 'processing')
        .reduce((sum, r) => sum + roundMoney(r.referrer_reward_amount), 0),
    );

    const refereeTopupsRes = await this.pool.query<RawTopupRow>(
      `SELECT id, customer_id, amount, status, payment_method_id, created_at
       FROM public.topups
       WHERE customer_id = $1
       ORDER BY created_at ASC`,
      [input.targetUserId],
    );
    const refereeDeposits = computeRefereeDepositsFromRows(refereeTopupsRes.rows);

    const hasReferrer = Boolean(refereeAward || owner.referred_by);
    let referrerDisplayName: string | undefined;
    if (refereeAward?.referrer_id) {
      const rUser = await this.pool.query<Pick<RawUserRow, 'id' | 'display_name'>>(
        `SELECT id, display_name FROM public.users WHERE id = $1 LIMIT 1`,
        [refereeAward.referrer_id],
      );
      referrerDisplayName = rUser.rows[0]?.display_name || undefined;
    } else if (owner.referred_by) {
      const rByCode = await this.pool.query<Pick<RawUserRow, 'id' | 'display_name'>>(
        `SELECT id, display_name FROM public.users WHERE upper(referral_code) = upper($1) LIMIT 1`,
        [normalizeReferralCodeInput(owner.referred_by)],
      );
      referrerDisplayName = rByCode.rows[0]?.display_name || undefined;
    }

    const welcomeTxCredits = refereeAward?.id
      ? getAwardCreditedStatus(
          refereeAward.id,
          ownerTxList,
          refereeAward.referrer_id,
          input.targetUserId,
        )
      : { refereeCredited: false, refereeAmount: 0, refereeTxId: undefined };

    const fallbackExpectedWelcome = hasReferrer
      ? calculateReferralPayouts(
          config,
          refereeDeposits.realDepositTotal > 0
            ? refereeDeposits.realDepositTotal
            : config.qualificationDepositMin,
        ).refereeAmount
      : 0;
    const storedWelcomeAmt = roundMoney(refereeAward?.referee_reward_amount);
    const expectedWelcomeAmt =
      storedWelcomeAmt > 0 ? storedWelcomeAmt : fallbackExpectedWelcome;

    let welcomeStatus: 'none' | 'pending' | 'processing' | 'rewarded' | 'held' | 'rejected' =
      'none';
    if (hasReferrer) {
      if (refereeAward?.status === 'rejected' || refereeAward?.status === 'capped') {
        welcomeStatus = 'rejected';
      } else if (refereeAward?.status === 'held_for_review') {
        welcomeStatus = 'held';
      } else if (
        refereeAward?.status === 'rewarded' &&
        (welcomeTxCredits.refereeCredited || expectedWelcomeAmt === 0)
      ) {
        welcomeStatus = 'rewarded';
      } else if (
        refereeAward?.status === 'processing' ||
        (refereeAward?.status === 'rewarded' &&
          !welcomeTxCredits.refereeCredited &&
          expectedWelcomeAmt > 0) ||
        (refereeDeposits.realDepositTotal >= config.qualificationDepositMin &&
          (!config.requireEmailVerified || Boolean(owner.email_verified)))
      ) {
        welcomeStatus = 'processing';
      } else {
        welcomeStatus = 'pending';
      }
    }

    const referralLink = input.requestOrigin
      ? `${input.requestOrigin}/signup?ref=${referralCode}`
      : `/signup?ref=${referralCode}`;

    return {
      referralCode,
      referralLink,
      totalReferred: referredUsers.length,
      activeReferred: referredUsers.filter((u) => u.status === 'rewarded').length,
      totalRewardsEarned,
      pendingRewards,
      heldRewardsCount: referredUsers.filter((u) => u.status === 'held_for_review').length,
      rewardMode: config.rewardMode,
      referrerRewardValue: config.referrerRewardValue,
      refereeRewardValue: config.refereeRewardValue,
      rewardPerReferral: config.referrerRewardValue,
      qualifyingDepositMin: config.qualificationDepositMin,
      payoutTarget: config.payoutTarget,
      maxReferralsPerUser: config.maxReferralsPerUser,
      programEnabled: config.enabled,
      referredUsers,
      walletBalances: {
        availableBalance: roundMoney(ownerWallet?.balance),
        referralBonusBalance: roundMoney(ownerWallet?.referral_bonus_balance),
      },
      welcomeBonus: {
        hasReferrer,
        awardId: refereeAward?.id,
        referrerId: refereeAward?.referrer_id,
        referrerName: referrerDisplayName,
        referralCodeUsed: refereeAward?.referral_code_used || owner.referred_by || undefined,
        status: welcomeStatus,
        expectedAmount: expectedWelcomeAmt,
        creditedAmount: welcomeTxCredits.refereeAmount,
        depositTotal: Math.max(
          roundMoney(refereeAward?.qualifying_deposit_amount),
          refereeDeposits.realDepositTotal,
        ),
        qualifyingDepositMin: config.qualificationDepositMin,
        payoutTarget:
          refereeAward?.payout_target === 'available_balance'
            ? 'available_balance'
            : config.payoutTarget,
        txId: welcomeTxCredits.refereeTxId,
        rewardedAt: toIsoString(refereeAward?.rewarded_at),
      },
    };
  }

  public async getAdminReferralLedger(
    query: AdminReferralLedgerQuery,
  ): Promise<AdminReferralLedgerResult> {
    await this.reconcileMissingReferralRewards({
      limit: 50,
      actorId: query.actorId,
      actorName: query.actorName,
      actorRole: query.actorRole,
    });

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query.status && query.status !== 'all') {
      values.push(query.status);
      conditions.push(`ra.status = $${values.length}`);
    }

    if (query.search) {
      const pattern = `%${escapeIlikePattern(query.search)}%`;
      values.push(pattern);
      const pIdx = values.length;
      conditions.push(`(
        COALESCE(rr.display_name, '') ILIKE $${pIdx} ESCAPE '\\'
        OR COALESCE(rr.email, '') ILIKE $${pIdx} ESCAPE '\\'
        OR COALESCE(re.display_name, '') ILIKE $${pIdx} ESCAPE '\\'
        OR COALESCE(re.email, '') ILIKE $${pIdx} ESCAPE '\\'
        OR COALESCE(ra.referral_code_used, '') ILIKE $${pIdx} ESCAPE '\\'
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total
       FROM public.referral_awards ra
       LEFT JOIN public.users rr ON rr.id = ra.referrer_id
       LEFT JOIN public.users re ON re.id = ra.referee_id
       ${whereClause}`,
      values,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const pagedValues = [...values, query.limit, query.offset];
    const rowsRes = await this.pool.query<
      RawReferralAwardRow & {
        rr_display_name: string | null;
        rr_email: string | null;
        rr_referral_code: string | null;
        re_display_name: string | null;
        re_email: string | null;
        re_referral_code: string | null;
      }
    >(
      `SELECT ra.*,
              rr.display_name AS rr_display_name,
              rr.email AS rr_email,
              rr.referral_code AS rr_referral_code,
              re.display_name AS re_display_name,
              re.email AS re_email,
              re.referral_code AS re_referral_code
       FROM public.referral_awards ra
       LEFT JOIN public.users rr ON rr.id = ra.referrer_id
       LEFT JOIN public.users re ON re.id = ra.referee_id
       ${whereClause}
       ORDER BY ra.created_at DESC, ra.id ASC
       LIMIT $${pagedValues.length - 1} OFFSET $${pagedValues.length}`,
      pagedValues,
    );

    const buildUsersMap = (
      rows: typeof rowsRes.rows,
    ): Record<string, { displayName: string; email?: string; referralCode?: string }> => {
      const map: Record<
        string,
        { displayName: string; email?: string; referralCode?: string }
      > = {};
      for (const r of rows) {
        if (r.referrer_id && (r.rr_display_name || r.rr_email)) {
          map[r.referrer_id] = {
            displayName: r.rr_display_name || r.rr_email?.split('@')[0] || 'Player',
            email: r.rr_email ?? undefined,
            referralCode: r.rr_referral_code ?? undefined,
          };
        }
        if (r.referee_id && (r.re_display_name || r.re_email)) {
          map[r.referee_id] = {
            displayName: r.re_display_name || r.re_email?.split('@')[0] || 'Player',
            email: r.re_email ?? undefined,
            referralCode: r.re_referral_code ?? undefined,
          };
        }
      }
      return map;
    };

    const pagedUsersById = buildUsersMap(rowsRes.rows);
    const awards = rowsRes.rows
      .map((r) => normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(r), pagedUsersById))
      .filter((e): e is ReferralLedgerEntry => Boolean(e));

    const boardRes = await this.pool.query<
      RawReferralAwardRow & {
        rr_display_name: string | null;
        rr_email: string | null;
        rr_referral_code: string | null;
        re_display_name: string | null;
        re_email: string | null;
        re_referral_code: string | null;
      }
    >(
      `SELECT ra.*,
              rr.display_name AS rr_display_name,
              rr.email AS rr_email,
              rr.referral_code AS rr_referral_code,
              re.display_name AS re_display_name,
              re.email AS re_email,
              re.referral_code AS re_referral_code
       FROM public.referral_awards ra
       LEFT JOIN public.users rr ON rr.id = ra.referrer_id
       LEFT JOIN public.users re ON re.id = ra.referee_id
       ORDER BY ra.created_at DESC
       LIMIT 200`,
    );
    const boardUsersById = buildUsersMap(boardRes.rows);
    const allNormalized = boardRes.rows
      .map((r) => normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(r), boardUsersById))
      .filter((e): e is ReferralLedgerEntry => Boolean(e));

    const topReferrers = computeTopReferrers(allNormalized, boardUsersById).slice(0, 15);
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const stats = {
      totalCount: allNormalized.length,
      heldCount: allNormalized.filter((a) => a.status === 'held_for_review').length,
      rewardedCount: allNormalized.filter((a) => a.status === 'rewarded').length,
      totalReferrerPaid: roundMoney(
        allNormalized
          .filter((a) => a.status === 'rewarded')
          .reduce((s, a) => s + a.referrerRewardAmount, 0),
      ),
      totalFriendPaid: roundMoney(
        allNormalized
          .filter((a) => a.status === 'rewarded')
          .reduce((s, a) => s + a.refereeRewardAmount, 0),
      ),
      dailyPaidToday: roundMoney(
        allNormalized
          .filter((a) => a.status === 'rewarded' && (a.rewardedAt || '').startsWith(todayPrefix))
          .reduce((s, a) => s + a.referrerRewardAmount + a.refereeRewardAmount, 0),
      ),
    };

    return {
      success: true,
      awards,
      topReferrers,
      total,
      hasMore: query.offset + awards.length < total,
      stats,
    };
  }

  public async manualAssignReferral(
    input: ManualAssignReferralInput,
  ): Promise<{
    success: true;
    mode: 'link_only' | 'link_and_reward';
    status: string;
    message: string;
    award: ReferralLedgerEntry | null;
  }> {
    const cleanReason = String(input.reason || '').trim();

    return this.withTransaction(async (db) => {
      const refereeRes = await db.query<RawUserRow>(
        `SELECT id, email, display_name, role, phone, status, email_verified,
                referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [input.refereeId],
      );
      const referee = refereeRes.rows[0];
      if (!referee) {
        throw new ReferralNotFoundError('Target player not found.');
      }

      const referrer = await this.resolveUserByIdentifier(db, input.referrerQuery);
      if (!referrer) {
        throw new ReferralNotFoundError(
          `Referrer matching "${input.referrerQuery}" not found.`,
        );
      }

      const existingAwardRes = await db.query<RawReferralAwardRow>(
        `SELECT * FROM public.referral_awards WHERE referee_id = $1 FOR UPDATE`,
        [referee.id],
      );
      const existingAward = existingAwardRes.rows[0];

      const hasExistingReferrer = Boolean(
        (referee.referred_by && String(referee.referred_by).trim() !== '') ||
          (existingAward && existingAward.referrer_id),
      );
      const isChangingExistingReferrer =
        hasExistingReferrer &&
        (existingAward?.referrer_id
          ? existingAward.referrer_id !== referrer.id
          : normalizeReferralCodeInput(referee.referred_by) !==
            normalizeReferralCodeInput(referrer.referral_code || referrer.id));

      if (hasExistingReferrer && isChangingExistingReferrer) {
        if (input.actorRole !== 'admin') {
          throw new ReferralForbiddenError(
            'Access Denied: This player already has a referrer. Only Administrators can reassign an existing referrer.',
          );
        }
        if (!cleanReason || cleanReason.length < 3) {
          throw new ReferralValidationError(
            'A clear reason (at least 3 characters) is required when reassigning an existing referrer.',
          );
        }
      }

      if (existingAward?.status === 'rewarded' && input.mode === 'link_and_reward') {
        throw new ReferralConflictError(
          'This player has already triggered a one-time referral payout. Choose "Link Only" to adjust attribution without double-paying.',
          'ALREADY_REWARDED',
        );
      }

      const config = await this.loadConfig(db);
      const otherUsersRes = await db.query<Pick<RawUserRow, 'id' | 'email' | 'phone'>>(
        `SELECT id, email, phone FROM public.users LIMIT 200`,
      );
      const fraud = evaluateReferralFraudSignals({
        referrer: {
          id: referrer.id,
          email: referrer.email,
          phone: referrer.phone ?? undefined,
          signupIp: referrer.signup_ip ?? undefined,
          deviceFingerprint: referrer.device_fingerprint ?? undefined,
        },
        referee: {
          id: referee.id,
          email: referee.email,
          phone: referee.phone ?? undefined,
          signupIp: referee.signup_ip ?? undefined,
          deviceFingerprint: referee.device_fingerprint ?? undefined,
        },
        otherUsers: otherUsersRes.rows.map((u) => ({
          id: u.id,
          email: u.email,
          phone: u.phone ?? undefined,
        })),
        config,
      });

      if (fraud.blocked) {
        throw new ReferralValidationError(
          fraud.blockReason || 'Self-referral or duplicate contact blocked.',
          fraud.blockCode || 'REFERRAL_BLOCKED',
        );
      }

      const resolvedRefCode =
        normalizeReferralCodeInput(referrer.referral_code) ||
        `REF_${referrer.id.slice(-5).toUpperCase()}`;

      if (!referrer.referral_code) {
        await db.query(
          `UPDATE public.users SET referral_code = $2, updated_at = timezone('utc'::text, now()) WHERE id = $1`,
          [referrer.id, resolvedRefCode],
        );
      }

      await db.query(
        `UPDATE public.users SET referred_by = $2, updated_at = timezone('utc'::text, now()) WHERE id = $1`,
        [referee.id, resolvedRefCode],
      );

      const awardId = existingAward?.id || `refaw_${referee.id}`;
      const source = isChangingExistingReferrer
        ? 'admin_reassign'
        : input.mode === 'link_and_reward'
        ? 'manual_link_and_reward'
        : 'manual_link';

      const topupsRes = await db.query<RawTopupRow>(
        `SELECT id, customer_id, amount, status, payment_method_id, created_at
         FROM public.topups WHERE customer_id = $1 ORDER BY created_at ASC`,
        [referee.id],
      );
      const depositProgress = computeRefereeDepositsFromRows(topupsRes.rows);

      if (input.mode === 'link_only') {
        const nextStatus =
          existingAward?.status === 'rewarded'
            ? 'rewarded'
            : referee.email_verified
            ? 'pending_deposit'
            : 'registered';

        const savedRes = await db.query<RawReferralAwardRow>(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             staff_reason, assigned_by, assigned_by_name, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9,
             $10, $11, $12, $13::jsonb,
             $14, $15, $16, timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             referrer_id = EXCLUDED.referrer_id,
             referral_code_used = EXCLUDED.referral_code_used,
             source = EXCLUDED.source,
             reward_mode = EXCLUDED.reward_mode,
             payout_target = EXCLUDED.payout_target,
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = EXCLUDED.status,
             fraud_flags = EXCLUDED.fraud_flags,
             staff_reason = EXCLUDED.staff_reason,
             assigned_by = EXCLUDED.assigned_by,
             assigned_by_name = EXCLUDED.assigned_by_name,
             updated_at = timezone('utc'::text, now())
           RETURNING *`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            source,
            config.rewardMode,
            config.payoutTarget,
            roundMoney(existingAward?.referrer_reward_amount),
            roundMoney(existingAward?.referee_reward_amount),
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            nextStatus,
            JSON.stringify(fraud.fraudFlags),
            cleanReason || null,
            input.actorId,
            input.actorName,
          ],
        );

        await this.insertAuditLog(db, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: isChangingExistingReferrer ? 'REFERRAL_REASSIGNED' : 'MANUAL_REFERRAL_LINKED',
          entityType: 'user',
          entityId: referee.id,
          details: `${isChangingExistingReferrer ? 'Reassigned' : 'Manually linked'} player ${referee.display_name} (${referee.email}) to referrer ${referrer.display_name} (${resolvedRefCode}) [Link Only].${cleanReason ? ` Reason: ${cleanReason}` : ''}`,
        });

        return {
          success: true,
          mode: 'link_only',
          status: nextStatus,
          message: `Linked ${referee.display_name} to referrer ${referrer.display_name} (${resolvedRefCode}).`,
          award: savedRes.rows[0]
            ? normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(savedRes.rows[0]))
            : null,
        };
      }

      // Mode: link_and_reward
      const depositBasis =
        depositProgress.realDepositTotal > 0
          ? depositProgress.realDepositTotal
          : config.qualificationDepositMin;
      const payouts = calculateReferralPayouts(config, depositBasis);
      const budget = await this.computeBudgetUsage(db, referrer.id);
      const capCheck = checkReferralBudgetCaps({
        config,
        referrerRewardedCount: budget.referrerRewardedCount,
        dailyTotalPaidToday: budget.dailyTotalPaidToday,
        payoutTotal: payouts.totalAmount,
      });

      if (!capCheck.allowed) {
        throw new ReferralConflictError(
          capCheck.capReason || 'Referral budget cap reached.',
          'REFERRAL_CAP_REACHED',
        );
      }

      if (fraud.shouldHold && input.actorRole !== 'admin') {
        const heldRes = await db.query<RawReferralAwardRow>(
          `INSERT INTO public.referral_awards (
             id, referrer_id, referee_id, referral_code_used, source, reward_mode,
             payout_target, referrer_reward_amount, referee_reward_amount,
             qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
             staff_reason, assigned_by, assigned_by_name, review_notes, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9,
             $10, $11, 'held_for_review', $12::jsonb,
             $13, $14, $15, $16, timezone('utc'::text, now()), timezone('utc'::text, now())
           )
           ON CONFLICT (id) DO UPDATE SET
             referrer_id = EXCLUDED.referrer_id,
             referral_code_used = EXCLUDED.referral_code_used,
             source = EXCLUDED.source,
             reward_mode = EXCLUDED.reward_mode,
             payout_target = EXCLUDED.payout_target,
             referrer_reward_amount = EXCLUDED.referrer_reward_amount,
             referee_reward_amount = EXCLUDED.referee_reward_amount,
             qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
             qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
             status = 'held_for_review',
             fraud_flags = EXCLUDED.fraud_flags,
             staff_reason = EXCLUDED.staff_reason,
             assigned_by = EXCLUDED.assigned_by,
             assigned_by_name = EXCLUDED.assigned_by_name,
             review_notes = EXCLUDED.review_notes,
             updated_at = timezone('utc'::text, now())
           RETURNING *`,
          [
            awardId,
            referrer.id,
            referee.id,
            resolvedRefCode,
            source,
            config.rewardMode,
            config.payoutTarget,
            payouts.referrerAmount,
            payouts.refereeAmount,
            depositProgress.qualifyingDepositId,
            depositProgress.realDepositTotal,
            JSON.stringify(fraud.fraudFlags),
            cleanReason || null,
            input.actorId,
            input.actorName,
            `Manual Link+Reward held for Admin verification (${fraud.fraudFlags.join(', ')})`,
          ],
        );

        await this.insertAuditLog(db, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: 'MANUAL_REFERRAL_HELD_FOR_REVIEW',
          entityType: 'user',
          entityId: referee.id,
          details: `Agent ${input.actorName} linked ${referee.display_name} to ${referrer.display_name}; payout placed in Admin Review Queue (${fraud.fraudFlags.join(', ')}).`,
        });

        return {
          success: true,
          mode: 'link_and_reward',
          status: 'held_for_review',
          message: `Linked ${referee.display_name} to ${referrer.display_name}. Reward placed in Admin Review Queue due to ${fraud.fraudFlags.join(', ')}.`,
          award: heldRes.rows[0]
            ? normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(heldRes.rows[0]))
            : null,
        };
      }

      const creditRes = await this.creditReferralAwardInTx(db, {
        awardId,
        referrerId: referrer.id,
        refereeId: referee.id,
        referralCodeUsed: resolvedRefCode,
        source,
        rewardMode: config.rewardMode,
        payoutTarget: config.payoutTarget,
        referrerRewardAmount: payouts.referrerAmount,
        refereeRewardAmount: payouts.refereeAmount,
        qualifyingDepositId: depositProgress.qualifyingDepositId,
        qualifyingDepositAmount: depositProgress.realDepositTotal,
        fraudFlags: fraud.fraudFlags,
        staffReason: cleanReason || null,
        assignedBy: input.actorId,
        assignedByName: input.actorName,
        reviewedBy: input.actorRole === 'admin' ? input.actorId : null,
        reviewedByName: input.actorRole === 'admin' ? input.actorName : null,
        referrerDescription: `Manual Referral Reward (${input.actorName}): ${referee.display_name || referee.email}`,
        refereeDescription: `Welcome Referral Bonus (${input.actorName}): Linked to ${referrer.display_name}`,
        referrerNotifTitle: 'Referral Reward Credited',
        referrerNotifMessage: `Staff credited your $${payouts.referrerAmount.toFixed(2)} referral bonus for ${referee.display_name}.`,
        refereeNotifTitle: 'Welcome Referral Bonus Credited',
        refereeNotifMessage: `Staff credited your $${payouts.refereeAmount.toFixed(2)} welcome referral bonus!`,
      });

      await this.insertAuditLog(db, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: isChangingExistingReferrer
          ? 'REFERRAL_REASSIGNED_AND_REWARDED'
          : 'MANUAL_REFERRAL_LINKED_AND_REWARDED',
        entityType: 'user',
        entityId: referee.id,
        details: `${isChangingExistingReferrer ? 'Reassigned' : 'Manually linked'} ${referee.display_name} to ${referrer.display_name} (${resolvedRefCode}) and issued $${payouts.referrerAmount.toFixed(2)} referrer / $${payouts.refereeAmount.toFixed(2)} friend bonus.${cleanReason ? ` Reason: ${cleanReason}` : ''}`,
      });

      return {
        success: true,
        mode: 'link_and_reward',
        status: 'rewarded',
        message: `Linked ${referee.display_name} to ${referrer.display_name} and credited $${payouts.referrerAmount.toFixed(2)} / $${payouts.refereeAmount.toFixed(2)}.`,
        award: normalizeReferralLedgerRow(normalizeAwardRowForSharedHelper(creditRes.awardRow)),
      };
    });
  }

  public async setVanityReferralCode(
    input: VanityCodeInput,
  ): Promise<{
    success: true;
    referralCode: string;
    user: Record<string, unknown>;
    message: string;
  }> {
    const vanityCode = normalizeReferralCodeInput(input.vanityCode);
    if (!isValidVanityReferralCode(vanityCode)) {
      throw new ReferralValidationError(
        'Vanity code must be 3–24 characters using letters, numbers, underscores, or hyphens.',
      );
    }

    return this.withTransaction(async (db) => {
      const targetRes = await db.query<RawUserRow>(
        `SELECT id, email, display_name, referral_code
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [input.userId],
      );
      const targetUser = targetRes.rows[0];
      if (!targetUser) {
        throw new ReferralNotFoundError('Target user not found.');
      }

      const conflictRes = await db.query<Pick<RawUserRow, 'id' | 'display_name'>>(
        `SELECT id, display_name
         FROM public.users
         WHERE upper(referral_code) = upper($1) AND id <> $2
         LIMIT 1`,
        [vanityCode, input.userId],
      );
      const conflict = conflictRes.rows[0];
      if (conflict) {
        throw new ReferralConflictError(
          `Referral code "${vanityCode}" is already assigned to ${conflict.display_name || conflict.id}.`,
          'VANITY_CODE_CONFLICT',
        );
      }

      const oldCode = targetUser.referral_code;
      const updRes = await db.query<RawUserRow>(
        `UPDATE public.users
         SET referral_code = $2,
             updated_at = timezone('utc'::text, now())
         WHERE id = $1
         RETURNING id, email, display_name, role, status, referral_code, referred_by, updated_at`,
        [input.userId, vanityCode],
      );
      const updated = updRes.rows[0]!;

      if (oldCode && normalizeReferralCodeInput(oldCode) !== vanityCode) {
        await db.query(
          `UPDATE public.users
           SET referred_by = $2,
               updated_at = timezone('utc'::text, now())
           WHERE upper(referred_by) = upper($1)`,
          [oldCode, vanityCode],
        );
      }

      await this.insertAuditLog(db, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: 'admin',
        action: 'REFERRAL_VANITY_CODE_SET',
        entityType: 'user',
        entityId: input.userId,
        details: `Assigned custom vanity referral code "${vanityCode}" to ${targetUser.display_name || targetUser.email}${oldCode ? ` (previously ${oldCode})` : ''}.`,
      });

      return {
        success: true,
        referralCode: vanityCode,
        user: {
          ...updated,
          updated_at: toIsoString(updated.updated_at, true),
        },
        message: `Custom vanity code "${vanityCode}" assigned successfully.`,
      };
    });
  }

  public async reviewHeldReferral(
    input: ReviewReferralInput,
  ): Promise<{
    success: true;
    status: string;
    award: ReferralLedgerEntry | null;
    message: string;
  }> {
    const cleanNotes = String(input.reviewNotes || '').trim();
    let reconcileAwardId: string | null = null;

    try {
      return await this.withTransaction(async (db) => {
        const awRes = await db.query<RawReferralAwardRow>(
          `SELECT * FROM public.referral_awards WHERE id = $1 FOR UPDATE`,
          [input.awardId],
        );
        const award = awRes.rows[0];
        if (!award) {
          throw new ReferralNotFoundError('Referral award record not found.');
        }

        if (award.status === 'rewarded') {
          reconcileAwardId = award.id;
          throw new ReferralConflictError(
            'This referral reward has already been approved and credited.',
            'ALREADY_REWARDED',
          );
        }

        if (input.decision === 'reject') {
          const rejectedRes = await db.query<RawReferralAwardRow>(
            `UPDATE public.referral_awards
             SET status = 'rejected',
                 reviewed_by = $2,
                 reviewed_by_name = $3,
                 review_notes = $4,
                 updated_at = timezone('utc'::text, now())
             WHERE id = $1
             RETURNING *`,
            [
              award.id,
              input.actorId,
              input.actorName,
              cleanNotes || 'Declined during Admin anti-fraud review.',
            ],
          );

          await this.insertAuditLog(db, {
            actorId: input.actorId,
            actorName: input.actorName,
            actorRole: 'admin',
            action: 'REFERRAL_HOLD_REJECTED',
            entityType: 'wallet',
            entityId: award.referee_id,
            details: `Rejected held referral award ${award.id}. Notes: ${cleanNotes || 'Fraud review rejection'}`,
          });

          return {
            success: true,
            status: 'rejected',
            award: rejectedRes.rows[0]
              ? normalizeReferralLedgerRow(
                  normalizeAwardRowForSharedHelper(rejectedRes.rows[0]),
                )
              : null,
            message: 'Held referral award rejected.',
          };
        }

        const config = await this.loadConfig(db);
        const topupsRes = await db.query<RawTopupRow>(
          `SELECT id, customer_id, amount, status, payment_method_id, created_at
           FROM public.topups WHERE customer_id = $1 ORDER BY created_at ASC`,
          [award.referee_id],
        );
        const depositProgress = computeRefereeDepositsFromRows(topupsRes.rows);
        const effectiveDepositTotal = Math.max(
          roundMoney(award.qualifying_deposit_amount),
          depositProgress.realDepositTotal,
        );

        const storedRefAmt = roundMoney(award.referrer_reward_amount);
        const storedEeAmt = roundMoney(award.referee_reward_amount);
        const payouts =
          storedRefAmt > 0 || storedEeAmt > 0
            ? {
                referrerAmount: storedRefAmt,
                refereeAmount: storedEeAmt,
                totalAmount: roundMoney(storedRefAmt + storedEeAmt),
              }
            : calculateReferralPayouts(
                config,
                effectiveDepositTotal || config.qualificationDepositMin,
              );

        const payoutTarget: ReferralPayoutTarget =
          award.payout_target === 'available_balance'
            ? 'available_balance'
            : config.payoutTarget;

        const existingFlags = normalizeAwardRowForSharedHelper(award)
          .fraud_flags as string[];

        const creditRes = await this.creditReferralAwardInTx(db, {
          awardId: award.id,
          referrerId: award.referrer_id,
          refereeId: award.referee_id,
          referralCodeUsed: award.referral_code_used || '',
          source: award.source || 'signup_link',
          rewardMode: award.reward_mode || config.rewardMode,
          payoutTarget,
          referrerRewardAmount: payouts.referrerAmount,
          refereeRewardAmount: payouts.refereeAmount,
          qualifyingDepositId:
            depositProgress.qualifyingDepositId || award.qualifying_deposit_id || null,
          qualifyingDepositAmount: effectiveDepositTotal,
          fraudFlags: existingFlags,
          reviewedBy: input.actorId,
          reviewedByName: input.actorName,
          reviewNotes: cleanNotes || 'Approved after Admin review.',
          referrerDescription: `Referral Reward Approved (${input.actorName}): Award #${award.id.slice(-6)}`,
          refereeDescription: `Welcome Referral Bonus Approved (${input.actorName})`,
          referrerNotifTitle: 'Held Referral Reward Approved',
          referrerNotifMessage: `Admin verified and credited $${payouts.referrerAmount.toFixed(2)} referral bonus to your wallet.`,
          refereeNotifTitle: 'Welcome Referral Bonus Approved',
          refereeNotifMessage: `Admin approved and credited your $${payouts.refereeAmount.toFixed(2)} welcome referral bonus!`,
        });

        await this.insertAuditLog(db, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: 'admin',
          action: 'REFERRAL_HOLD_APPROVED',
          entityType: 'wallet',
          entityId: award.referrer_id,
          details: `Approved held referral ${award.id}; credited $${payouts.referrerAmount.toFixed(2)} / $${payouts.refereeAmount.toFixed(2)}. ${cleanNotes ? `Notes: ${cleanNotes}` : ''}`,
        });

        return {
          success: true,
          status: 'rewarded',
          award: normalizeReferralLedgerRow(
            normalizeAwardRowForSharedHelper(creditRes.awardRow),
          ),
          message: 'Held referral approved and credited.',
        };
      });
    } catch (err) {
      if (reconcileAwardId) {
        await this.reconcileMissingReferralRewards({
          awardIds: [reconcileAwardId],
          limit: 1,
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: 'admin',
        }).catch(() => {});
      }
      throw err;
    }
  }

  public async reconcileMissingReferralRewards(
    input: ReconcileReferralsInput,
  ): Promise<ReconcileReferralsResult> {
    const maxScan = Math.min(100, Math.max(1, Number(input.limit || 50)));
    const config = await this.loadConfig(this.pool);

    const conditions: string[] = [`status IN ('rewarded', 'processing')`];
    const values: unknown[] = [];

    if (input.userId) {
      values.push(input.userId);
      conditions.push(`(referrer_id = $${values.length} OR referee_id = $${values.length})`);
    }
    if (Array.isArray(input.awardIds) && input.awardIds.length > 0) {
      values.push(input.awardIds);
      conditions.push(`id = ANY($${values.length}::text[])`);
    }
    values.push(maxScan);

    const awardsRes = await this.pool.query<RawReferralAwardRow>(
      `SELECT *
       FROM public.referral_awards
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );

    const candidateAwards = awardsRes.rows;
    if (candidateAwards.length === 0) {
      return {
        success: true,
        scanned: 0,
        reconciledCount: 0,
        skippedCount: 0,
        checkedAwards: 0,
        reconciledAwards: 0,
        creditedLegs: 0,
        totalCreditedAmount: 0,
        details: [],
      };
    }

    const participantIds = Array.from(
      new Set(
        candidateAwards.flatMap((a) => [a.referrer_id, a.referee_id]).filter(Boolean),
      ),
    );
    const refereeIds = Array.from(
      new Set(candidateAwards.map((a) => a.referee_id).filter(Boolean)),
    );

    const [usersRes, allParticipantAwardsRes, topupsRes] = await Promise.all([
      this.pool.query<RawUserRow>(
        `SELECT id, email, display_name, email_verified
         FROM public.users
         WHERE id = ANY($1::text[])`,
        [participantIds],
      ),
      this.pool.query<Pick<RawReferralAwardRow, 'id' | 'payout_target'>>(
        `SELECT id, payout_target
         FROM public.referral_awards
         WHERE referrer_id = ANY($1::text[]) OR referee_id = ANY($1::text[])`,
        [participantIds],
      ),
      this.pool.query<RawTopupRow>(
        `SELECT id, customer_id, amount, status, payment_method_id, created_at
         FROM public.topups
         WHERE customer_id = ANY($1::text[])`,
        [refereeIds],
      ),
    ]);

    const usersById: Record<string, RawUserRow> = {};
    for (const u of usersRes.rows) usersById[u.id] = u;

    const awardTargetById: Record<string, ReferralPayoutTarget> = {};
    for (const row of [...candidateAwards, ...allParticipantAwardsRes.rows]) {
      if (row.id) {
        awardTargetById[row.id] =
          row.payout_target === 'available_balance'
            ? 'available_balance'
            : 'referral_bonus';
      }
    }

    const topupsByReferee = new Map<string, RawTopupRow[]>();
    for (const t of topupsRes.rows) {
      const list = topupsByReferee.get(t.customer_id) || [];
      list.push(t);
      topupsByReferee.set(t.customer_id, list);
    }

    const details: ReconcileReferralsResult['details'] = [];
    const detailByAwardId = new Map<string, ReconcileReferralsResult['details'][number]>();
    const reconciledAwardIds = new Set<string>();
    let skippedCount = 0;

    // Pass 1: Heal missing transaction/wallet legs inside per-award transactions
    for (const award of candidateAwards) {
      if (!award.id || !award.referrer_id || !award.referee_id) continue;
      const referee = usersById[award.referee_id];
      const referrer = usersById[award.referrer_id];
      const depositProgress = computeRefereeDepositsFromRows(
        topupsByReferee.get(award.referee_id) || [],
      );
      const effectiveDepositTotal = Math.max(
        roundMoney(award.qualifying_deposit_amount),
        depositProgress.realDepositTotal,
      );

      const isStaffAuthorized =
        award.source === 'manual_link_and_reward' ||
        award.source === 'manual_admin' ||
        award.source === 'manual_agent' ||
        Boolean(award.reviewed_by) ||
        Boolean(award.assigned_by && award.source === 'manual_link_and_reward');
      const meetsQualification =
        effectiveDepositTotal >= config.qualificationDepositMin &&
        (!config.requireEmailVerified || Boolean(referee?.email_verified ?? true));

      const storedRefAmt = roundMoney(award.referrer_reward_amount);
      const storedEeAmt = roundMoney(award.referee_reward_amount);
      const calculated = calculateReferralPayouts(
        config,
        effectiveDepositTotal > 0 ? effectiveDepositTotal : config.qualificationDepositMin,
      );

      const entitled =
        isStaffAuthorized || meetsQualification || storedRefAmt > 0 || storedEeAmt > 0;
      if (!entitled) {
        skippedCount += 1;
        details.push({
          awardId: award.id,
          referrerId: award.referrer_id,
          refereeId: award.referee_id,
          referrerCredited: 0,
          refereeCredited: 0,
          reason: 'Not entitled (deposit/email/staff authorization criteria not met)',
        });
        continue;
      }

      const expectedRefAmt = storedRefAmt > 0 ? storedRefAmt : calculated.referrerAmount;
      const expectedEeAmt = storedEeAmt > 0 ? storedEeAmt : calculated.refereeAmount;
      const payoutTarget: ReferralPayoutTarget =
        award.payout_target === 'available_balance'
          ? 'available_balance'
          : award.payout_target === 'referral_bonus'
          ? 'referral_bonus'
          : config.payoutTarget;
      awardTargetById[award.id] = payoutTarget;

      const outcome = await this.withTransaction(async (db) => {
        const refTxId = `tx_ref_r_${award.id}`;
        const eeTxId = `tx_ref_f_${award.id}`;

        const walletIds = Array.from(new Set([award.referrer_id, award.referee_id])).sort();
        for (const cid of walletIds) {
          await db.query(
            `INSERT INTO public.wallets (
               customer_id, balance, referral_bonus_balance, free_play_balance,
               pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
               currency, updated_at
             ) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 'USD', timezone('utc'::text, now()))
             ON CONFLICT (customer_id) DO NOTHING`,
            [cid],
          );
          await db.query(
            `SELECT customer_id FROM public.wallets WHERE customer_id = $1 FOR UPDATE`,
            [cid],
          );
        }

        const txRes = await db.query<RawTransactionRow>(
          `SELECT id, customer_id, amount, type, status, reference_id, created_at
           FROM public.transactions
           WHERE (reference_id = $1 AND type = 'referral_reward') OR id IN ($2, $3)`,
          [award.id, refTxId, eeTxId],
        );
        const existingCredits = getAwardCreditedStatus(
          award.id,
          txRes.rows,
          award.referrer_id,
          award.referee_id,
        );

        const needsRef = expectedRefAmt > 0 && !existingCredits.referrerCredited;
        const needsEe = expectedEeAmt > 0 && !existingCredits.refereeCredited;

        if (!needsRef && !needsEe) {
          if (award.status === 'processing') {
            await db.query(
              `UPDATE public.referral_awards
               SET status = 'rewarded',
                   rewarded_at = COALESCE(rewarded_at, timezone('utc'::text, now())),
                   updated_at = timezone('utc'::text, now())
               WHERE id = $1`,
              [award.id],
            );
          }
          return { refCredited: 0, eeCredited: 0 };
        }

        const targetCol =
          payoutTarget === 'available_balance' ? 'balance' : 'referral_bonus_balance';
        let refCredited = 0;
        let eeCredited = 0;

        if (needsRef) {
          await db.query(
            `UPDATE public.wallets
             SET ${targetCol} = ${targetCol} + $2,
                 updated_at = timezone('utc'::text, now())
             WHERE customer_id = $1`,
            [award.referrer_id, expectedRefAmt],
          );
          await db.query(
            `INSERT INTO public.transactions (
               id, customer_id, amount, type, status, description, reference_id, game_name, created_at
             ) VALUES ($1, $2, $3, 'referral_reward', 'completed', $4, $5, 'Swift Sweeps Referral', timezone('utc'::text, now()))
             ON CONFLICT (id) DO UPDATE SET
               amount = EXCLUDED.amount,
               status = 'completed',
               description = EXCLUDED.description,
               reference_id = EXCLUDED.reference_id,
               game_name = EXCLUDED.game_name,
               created_at = EXCLUDED.created_at`,
            [
              refTxId,
              award.referrer_id,
              expectedRefAmt,
              `Referral Reward Reconciliation (Award #${award.id.slice(-6)}): ${referee?.display_name || referee?.email || award.referee_id}`,
              award.id,
            ],
          );
          await this.maybeInsertNotification(db, {
            id: `notif_ref_r_${award.id}`,
            userId: award.referrer_id,
            title: 'Referral Reward Credited',
            message: `Your missing $${expectedRefAmt.toFixed(2)} referral bonus for ${referee?.display_name || 'your referred friend'} has been credited to your wallet.`,
            type: 'referral',
            linkTab: 'referrals',
            linkRequestId: award.id,
          });
          refCredited = expectedRefAmt;
        }

        if (needsEe) {
          await db.query(
            `UPDATE public.wallets
             SET ${targetCol} = ${targetCol} + $2,
                 updated_at = timezone('utc'::text, now())
             WHERE customer_id = $1`,
            [award.referee_id, expectedEeAmt],
          );
          await db.query(
            `INSERT INTO public.transactions (
               id, customer_id, amount, type, status, description, reference_id, game_name, created_at
             ) VALUES ($1, $2, $3, 'referral_reward', 'completed', $4, $5, 'Swift Sweeps Referral', timezone('utc'::text, now()))
             ON CONFLICT (id) DO UPDATE SET
               amount = EXCLUDED.amount,
               status = 'completed',
               description = EXCLUDED.description,
               reference_id = EXCLUDED.reference_id,
               game_name = EXCLUDED.game_name,
               created_at = EXCLUDED.created_at`,
            [
              eeTxId,
              award.referee_id,
              expectedEeAmt,
              `Welcome Referral Bonus Reconciliation (Award #${award.id.slice(-6)}): Code ${award.referral_code_used}`,
              award.id,
            ],
          );
          await this.maybeInsertNotification(db, {
            id: `notif_ref_f_${award.id}`,
            userId: award.referee_id,
            title: 'Welcome Referral Bonus Credited',
            message: `Your $${expectedEeAmt.toFixed(2)} welcome referral bonus has been credited to your wallet!`,
            type: 'referral',
            linkTab: 'wallet',
            linkRequestId: award.id,
          });
          eeCredited = expectedEeAmt;
        }

        await db.query(
          `UPDATE public.referral_awards
           SET status = 'rewarded',
               payout_target = $2,
               referrer_reward_amount = $3,
               referee_reward_amount = $4,
               qualifying_deposit_id = COALESCE($5, qualifying_deposit_id),
               qualifying_deposit_amount = GREATEST(qualifying_deposit_amount, $6),
               rewarded_at = COALESCE(rewarded_at, timezone('utc'::text, now())),
               updated_at = timezone('utc'::text, now())
           WHERE id = $1`,
          [
            award.id,
            payoutTarget,
            expectedRefAmt,
            expectedEeAmt,
            depositProgress.qualifyingDepositId || award.qualifying_deposit_id || null,
            effectiveDepositTotal,
          ],
        );

        await this.insertAuditLog(db, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: 'REFERRAL_REWARD_RECONCILED',
          entityType: 'referral',
          entityId: award.id,
          details: `Reconciled missing referral wallet credit(s) for award ${award.id} (Referrer ${referrer?.display_name || award.referrer_id}: +$${refCredited.toFixed(2)}, Friend ${referee?.display_name || award.referee_id}: +$${eeCredited.toFixed(2)}, target=${payoutTarget}).`,
        });

        return { refCredited, eeCredited };
      });

      if (outcome.refCredited > 0 || outcome.eeCredited > 0) {
        reconciledAwardIds.add(award.id);
        const entry = {
          awardId: award.id,
          referrerId: award.referrer_id,
          refereeId: award.referee_id,
          referrerCredited: outcome.refCredited,
          refereeCredited: outcome.eeCredited,
        };
        details.push(entry);
        detailByAwardId.set(award.id, entry);
      }
    }

    // Pass 2: Heal wallets.referral_bonus_balance drift against completed ledger credits & debits
    const participantsToVerify = input.userId
      ? participantIds.filter((id) => id === input.userId)
      : participantIds;

    for (const uid of participantsToVerify) {
      const restored = await this.withTransaction(async (db) => {
        await db.query(
          `INSERT INTO public.wallets (
             customer_id, balance, referral_bonus_balance, free_play_balance,
             pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
             currency, updated_at
           ) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 'USD', timezone('utc'::text, now()))
           ON CONFLICT (customer_id) DO NOTHING`,
          [uid],
        );
        const wRes = await db.query<RawWalletRow>(
          `SELECT customer_id, balance, referral_bonus_balance
           FROM public.wallets WHERE customer_id = $1 FOR UPDATE`,
          [uid],
        );
        const wallet = wRes.rows[0];
        const currentRefBonus = roundMoney(wallet?.referral_bonus_balance);

        const [refTxsRes, loadTxsRes, bonusTopupsRes] = await Promise.all([
          db.query<RawTransactionRow>(
            `SELECT id, customer_id, amount, type, status, reference_id, created_at
             FROM public.transactions
             WHERE customer_id = $1 AND type = 'referral_reward'`,
            [uid],
          ),
          db.query<RawTransactionRow>(
            `SELECT id, customer_id, amount, type, status, description, reference_id, created_at
             FROM public.transactions
             WHERE customer_id = $1 AND type IN ('bonus', 'game_load')`,
            [uid],
          ),
          db.query<RawTopupRow>(
            `SELECT id, customer_id, amount, status, payment_method_id, created_at
             FROM public.topups
             WHERE customer_id = $1 AND payment_method_id = 'referral_bonus'`,
            [uid],
          ),
        ]);

        const userReferralCredits = refTxsRes.rows
          .filter((tx) => {
            if (String(tx.status || '').toLowerCase() !== 'completed') return false;
            const target =
              (tx.reference_id && awardTargetById[tx.reference_id]) ||
              (config.payoutTarget === 'available_balance'
                ? 'available_balance'
                : 'referral_bonus');
            return target === 'referral_bonus';
          })
          .reduce((sum, tx) => sum + roundMoney(tx.amount), 0);

        if (userReferralCredits <= 0) return null;

        const loadTxRefIds = new Set<string>();
        const txDebits = loadTxsRes.rows
          .filter((tx) => {
            if (String(tx.status || '').toLowerCase() !== 'completed') return false;
            const desc = String(tx.description || '').toLowerCase();
            if (!desc.startsWith('referral bonus loaded to')) return false;
            if (tx.reference_id) loadTxRefIds.add(String(tx.reference_id));
            return true;
          })
          .reduce((sum, tx) => sum + roundMoney(tx.amount), 0);

        const legacyTopupDebits = bonusTopupsRes.rows
          .filter((t) => {
            const st = String(t.status || '').toLowerCase();
            if (st !== 'completed' && st !== 'approved') return false;
            return !loadTxRefIds.has(String(t.id));
          })
          .reduce((sum, t) => sum + roundMoney(t.amount), 0);

        const expectedRefBonus = Math.max(
          0,
          roundMoney(userReferralCredits - txDebits - legacyTopupDebits),
        );
        if (expectedRefBonus <= 0) return null;

        if (currentRefBonus + 0.009 < expectedRefBonus) {
          const restoredDelta = roundMoney(Math.max(0, expectedRefBonus - currentRefBonus));
          await db.query(
            `UPDATE public.wallets
             SET referral_bonus_balance = $2,
                 updated_at = timezone('utc'::text, now())
             WHERE customer_id = $1`,
            [uid, expectedRefBonus],
          );
          await this.insertAuditLog(db, {
            actorId: input.actorId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            action: 'REFERRAL_WALLET_BALANCE_RECONCILED',
            entityType: 'wallet',
            entityId: uid,
            details: `Restored Game Bonus Wallet balance for ${usersById[uid]?.display_name || uid} from $${currentRefBonus.toFixed(2)} to $${expectedRefBonus.toFixed(2)} (credits=$${userReferralCredits.toFixed(2)}, gameLoads=$${(txDebits + legacyTopupDebits).toFixed(2)}).`,
          });
          return restoredDelta;
        }

        return null;
      });

      if (restored && restored > 0) {
        const matchingAward =
          candidateAwards.find((a) => a.referee_id === uid) ||
          candidateAwards.find((a) => a.referrer_id === uid) ||
          candidateAwards[0];
        if (matchingAward?.id) {
          reconciledAwardIds.add(matchingAward.id);
          const existingDetail = detailByAwardId.get(matchingAward.id);
          if (existingDetail) {
            existingDetail.walletBalanceRestored = roundMoney(
              (existingDetail.walletBalanceRestored || 0) + restored,
            );
          } else {
            const newDetail = {
              awardId: matchingAward.id,
              referrerId: matchingAward.referrer_id,
              refereeId: matchingAward.referee_id,
              referrerCredited: 0,
              refereeCredited: 0,
              walletBalanceRestored: restored,
              reason:
                'Restored missing Game Bonus Wallet balance from completed referral transactions',
            };
            details.push(newDetail);
            detailByAwardId.set(matchingAward.id, newDetail);
          }
        }
      }
    }

    const creditedLegs = details.reduce(
      (sum, d) =>
        sum +
        (d.referrerCredited > 0 ? 1 : 0) +
        (d.refereeCredited > 0 ? 1 : 0) +
        ((d.walletBalanceRestored || 0) > 0 ? 1 : 0),
      0,
    );
    const totalCreditedAmount = roundMoney(
      details.reduce(
        (sum, d) =>
          sum +
          roundMoney(d.referrerCredited) +
          roundMoney(d.refereeCredited) +
          roundMoney(d.walletBalanceRestored),
        0,
      ),
    );

    return {
      success: true,
      scanned: candidateAwards.length,
      reconciledCount: reconciledAwardIds.size,
      skippedCount,
      checkedAwards: candidateAwards.length,
      reconciledAwards: reconciledAwardIds.size,
      creditedLegs,
      totalCreditedAmount,
      details,
    };
  }

  public async saveReferralProgramConfig(input: {
    referralProgram: unknown;
    actorId: string;
    actorName: string;
  }): Promise<ReferralProgramConfig> {
    const normalized = normalizeReferralConfig(input.referralProgram);

    await this.withTransaction(async (db) => {
      const existingRes = await db.query<{ data: Record<string, unknown> }>(
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
      );
      const currentData = existingRes.rows[0]?.data || {};
      const nextData = {
        ...currentData,
        referralProgram: normalized,
      };

      await db.query(
        `INSERT INTO public.app_config (id, data, updated_at)
         VALUES ('main', $1::jsonb, timezone('utc'::text, now()))
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = timezone('utc'::text, now())`,
        [JSON.stringify(nextData)],
      );

      await this.insertAuditLog(db, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: 'admin',
        action: 'REFERRAL_SETTINGS_UPDATED',
        entityType: 'settings',
        entityId: 'referral_program',
        details: `Updated referral rules: ${normalized.enabled ? 'Enabled' : 'Disabled'}, mode=${normalized.rewardMode}, referrer=${normalized.referrerRewardValue}, friend=${normalized.refereeRewardValue}, minDeposit=$${normalized.qualificationDepositMin}, target=${normalized.payoutTarget}, maxPerUser=${normalized.maxReferralsPerUser}, dailyCap=$${normalized.dailyPayoutCap}.`,
      });
    });

    return normalized;
  }
}
