import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLogger } from '../logging/logger.js';
import {
  DataMigrationConfigError,
  DataMigrationIntegrityError,
  type DataMigrationConfig,
  type MigrationDbClient,
  type MigrationQueryable,
  type QueryResultLike,
  PRODUCTION_SOURCE_CONFIRM_TOKEN,
  PRODUCTION_TARGET_CONFIRM_TOKEN,
  advanceTargetSequences,
  loadDataMigrationConfig,
  runDataMigrationImport,
  runDryRunOrValidation,
  runExportSnapshot,
} from '../migration/dataMigrationTool.js';

interface SimColumnDef {
  table: string;
  column: string;
  isIdentity?: boolean;
  defaultExpr?: string;
}

class IsolatedPostgresSimulator implements MigrationQueryable {
  public readonly kind: 'supabase_source' | 'self_hosted_target';
  public readonly store: Record<string, Array<Record<string, unknown>>> = {
    users: [],
    auth_users: [],
    auth_user_links: [],
    ba_user: [],
    app_config: [],
    push_subscriptions: [],
    audit_logs: [],
    game_catalog: [],
    faked_cashouts: [],
    official_partners: [],
    official_partner_icons: [],
    wallets: [],
    game_accounts: [],
    topups: [],
    withdrawals: [],
    transactions: [],
    referral_awards: [],
    wheel_spins: [],
    notifications: [],
    conversations: [],
    messages: [],
    chat_attachments: [],
    storage_objects: [],
    storage_objects_meta: [],
    password_reset_tokens: [],
    custom_seq_table: [],
  };
  public readonly columns: SimColumnDef[] = [];
  public readonly sequences = new Map<string, bigint>();
  public readonly triggers: string[] = [];
  public readonly functions: string[] = [];
  public readonly extensions: string[] = ['pgcrypto', 'plpgsql'];
  public policiesCount = 0;
  public transientFailuresRemaining = 0;

  constructor(kind: 'supabase_source' | 'self_hosted_target') {
    this.kind = kind;
    if (kind === 'supabase_source') {
      this.triggers.push('on_auth_user_created', 'trg_official_partners_updated_at');
      this.functions.push(
        'credit_referral_award_atomic',
        'claim_wheel_of_luck_spin',
        'transfer_game_credits_atomic',
      );
      this.policiesCount = 14;
      this.columns.push(
        { table: 'users', column: 'id' },
        { table: 'users', column: 'email' },
        { table: 'users', column: 'referral_code' },
        { table: 'users', column: 'referred_by' },
        { table: 'users', column: 'signup_ip' },
        { table: 'users', column: 'device_fingerprint' },
        { table: 'users', column: 'is_parent_admin' },
        { table: 'notifications', column: 'read' },
        { table: 'audit_logs', column: 'user_id' },
        { table: 'audit_logs', column: 'user_email' },
        { table: 'audit_logs', column: 'created_at' },
        { table: 'wallets', column: 'referral_bonus_balance' },
        { table: 'wallets', column: 'free_play_balance' },
        { table: 'game_catalog', column: 'game_url' },
        { table: 'game_catalog', column: 'download_url' },
        { table: 'game_catalog', column: 'links' },
        { table: 'game_catalog', column: 'updated_at' },
        { table: 'game_accounts', column: 'platform_name' },
        { table: 'game_accounts', column: 'balance' },
        { table: 'game_accounts', column: 'free_play_balance' },
        { table: 'topups', column: 'currency' },
        { table: 'topups', column: 'bonus_percentage' },
        { table: 'topups', column: 'fee_amount' },
        { table: 'topups', column: 'final_wallet_credit' },
        { table: 'topups', column: 'metadata' },
        { table: 'messages', column: 'is_internal_note' },
      );
    } else {
      this.triggers.push(
        'tr_prevent_verification_downgrade',
        'trg_official_partners_updated_at',
      );
      this.columns.push(
        { table: 'users', column: 'id' },
        { table: 'users', column: 'referral_code' },
        { table: 'users', column: 'referred_by' },
        { table: 'users', column: 'signup_ip' },
        { table: 'users', column: 'device_fingerprint' },
        { table: 'notifications', column: 'is_read' },
        { table: 'audit_logs', column: 'actor_id' },
        { table: 'audit_logs', column: 'actor_name' },
        { table: 'audit_logs', column: 'actor_role' },
        { table: 'audit_logs', column: 'timestamp' },
        { table: 'wallets', column: 'referral_bonus_balance' },
        { table: 'wallets', column: 'free_play_balance' },
        { table: 'game_catalog', column: 'game_url' },
        { table: 'game_catalog', column: 'download_url' },
        { table: 'game_catalog', column: 'links' },
        { table: 'game_catalog', column: 'updated_at' },
        { table: 'game_accounts', column: 'platform_name' },
        { table: 'game_accounts', column: 'balance' },
        { table: 'game_accounts', column: 'free_play_balance' },
        { table: 'topups', column: 'currency' },
        { table: 'topups', column: 'bonus_percentage' },
        { table: 'topups', column: 'fee_amount' },
        { table: 'topups', column: 'final_wallet_credit' },
        { table: 'topups', column: 'metadata' },
        { table: 'conversations', column: 'updated_at' },
        { table: 'messages', column: 'is_internal_note' },
      );
    }
  }

  public async connect(): Promise<MigrationDbClient> {
    return {
      query: (text, values) => this.query(text, values),
      release: () => {},
    };
  }

  public async query<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResultLike<T>> {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    if (this.transientFailuresRemaining > 0 && sql.startsWith('INSERT INTO')) {
      this.transientFailuresRemaining -= 1;
      const err = new Error('Simulated serialization failure') as Error & {
        code?: string;
      };
      err.code = '40001';
      throw err;
    }

    if (sql.includes('FROM information_schema.tables')) {
      const publicTables =
        this.kind === 'supabase_source'
          ? [
              'users',
              'app_config',
              'audit_logs',
              'game_catalog',
              'faked_cashouts',
              'official_partners',
              'wallets',
              'game_accounts',
              'topups',
              'withdrawals',
              'transactions',
              'referral_awards',
              'wheel_spins',
              'notifications',
              'conversations',
              'messages',
              'password_reset_tokens',
            ]
          : [
              'users',
              'auth_user_links',
              'ba_user',
              'app_config',
              'push_subscriptions',
              'audit_logs',
              'game_catalog',
              'faked_cashouts',
              'official_partners',
              'official_partner_icons',
              'wallets',
              'game_accounts',
              'topups',
              'withdrawals',
              'transactions',
              'referral_awards',
              'wheel_spins',
              'notifications',
              'conversations',
              'messages',
              'chat_attachments',
              'storage_objects',
            ];
      const rows = publicTables.map((table_name) => ({
        table_schema: 'public',
        table_name,
      }));
      if (this.kind === 'supabase_source') {
        rows.push({ table_schema: 'auth', table_name: 'users' });
        rows.push({ table_schema: 'storage', table_name: 'objects' });
      }
      return { rows: rows as T[] };
    }

    if (sql.includes('FROM information_schema.columns') && sql.includes('pg_get_serial_sequence')) {
      const seqCols = this.columns
        .filter((c) => c.isIdentity || c.defaultExpr?.includes('nextval'))
        .map((c) => ({
          table_name: c.table,
          column_name: c.column,
          sequence_name: `public.${c.table}_${c.column}_seq`,
        }));
      return { rows: seqCols as T[] };
    }

    if (sql.includes('FROM information_schema.columns')) {
      return {
        rows: this.columns.map((c) => ({
          table_name: c.table,
          column_name: c.column,
        })) as T[],
      };
    }

    if (sql.includes('FROM pg_extension')) {
      return {
        rows: this.extensions.map((extname) => ({ extname })) as T[],
      };
    }
    if (sql.includes('FROM information_schema.triggers')) {
      return {
        rows: this.triggers.map((trigger_name) => ({ trigger_name })) as T[],
      };
    }
    if (sql.includes('FROM pg_proc')) {
      return {
        rows: this.functions.map((proname) => ({ proname })) as T[],
      };
    }
    if (sql.includes('FROM pg_policies')) {
      return { rows: [{ count: this.policiesCount }] as T[] };
    }
    if (sql.includes('FROM auth.users')) {
      return { rows: this.store.auth_users as T[] };
    }
    if (sql.includes('FROM storage.objects')) {
      return {
        rows: [{ count: this.store.storage_objects_meta.length }] as T[],
      };
    }
    if (sql.includes('FROM public.password_reset_tokens')) {
      return {
        rows: [{ count: this.store.password_reset_tokens.length }] as T[],
      };
    }
    if (sql.includes('WHERE is_parent_admin IS NOT NULL')) {
      const count = this.store.users.filter(
        (u) => u.is_parent_admin !== undefined && u.is_parent_admin !== null,
      ).length;
      return { rows: [{ count }] as T[] };
    }

    // Sequence queries
    if (sql.startsWith('SELECT MAX(')) {
      const m = /SELECT MAX\(([a-z0-9_]+)\)::text AS max_val FROM public\.([a-z0-9_]+)/i.exec(
        sql,
      );
      const col = m![1]!;
      const tbl = m![2]!;
      const rows = this.store[tbl] ?? [];
      let maxVal: bigint | null = null;
      for (const r of rows) {
        const val = r[col];
        if (val !== undefined && val !== null) {
          const n = BigInt(String(val));
          if (maxVal === null || n > maxVal) maxVal = n;
        }
      }
      return {
        rows: [{ max_val: maxVal !== null ? maxVal.toString() : null }] as T[],
      };
    }

    if (sql.startsWith('SELECT last_value::text')) {
      const m = /FROM ([^\s]+)/i.exec(sql);
      const seqName = m![1]!;
      return {
        rows: [{ last_value: (this.sequences.get(seqName) ?? 1n).toString() }] as T[],
      };
    }

    if (sql.startsWith('SELECT setval(')) {
      const seqName = String(values[0]);
      const val = BigInt(String(values[1]));
      this.sequences.set(seqName, val);
      return { rows: [{ setval: val.toString() }] as T[] };
    }

    // Batched SELECTs
    if (sql.startsWith('SELECT ')) {
      const m = /FROM public\.([a-z0-9_]+) ORDER BY .* LIMIT \$1 OFFSET \$2/i.exec(
        sql,
      );
      if (m) {
        const tbl = m[1]!;
        const limit = Number(values[0]);
        const offset = Number(values[1]);
        const list = [...(this.store[tbl] ?? [])].sort((a, b) => {
          const ka = String(a.id ?? a.customer_id ?? a.app_user_id ?? `${a.bucket}:${a.object_path}`);
          const kb = String(b.id ?? b.customer_id ?? b.app_user_id ?? `${b.bucket}:${b.object_path}`);
          return ka.localeCompare(kb);
        });
        const slice = list.slice(offset, offset + limit).map((row) => {
          const copy = { ...row };
          // Simulate Supabase notifications."read" and audit_logs legacy columns
          if (tbl === 'notifications' && this.kind === 'supabase_source') {
            copy.is_read = copy.read;
          }
          if (tbl === 'audit_logs' && this.kind === 'supabase_source') {
            copy.actor_id = copy.actor_id ?? copy.user_id ?? null;
            copy.actor_name = copy.actor_name ?? copy.user_email ?? null;
            copy.timestamp = copy.timestamp ?? copy.created_at ?? null;
          }
          return copy;
        });
        return { rows: slice as T[] };
      }
    }

    // Target INSERTs
    if (sql.startsWith('INSERT INTO public.')) {
      const m = /^INSERT INTO public\.([a-z0-9_]+)/i.exec(sql);
      const tbl = m![1]!;
      const rows = this.store[tbl] ?? (this.store[tbl] = []);

      const upsertByKey = (
        keyFn: (r: Record<string, unknown>) => string,
        row: Record<string, unknown>,
        overwrite = true,
      ) => {
        const k = keyFn(row);
        const idx = rows.findIndex((existing) => keyFn(existing) === k);
        if (idx >= 0) {
          if (overwrite) {
            rows[idx] = { ...rows[idx], ...row };
          }
        } else {
          rows.push(row);
        }
      };

      switch (tbl) {
        case 'users': {
          const [
            id,
            email,
            display_name,
            role,
            phone,
            avatar_url,
            status,
            email_verified,
            referral_code,
            referred_by,
            signup_ip,
            device_fingerprint,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            email,
            display_name,
            role,
            phone,
            avatar_url,
            status,
            email_verified,
            referral_code,
            referred_by,
            signup_ip,
            device_fingerprint,
            created_at,
            updated_at,
          });
          break;
        }
        case 'ba_user': {
          const [id, name, email, emailVerified, image, createdAt, updatedAt] =
            values;
          upsertByKey(
            (r) => String(r.email).toLowerCase(),
            { id, name, email, emailVerified, image, createdAt, updatedAt },
            false,
          );
          break;
        }
        case 'auth_user_links': {
          const [
            app_user_id,
            auth_user_id,
            legacy_supabase_uid,
            email_normalized,
            migration_source,
            password_reset_required,
            linked_at,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.app_user_id), {
            app_user_id,
            auth_user_id,
            legacy_supabase_uid,
            email_normalized,
            migration_source,
            password_reset_required,
            linked_at,
            created_at,
            updated_at,
          });
          break;
        }
        case 'app_config': {
          const [id, dataJson, updated_at] = values;
          upsertByKey((r) => String(r.id), {
            id,
            data: JSON.parse(String(dataJson)),
            updated_at,
          });
          break;
        }
        case 'push_subscriptions': {
          const [
            id,
            endpoint,
            user_id,
            user_email,
            user_role,
            p256dh,
            auth,
            expiration_time,
            platform,
            browser,
            active,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.endpoint), {
            id,
            endpoint,
            user_id,
            user_email,
            user_role,
            p256dh,
            auth,
            expiration_time,
            platform,
            browser,
            active,
            created_at,
            updated_at,
          });
          break;
        }
        case 'audit_logs': {
          const [
            id,
            actor_id,
            actor_name,
            actor_role,
            action,
            entity_type,
            entity_id,
            details,
            timestamp,
          ] = values;
          upsertByKey(
            (r) => String(r.id),
            {
              id,
              actor_id,
              actor_name,
              actor_role,
              action,
              entity_type,
              entity_id,
              details,
              timestamp,
            },
            false,
          );
          break;
        }
        case 'game_catalog': {
          const [
            id,
            title,
            category,
            description,
            min_load,
            bonus_pct,
            is_active,
            icon_url,
            image_url,
            game_url,
            download_url,
            linksJson,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            title,
            category,
            description,
            min_load,
            bonus_pct,
            is_active,
            icon_url,
            image_url,
            game_url,
            download_url,
            links: JSON.parse(String(linksJson)),
            created_at,
            updated_at,
          });
          break;
        }
        case 'faked_cashouts': {
          const [
            id,
            customer_name,
            amount,
            currency,
            method_name,
            game_name,
            is_fake,
            timestamp,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            customer_name,
            amount,
            currency,
            method_name,
            game_name,
            is_fake,
            timestamp,
          });
          break;
        }
        case 'official_partners': {
          const [
            id,
            name,
            icon_url,
            platform,
            page_url,
            message_link,
            game_id,
            note,
            is_visible,
            sort_order,
            updated_by,
          ] = values;
          // Simulate trg_official_partners_updated_at overwriting updated_at!
          upsertByKey((r) => String(r.id), {
            id,
            name,
            icon_url,
            platform,
            page_url,
            message_link,
            game_id,
            note,
            is_visible,
            sort_order,
            updated_by,
            updated_at: new Date().toISOString(),
          });
          break;
        }
        case 'wallets': {
          const [
            customer_id,
            balance,
            referral_bonus_balance,
            free_play_balance,
            pending_withdrawal,
            pending_deposit,
            total_deposited,
            total_withdrawn,
            currency,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.customer_id), {
            customer_id,
            balance,
            referral_bonus_balance,
            free_play_balance,
            pending_withdrawal,
            pending_deposit,
            total_deposited,
            total_withdrawn,
            currency,
            updated_at,
          });
          break;
        }
        case 'game_accounts': {
          const [
            id,
            customer_id,
            game_id,
            game_title,
            platform_name,
            username,
            password,
            pin,
            status,
            balance,
            free_play_balance,
            request_type,
            assigned_by_agent_id,
            assigned_by_agent_name,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            customer_id,
            game_id,
            game_title,
            platform_name,
            username,
            password,
            pin,
            status,
            balance,
            free_play_balance,
            request_type,
            assigned_by_agent_id,
            assigned_by_agent_name,
            created_at,
            updated_at,
          });
          break;
        }
        case 'topups': {
          const [
            id,
            customer_id,
            customer_name,
            amount,
            currency,
            bonus_amount,
            bonus_percentage,
            fee_amount,
            final_wallet_credit,
            payment_method_id,
            payment_method_name,
            status,
            proof_url,
            receipt_name,
            target_game_name,
            target_game_account_id,
            target_game_username,
            funding_source,
            provider_ref,
            customer_notes,
            metadataJson,
            reviewer_id,
            reviewer_name,
            review_notes,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            customer_id,
            customer_name,
            amount,
            currency,
            bonus_amount,
            bonus_percentage,
            fee_amount,
            final_wallet_credit,
            payment_method_id,
            payment_method_name,
            status,
            proof_url,
            receipt_name,
            target_game_name,
            target_game_account_id,
            target_game_username,
            funding_source,
            provider_ref,
            customer_notes,
            metadata: JSON.parse(String(metadataJson)),
            reviewer_id,
            reviewer_name,
            review_notes,
            created_at,
            updated_at,
          });
          break;
        }
        case 'withdrawals': {
          const [
            id,
            customer_id,
            customer_name,
            amount,
            fee,
            net_amount,
            payout_method_id,
            payout_method_name,
            payoutDetailsJson,
            status,
            reviewer_id,
            reviewer_name,
            review_notes,
            transaction_hash,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            customer_id,
            customer_name,
            amount,
            fee,
            net_amount,
            payout_method_id,
            payout_method_name,
            payout_details:
              payoutDetailsJson === null
                ? null
                : JSON.parse(String(payoutDetailsJson)),
            status,
            reviewer_id,
            reviewer_name,
            review_notes,
            transaction_hash,
            created_at,
            updated_at,
          });
          break;
        }
        case 'transactions': {
          const [
            id,
            customer_id,
            amount,
            type,
            status,
            description,
            reference_id,
            game_name,
            created_at,
          ] = values;
          upsertByKey(
            (r) => String(r.id),
            {
              id,
              customer_id,
              amount,
              type,
              status,
              description,
              reference_id,
              game_name,
              created_at,
            },
            false,
          );
          break;
        }
        case 'referral_awards': {
          const [
            id,
            referrer_id,
            referee_id,
            referral_code_used,
            source,
            reward_mode,
            payout_target,
            referrer_reward_amount,
            referee_reward_amount,
            qualifying_deposit_id,
            qualifying_deposit_amount,
            status,
            fraudFlagsJson,
            staff_reason,
            assigned_by,
            assigned_by_name,
            reviewed_by,
            reviewed_by_name,
            review_notes,
            rewarded_at,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            referrer_id,
            referee_id,
            referral_code_used,
            source,
            reward_mode,
            payout_target,
            referrer_reward_amount,
            referee_reward_amount,
            qualifying_deposit_id,
            qualifying_deposit_amount,
            status,
            fraud_flags: JSON.parse(String(fraudFlagsJson)),
            staff_reason,
            assigned_by,
            assigned_by_name,
            reviewed_by,
            reviewed_by_name,
            review_notes,
            rewarded_at,
            created_at,
            updated_at,
          });
          break;
        }
        case 'wheel_spins': {
          const [
            id,
            customer_id,
            segment_id,
            segment_label,
            reward_amount,
            simulated_win_amount,
            probability_weight,
            idempotency_key,
            tx_id,
            status,
            created_at,
          ] = values;
          upsertByKey(
            (r) => String(r.id),
            {
              id,
              customer_id,
              segment_id,
              segment_label,
              reward_amount,
              simulated_win_amount,
              probability_weight,
              idempotency_key,
              tx_id,
              status,
              created_at,
            },
            false,
          );
          break;
        }
        case 'notifications': {
          const [
            id,
            user_id,
            title,
            message,
            type,
            is_read,
            link_tab,
            link_request_id,
            created_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            user_id,
            title,
            message,
            type,
            is_read,
            link_tab,
            link_request_id,
            created_at,
          });
          break;
        }
        case 'conversations': {
          const [
            id,
            customer_id,
            customer_name,
            agent_id,
            agent_name,
            status,
            last_message,
            last_message_at,
            created_at,
            updated_at,
          ] = values;
          upsertByKey((r) => String(r.id), {
            id,
            customer_id,
            customer_name,
            agent_id,
            agent_name,
            status,
            last_message,
            last_message_at,
            created_at,
            updated_at,
          });
          break;
        }
        case 'messages': {
          const [
            id,
            conversation_id,
            sender_id,
            sender_name,
            sender_role,
            content,
            attachment_url,
            attachment_name,
            txDataJson,
            is_internal_note,
            created_at,
          ] = values;
          upsertByKey(
            (r) => String(r.id),
            {
              id,
              conversation_id,
              sender_id,
              sender_name,
              sender_role,
              content,
              attachment_url,
              attachment_name,
              transaction_data:
                txDataJson === null ? null : JSON.parse(String(txDataJson)),
              is_internal_note,
              created_at,
            },
            false,
          );
          break;
        }
      }
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
}

function seedRealisticSupabaseSource(db: IsolatedPostgresSimulator): void {
  const adminUid = '11111111-1111-4111-8111-111111111111';
  const aliceUid = '22222222-2222-4222-8222-222222222222';
  const bobUid = '33333333-3333-4333-8333-333333333333';

  db.store.auth_users.push(
    {
      id: adminUid,
      email: 'sachet61@gmail.com',
      email_confirmed: true,
      encrypted_password: '$2a$10$DO_NOT_EVER_EXPORT_THIS_BCRYPT_HASH',
    },
    {
      id: aliceUid,
      email: 'alice@example.com',
      email_confirmed: true,
      encrypted_password: '$2a$10$DO_NOT_EVER_EXPORT_THIS_BCRYPT_HASH_2',
    },
    {
      id: bobUid,
      email: 'bob@example.com',
      email_confirmed: false,
      encrypted_password: '$2a$10$DO_NOT_EVER_EXPORT_THIS_BCRYPT_HASH_3',
    },
  );

  db.store.users.push(
    {
      id: adminUid,
      email: 'Sachet61@gmail.com',
      display_name: 'Master Admin',
      role: 'admin',
      phone: null,
      avatar_url: null,
      status: 'active',
      email_verified: true,
      referral_code: 'REF_ADMIN_01',
      referred_by: null,
      signup_ip: '198.51.100.1',
      device_fingerprint: 'fp_admin',
      is_parent_admin: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: aliceUid,
      email: 'Alice@Example.com',
      display_name: 'Alice Player',
      role: 'customer',
      phone: '+15550001111',
      avatar_url: '/api/storage/file?bucket=avatars&path=alice.webp',
      status: 'active',
      email_verified: true,
      referral_code: 'REF_ALICE_01',
      referred_by: null,
      signup_ip: '198.51.100.2',
      device_fingerprint: 'fp_alice',
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.000Z',
    },
    {
      id: bobUid,
      email: 'bob@example.com',
      display_name: 'Bob Player',
      role: 'customer',
      phone: null,
      avatar_url: null,
      status: 'active',
      email_verified: false,
      referral_code: 'REF_BOB_01',
      referred_by: aliceUid,
      signup_ip: '198.51.100.3',
      device_fingerprint: 'fp_bob',
      created_at: '2026-02-02T12:30:00.000Z',
      updated_at: '2026-02-02T12:30:00.000Z',
    },
  );

  db.store.app_config.push(
    {
      id: 'main',
      data: { currency: 'USD', minWithdrawal: 20, maxWithdrawal: 2000 },
      updated_at: '2026-02-10T00:00:00.000Z',
    },
    {
      id: 'push_subscriptions',
      data: [
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-alice-1',
          userId: aliceUid,
          userRole: 'customer',
          userEmail: 'alice@example.com',
          keys: { p256dh: 'P256_KEY_ALICE', auth: 'AUTH_KEY_ALICE' },
          platform: 'android',
          browser: 'chrome',
          active: true,
          createdAt: '2026-02-03T00:00:00.000Z',
          updatedAt: '2026-02-03T00:00:00.000Z',
        },
      ],
      updated_at: '2026-02-03T00:00:00.000Z',
    },
  );

  db.store.audit_logs.push({
    id: 'aud_1',
    user_id: adminUid,
    user_email: 'sachet61@gmail.com',
    actor_role: 'admin',
    action: 'TOPUP_APPROVED',
    entity_type: 'topup',
    entity_id: 'top_1',
    details: 'Approved $100.05 top-up',
    created_at: '2026-02-04T08:00:00.000Z',
  });

  db.store.game_catalog.push({
    id: 'fire_kirin',
    title: 'Fire Kirin',
    category: 'Fish Arcade',
    description: 'Popular sweepstakes arcade',
    min_load: '10.00',
    bonus_pct: '20.00',
    is_active: true,
    icon_url: '/images/games/firekirin-v2.webp',
    image_url: '/images/games/firekirin-v2.webp',
    game_url: 'https://play.example.com/fk',
    download_url: null,
    links: [{ label: 'Web', url: 'https://play.example.com/fk' }],
    created_at: '2026-01-05T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
  });

  db.store.faked_cashouts.push({
    id: 'fc_1',
    customer_name: 'Alice P.',
    amount: '150.25',
    currency: 'USD',
    method_name: 'CashApp',
    game_name: 'Fire Kirin',
    is_fake: false,
    timestamp: '2026-02-05T15:00:00.000Z',
  });

  db.store.official_partners.push({
    id: '44444444-4444-4444-8444-444444444444',
    name: 'SwiftSweeps Telegram',
    icon_url: null,
    platform: 'telegram',
    page_url: 'https://t.me/swiftsweeps',
    message_link: 'https://t.me/swiftsweeps',
    game_id: 'fire_kirin',
    note: 'Official channel',
    is_visible: true,
    sort_order: 1,
    updated_by: adminUid,
    updated_at: '2026-01-10T00:00:00.000Z',
  });

  db.store.wallets.push(
    {
      customer_id: aliceUid,
      balance: '125.75',
      referral_bonus_balance: '15.50',
      free_play_balance: '5.25',
      pending_withdrawal: '40.00',
      pending_deposit: '0.00',
      total_deposited: '200.55',
      total_withdrawn: '34.80',
      currency: 'USD',
      updated_at: '2026-02-06T12:00:00.000Z',
    },
    {
      customer_id: bobUid,
      balance: '0.00',
      referral_bonus_balance: '10.00',
      free_play_balance: '2.50',
      pending_withdrawal: '0.00',
      pending_deposit: '25.00',
      total_deposited: '0.00',
      total_withdrawn: '0.00',
      currency: 'USD',
      updated_at: '2026-02-06T12:05:00.000Z',
    },
  );

  db.store.game_accounts.push({
    id: 'ga_1',
    customer_id: aliceUid,
    game_id: 'fire_kirin',
    game_title: 'Fire Kirin',
    platform_name: 'Sweepstakes',
    username: 'alice_fk',
    password: 'SENSITIVE_GAME_PASSWORD_99',
    pin: '4321',
    status: 'active',
    balance: '32.10',
    free_play_balance: '5.00',
    request_type: null,
    assigned_by_agent_id: adminUid,
    assigned_by_agent_name: 'Master Admin',
    created_at: '2026-02-01T11:00:00.000Z',
    updated_at: '2026-02-06T11:00:00.000Z',
  });

  db.store.topups.push(
    {
      id: 'top_1',
      customer_id: aliceUid,
      customer_name: 'Alice Player',
      amount: '100.05',
      currency: 'USD',
      bonus_amount: '20.01',
      bonus_percentage: '20.00',
      fee_amount: '0.00',
      final_wallet_credit: '120.06',
      payment_method_id: 'pm_cashapp_verified',
      payment_method_name: 'Verified CashApp',
      status: 'completed',
      proof_url: '/api/storage/file?bucket=chat_attachments&path=receipts%2Ftop1.webp',
      receipt_name: 'top1.webp',
      target_game_name: 'Fire Kirin',
      target_game_account_id: 'ga_1',
      target_game_username: 'alice_fk',
      funding_source: 'payment_method',
      provider_ref: null,
      customer_notes: 'First deposit',
      metadata: { cashTag: '$alice', verified: true },
      reviewer_id: adminUid,
      reviewer_name: 'Master Admin',
      review_notes: 'Verified receipt',
      created_at: '2026-02-04T07:55:00.000Z',
      updated_at: '2026-02-04T08:00:00.000Z',
    },
    {
      id: 'top_2',
      customer_id: bobUid,
      customer_name: 'Bob Player',
      amount: '0.00',
      currency: 'USD',
      bonus_amount: '0.00',
      bonus_percentage: '0.00',
      fee_amount: '0.00',
      final_wallet_credit: '0.00',
      payment_method_id: 'pm_chime_direct',
      payment_method_name: 'Chime Direct',
      status: 'submitted',
      proof_url: null,
      receipt_name: null,
      target_game_name: null,
      target_game_account_id: null,
      target_game_username: null,
      funding_source: 'payment_method',
      provider_ref: null,
      customer_notes: 'Proof-first submission',
      metadata: {},
      reviewer_id: null,
      reviewer_name: null,
      review_notes: null,
      created_at: '2026-02-06T12:04:00.000Z',
      updated_at: '2026-02-06T12:04:00.000Z',
    },
  );

  db.store.withdrawals.push({
    id: 'wd_1',
    customer_id: aliceUid,
    customer_name: 'Alice Player',
    amount: '40.00',
    fee: '1.25',
    net_amount: '38.75',
    payout_method_id: 'pm_cashapp',
    payout_method_name: 'CashApp',
    payout_details: { cashtag: '$alice', method: 'cashapp' },
    status: 'pending',
    reviewer_id: null,
    reviewer_name: null,
    review_notes: null,
    transaction_hash: null,
    created_at: '2026-02-06T11:50:00.000Z',
    updated_at: '2026-02-06T11:50:00.000Z',
  });

  db.store.transactions.push(
    {
      id: 'tx_dep_top_1',
      customer_id: aliceUid,
      amount: '100.05',
      type: 'deposit',
      status: 'completed',
      description: 'CashApp Deposit Approved',
      reference_id: 'top_1',
      game_name: 'Fire Kirin',
      created_at: '2026-02-04T08:00:00.000Z',
    },
    {
      id: 'tx_bns_top_1',
      customer_id: aliceUid,
      amount: '20.01',
      type: 'bonus',
      status: 'completed',
      description: 'Deposit Promo Bonus',
      reference_id: 'top_1',
      game_name: 'Fire Kirin',
      created_at: '2026-02-04T08:00:01.000Z',
    },
  );

  db.store.referral_awards.push({
    id: 'ref_1',
    referrer_id: aliceUid,
    referee_id: bobUid,
    referral_code_used: 'REF_ALICE_01',
    source: 'signup_link',
    reward_mode: 'flat',
    payout_target: 'referral_bonus',
    referrer_reward_amount: '15.50',
    referee_reward_amount: '10.00',
    qualifying_deposit_id: 'top_1',
    qualifying_deposit_amount: '100.05',
    status: 'rewarded',
    fraud_flags: [],
    staff_reason: null,
    assigned_by: null,
    assigned_by_name: null,
    reviewed_by: adminUid,
    reviewed_by_name: 'Master Admin',
    review_notes: 'Clean referral',
    rewarded_at: '2026-02-05T09:00:00.000Z',
    created_at: '2026-02-02T12:31:00.000Z',
    updated_at: '2026-02-05T09:00:00.000Z',
  });

  db.store.wheel_spins.push({
    id: 'spin_1',
    customer_id: aliceUid,
    segment_id: 'seg_5',
    segment_label: '$5.25 Free Play',
    reward_amount: '5.25',
    simulated_win_amount: '250.00',
    probability_weight: '12.5000',
    idempotency_key: 'idem_spin_1',
    tx_id: 'tx_spin_1',
    status: 'completed',
    created_at: '2026-02-05T10:00:00.000Z',
  });

  db.store.notifications.push({
    id: 'notif_1',
    user_id: aliceUid,
    title: 'Deposit Approved',
    message: 'Your $100.05 deposit was approved.',
    type: 'topup',
    read: false,
    link_tab: 'wallet',
    link_request_id: 'top_1',
    created_at: '2026-02-04T08:00:02.000Z',
  });

  db.store.conversations.push({
    id: `conv_${aliceUid}`,
    customer_id: aliceUid,
    customer_name: 'Alice Player',
    agent_id: adminUid,
    agent_name: 'Master Admin',
    status: 'open',
    last_message: 'Hello support!',
    last_message_at: '2026-02-06T09:00:00.000Z',
    created_at: '2026-02-01T10:05:00.000Z',
  });

  db.store.messages.push({
    id: 'msg_1',
    conversation_id: `conv_${aliceUid}`,
    sender_id: aliceUid,
    sender_name: 'Alice Player',
    sender_role: 'customer',
    content: 'Hello support!',
    attachment_url: null,
    attachment_name: null,
    transaction_data: { amount: 100.05, requestId: 'top_1' },
    is_internal_note: false,
    created_at: '2026-02-06T09:00:00.000Z',
  });

  db.store.storage_objects_meta.push({ name: 'receipts/top1.webp' });
  db.store.password_reset_tokens.push({ id: 'legacy_prt_1' });
}

function makeStagingConfig(overrides: Partial<DataMigrationConfig> = {}): DataMigrationConfig {
  return {
    mode: 'preflight',
    sourceEnv: 'staging',
    targetEnv: 'staging',
    sourceDatabaseUrl: 'postgres://ro_user:super_secret_pw@source.staging.internal:5432/postgres',
    targetDatabaseUrl: 'postgres://mig_user:target_secret_pw@target.staging.internal:5432/swiftsweeps',
    sourceSslMode: 'require',
    targetSslMode: 'require',
    batchSize: 2, // intentionally small to exercise multi-batch pagination + checkpoints
    maxRetries: 2,
    retryBaseDelayMs: 5,
    confirmProductionCli: false,
    allowProductionSource: false,
    allowProductionTarget: false,
    ...overrides,
  };
}

test('config validation fails closed on missing env, same DB, and unguarded production environments', () => {
  assert.throws(
    () =>
      loadDataMigrationConfig({
        mode: 'preflight',
        env: {},
      }),
    DataMigrationConfigError,
  );

  // Same source & target database rejected
  assert.throws(
    () =>
      loadDataMigrationConfig({
        mode: 'validate',
        env: {
          MIGRATION_SOURCE_ENV: 'staging',
          MIGRATION_TARGET_ENV: 'staging',
          MIGRATION_SOURCE_DATABASE_URL: 'postgres://u:p1@db.internal:5432/appdb',
          MIGRATION_TARGET_DATABASE_URL: 'postgres://u2:p2@db.internal:5432/appdb',
        },
      }),
    DataMigrationConfigError,
  );

  // Production source blocked without explicit operator confirmation token
  assert.throws(
    () =>
      loadDataMigrationConfig({
        mode: 'preflight',
        env: {
          MIGRATION_SOURCE_ENV: 'production',
          MIGRATION_TARGET_ENV: 'staging',
          MIGRATION_SOURCE_DATABASE_URL: 'postgres://u:p1@src.internal:5432/src',
          MIGRATION_TARGET_DATABASE_URL: 'postgres://u:p2@tgt.internal:5432/tgt',
        },
      }),
    DataMigrationConfigError,
  );

  // Production target import blocked without both env guard AND --confirm-production CLI flag
  assert.throws(
    () =>
      loadDataMigrationConfig({
        mode: 'import',
        confirmProductionCli: false,
        env: {
          MIGRATION_SOURCE_ENV: 'production',
          MIGRATION_TARGET_ENV: 'production',
          MIGRATION_SOURCE_DATABASE_URL: 'postgres://u:p1@src.internal:5432/src',
          MIGRATION_TARGET_DATABASE_URL: 'postgres://u:p2@tgt.internal:5432/tgt',
          MIGRATION_ALLOW_PRODUCTION_SOURCE: PRODUCTION_SOURCE_CONFIRM_TOKEN,
          MIGRATION_ALLOW_PRODUCTION_TARGET: PRODUCTION_TARGET_CONFIRM_TOKEN,
        },
      }),
    DataMigrationConfigError,
  );

  // Valid guarded production config succeeds
  const validProd = loadDataMigrationConfig({
    mode: 'import',
    confirmProductionCli: true,
    env: {
      MIGRATION_SOURCE_ENV: 'production',
      MIGRATION_TARGET_ENV: 'production',
      MIGRATION_SOURCE_DATABASE_URL: 'postgres://u:p1@src.internal:5432/src',
      MIGRATION_TARGET_DATABASE_URL: 'postgres://u:p2@tgt.internal:5432/tgt',
      MIGRATION_ALLOW_PRODUCTION_SOURCE: PRODUCTION_SOURCE_CONFIRM_TOKEN,
      MIGRATION_ALLOW_PRODUCTION_TARGET: PRODUCTION_TARGET_CONFIRM_TOKEN,
    },
  });
  assert.equal(validProd.allowProductionSource, true);
  assert.equal(validProd.allowProductionTarget, true);
});

test('preflight produces dry-run report with unmapped inspection, zero target writes, and zero leaked secrets', async () => {
  const sourceDb = new IsolatedPostgresSimulator('supabase_source');
  const targetDb = new IsolatedPostgresSimulator('self_hosted_target');
  seedRealisticSupabaseSource(sourceDb);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ss-mig-preflight-'));
  const reportPath = path.join(workDir, 'preflight.json');
  const logs: string[] = [];
  const logger = createLogger({
    level: 'info',
    writeStdout: (line) => logs.push(line),
    writeStderr: (line) => logs.push(line),
  });

  try {
    const report = await runDryRunOrValidation({
      sourceDb,
      targetDb,
      config: makeStagingConfig({ mode: 'preflight', reportPath }),
      logger,
    });

    assert.equal(report.passed, true);
    assert.equal(report.readyForHumanReview, true);
    assert.equal(report.discrepancies.length, 0);
    assert.equal(report.unmappedObjects.legacyAuthUsersDetected, 3);
    assert.equal(report.unmappedObjects.storageObjectsPendingBackfill, 1);
    assert.equal(report.unmappedObjects.legacyPasswordResetTokensCount, 1);
    assert.ok(
      report.unmappedObjects.unmappedSourceColumns.some(
        (c) => c.table === 'users' && c.column === 'is_parent_admin' && c.nonNullCount === 1,
      ),
    );
    // Preflight MUST NOT write anything to target DB
    assert.equal(targetDb.store.users.length, 0);
    assert.equal(targetDb.store.wallets.length, 0);

    const diskReport = await fs.readFile(reportPath, 'utf8');
    const combinedOutput = `${diskReport}\n${logs.join('\n')}`;
    assert.equal(combinedOutput.includes('super_secret_pw'), false);
    assert.equal(combinedOutput.includes('target_secret_pw'), false);
    assert.equal(combinedOutput.includes('SENSITIVE_GAME_PASSWORD_99'), false);
    assert.equal(combinedOutput.includes('DO_NOT_EVER_EXPORT_THIS_BCRYPT_HASH'), false);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
});

test('snapshot export, checkpointed batched import with retry, identity mapping, financial reconciliation, and idempotent re-run pass end-to-end', async () => {
  const sourceDb = new IsolatedPostgresSimulator('supabase_source');
  const targetDb = new IsolatedPostgresSimulator('self_hosted_target');
  seedRealisticSupabaseSource(sourceDb);

  // Inject transient serialization failures to test deterministic retry
  targetDb.transientFailuresRemaining = 2;

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ss-mig-e2e-'));
  const snapshotDir = path.join(workDir, 'snapshot');
  const checkpointPath = path.join(workDir, 'checkpoint.json');
  const reportPath = path.join(workDir, 'import-report.json');
  const logs: string[] = [];
  const logger = createLogger({
    level: 'info',
    writeStdout: (line) => logs.push(line),
    writeStderr: (line) => logs.push(line),
  });

  try {
    const exportRes = await runExportSnapshot({
      sourceDb,
      config: makeStagingConfig({ mode: 'export' }),
      logger,
      exportDir: snapshotDir,
    });
    assert.equal(exportRes.rowCounts.users, 3);
    assert.equal(exportRes.rowCounts.push_subscriptions, 1);
    assert.equal(exportRes.rowCounts.ba_user, 3);
    assert.equal(exportRes.rowCounts.auth_user_links, 3);

    // Import from verified snapshot into isolated target
    const importReport = await runDataMigrationImport({
      sourceDb,
      targetDb,
      snapshotDir,
      config: makeStagingConfig({
        mode: 'import',
        checkpointPath,
        reportPath,
      }),
      logger,
    });

    assert.equal(importReport.passed, true);
    assert.equal(importReport.financialReconciliation.matched, true);
    assert.equal(targetDb.store.users.length, 3);
    assert.equal(targetDb.store.wallets.length, 2);
    assert.equal(targetDb.store.topups.length, 2);
    assert.equal(targetDb.store.withdrawals.length, 1);
    assert.equal(targetDb.store.transactions.length, 2);
    assert.equal(targetDb.store.push_subscriptions.length, 1);

    // Check Better Auth identity links: password_reset_required=true and NO bcrypt hash copied
    assert.equal(targetDb.store.ba_user.length, 3);
    assert.equal(targetDb.store.auth_user_links.length, 3);
    for (const link of targetDb.store.auth_user_links) {
      assert.equal(link.migration_source, 'supabase_import');
      assert.equal(link.password_reset_required, true);
      assert.ok(link.legacy_supabase_uid);
    }

    // Check notifications."read" -> is_read & audit_logs legacy column normalization
    assert.equal(targetDb.store.notifications[0]?.is_read, false);
    assert.equal(
      targetDb.store.audit_logs[0]?.actor_id,
      '11111111-1111-4111-8111-111111111111',
    );
    assert.equal(targetDb.store.audit_logs[0]?.actor_name, 'sachet61@gmail.com');

    // Check exact numeric precision preserved
    assert.equal(
      importReport.financialReconciliation.target.wallets.balance,
      '125.75',
    );
    assert.equal(
      importReport.financialReconciliation.target.topups.amount,
      '100.05',
    );
    assert.equal(
      importReport.financialReconciliation.target.withdrawals.netAmount,
      '38.75',
    );

    // Independent validation against live sourceDb vs targetDb passes
    const valReport = await runDryRunOrValidation({
      sourceDb,
      targetDb,
      config: makeStagingConfig({ mode: 'validate' }),
      logger,
    });
    assert.equal(valReport.passed, true);
    assert.equal(valReport.discrepancies.length, 0);

    // Checkpoint resume / idempotent re-run leaves exact same state
    const checkpointRaw = await fs.readFile(checkpointPath, 'utf8');
    const parsedCheckpoint = JSON.parse(checkpointRaw) as {
      completedTables: string[];
    };
    assert.ok(parsedCheckpoint.completedTables.includes('transactions'));

    const resumeReport = await runDataMigrationImport({
      sourceDb,
      targetDb,
      config: makeStagingConfig({ mode: 'import', checkpointPath }),
      logger,
    });
    assert.equal(resumeReport.passed, true);
    assert.equal(targetDb.store.transactions.length, 2);

    // Verify logs & report contain zero secrets or passwords
    const diskReport = await fs.readFile(reportPath, 'utf8');
    const combinedOutput = `${diskReport}\n${checkpointRaw}\n${logs.join('\n')}`;
    assert.equal(combinedOutput.includes('super_secret_pw'), false);
    assert.equal(combinedOutput.includes('target_secret_pw'), false);
    assert.equal(combinedOutput.includes('SENSITIVE_GAME_PASSWORD_99'), false);
    assert.equal(combinedOutput.includes('P256_KEY_ALICE'), false);
    assert.equal(combinedOutput.includes('DO_NOT_EVER_EXPORT_THIS_BCRYPT_HASH'), false);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
});

test('validator halts fail-closed on $0.01 financial discrepancy and orphan FK source rows', async () => {
  const sourceDb = new IsolatedPostgresSimulator('supabase_source');
  const targetDb = new IsolatedPostgresSimulator('self_hosted_target');
  seedRealisticSupabaseSource(sourceDb);
  const logger = createLogger({ level: 'error', writeStdout: () => {}, writeStderr: () => {} });

  await runDataMigrationImport({
    sourceDb,
    targetDb,
    config: makeStagingConfig({ mode: 'import' }),
    logger,
  });

  // Introduce a $0.01 discrepancy on target wallet balance
  targetDb.store.wallets[0]!.balance = '125.74';

  await assert.rejects(
    () =>
      runDryRunOrValidation({
        sourceDb,
        targetDb,
        config: makeStagingConfig({ mode: 'validate' }),
        logger,
      }),
    (err: unknown) => {
      assert.ok(err instanceof DataMigrationIntegrityError);
      assert.ok(
        err.discrepancies.some((d) => d.includes('wallets.balance')),
      );
      return true;
    },
  );

  // Inject an orphan transaction in source DB and prove import refuses to run
  sourceDb.store.transactions.push({
    id: 'tx_orphan_1',
    customer_id: 'non_existent_user',
    amount: '10.00',
    type: 'deposit',
    status: 'completed',
    description: 'Orphan row',
    reference_id: null,
    game_name: null,
    created_at: '2026-02-07T00:00:00.000Z',
  });

  await assert.rejects(
    () =>
      runDataMigrationImport({
        sourceDb,
        targetDb,
        config: makeStagingConfig({ mode: 'import' }),
        logger,
      }),
    (err: unknown) => {
      assert.ok(err instanceof DataMigrationIntegrityError);
      assert.ok(err.discrepancies.some((d) => d.includes('orphan transaction')));
      return true;
    },
  );
});

test('advanceTargetSequences safely advances serial/identity sequences without moving backwards and stays read-only when readOnly=true', async () => {
  const targetDb = new IsolatedPostgresSimulator('self_hosted_target');
  targetDb.columns.push({
    table: 'custom_seq_table',
    column: 'seq_id',
    isIdentity: true,
  });
  targetDb.sequences.set('public.custom_seq_table_seq_id_seq', 3n);
  targetDb.store.custom_seq_table.push({ seq_id: 42 });

  const readOnlyCheck = await advanceTargetSequences(targetDb, { readOnly: true });
  assert.equal(readOnlyCheck.length, 1);
  assert.equal(readOnlyCheck[0]?.maxColumnValue, '42');
  assert.equal(targetDb.sequences.get('public.custom_seq_table_seq_id_seq'), 3n);

  const applied = await advanceTargetSequences(targetDb, { readOnly: false });
  assert.equal(applied[0]?.advancedTo, '42');
  assert.equal(targetDb.sequences.get('public.custom_seq_table_seq_id_seq'), 42n);
});
