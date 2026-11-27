import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabasePool } from '../db/pool.js';
import {
  DEFAULT_WHEEL_OF_LUCK_CONFIG,
  ROLLING_SPIN_COOLDOWN_MS,
  buildGameBonusLoadStaffMessage,
  computeGameCreditUnloadSplit,
  evaluateWheelEligibility,
  normalizeWheelConfig,
  selectWeightedWheelSegment,
  validateWheelConfig,
  type ServerWheelSpinResponse as WheelSpinResponse,
  type WheelEligibilityState,
  type WheelOfLuckConfig,
  type WheelSpinRecord,
  type WheelStatusResponse,
} from './wheelLogic.js';

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

export class WheelNotFoundError extends Error {
  public readonly code: string;

  constructor(message = 'Record not found.', code = 'NOT_FOUND') {
    super(message);
    this.name = 'WheelNotFoundError';
    this.code = code;
  }
}

export class WheelValidationError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'WheelValidationError';
    this.code = code;
  }
}

export class WheelForbiddenError extends Error {
  public readonly code: string;

  constructor(message = 'Access denied.', code = 'FORBIDDEN') {
    super(message);
    this.name = 'WheelForbiddenError';
    this.code = code;
  }
}

export class WheelConflictError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CONFLICT') {
    super(message);
    this.name = 'WheelConflictError';
    this.code = code;
  }
}

export class WheelCooldownError extends Error {
  public readonly code = 'COOLDOWN_ACTIVE';
  public readonly eligibility: WheelEligibilityState;

  constructor(message: string, eligibility: WheelEligibilityState) {
    super(message);
    this.name = 'WheelCooldownError';
    this.eligibility = eligibility;
  }
}

interface RawWheelSpinRow {
  id: string;
  customer_id: string;
  segment_id: string;
  segment_label: string;
  reward_amount: string | number;
  simulated_win_amount: string | number;
  probability_weight: string | number;
  idempotency_key?: string | null;
  tx_id: string | null;
  status: string;
  created_at: Date | string;
}

interface RawWalletRow {
  customer_id: string;
  balance: string | number;
  referral_bonus_balance: string | number;
  free_play_balance: string | number;
  currency: string;
  updated_at: Date | string;
}

interface RawGameAccountRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  username: string;
  status: string;
  balance: string | number;
  free_play_balance: string | number;
  updated_at: Date | string;
}

export interface SpinWheelInput {
  customerId: string;
  idempotencyKey?: string | null;
  nowMs?: number;
  randomUnitFn?: () => number;
}

export interface SaveWheelConfigInput {
  wheelOfLuck: unknown;
  actorId: string;
  actorName: string;
}

export interface TransferGameCreditsInput {
  gameAccountId?: string;
  gameCatalogId?: string;
  customerIdOverride?: string;
  direction: 'load' | 'unload';
  source: 'free_play' | 'referral_bonus' | 'wallet_cash';
  amount: number;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  nowMs?: number;
}

export interface TransferGameCreditsResult {
  success: true;
  direction: 'load' | 'unload';
  source: 'free_play' | 'referral_bonus' | 'wallet_cash';
  amount: number;
  txId: string;
  freePlayReturn: number;
  cashReturn: number;
  wallet: {
    availableBalance: number;
    referralBonusBalance: number;
    freePlayBalance: number;
  };
  gameAccount: {
    id: string;
    customerId: string;
    gameCatalogId: string;
    gameName: string;
    username: string;
    balance: number;
    freePlayBalance: number;
    updatedAt: string;
  };
  staffMessage: Record<string, unknown> | null;
  staffNotificationDelivered: boolean;
  telegramNotified: boolean;
  telegramText?: string | null;
}

function roundMoney(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function toIsoString(val: Date | string | null | undefined, fallbackNow = false): string {
  if (!val) return fallbackNow ? new Date().toISOString() : '';
  if (val instanceof Date) return val.toISOString();
  const parsed = Date.parse(String(val));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(val);
}

function mapWheelSpinRow(row: RawWheelSpinRow): WheelSpinRecord {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    segmentId: String(row.segment_id || ''),
    segmentLabel: String(row.segment_label || ''),
    rewardAmount: roundMoney(row.reward_amount),
    simulatedWinAmount: roundMoney(row.simulated_win_amount),
    probabilityWeight: Number(row.probability_weight ?? 0),
    status: String(row.status || 'completed'),
    txId: row.tx_id ? String(row.tx_id) : undefined,
    createdAt: toIsoString(row.created_at, true),
  };
}

function generateCryptoRandomUnit(): number {
  return crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;
}

export class WheelRepo {
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
          // Ignore secondary rollback error
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
        // Ignore secondary rollback error
      }
      throw err;
    }
  }

  private async loadConfig(db: Pick<TypedDatabaseClient, 'query'>): Promise<WheelOfLuckConfig> {
    const res = await db.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1`,
    );
    const data = res.rows[0]?.data;
    return normalizeWheelConfig(data?.wheelOfLuck || DEFAULT_WHEEL_OF_LUCK_CONFIG);
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

  public async getStatus(
    customerId: string,
    nowMs = Date.now(),
  ): Promise<WheelStatusResponse> {
    const [config, spinsRes, walletRes] = await Promise.all([
      this.loadConfig(this.pool),
      this.pool.query<RawWheelSpinRow>(
        `SELECT id, customer_id, segment_id, segment_label, reward_amount,
                simulated_win_amount, probability_weight, tx_id, status, created_at
         FROM public.wheel_spins
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [customerId],
      ),
      this.pool.query<RawWalletRow>(
        `SELECT customer_id, balance, referral_bonus_balance, free_play_balance, currency, updated_at
         FROM public.wallets
         WHERE customer_id = $1
         LIMIT 1`,
        [customerId],
      ),
    ]);

    const recentSpins = spinsRes.rows.map(mapWheelSpinRow);
    const latestCompleted = recentSpins.find((s) => s.status === 'completed') || null;
    const wallet = walletRes.rows[0];

    const eligibility = evaluateWheelEligibility({
      config,
      lastSpinAt: latestCompleted?.createdAt || null,
      serverNowMs: nowMs,
    });

    return {
      config,
      eligibility,
      freePlayBalance: roundMoney(wallet?.free_play_balance),
      availableBalance: roundMoney(wallet?.balance),
      referralBonusBalance: roundMoney(wallet?.referral_bonus_balance),
      recentSpins,
      latestSpin: latestCompleted,
    };
  }

  public async spin(input: SpinWheelInput): Promise<WheelSpinResponse> {
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const cleanIdemp = input.idempotencyKey
      ? String(input.idempotencyKey).trim().slice(0, 96) || null
      : null;

    return this.withTransaction(async (db) => {
      const config = await this.loadConfig(db);

      const userRes = await db.query<{
        id: string;
        display_name: string;
        role: string;
      }>(
        `SELECT id, display_name, role
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [input.customerId],
      );
      const user = userRes.rows[0];
      if (!user) {
        throw new WheelNotFoundError('User account not found.', 'USER_NOT_FOUND');
      }

      await db.query(
        `INSERT INTO public.wallets (
           customer_id, balance, referral_bonus_balance, free_play_balance,
           pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
           currency, updated_at
         ) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 'USD', timezone('utc'::text, now()))
         ON CONFLICT (customer_id) DO NOTHING`,
        [input.customerId],
      );

      const walletRes = await db.query<RawWalletRow>(
        `SELECT customer_id, balance, referral_bonus_balance, free_play_balance, currency, updated_at
         FROM public.wallets
         WHERE customer_id = $1
         FOR UPDATE`,
        [input.customerId],
      );
      const wallet = walletRes.rows[0]!;
      let freePlayBalance = roundMoney(wallet.free_play_balance);
      const availableBalance = roundMoney(wallet.balance);
      const referralBonusBalance = roundMoney(wallet.referral_bonus_balance);

      // 1. Idempotency replay check before cooldown / random spin
      if (cleanIdemp) {
        const existingIdempRes = await db.query<RawWheelSpinRow>(
          `SELECT id, customer_id, segment_id, segment_label, reward_amount,
                  simulated_win_amount, probability_weight, idempotency_key, tx_id, status, created_at
           FROM public.wheel_spins
           WHERE customer_id = $1 AND idempotency_key = $2
           LIMIT 1`,
          [input.customerId, cleanIdemp],
        );
        const existing = existingIdempRes.rows[0];
        if (existing) {
          const spin = mapWheelSpinRow(existing);
          const idx = Math.max(
            0,
            config.segments.findIndex((s) => s.id === spin.segmentId),
          );
          const matchedSeg = config.segments[idx] || {
            id: spin.segmentId,
            label: spin.segmentLabel,
            rewardAmount: spin.rewardAmount,
            probabilityWeight: spin.probabilityWeight,
            color: '#4F46E5',
            enabled: true,
          };
          const eligibility = evaluateWheelEligibility({
            config,
            lastSpinAt: spin.createdAt,
            serverNowMs: nowMs,
          });
          return {
            success: true,
            idempotentReplay: true,
            spin,
            selectedSegment: matchedSeg,
            segmentIndex: idx,
            rewardAmount: spin.rewardAmount,
            actualRewardAmount: spin.rewardAmount,
            simulatedWinAmount: spin.simulatedWinAmount,
            simulatedWinDisplay: config.simulatedWinDisplay,
            freePlayBalance,
            availableBalance,
            referralBonusBalance,
            eligibility,
            txId: spin.txId ?? null,
          };
        }
      }

      if (!config.enabled) {
        throw new WheelForbiddenError(
          'Wheel of Luck is currently disabled by Admin.',
          'WHEEL_DISABLED',
        );
      }

      const randomUnit = (input.randomUnitFn || generateCryptoRandomUnit)();
      const selection = selectWeightedWheelSegment(config.segments, randomUnit);
      if (!selection) {
        throw new WheelConflictError(
          'No active reward segments are configured for the Wheel of Luck.',
          'NO_ACTIVE_SEGMENTS',
        );
      }

      // 2. Rolling 24-hour cooldown check under row locks
      const latestSpinRes = await db.query<RawWheelSpinRow>(
        `SELECT id, customer_id, segment_id, segment_label, reward_amount,
                simulated_win_amount, probability_weight, tx_id, status, created_at
         FROM public.wheel_spins
         WHERE customer_id = $1 AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.customerId],
      );
      const latestSpin = latestSpinRes.rows[0];
      if (latestSpin) {
        const lastMs = Date.parse(toIsoString(latestSpin.created_at, true));
        if (Number.isFinite(lastMs) && lastMs + ROLLING_SPIN_COOLDOWN_MS > nowMs) {
          const eligibility = evaluateWheelEligibility({
            config,
            lastSpinAt: new Date(lastMs).toISOString(),
            serverNowMs: nowMs,
          });
          throw new WheelCooldownError(
            'Daily spin already claimed. Next spin unlocks after the 24-hour cooldown.',
            eligibility,
          );
        }
      }

      // 3. Record spin & credit ONLY rewardAmount to free_play_balance (NEVER simulatedWinAmount)
      const rewardAmount = roundMoney(selection.segment.rewardAmount);
      const simulatedWinAmount = config.simulatedWinDisplay.enabled
        ? roundMoney(config.simulatedWinDisplay.amount)
        : 0;
      const spinId = `wspin_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
      const txId =
        rewardAmount > 0
          ? `tx_wspin_${nowMs}_${crypto.randomBytes(4).toString('hex')}`
          : null;

      const insertedSpinRes = await db.query<RawWheelSpinRow>(
        `INSERT INTO public.wheel_spins (
           id, customer_id, segment_id, segment_label, reward_amount,
           simulated_win_amount, probability_weight, idempotency_key, tx_id,
           status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10)
         RETURNING id, customer_id, segment_id, segment_label, reward_amount,
                   simulated_win_amount, probability_weight, idempotency_key, tx_id,
                   status, created_at`,
        [
          spinId,
          input.customerId,
          selection.segment.id,
          selection.segment.label,
          rewardAmount,
          simulatedWinAmount,
          selection.segment.probabilityWeight,
          cleanIdemp,
          txId,
          nowIso,
        ],
      );

      if (rewardAmount > 0 && txId) {
        const updWalletRes = await db.query<RawWalletRow>(
          `UPDATE public.wallets
           SET free_play_balance = free_play_balance + $2,
               updated_at = $3
           WHERE customer_id = $1
           RETURNING customer_id, balance, referral_bonus_balance, free_play_balance, currency, updated_at`,
          [input.customerId, rewardAmount, nowIso],
        );
        freePlayBalance = roundMoney(
          updWalletRes.rows[0]?.free_play_balance ?? freePlayBalance + rewardAmount,
        );

        await db.query(
          `INSERT INTO public.transactions (
             id, customer_id, amount, type, status, description, reference_id, game_name, created_at
           ) VALUES ($1, $2, $3, 'free_play_bonus', 'completed', $4, $5, 'Wheel of Luck', $6)`,
          [
            txId,
            input.customerId,
            rewardAmount,
            `Wheel of Luck Free-Play Reward: ${selection.segment.label}`,
            spinId,
            nowIso,
          ],
        );

        await this.maybeInsertNotification(db, {
          id: `notif_wspin_${spinId}`,
          userId: input.customerId,
          title: 'Wheel of Luck Free-Play Credited!',
          message: `You spun "${selection.segment.label}" and received $${rewardAmount.toFixed(2)} in Free-Play credits.`,
          type: 'bonus',
          linkTab: 'game_accounts',
          linkRequestId: spinId,
        });
      }

      await this.insertAuditLog(db, {
        actorId: input.customerId,
        actorName: user.display_name || 'Player',
        actorRole: user.role || 'customer',
        action: 'WHEEL_OF_LUCK_SPIN_CLAIMED',
        entityType: 'wallet',
        entityId: input.customerId,
        details: `Spun Wheel of Luck -> landed on "${selection.segment.label}" ($${rewardAmount.toFixed(2)} Free-Play).${simulatedWinAmount > 0 ? ` Showcase banner: $${simulatedWinAmount.toFixed(2)} (simulated only).` : ''}`,
      });

      const spinRecord = mapWheelSpinRow(insertedSpinRes.rows[0]!);
      const eligibility = evaluateWheelEligibility({
        config,
        lastSpinAt: spinRecord.createdAt,
        serverNowMs: nowMs,
      });

      return {
        success: true,
        idempotentReplay: false,
        spin: spinRecord,
        selectedSegment: selection.segment,
        segmentIndex: selection.segmentIndexInAll,
        rewardAmount,
        actualRewardAmount: rewardAmount,
        simulatedWinAmount,
        simulatedWinDisplay: config.simulatedWinDisplay,
        freePlayBalance,
        availableBalance,
        referralBonusBalance,
        eligibility,
        txId,
      };
    });
  }

  public async saveWheelConfig(input: SaveWheelConfigInput): Promise<WheelOfLuckConfig> {
    const validation = validateWheelConfig(input.wheelOfLuck);
    if (!validation.valid) {
      throw new WheelValidationError(
        validation.errors[0] || 'Invalid Wheel of Luck configuration.',
      );
    }

    await this.withTransaction(async (db) => {
      const existingRes = await db.query<{ data: Record<string, unknown> }>(
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
      );
      const currentData = existingRes.rows[0]?.data || {};
      const nextData = {
        ...currentData,
        wheelOfLuck: validation.config,
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
        action: 'WHEEL_CONFIG_UPDATED',
        entityType: 'settings',
        entityId: 'wheel_of_luck',
        details: `Updated Wheel of Luck settings: ${validation.config.enabled ? 'Enabled' : 'Disabled'}, ${validation.config.segments.length} segments, showcase $${validation.config.simulatedWinDisplay.amount.toFixed(2)} (${validation.config.simulatedWinDisplay.enabled ? 'on' : 'off'}).`,
      });
    });

    return validation.config;
  }

  public async transferGameCredits(
    input: TransferGameCreditsInput,
  ): Promise<TransferGameCreditsResult> {
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const amount = roundMoney(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      throw new WheelValidationError('Amount must be greater than $0.00.');
    }

    return this.withTransaction(async (db) => {
      const isStaff = input.actorRole === 'admin' || input.actorRole === 'agent';
      const targetCustomer =
        isStaff && input.customerIdOverride
          ? input.customerIdOverride
          : input.actorId;

      // Resolve target owner non-lockingly first so row locks always follow
      // canonical DAG order (wallets -> game_accounts), matching transfer_game_credits_atomic.
      let ownerId = targetCustomer;
      if (input.gameAccountId) {
        const lookupRes = await db.query<{ customer_id: string }>(
          `SELECT customer_id FROM public.game_accounts WHERE id = $1 LIMIT 1`,
          [input.gameAccountId],
        );
        const foundOwner = lookupRes.rows[0]?.customer_id;
        if (!foundOwner) {
          throw new WheelNotFoundError(
            'Game account not found.',
            'GAME_ACCOUNT_NOT_FOUND',
          );
        }
        ownerId = foundOwner;
      }

      if (ownerId !== input.actorId && !isStaff) {
        throw new WheelForbiddenError(
          'Access Denied: You can only manage credits for your own game accounts.',
        );
      }

      await db.query(
        `INSERT INTO public.wallets (
           customer_id, balance, referral_bonus_balance, free_play_balance,
           pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
           currency, updated_at
         ) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 'USD', timezone('utc'::text, now()))
         ON CONFLICT (customer_id) DO NOTHING`,
        [ownerId],
      );

      const walletRes = await db.query<RawWalletRow>(
        `SELECT customer_id, balance, referral_bonus_balance, free_play_balance, currency, updated_at
         FROM public.wallets
         WHERE customer_id = $1
         FOR UPDATE`,
        [ownerId],
      );
      const wallet = walletRes.rows[0]!;

      let accountRow: RawGameAccountRow | undefined;
      if (input.gameAccountId) {
        const res = await db.query<RawGameAccountRow>(
          `SELECT id, customer_id, game_id, game_title, username, status,
                  balance, free_play_balance, updated_at
           FROM public.game_accounts
           WHERE id = $1
           FOR UPDATE`,
          [input.gameAccountId],
        );
        accountRow = res.rows[0];
      } else if (input.gameCatalogId) {
        const res = await db.query<RawGameAccountRow>(
          `SELECT id, customer_id, game_id, game_title, username, status,
                  balance, free_play_balance, updated_at
           FROM public.game_accounts
           WHERE customer_id = $1 AND game_id = $2
           FOR UPDATE`,
          [ownerId, input.gameCatalogId],
        );
        accountRow = res.rows[0];
      }

      if (!accountRow) {
        throw new WheelNotFoundError(
          'Game account not found.',
          'GAME_ACCOUNT_NOT_FOUND',
        );
      }

      if (accountRow.customer_id !== input.actorId && !isStaff) {
        throw new WheelForbiddenError(
          'Access Denied: You can only manage credits for your own game accounts.',
        );
      }

      if (String(accountRow.status || '').toLowerCase() !== 'active') {
        throw new WheelValidationError(
          'Game account must be active before transferring credits.',
        );
      }

      let nextWalletCash = roundMoney(wallet.balance);
      let nextWalletRef = roundMoney(wallet.referral_bonus_balance);
      let nextWalletFp = roundMoney(wallet.free_play_balance);
      let nextGameBal = roundMoney(accountRow.balance);
      let nextGameFp = Math.min(nextGameBal, roundMoney(accountRow.free_play_balance));
      let fpReturn = 0;
      let cashReturn = 0;
      let txType = 'game_load';
      let txDesc = '';

      if (input.direction === 'load') {
        if (input.source === 'free_play') {
          if (nextWalletFp < amount) {
            throw new WheelValidationError(
              `Insufficient Free-Play balance ($${nextWalletFp.toFixed(2)}).`,
              'INSUFFICIENT_FREE_PLAY',
            );
          }
          nextWalletFp = roundMoney(nextWalletFp - amount);
          nextGameFp = roundMoney(nextGameFp + amount);
          nextGameBal = roundMoney(nextGameBal + amount);
          txDesc = `Free-Play Loaded to ${accountRow.game_title} (${accountRow.username})`;
        } else if (input.source === 'referral_bonus') {
          if (nextWalletRef < amount) {
            throw new WheelValidationError(
              `Insufficient referral bonus balance ($${nextWalletRef.toFixed(2)}).`,
              'INSUFFICIENT_REFERRAL_BONUS',
            );
          }
          nextWalletRef = roundMoney(nextWalletRef - amount);
          nextGameFp = roundMoney(nextGameFp + amount);
          nextGameBal = roundMoney(nextGameBal + amount);
          txDesc = `Referral Bonus Loaded to ${accountRow.game_title} (${accountRow.username})`;
        } else {
          if (nextWalletCash < amount) {
            throw new WheelValidationError(
              `Insufficient wallet cash balance ($${nextWalletCash.toFixed(2)}).`,
              'INSUFFICIENT_WALLET_CASH',
            );
          }
          nextWalletCash = roundMoney(nextWalletCash - amount);
          nextGameBal = roundMoney(nextGameBal + amount);
          txDesc = `Wallet Cash Loaded to ${accountRow.game_title} (${accountRow.username})`;
        }
      } else {
        const split = computeGameCreditUnloadSplit({
          totalGameBalance: nextGameBal,
          trackedFreePlayBalance: nextGameFp,
          requestedAmount: amount,
        });
        if (!split.valid) {
          throw new WheelValidationError(
            split.error || 'Insufficient game credits to unload.',
            'INSUFFICIENT_GAME_CREDITS',
          );
        }
        fpReturn = split.freePlayReturn;
        cashReturn = split.cashReturn;
        nextGameBal = split.nextGameBalance;
        nextGameFp = split.nextGameFreePlayBalance;
        nextWalletFp = roundMoney(nextWalletFp + fpReturn);
        nextWalletCash = roundMoney(nextWalletCash + cashReturn);
        txType = 'game_redeem';
        txDesc = `Unloaded $${amount.toFixed(2)} from ${accountRow.game_title} (${accountRow.username})`;
      }

      await db.query(
        `UPDATE public.wallets
         SET balance = $2,
             referral_bonus_balance = $3,
             free_play_balance = $4,
             updated_at = $5
         WHERE customer_id = $1`,
        [ownerId, nextWalletCash, nextWalletRef, nextWalletFp, nowIso],
      );

      await db.query(
        `UPDATE public.game_accounts
         SET balance = $2,
             free_play_balance = $3,
             updated_at = $4
         WHERE id = $1`,
        [accountRow.id, nextGameBal, nextGameFp, nowIso],
      );

      const txId = `tx_gxf_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
      await db.query(
        `INSERT INTO public.transactions (
           id, customer_id, amount, type, status, description, reference_id, game_name, created_at
         ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8)`,
        [
          txId,
          ownerId,
          amount,
          txType,
          txDesc,
          accountRow.id,
          accountRow.game_title,
          nowIso,
        ],
      );

      await this.insertAuditLog(db, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action:
          input.direction === 'load'
            ? 'GAME_CREDITS_LOADED'
            : 'GAME_CREDITS_UNLOADED',
        entityType: 'game_account',
        entityId: accountRow.id,
        details:
          input.direction === 'load'
            ? `Loaded $${amount.toFixed(2)} (${input.source}) into ${accountRow.game_title} (${accountRow.username}).`
            : `Unloaded $${amount.toFixed(2)} from ${accountRow.game_title} (${accountRow.username}) -> Free-Play returned: $${fpReturn.toFixed(2)}, Cash returned: $${cashReturn.toFixed(2)}.`,
      });

      const ownerUserRes = await db.query<{ display_name: string }>(
        `SELECT display_name FROM public.users WHERE id = $1 LIMIT 1`,
        [ownerId],
      );
      const ownerDisplayName = ownerUserRes.rows[0]?.display_name || input.actorName;

      const staffPayload = buildGameBonusLoadStaffMessage({
        direction: input.direction,
        source: input.source,
        amount,
        customerId: ownerId,
        customerName: ownerDisplayName,
        gameTitle: accountRow.game_title,
        gameUsername: accountRow.username,
        txId,
        createdAt: nowIso,
      });

      let staffMessage: Record<string, unknown> | null = null;
      let staffNotificationDelivered = false;
      if (staffPayload) {
        staffMessage = {
          id: staffPayload.id,
          conversation_id: staffPayload.conversationId,
          sender_id: staffPayload.senderId,
          sender_name: staffPayload.senderName,
          sender_role: staffPayload.senderRole,
          content: staffPayload.content,
          transaction_data: null,
          created_at: staffPayload.createdAt,
          is_internal_note: false,
        };

        const chatCheck = await db.query<{
          conv_reg: string | null;
          msg_reg: string | null;
        }>(
          `SELECT to_regclass('public.conversations') AS conv_reg,
                  to_regclass('public.messages') AS msg_reg`,
        );
        if (chatCheck.rows[0]?.conv_reg && chatCheck.rows[0]?.msg_reg) {
          await db.query(
            `INSERT INTO public.conversations (
               id, customer_id, customer_name, last_message, last_message_at, status
             ) VALUES ($1, $2, $3, $4, $5, 'open')
             ON CONFLICT (id) DO UPDATE SET
               last_message = EXCLUDED.last_message,
               last_message_at = EXCLUDED.last_message_at,
               status = 'open'`,
            [
              staffPayload.conversationId,
              staffPayload.senderId,
              staffPayload.senderName,
              staffPayload.content,
              staffPayload.createdAt,
            ],
          );
          await db.query(
            `INSERT INTO public.messages (
               id, conversation_id, sender_id, sender_name, sender_role,
               content, transaction_data, created_at, is_internal_note
             ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, false)
             ON CONFLICT (id) DO NOTHING`,
            [
              staffPayload.id,
              staffPayload.conversationId,
              staffPayload.senderId,
              staffPayload.senderName,
              staffPayload.senderRole,
              staffPayload.content,
              staffPayload.createdAt,
            ],
          );
          staffNotificationDelivered = true;
        }
      }

      await this.maybeInsertNotification(db, {
        id: `notif_gxf_${txId}`,
        userId: ownerId,
        title:
          input.direction === 'load'
            ? 'Game Credits Loaded'
            : 'Game Credits Unloaded',
        message:
          input.direction === 'load'
            ? `$${amount.toFixed(2)} loaded onto ${accountRow.game_title} (${accountRow.username}).`
            : `$${amount.toFixed(2)} unloaded from ${accountRow.game_title} (Free-Play: $${fpReturn.toFixed(2)}, Cash: $${cashReturn.toFixed(2)}).`,
        type: 'game_account',
        linkTab: 'game_accounts',
        linkRequestId: accountRow.id,
      });

      return {
        success: true,
        direction: input.direction,
        source: input.source,
        amount,
        txId,
        freePlayReturn: fpReturn,
        cashReturn,
        wallet: {
          availableBalance: nextWalletCash,
          referralBonusBalance: nextWalletRef,
          freePlayBalance: nextWalletFp,
        },
        gameAccount: {
          id: accountRow.id,
          customerId: ownerId,
          gameCatalogId: accountRow.game_id,
          gameName: accountRow.game_title,
          username: accountRow.username,
          balance: nextGameBal,
          freePlayBalance: nextGameFp,
          updatedAt: nowIso,
        },
        staffMessage,
        staffNotificationDelivered,
        telegramNotified: false,
        telegramText: staffPayload?.telegramText ?? null,
      };
    });
  }
}
