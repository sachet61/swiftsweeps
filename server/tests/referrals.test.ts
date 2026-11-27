import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from '../app.js';
import type {
  EmailDeliveryAdapter,
  SendOtpEmailPayload,
  SendPasswordResetEmailPayload,
  SendVerificationEmailPayload,
} from '../auth/emailDelivery.js';
import type { ServerConfig } from '../config/env.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';

interface InMemoryUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  email_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  signup_ip: string | null;
  device_fingerprint: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAuthLinkRow {
  app_user_id: string;
  auth_user_id: string | null;
  legacy_supabase_uid: string | null;
  email_normalized: string;
  migration_source: string;
  password_reset_required: boolean;
  linked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryWalletRow {
  customer_id: string;
  balance: string;
  referral_bonus_balance: string;
  free_play_balance: string;
  pending_withdrawal: string;
  pending_deposit: string;
  total_deposited: string;
  total_withdrawn: string;
  currency: string;
  updated_at: Date;
}

interface InMemoryTransactionRow {
  id: string;
  customer_id: string;
  amount: string;
  type: string;
  status: string;
  description: string;
  reference_id: string | null;
  game_name: string | null;
  created_at: Date;
}

interface InMemoryTopupRow {
  id: string;
  customer_id: string;
  amount: string;
  status: string;
  payment_method_id: string;
  created_at: Date;
}

interface InMemoryReferralAwardRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  referral_code_used: string;
  source: string;
  reward_mode: string;
  payout_target: string;
  referrer_reward_amount: string;
  referee_reward_amount: string;
  qualifying_deposit_id: string | null;
  qualifying_deposit_amount: string;
  status: string;
  fraud_flags: string[];
  staff_reason: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  rewarded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAuditLogRow {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  timestamp: Date;
}

class InMemoryReferralDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public users = new Map<string, InMemoryUserRow>();
  public authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public transactions = new Map<string, InMemoryTransactionRow>();
  public topups = new Map<string, InMemoryTopupRow>();
  public referralAwards = new Map<string, InMemoryReferralAwardRow>();
  public appConfig = new Map<string, Record<string, unknown>>();
  public auditLogs: InMemoryAuditLogRow[] = [];

  public failNextReferralQuery = false;
  public delayInsideTxMs = 0;

  private lockQueue: Promise<void> = Promise.resolve();
  private txSnapshot: {
    users: Map<string, InMemoryUserRow>;
    wallets: Map<string, InMemoryWalletRow>;
    transactions: Map<string, InMemoryTransactionRow>;
    referralAwards: Map<string, InMemoryReferralAwardRow>;
    appConfig: Map<string, Record<string, unknown>>;
    auditLogs: InMemoryAuditLogRow[];
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    let releaseQueue: (() => void) | null = null;
    await new Promise<void>((resolve) => {
      this.lockQueue = this.lockQueue.then(
        () =>
          new Promise<void>((done) => {
            releaseQueue = done;
            resolve();
          }),
      );
    });

    return {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          this.txSnapshot = {
            users: new Map(
              Array.from(this.users.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            wallets: new Map(
              Array.from(this.wallets.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            transactions: new Map(
              Array.from(this.transactions.entries()).map(([k, v]) => [
                k,
                { ...v },
              ]),
            ),
            referralAwards: new Map(
              Array.from(this.referralAwards.entries()).map(([k, v]) => [
                k,
                { ...v, fraud_flags: [...v.fraud_flags] },
              ]),
            ),
            appConfig: new Map(
              Array.from(this.appConfig.entries()).map(([k, v]) => [
                k,
                structuredClone(v),
              ]),
            ),
            auditLogs: [...this.auditLogs],
          };
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'COMMIT') {
          this.txSnapshot = null;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'ROLLBACK') {
          if (this.txSnapshot) {
            this.users = this.txSnapshot.users;
            this.wallets = this.txSnapshot.wallets;
            this.transactions = this.txSnapshot.transactions;
            this.referralAwards = this.txSnapshot.referralAwards;
            this.appConfig = this.txSnapshot.appConfig;
            this.auditLogs = this.txSnapshot.auditLogs;
            this.txSnapshot = null;
          }
          return { rows: [], rowCount: 0 };
        }
        return this.query(sql, values);
      },
      release: () => {
        this.txSnapshot = null;
        if (releaseQueue) {
          const done = releaseQueue;
          releaseQueue = null;
          done();
        }
      },
    };
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

    if (normalized.includes("to_regclass('public.notifications')")) {
      return { rows: [{ reg: null }] };
    }

    if (
      normalized.includes('FROM public.auth_user_links l INNER JOIN public.users u') &&
      normalized.includes('WHERE l.auth_user_id = $1')
    ) {
      const authUserId = String(values[0] ?? '');
      for (const link of this.authLinks.values()) {
        if (link.auth_user_id === authUserId) {
          const user = this.users.get(link.app_user_id);
          if (user) return { rows: [this.toJoinedRow(user, link)] };
        }
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE u.id = $1')
    ) {
      const appUserId = String(values[0] ?? '');
      const user = this.users.get(appUserId);
      if (!user) return { rows: [] };
      return { rows: [this.toJoinedRow(user, this.authLinks.get(appUserId))] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE lower(u.email) = $1')
    ) {
      const cleanEmail = String(values[0] ?? '').toLowerCase();
      for (const user of this.users.values()) {
        if (user.email.toLowerCase() === cleanEmail) {
          return { rows: [this.toJoinedRow(user, this.authLinks.get(user.id))] };
        }
      }
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO public.users')) {
      const [id, email, displayName, emailVerified, referralCode] = values as [
        string,
        string,
        string,
        boolean,
        string,
      ];
      if (!this.users.has(id)) {
        const now = new Date();
        this.users.set(id, {
          id,
          email,
          display_name: displayName,
          role: 'customer',
          phone: null,
          avatar_url: null,
          status: 'active',
          email_verified: emailVerified,
          referral_code: referralCode,
          referred_by: null,
          signup_ip: null,
          device_fingerprint: null,
          created_at: now,
          updated_at: now,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.auth_user_links')) {
      const appUserId = String(values[0]);
      const authUserId = String(values[1]);
      const emailNormalized = String(values[2]);
      const now = new Date();
      this.authLinks.set(appUserId, {
        app_user_id: appUserId,
        auth_user_id: authUserId,
        legacy_supabase_uid: null,
        email_normalized: emailNormalized,
        migration_source: 'self_hosted_signup',
        password_reset_required: false,
        linked_at: now,
        created_at: now,
        updated_at: now,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.users SET email_verified = true')) {
      const id = String(values[0]);
      const user = this.users.get(id);
      if (user) {
        user.email_verified = true;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (
      this.failNextReferralQuery &&
      normalized.includes('public.referral_awards')
    ) {
      this.failNextReferralQuery = false;
      throw new Error('pg_referral_error: simulated database timeout');
    }

    // app_config
    if (normalized.startsWith("SELECT data FROM public.app_config WHERE id = 'main'")) {
      const data = this.appConfig.get('main');
      return { rows: data ? [{ data: structuredClone(data) }] : [] };
    }
    if (normalized.startsWith('INSERT INTO public.app_config')) {
      const parsed = JSON.parse(String(values[0] ?? '{}'));
      this.appConfig.set('main', parsed);
      return { rows: [], rowCount: 1 };
    }

    // audit_logs
    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      const [id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details] =
        values as [string, string, string, string, string, string, string, string | null];
      this.auditLogs.push({
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details: details ?? null,
        timestamp: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    // users lookups & updates
    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE id = $1') &&
      !normalized.includes('LEFT JOIN')
    ) {
      if (this.delayInsideTxMs > 0 && normalized.includes('FOR UPDATE')) {
        await new Promise((r) => setTimeout(r, this.delayInsideTxMs));
      }
      const u = this.users.get(String(values[0] ?? ''));
      return { rows: u ? [{ ...u }] : [] };
    }

    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE upper(referral_code) = upper($1)') &&
      normalized.includes('AND id <> $2')
    ) {
      const code = String(values[0] ?? '').toUpperCase();
      const excludeId = String(values[1] ?? '');
      for (const u of this.users.values()) {
        if (u.id !== excludeId && (u.referral_code || '').toUpperCase() === code) {
          return { rows: [{ ...u }] };
        }
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE upper(referral_code) = upper($1)')
    ) {
      const code = String(values[0] ?? '').toUpperCase();
      for (const u of this.users.values()) {
        if ((u.referral_code || '').toUpperCase() === code) {
          return { rows: [{ ...u }] };
        }
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE lower(email) = $1')
    ) {
      const clean = String(values[0] ?? '').toLowerCase();
      for (const u of this.users.values()) {
        if (u.email.toLowerCase() === clean) return { rows: [{ ...u }] };
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE id = ANY($1::text[])')
    ) {
      const ids = Array.isArray(values[0]) ? (values[0] as string[]) : [];
      const set = new Set(ids);
      return {
        rows: Array.from(this.users.values())
          .filter((u) => set.has(u.id))
          .map((u) => ({ ...u })),
      };
    }

    if (normalized === 'SELECT id, email, phone FROM public.users LIMIT 200') {
      return {
        rows: Array.from(this.users.values())
          .slice(0, 200)
          .map((u) => ({ id: u.id, email: u.email, phone: u.phone })),
      };
    }

    if (normalized.startsWith('UPDATE public.users SET signup_ip = COALESCE($2, signup_ip)')) {
      const [id, ip, fp] = values as [string, string | null, string | null];
      const u = this.users.get(id);
      if (u) {
        if (ip && !u.signup_ip) u.signup_ip = ip;
        if (fp && !u.device_fingerprint) u.device_fingerprint = fp;
        u.updated_at = new Date();
      }
      return { rows: [], rowCount: u ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET referred_by = $2')) {
      const [id, code] = values as [string, string];
      const u = this.users.get(id);
      if (u) {
        u.referred_by = code;
        u.updated_at = new Date();
      }
      return { rows: [], rowCount: u ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET referral_code = $2')) {
      const [id, code] = values as [string, string];
      const u = this.users.get(id);
      if (!u) return { rows: [], rowCount: 0 };
      u.referral_code = code;
      u.updated_at = new Date();
      return { rows: [{ ...u }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.users SET referred_by = $2') === false &&
        normalized.includes('SET referred_by = $2') &&
        normalized.includes('WHERE upper(referred_by) = upper($1)')) {
      const [oldCode, newCode] = values as [string, string];
      for (const u of this.users.values()) {
        if ((u.referred_by || '').toUpperCase() === oldCode.toUpperCase()) {
          u.referred_by = newCode;
          u.updated_at = new Date();
        }
      }
      return { rows: [] };
    }

    // wallets
    if (normalized.startsWith('INSERT INTO public.wallets')) {
      const cid = String(values[0]);
      if (!this.wallets.has(cid)) {
        this.wallets.set(cid, {
          customer_id: cid,
          balance: '0.00',
          referral_bonus_balance: '0.00',
          free_play_balance: '0.00',
          pending_withdrawal: '0.00',
          pending_deposit: '0.00',
          total_deposited: '0.00',
          total_withdrawn: '0.00',
          currency: 'USD',
          updated_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.includes('FROM public.wallets') &&
      normalized.includes('WHERE customer_id = $1')
    ) {
      const w = this.wallets.get(String(values[0] ?? ''));
      return { rows: w ? [{ ...w }] : [] };
    }

    if (normalized.startsWith('UPDATE public.wallets SET referral_bonus_balance = referral_bonus_balance + $2')) {
      const [cid, amt] = values as [string, number];
      const w = this.wallets.get(cid);
      if (w) {
        w.referral_bonus_balance = (Number(w.referral_bonus_balance) + Number(amt)).toFixed(2);
        w.updated_at = new Date();
      }
      return { rows: [], rowCount: w ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET balance = balance + $2')) {
      const [cid, amt] = values as [string, number];
      const w = this.wallets.get(cid);
      if (w) {
        w.balance = (Number(w.balance) + Number(amt)).toFixed(2);
        w.updated_at = new Date();
      }
      return { rows: [], rowCount: w ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET referral_bonus_balance = $2')) {
      const [cid, amt] = values as [string, number];
      const w = this.wallets.get(cid);
      if (w) {
        w.referral_bonus_balance = Number(amt).toFixed(2);
        w.updated_at = new Date();
      }
      return { rows: [], rowCount: w ? 1 : 0 };
    }

    // topups
    if (
      normalized.includes('FROM public.topups') &&
      normalized.includes('WHERE customer_id = $1')
    ) {
      const cid = String(values[0] ?? '');
      return {
        rows: Array.from(this.topups.values())
          .filter((t) => t.customer_id === cid)
          .map((t) => ({ ...t })),
      };
    }

    if (
      normalized.includes('FROM public.topups') &&
      normalized.includes('WHERE customer_id = ANY($1::text[])')
    ) {
      const ids = new Set(Array.isArray(values[0]) ? (values[0] as string[]) : []);
      return {
        rows: Array.from(this.topups.values())
          .filter((t) => ids.has(t.customer_id))
          .map((t) => ({ ...t })),
      };
    }

    // transactions
    if (
      normalized.includes('FROM public.transactions') &&
      normalized.includes("WHERE (reference_id = $1 AND type = 'referral_reward')")
    ) {
      const [awardId, refTxId, eeTxId] = values as [string, string, string];
      return {
        rows: Array.from(this.transactions.values())
          .filter(
            (tx) =>
              (tx.reference_id === awardId && tx.type === 'referral_reward') ||
              tx.id === refTxId ||
              tx.id === eeTxId,
          )
          .map((tx) => ({ ...tx })),
      };
    }

    if (
      normalized.includes('FROM public.transactions') &&
      normalized.includes("WHERE customer_id = $1 AND type = 'referral_reward'")
    ) {
      const cid = String(values[0] ?? '');
      return {
        rows: Array.from(this.transactions.values())
          .filter((tx) => tx.customer_id === cid && tx.type === 'referral_reward')
          .map((tx) => ({ ...tx })),
      };
    }

    if (
      normalized.includes('FROM public.transactions') &&
      normalized.includes("WHERE customer_id = $1 AND type IN ('bonus', 'game_load')")
    ) {
      const cid = String(values[0] ?? '');
      return {
        rows: Array.from(this.transactions.values())
          .filter(
            (tx) =>
              tx.customer_id === cid &&
              (tx.type === 'bonus' || tx.type === 'game_load'),
          )
          .map((tx) => ({ ...tx })),
      };
    }

    if (normalized.startsWith('INSERT INTO public.transactions')) {
      const [id, customer_id, amount, description, reference_id] = values as [
        string,
        string,
        number,
        string,
        string,
      ];
      if (!this.transactions.has(id)) {
        this.transactions.set(id, {
          id,
          customer_id,
          amount: Number(amount).toFixed(2),
          type: 'referral_reward',
          status: 'completed',
          description,
          reference_id,
          game_name: null,
          created_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // referral_awards queries
    if (normalized.startsWith('SELECT COUNT(*)::int AS cnt FROM public.referral_awards')) {
      const referrerId = String(values[0] ?? '');
      const cnt = Array.from(this.referralAwards.values()).filter(
        (a) => a.referrer_id === referrerId && a.status === 'rewarded',
      ).length;
      return { rows: [{ cnt }] };
    }

    if (
      normalized.includes('SELECT referrer_reward_amount, referee_reward_amount FROM public.referral_awards')
    ) {
      const dayPrefix = String(values[0] ?? '');
      return {
        rows: Array.from(this.referralAwards.values())
          .filter(
            (a) =>
              a.status === 'rewarded' &&
              a.rewarded_at &&
              a.rewarded_at.toISOString().startsWith(dayPrefix),
          )
          .map((a) => ({
            referrer_reward_amount: a.referrer_reward_amount,
            referee_reward_amount: a.referee_reward_amount,
          })),
      };
    }

    if (normalized.startsWith('SELECT * FROM public.referral_awards WHERE id = $1')) {
      const a = this.referralAwards.get(String(values[0] ?? ''));
      return { rows: a ? [{ ...a, fraud_flags: [...a.fraud_flags] }] : [] };
    }

    if (normalized.startsWith('SELECT * FROM public.referral_awards WHERE referee_id = $1')) {
      const refereeId = String(values[0] ?? '');
      const found = Array.from(this.referralAwards.values()).find(
        (a) => a.referee_id === refereeId,
      );
      return { rows: found ? [{ ...found, fraud_flags: [...found.fraud_flags] }] : [] };
    }

    if (normalized.startsWith('SELECT * FROM public.referral_awards WHERE referrer_id = $1')) {
      const referrerId = String(values[0] ?? '');
      const rows = Array.from(this.referralAwards.values())
        .filter((a) => a.referrer_id === referrerId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((a) => ({ ...a, fraud_flags: [...a.fraud_flags] }));
      return { rows };
    }

    if (
      normalized.startsWith('SELECT id, payout_target FROM public.referral_awards')
    ) {
      const ids = new Set(Array.isArray(values[0]) ? (values[0] as string[]) : []);
      return {
        rows: Array.from(this.referralAwards.values())
          .filter((a) => ids.has(a.referrer_id) || ids.has(a.referee_id))
          .map((a) => ({ id: a.id, payout_target: a.payout_target })),
      };
    }

    if (
      normalized.startsWith("SELECT * FROM public.referral_awards WHERE status IN ('rewarded', 'processing')")
    ) {
      let rows = Array.from(this.referralAwards.values()).filter(
        (a) => a.status === 'rewarded' || a.status === 'processing',
      );
      let idx = 0;
      if (normalized.includes('referrer_id = $')) {
        const uid = String(values[idx++] ?? '');
        rows = rows.filter((a) => a.referrer_id === uid || a.referee_id === uid);
      }
      if (normalized.includes('id = ANY($')) {
        const ids = new Set(Array.isArray(values[idx++]) ? (values[idx - 1] as string[]) : []);
        rows = rows.filter((a) => ids.has(a.id));
      }
      const limit = Number(values[idx] ?? 50);
      rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return {
        rows: rows.slice(0, limit).map((a) => ({ ...a, fraud_flags: [...a.fraud_flags] })),
      };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.referral_awards ra')) {
      const filtered = this.filterAdminLedger(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.includes('FROM public.referral_awards ra') &&
      normalized.includes('LIMIT $')
    ) {
      const limit = Number(values[values.length - 2] ?? 100);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterAdminLedger(normalized, filterParams);
      filtered.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return {
        rows: filtered
          .slice(offset, offset + limit)
          .map((a) => this.withJoinedUsers(a)),
      };
    }

    if (
      normalized.includes('FROM public.referral_awards ra') &&
      normalized.includes('LIMIT 200')
    ) {
      const rows = Array.from(this.referralAwards.values()).sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime(),
      );
      return { rows: rows.slice(0, 200).map((a) => this.withJoinedUsers(a)) };
    }

    if (normalized.startsWith('INSERT INTO public.referral_awards')) {
      const now = new Date();
      // Distinguish simple signup insert vs credit/held/link upserts
      if (normalized.includes("'signup_link'") && values.length === 7) {
        const [id, referrer_id, referee_id, referral_code_used, reward_mode, payout_target, flagsJson] =
          values as [string, string, string, string, string, string, string];
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source: 'signup_link',
          reward_mode,
          payout_target,
          referrer_reward_amount: '0.00',
          referee_reward_amount: '0.00',
          qualifying_deposit_id: null,
          qualifying_deposit_amount: '0.00',
          status: 'registered',
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: null,
          assigned_by: null,
          assigned_by_name: null,
          reviewed_by: null,
          reviewed_by_name: null,
          review_notes: null,
          rewarded_at: null,
          created_at: now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      // creditReferralAwardInTx (values length 18)
      if (values.length === 18 && normalized.includes("'rewarded'")) {
        const [
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          refAmt,
          eeAmt,
          qualDepId,
          qualDepAmt,
          flagsJson,
          staff_reason,
          assigned_by,
          assigned_by_name,
          reviewed_by,
          reviewed_by_name,
          review_notes,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          string | null,
          number,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
          string | null,
        ];
        const existing = this.referralAwards.get(id);
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          referrer_reward_amount: Number(refAmt).toFixed(2),
          referee_reward_amount: Number(eeAmt).toFixed(2),
          qualifying_deposit_id: qualDepId || existing?.qualifying_deposit_id || null,
          qualifying_deposit_amount: Math.max(
            Number(existing?.qualifying_deposit_amount ?? 0),
            Number(qualDepAmt ?? 0),
          ).toFixed(2),
          status: 'rewarded',
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: staff_reason ?? existing?.staff_reason ?? null,
          assigned_by: assigned_by ?? existing?.assigned_by ?? null,
          assigned_by_name: assigned_by_name ?? existing?.assigned_by_name ?? null,
          reviewed_by: reviewed_by ?? existing?.reviewed_by ?? null,
          reviewed_by_name: reviewed_by_name ?? existing?.reviewed_by_name ?? null,
          review_notes: review_notes ?? existing?.review_notes ?? null,
          rewarded_at: existing?.rewarded_at ?? now,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row, fraud_flags: [...row.fraud_flags] }], rowCount: 1 };
      }

      // evaluate registered / pending_deposit (10 params)
      if (values.length === 10) {
        const [
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          qualDepId,
          qualDepAmt,
          flagsJson,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          number,
          string,
        ];
        const status = normalized.includes("'pending_deposit'")
          ? 'pending_deposit'
          : 'registered';
        const existing = this.referralAwards.get(id);
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          referrer_reward_amount: '0.00',
          referee_reward_amount: '0.00',
          qualifying_deposit_id: qualDepId ?? null,
          qualifying_deposit_amount: Number(qualDepAmt ?? 0).toFixed(2),
          status,
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: existing?.staff_reason ?? null,
          assigned_by: existing?.assigned_by ?? null,
          assigned_by_name: existing?.assigned_by_name ?? null,
          reviewed_by: existing?.reviewed_by ?? null,
          reviewed_by_name: existing?.reviewed_by_name ?? null,
          review_notes: existing?.review_notes ?? null,
          rewarded_at: null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row, fraud_flags: [...row.fraud_flags] }], rowCount: 1 };
      }

      // rejected / capped (11 params)
      if (values.length === 11) {
        const [
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          qualDepId,
          qualDepAmt,
          flagsJson,
          reviewNotes,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          number,
          string,
          string,
        ];
        const status = normalized.includes("'capped'") ? 'capped' : 'rejected';
        const existing = this.referralAwards.get(id);
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          referrer_reward_amount: '0.00',
          referee_reward_amount: '0.00',
          qualifying_deposit_id: qualDepId ?? null,
          qualifying_deposit_amount: Number(qualDepAmt ?? 0).toFixed(2),
          status,
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: existing?.staff_reason ?? null,
          assigned_by: existing?.assigned_by ?? null,
          assigned_by_name: existing?.assigned_by_name ?? null,
          reviewed_by: existing?.reviewed_by ?? null,
          reviewed_by_name: existing?.reviewed_by_name ?? null,
          review_notes: reviewNotes,
          rewarded_at: null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row, fraud_flags: [...row.fraud_flags] }], rowCount: 1 };
      }

      // held_for_review auto (13 params)
      if (values.length === 13) {
        const [
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          refAmt,
          eeAmt,
          qualDepId,
          qualDepAmt,
          flagsJson,
          reviewNotes,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          number,
          number,
          string | null,
          number,
          string,
          string,
        ];
        const existing = this.referralAwards.get(id);
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          referrer_reward_amount: Number(refAmt).toFixed(2),
          referee_reward_amount: Number(eeAmt).toFixed(2),
          qualifying_deposit_id: qualDepId ?? null,
          qualifying_deposit_amount: Number(qualDepAmt ?? 0).toFixed(2),
          status: 'held_for_review',
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: existing?.staff_reason ?? null,
          assigned_by: existing?.assigned_by ?? null,
          assigned_by_name: existing?.assigned_by_name ?? null,
          reviewed_by: existing?.reviewed_by ?? null,
          reviewed_by_name: existing?.reviewed_by_name ?? null,
          review_notes: reviewNotes,
          rewarded_at: null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row, fraud_flags: [...row.fraud_flags] }], rowCount: 1 };
      }

      // manual link_only or manual agent held (16 params)
      if (values.length === 16) {
        const isHeld = normalized.includes("'held_for_review'");
        const [
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          refAmt,
          eeAmt,
          qualDepId,
          qualDepAmt,
          p12,
          p13,
          p14,
          p15,
          p16,
        ] = values as any[];
        const existing = this.referralAwards.get(id);
        const status = isHeld ? 'held_for_review' : String(p12);
        const flagsJson = isHeld ? String(p12) : String(p13);
        const staffReason = isHeld ? p13 : p14;
        const assignedBy = isHeld ? p14 : p15;
        const assignedByName = isHeld ? p15 : p16;
        const reviewNotes = isHeld ? p16 : existing?.review_notes ?? null;
        const row: InMemoryReferralAwardRow = {
          id,
          referrer_id,
          referee_id,
          referral_code_used,
          source,
          reward_mode,
          payout_target,
          referrer_reward_amount: Number(refAmt).toFixed(2),
          referee_reward_amount: Number(eeAmt).toFixed(2),
          qualifying_deposit_id: qualDepId ?? null,
          qualifying_deposit_amount: Number(qualDepAmt ?? 0).toFixed(2),
          status,
          fraud_flags: JSON.parse(flagsJson),
          staff_reason: staffReason ?? null,
          assigned_by: assignedBy ?? null,
          assigned_by_name: assignedByName ?? null,
          reviewed_by: existing?.reviewed_by ?? null,
          reviewed_by_name: existing?.reviewed_by_name ?? null,
          review_notes: reviewNotes ?? null,
          rewarded_at: status === 'rewarded' ? existing?.rewarded_at ?? now : null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        this.referralAwards.set(id, row);
        return { rows: [{ ...row, fraud_flags: [...row.fraud_flags] }], rowCount: 1 };
      }
    }

    if (normalized.startsWith('UPDATE public.referral_awards SET qualifying_deposit_amount = $2')) {
      const [id, depAmt, depId] = values as [string, number, string | null];
      const a = this.referralAwards.get(id);
      if (a) {
        a.qualifying_deposit_amount = Number(depAmt).toFixed(2);
        a.qualifying_deposit_id = depId;
        a.updated_at = new Date();
      }
      return { rows: a ? [{ ...a, fraud_flags: [...a.fraud_flags] }] : [] };
    }

    if (normalized.startsWith("UPDATE public.referral_awards SET status = 'rejected'")) {
      const [id, revBy, revName, notes] = values as [string, string, string, string];
      const a = this.referralAwards.get(id);
      if (a) {
        a.status = 'rejected';
        a.reviewed_by = revBy;
        a.reviewed_by_name = revName;
        a.review_notes = notes;
        a.updated_at = new Date();
      }
      return { rows: a ? [{ ...a, fraud_flags: [...a.fraud_flags] }] : [] };
    }

    if (normalized.startsWith("UPDATE public.referral_awards SET status = 'rewarded'")) {
      const a = this.referralAwards.get(String(values[0] ?? ''));
      if (a) {
        if (values.length >= 6) {
          a.payout_target = String(values[1]);
          a.referrer_reward_amount = Number(values[2]).toFixed(2);
          a.referee_reward_amount = Number(values[3]).toFixed(2);
          a.qualifying_deposit_id = (values[4] as string | null) ?? a.qualifying_deposit_id;
          a.qualifying_deposit_amount = Math.max(
            Number(a.qualifying_deposit_amount),
            Number(values[5] ?? 0),
          ).toFixed(2);
        }
        a.status = 'rewarded';
        a.rewarded_at = a.rewarded_at ?? new Date();
        a.updated_at = new Date();
      }
      return { rows: [] };
    }

    return { rows: [], rowCount: 0 };
  }

  private filterAdminLedger(
    normalized: string,
    params: unknown[],
  ): InMemoryReferralAwardRow[] {
    let rows = Array.from(this.referralAwards.values());
    let idx = 0;
    if (normalized.includes('ra.status = $')) {
      const status = String(params[idx++] ?? '');
      rows = rows.filter((r) => r.status === status);
    }
    if (normalized.includes('ILIKE $')) {
      const rawPat = String(params[idx++] ?? '');
      const cleanSearch = rawPat.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase();
      rows = rows.filter((r) => {
        const rr = this.users.get(r.referrer_id);
        const re = this.users.get(r.referee_id);
        return (
          (rr?.display_name || '').toLowerCase().includes(cleanSearch) ||
          (rr?.email || '').toLowerCase().includes(cleanSearch) ||
          (re?.display_name || '').toLowerCase().includes(cleanSearch) ||
          (re?.email || '').toLowerCase().includes(cleanSearch) ||
          (r.referral_code_used || '').toLowerCase().includes(cleanSearch)
        );
      });
    }
    return rows;
  }

  private withJoinedUsers(a: InMemoryReferralAwardRow) {
    const rr = this.users.get(a.referrer_id);
    const re = this.users.get(a.referee_id);
    return {
      ...a,
      fraud_flags: [...a.fraud_flags],
      rr_display_name: rr?.display_name ?? null,
      rr_email: rr?.email ?? null,
      rr_referral_code: rr?.referral_code ?? null,
      re_display_name: re?.display_name ?? null,
      re_email: re?.email ?? null,
      re_referral_code: re?.referral_code ?? null,
    };
  }

  private toJoinedRow(user: InMemoryUserRow, link: InMemoryAuthLinkRow | undefined) {
    return {
      app_user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      phone: user.phone,
      avatar_url: user.avatar_url,
      status: user.status,
      email_verified: user.email_verified,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      auth_user_id: link?.auth_user_id ?? null,
      legacy_supabase_uid: link?.legacy_supabase_uid ?? null,
      migration_source: link?.migration_source ?? 'self_hosted_signup',
      password_reset_required: link?.password_reset_required ?? false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}

function createTestConfig(port = 0): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port,
    appOrigin: 'https://swiftsweeps.example.com',
    trustProxy: 'loopback',
    databaseUrl: 'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 10_000,
    pgConnectionTimeoutMs: 2_000,
    pgStatementTimeoutMs: 5_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'error',
    shutdownTimeoutMs: 2_000,
    authSecret: 'test-only-auth-secret-with-more-than-thirty-two-chars-1234',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: true,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 1000,
    emailProvider: 'smtp',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'smtp-user',
    smtpPass: 'smtp-pass',
    emailFromAddress: 'no-reply@swiftsweeps.example.com',
    emailFromName: 'SwiftSweeps',
  };
}

function createSilentLogger() {
  return createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
}

function createCaptureEmailAdapter(otps: SendOtpEmailPayload[]): EmailDeliveryAdapter {
  return {
    providerName: 'test-capture',
    isConfigured: () => true,
    sendVerificationEmail: async (_p: SendVerificationEmailPayload) => {},
    sendPasswordResetEmail: async (_p: SendPasswordResetEmailPayload) => {},
    sendOtpEmail: async (p: SendOtpEmailPayload) => {
      otps.push(p);
    },
  };
}

const serverOtpsByBaseUrl = new Map<string, SendOtpEmailPayload[]>();

async function startTestServer(db: InMemoryReferralDatabase) {
  const otps: SendOtpEmailPayload[] = [];
  const authMemDb: Record<string, unknown[]> = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const app = createApiApp({
    config: createTestConfig(),
    logger: createSilentLogger(),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemDb),
    emailDeliveryOverride: createCaptureEmailAdapter(otps),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  serverOtpsByBaseUrl.set(baseUrl, otps);
  return { server, baseUrl };
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, json };
}

async function signUpAndCookie(
  baseUrl: string,
  email: string,
  name: string,
  password = 'StrongPassword!2026',
) {
  const signup = await requestJson(baseUrl, '/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password, name },
  });
  assert.equal(signup.status, 200);

  const otps = serverOtpsByBaseUrl.get(baseUrl) ?? [];
  const otpEntry = [...otps]
    .reverse()
    .find((o) => o.to === email.toLowerCase());
  assert.ok(otpEntry?.otp, 'Expected verification OTP for signup');

  const verify = await requestJson(baseUrl, '/api/auth/email-otp/verify-email', {
    method: 'POST',
    body: { email: email.toLowerCase(), otp: otpEntry.otp },
  });
  assert.equal(verify.status, 200);

  const signIn = await requestJson(baseUrl, '/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: email.toLowerCase(), password },
  });
  assert.equal(signIn.status, 200);

  const setCookie = signIn.headers.getSetCookie();
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  const profile = await requestJson(baseUrl, '/api/auth/me', { cookie });
  assert.equal(profile.status, 200);
  return {
    cookie,
    appUserId: String(profile.json.user.id),
  };
}

test('referrals endpoints reject anonymous and suspended accounts', async (t) => {
  const db = new InMemoryReferralDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  const anonSummary = await requestJson(baseUrl, '/api/referrals/summary');
  assert.equal(anonSummary.status, 401);

  const anonLedger = await requestJson(baseUrl, '/api/referrals/admin-ledger');
  assert.equal(anonLedger.status, 401);

  const suspended = await signUpAndCookie(baseUrl, 'susp_ref@example.test', 'Suspended');
  db.users.get(suspended.appUserId)!.status = 'suspended';

  const suspRes = await requestJson(baseUrl, '/api/referrals/summary', {
    cookie: suspended.cookie,
  });
  assert.equal(suspRes.status, 403);
});

test('referral attribution, qualification, fraud hold, concurrency idempotency, and summary isolation', async (t) => {
  const db = new InMemoryReferralDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  const referrer = await signUpAndCookie(baseUrl, 'alice_ref@example.test', 'Alice');
  const friend = await signUpAndCookie(baseUrl, 'bob_ref@example.test', 'Bob');
  const bobUser = db.users.get(friend.appUserId)!;
  const aliceUser = db.users.get(referrer.appUserId)!;
  aliceUser.referral_code = 'ALICE55';

  // Empty summary works
  const emptySum = await requestJson(baseUrl, '/api/referrals/summary', {
    cookie: referrer.cookie,
  });
  assert.equal(emptySum.status, 200);
  assert.equal(emptySum.json.summary.totalReferred, 0);
  assert.equal(emptySum.json.summary.referralCode, 'ALICE55');

  // Wrong-owner summary rejected for customer
  const wrongOwnerSum = await requestJson(
    baseUrl,
    `/api/referrals/summary?userId=${referrer.appUserId}`,
    { cookie: friend.cookie },
  );
  assert.equal(wrongOwnerSum.status, 403);

  // Wrong-owner attribution rejected
  const wrongAttr = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: friend.cookie,
    body: { refereeId: referrer.appUserId, referralCode: 'ALICE55' },
  });
  assert.equal(wrongAttr.status, 403);

  // Privileged body injection rejected
  const injected = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: friend.cookie,
    body: { referralCode: 'ALICE55', status: 'rewarded' },
  });
  assert.equal(injected.status, 403);

  // Invalid referral code -> 404
  const badCode = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: friend.cookie,
    body: { referralCode: 'MISSING999' },
  });
  assert.equal(badCode.status, 404);

  // Self-referral -> 400
  const selfRef = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: referrer.cookie,
    body: { referralCode: 'ALICE55' },
  });
  assert.equal(selfRef.status, 400);

  // Happy path attribution
  const attr = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: friend.cookie,
    body: { referralCode: 'alice55', deviceFingerprint: 'fp_bob_device_123' },
  });
  assert.equal(attr.status, 200);
  assert.equal(attr.json.referralCodeUsed, 'ALICE55');
  assert.equal(db.users.get(friend.appUserId)!.referred_by, 'ALICE55');

  // Re-attributing a different code -> 409
  const charlie = await signUpAndCookie(baseUrl, 'charlie_ref@example.test', 'Charlie');
  db.users.get(charlie.appUserId)!.referral_code = 'CHARLIE1';
  const reAttr = await requestJson(baseUrl, '/api/referrals/attribute', {
    method: 'POST',
    cookie: friend.cookie,
    body: { referralCode: 'CHARLIE1' },
  });
  assert.equal(reAttr.status, 409);

  // Unverified email stays registered
  db.users.get(friend.appUserId)!.email_verified = false;
  const evalUnverified = await requestJson(baseUrl, '/api/referrals/evaluate', {
    method: 'POST',
    cookie: friend.cookie,
    body: {},
  });
  assert.equal(evalUnverified.status, 200);
  assert.equal(evalUnverified.json.status, 'registered');

  // Verify email + deposit under minimum ($100) -> pending_deposit
  db.users.get(friend.appUserId)!.email_verified = true;
  db.topups.set('top_under', {
    id: 'top_under',
    customer_id: friend.appUserId,
    amount: '25.00',
    status: 'completed',
    payment_method_id: 'card',
    created_at: new Date(),
  });
  const evalUnder = await requestJson(baseUrl, '/api/referrals/evaluate', {
    method: 'POST',
    cookie: friend.cookie,
    body: {},
  });
  assert.equal(evalUnder.status, 200);
  assert.equal(evalUnder.json.status, 'pending_deposit');

  // Wrong-owner evaluate rejected for customer
  const wrongEval = await requestJson(baseUrl, '/api/referrals/evaluate', {
    method: 'POST',
    cookie: friend.cookie,
    body: { refereeId: referrer.appUserId },
  });
  assert.equal(wrongEval.status, 403);

  // Cumulative deposit pushes Bob >= $100 min -> concurrent evaluate must credit strictly once!
  db.topups.set('top_qual', {
    id: 'top_qual',
    customer_id: friend.appUserId,
    amount: '80.00',
    status: 'approved',
    payment_method_id: 'cashapp',
    created_at: new Date(),
  });
  db.delayInsideTxMs = 20;
  const [e1, e2] = await Promise.all([
    requestJson(baseUrl, '/api/referrals/evaluate', {
      method: 'POST',
      cookie: friend.cookie,
      body: {},
    }),
    requestJson(baseUrl, '/api/referrals/evaluate', {
      method: 'POST',
      cookie: friend.cookie,
      body: {},
    }),
  ]);
  db.delayInsideTxMs = 0;

  assert.equal(e1.status, 200);
  assert.equal(e2.status, 200);
  assert.equal(e1.json.status, 'rewarded');
  assert.equal(e2.json.status, 'rewarded');

  // Default config: $25 referrer + $10 friend -> referral_bonus_balance
  assert.equal(db.wallets.get(referrer.appUserId)!.referral_bonus_balance, '25.00');
  assert.equal(db.wallets.get(friend.appUserId)!.referral_bonus_balance, '10.00');

  // Verify summary for referrer & welcomeBonus for friend
  const aliceSum = await requestJson(baseUrl, '/api/referrals/summary', {
    cookie: referrer.cookie,
  });
  assert.equal(aliceSum.status, 200);
  assert.equal(aliceSum.json.summary.totalReferred, 1);
  assert.equal(aliceSum.json.summary.activeReferred, 1);
  assert.equal(aliceSum.json.summary.totalRewardsEarned, 25);

  const bobSum = await requestJson(baseUrl, '/api/referrals/summary', {
    cookie: friend.cookie,
  });
  assert.equal(bobSum.status, 200);
  assert.equal(bobSum.json.summary.welcomeBonus.status, 'rewarded');
  assert.equal(bobSum.json.summary.welcomeBonus.creditedAmount, 10);
});

test('referral RBAC, admin-ledger pagination, manual-assign, vanity-code, review, config, reconcile, and masked 500', async (t) => {
  const db = new InMemoryReferralDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  const admin = await signUpAndCookie(baseUrl, 'admin_ref@example.test', 'Admin');
  const agent = await signUpAndCookie(baseUrl, 'agent_ref@example.test', 'Agent');
  const p1 = await signUpAndCookie(baseUrl, 'p1_ref@example.test', 'PlayerOne');
  const p2 = await signUpAndCookie(baseUrl, 'p2_ref@example.test', 'PlayerTwo');
  const p3 = await signUpAndCookie(baseUrl, 'p3_ref@example.test', 'PlayerThree');

  db.users.get(admin.appUserId)!.role = 'admin';
  db.users.get(agent.appUserId)!.role = 'agent';
  db.users.get(p1.appUserId)!.referral_code = 'P1CODE';
  db.users.get(p3.appUserId)!.referral_code = 'P3CODE';

  // Customer blocked from staff/admin endpoints
  assert.equal(
    (await requestJson(baseUrl, '/api/referrals/admin-ledger', { cookie: p1.cookie })).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/manual-assign', {
        method: 'POST',
        cookie: p1.cookie,
        body: { refereeId: p2.appUserId, referrerQuery: 'P1CODE', mode: 'link_only' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/reconcile', {
        method: 'POST',
        cookie: p1.cookie,
        body: {},
      })
    ).status,
    403,
  );

  // Agent blocked from admin-only endpoints
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/vanity-code', {
        method: 'PATCH',
        cookie: agent.cookie,
        body: { userId: p1.appUserId, vanityCode: 'VIPAGENT' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/review', {
        method: 'POST',
        cookie: agent.cookie,
        body: { awardId: 'refaw_none', decision: 'approve' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/admin/referral-config', {
        method: 'POST',
        cookie: agent.cookie,
        body: { referralProgram: { enabled: true } },
      })
    ).status,
    403,
  );

  // Admin updates referral config
  const cfgRes = await requestJson(baseUrl, '/api/admin/referral-config', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      referralProgram: {
        enabled: true,
        rewardMode: 'flat',
        referrerRewardValue: 12,
        refereeRewardValue: 6,
        qualificationDepositMin: 20,
        payoutTarget: 'referral_bonus',
        holdFlaggedForReview: true,
      },
    },
  });
  assert.equal(cfgRes.status, 200);
  assert.equal(cfgRes.json.referralProgram.referrerRewardValue, 12);

  // Admin vanity-code: invalid (400), conflict (409), happy path (200)
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/vanity-code', {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { userId: p1.appUserId, vanityCode: 'X' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/vanity-code', {
        method: 'PATCH',
        cookie: admin.cookie,
        body: { userId: p1.appUserId, vanityCode: 'P3CODE' },
      })
    ).status,
    409,
  );
  const vanityOk = await requestJson(baseUrl, '/api/referrals/vanity-code', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { userId: p1.appUserId, vanityCode: 'VIP_P1' },
  });
  assert.equal(vanityOk.status, 200);
  assert.equal(vanityOk.json.referralCode, 'VIP_P1');

  // Agent manual link_only, then blocked from reassigning
  const agentLink = await requestJson(baseUrl, '/api/referrals/manual-assign', {
    method: 'POST',
    cookie: agent.cookie,
    body: { refereeId: p2.appUserId, referrerQuery: 'VIP_P1', mode: 'link_only' },
  });
  assert.equal(agentLink.status, 200);

  const agentReassign = await requestJson(baseUrl, '/api/referrals/manual-assign', {
    method: 'POST',
    cookie: agent.cookie,
    body: {
      refereeId: p2.appUserId,
      referrerQuery: 'P3CODE',
      mode: 'link_only',
      reason: 'Agent trying override',
    },
  });
  assert.equal(agentReassign.status, 403);

  // Admin reassign requires reason >= 3 chars, succeeds with reason
  assert.equal(
    (
      await requestJson(baseUrl, '/api/referrals/manual-assign', {
        method: 'POST',
        cookie: admin.cookie,
        body: { refereeId: p2.appUserId, referrerQuery: 'P3CODE', mode: 'link_only', reason: 'no' },
      })
    ).status,
    400,
  );
  const adminReassign = await requestJson(baseUrl, '/api/referrals/manual-assign', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      refereeId: p2.appUserId,
      referrerQuery: 'P3CODE',
      mode: 'link_only',
      reason: 'Customer support confirmed inviter',
    },
  });
  assert.equal(adminReassign.status, 200);

  // Agent link_and_reward with shared IP -> held_for_review
  db.users.get(p1.appUserId)!.signup_ip = '203.0.113.44';
  db.users.get(p3.appUserId)!.signup_ip = '203.0.113.44';
  const agentHeld = await requestJson(baseUrl, '/api/referrals/manual-assign', {
    method: 'POST',
    cookie: agent.cookie,
    body: {
      refereeId: p1.appUserId,
      referrerQuery: 'P3CODE',
      mode: 'link_and_reward',
    },
  });
  assert.equal(agentHeld.status, 200);
  assert.equal(agentHeld.json.status, 'held_for_review');

  // Admin ledger filters & pagination
  const heldLedger = await requestJson(
    baseUrl,
    '/api/referrals/admin-ledger?status=held_for_review&limit=1&offset=0',
    { cookie: agent.cookie },
  );
  assert.equal(heldLedger.status, 200);
  assert.equal(heldLedger.json.awards.length, 1);
  assert.equal(heldLedger.json.total, 1);
  assert.equal(heldLedger.json.hasMore, false);

  // Admin approves held award -> credits once, second review returns 409
  const awardId = agentHeld.json.award.id;
  const approveRes = await requestJson(baseUrl, '/api/referrals/review', {
    method: 'POST',
    cookie: admin.cookie,
    body: { awardId, decision: 'approve', reviewNotes: 'Verified player identity' },
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.json.status, 'rewarded');
  assert.equal(db.wallets.get(p3.appUserId)!.referral_bonus_balance, '12.00');
  assert.equal(db.wallets.get(p1.appUserId)!.referral_bonus_balance, '6.00');

  const dupReview = await requestJson(baseUrl, '/api/referrals/review', {
    method: 'POST',
    cookie: admin.cookie,
    body: { awardId, decision: 'approve' },
  });
  assert.equal(dupReview.status, 409);

  // link_and_reward on already-rewarded award -> 409
  const dupReward = await requestJson(baseUrl, '/api/referrals/manual-assign', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      refereeId: p1.appUserId,
      referrerQuery: 'P3CODE',
      mode: 'link_and_reward',
    },
  });
  assert.equal(dupReward.status, 409);

  // Reconcile heals simulated wallet drift (taking game_load debit into account)
  db.wallets.get(p3.appUserId)!.referral_bonus_balance = '0.00';
  db.transactions.set('tx_load_1', {
    id: 'tx_load_1',
    customer_id: p3.appUserId,
    amount: '2.00',
    type: 'game_load',
    status: 'completed',
    description: 'Referral Bonus Loaded to Dragon Quest (p3)',
    reference_id: 'ga_1',
    game_name: 'Dragon Quest',
    created_at: new Date(),
  });
  const reconcileRes = await requestJson(baseUrl, '/api/referrals/reconcile', {
    method: 'POST',
    cookie: admin.cookie,
    body: { userId: p3.appUserId },
  });
  assert.equal(reconcileRes.status, 200);
  // $12 credited - $2 loaded = $10 restored!
  assert.equal(db.wallets.get(p3.appUserId)!.referral_bonus_balance, '10.00');
  assert.equal(reconcileRes.json.totalCreditedAmount, 10);

  // Masked 500 error check
  db.failNextReferralQuery = true;
  const errRes = await requestJson(baseUrl, '/api/referrals/admin-ledger', {
    cookie: admin.cookie,
  });
  assert.equal(errRes.status, 500);
  assert.equal(errRes.json.error.code, 'INTERNAL_SERVER_ERROR');
  assert.ok(!JSON.stringify(errRes.json).includes('pg_referral_error'));
});
