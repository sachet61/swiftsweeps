import {
  UserProfile,
  UserWallet,
  WalletTransaction,
  TopUpRequest,
  WithdrawalRequest,
  GameCatalogItem,
  GameAccount,
  GameAccountStatus,
  SupportConversation,
  ChatMessage,
  ChatTransactionData,
  AppNotification,
  AppConfig,
  AuditLog,
  ReferralSummary,
  ReferralProgramConfig,
  ReferralLedgerEntry,
  TopReferrerEntry,
  PayoutMethodType,
  PaymentMethodType,
  WithdrawalStatus,
  CashoutFeedItem,
  PasswordResetToken,
  UserRole,
  WheelEligibilityState,
  WheelOfLuckConfig,
  WheelSpinResponse,
  WheelStatusResponse,
  OfficialPartner,
  OfficialPartnerInput,
} from '../types';
import {
  INITIAL_CONFIG,
  INITIAL_USERS,
  INITIAL_WALLETS,
  INITIAL_TRANSACTIONS,
  INITIAL_TOPUPS,
  INITIAL_WITHDRAWALS,
  INITIAL_GAME_CATALOG,
  INITIAL_GAME_ACCOUNTS,
  INITIAL_CONVERSATIONS,
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_AUDIT_LOGS,
} from './seedData';
import { resolveGameImageUrl } from '../utils/imageUtils';
import { authSessionService, PREDEFINED_ADMINS } from './authSessionService';
import { selfHostedAuthService } from './selfHostedAuthService';
import { shouldRunSilentBackgroundRefresh } from './sessionHydrationUtils';
import { supabase, isSupabaseConfigured, testSupabaseConnection } from './supabaseClient';
import { supabaseAuthService } from './supabaseAuthService';
import { supabaseTokenManager } from './supabaseTokenManager';
import { SESSION_EXPIRED_USER_MESSAGE } from './authTokenUtils';
import { webPushClient } from './webPushClient';
import { realtimeStreamClient } from './realtimeStreamClient';
import {
  filterRealtimeRowsForUser,
  shouldAcceptIncomingChatMessage,
} from './notificationScoping';
import {
  normalizeAuditLogRow,
  mergeAuditLogs,
} from '../utils/auditLogUtils';
import {
  calculateReferralPayouts,
  normalizeReferralConfig,
  normalizeReferralCodeInput,
} from '../utils/referralUtils';
import {
  formatWheelHttpError,
  isHtmlFallbackResponse,
  normalizeWheelConfig,
} from '../utils/wheelOfLuckUtils';
import { normalizeCashoutRulesConfig } from '../utils/cashoutRulesUtils';
import {
  normalizeOfficialPartnerRow,
  sortOfficialPartners,
} from '../utils/officialPartnersUtils';
import { storageService } from './storageService';
import {
  mergeVerifiedStatus,
  readVerifiedCache,
  writeVerifiedCache,
} from './verificationStateUtils';
import {
  mapDbMessageRowToChatMessage,
  sortAndDeduplicateMessages,
  mergeAuthoritativeMessages,
  mergeSingleMessage,
} from './chatOrderUtils';
import {
  filterVisibleMessagesForRole,
  isMessageInternalNote,
  normalizeTicketStatus,
  type TicketStatusValue,
} from '../utils/chatPresentationUtils';
import {
  formatCashoutChatMessage,
  formatCredentialsReadyChatMessage,
  formatGameIdRequestChatMessage,
  formatGamePasswordResetChatMessage,
  formatTopUpApprovedChatMessage,
  formatTopUpSubmittedChatMessage,
  formatTransactionStatusChatMessage,
} from '../utils/uiCopyUtils';
import {
  mapDbTopupRowToRequest,
  mapDbWithdrawalRowToRequest,
  mergeWithdrawalRequests,
  mergeTopupRequests,
  findRequestById,
  parseDepositApiError,
  parseWithdrawalApiError,
} from './requestSyncUtils';
import {
  buildStaffTopUpDraft,
  buildStaffWithdrawalDraft,
  computeCumulativeCompletedDeposits,
  computeCumulativeCompletedWithdrawals,
  getDefaultBonusPercentageForMethod,
  mapDbWalletRowToWallet,
  mergeWalletTransactions,
  parseWalletApiError,
  reconcileWalletWithTopups,
} from './walletActivityUtils';
import { toProxyStorageUrl } from './storageUrlUtils';
import {
  applyServerGameCatalogResponse,
  mapDbRowToGameCatalogItem,
  mergeCatalogFromServerRows,
  parseGameCatalogApiError,
} from './gameCatalogUtils';
import {
  buildGameAccountsQueryUrl,
  deduplicateGameAccountsList,
  mergeGameAccounts,
  parseGameAccountApiError,
} from './gameAccountUtils';

function extractServerApiError(json: any, fallback: string): string {
  if (json && typeof json === 'object') {
    if (typeof json.error === 'string' && json.error.trim()) {
      return json.error.trim();
    }
    if (
      json.error &&
      typeof json.error === 'object' &&
      typeof json.error.message === 'string' &&
      json.error.message.trim()
    ) {
      return json.error.message.trim();
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim();
    }
  }
  return fallback;
}

function extractServerApiCode(json: any): string | undefined {
  if (json && typeof json === 'object') {
    if (typeof json.code === 'string' && json.code) return json.code;
    if (
      json.error &&
      typeof json.error === 'object' &&
      typeof json.error.code === 'string' &&
      json.error.code
    ) {
      return json.error.code;
    }
  }
  return undefined;
}

export type RealtimeSyncStatus = 'connected' | 'syncing' | 'sleeping' | 'disconnected' | 'reconnecting';

export interface SyncHealthInfo {
  status: RealtimeSyncStatus;
  lastSyncAt: string | null;
  egressReductionActive: boolean;
  dormantPaused: boolean;
}

const STORAGE_KEYS = {
  USERS: 'aetherpay_users',
  WALLETS: 'aetherpay_wallets',
  TRANSACTIONS: 'aetherpay_transactions',
  TOPUPS: 'aetherpay_topups',
  WITHDRAWALS: 'aetherpay_withdrawals',
  GAME_CATALOG: 'aetherpay_game_catalog',
  GAME_ACCOUNTS: 'aetherpay_game_accounts',
  CONVERSATIONS: 'aetherpay_conversations',
  MESSAGES: 'aetherpay_messages',
  NOTIFICATIONS: 'aetherpay_notifications',
  AUDIT_LOGS: 'aetherpay_audit_logs',
  CONFIG: 'aetherpay_config',
  FAKED_CASHOUTS: 'aetherpay_faked_cashouts',
  PASSWORD_RESET_TOKENS: 'aetherpay_password_reset_tokens',
  WEBHOOK_LOGS: 'aetherpay_webhook_logs',
  CURRENT_USER_ID: 'aetherpay_current_user_id',
};

class DataService {
  private isDemoMode = false;
  private inFlightUserLookups = new Set<string>();
  private cache: Record<string, any> = {
    [STORAGE_KEYS.USERS]: [],
    [STORAGE_KEYS.WALLETS]: {},
    [STORAGE_KEYS.TRANSACTIONS]: [],
    [STORAGE_KEYS.TOPUPS]: [],
    [STORAGE_KEYS.WITHDRAWALS]: [],
    [STORAGE_KEYS.GAME_CATALOG]: [...INITIAL_GAME_CATALOG],
    [STORAGE_KEYS.GAME_ACCOUNTS]: [],
    [STORAGE_KEYS.CONVERSATIONS]: [],
    [STORAGE_KEYS.MESSAGES]: {},
    [STORAGE_KEYS.NOTIFICATIONS]: [],
    [STORAGE_KEYS.AUDIT_LOGS]: [],
    [STORAGE_KEYS.CONFIG]: { ...INITIAL_CONFIG },
    [STORAGE_KEYS.FAKED_CASHOUTS]: [],
    [STORAGE_KEYS.PASSWORD_RESET_TOKENS]: [],
  };
  private currentUserId: string | null = null;
  private authenticatedUser: UserProfile | null = null;
  private isQuotaExceeded = false;
  private pollingIntervals: number[] = [];
  private isSeeding = false;
  private lastPolledMessageTime: string | null = null;
  private syncStatus: RealtimeSyncStatus = 'disconnected';
  private lastSyncTimestamp: string | null = null;
  private realtimeChannel: any = null;
  private realtimeStreamUnsub: (() => void) | null = null;
  private invalidationSyncTimer: number | null = null;
  private pendingInvalidatedTables: Set<string> = new Set();
  private mutationQueue: Array<{ table: string; eventType: string; newRow: any; oldRow: any }> = [];
  private mutationDebounceTimer: number | null = null;
  private messageSaveDebounceTimer: any = null;
  private isVisibilityListenerAttached = false;
  private isSyncingDelta = false;
  private isHydratingSession = false;
  private hydrationUserId: string | null = null;
  private activeHydrationPromise: Promise<void> | null = null;
  private lastHydratedUserId: string | null = null;
  private lastHydratedAt = 0;
  private lastHydrationError: string | null = null;
  private authoritativelyLoadedTopupsForUser: Set<string> = new Set();
  private conversationAliasMap: Map<string, string> = new Map();
  private ensuredServerConversations: Set<string> = new Set();
  private inFlightEnsureConversations: Set<string> = new Set();
  private officialPartnersCache: OfficialPartner[] | null = null;

  constructor() {
    this.cleanLegacyStorage();
    this.loadFromLocalStorage();
    // Enforce invariant: Strictly 1 Game ID per game platform per user
    const initialAccounts = this.cache[STORAGE_KEYS.GAME_ACCOUNTS] as GameAccount[];
    if (Array.isArray(initialAccounts) && initialAccounts.length > 0) {
      const clean = this.deduplicateGameAccounts(initialAccounts);
      this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = clean;
      this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, clean);
    }
    // Enforce invariant: Strictly 1 persistent conversation per customer across all agents & admins
    const initialConvs = this.cache[STORAGE_KEYS.CONVERSATIONS] as SupportConversation[];
    if (Array.isArray(initialConvs) && initialConvs.length > 0) {
      const cleanConvs = this.deduplicateAndMergeConversations(initialConvs);
      this.cache[STORAGE_KEYS.CONVERSATIONS] = cleanConvs;
      this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, cleanConvs);
    }
    this.attachVisibilityListener();
    this.initPersistence();
  }

  private cleanLegacyStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      // Invariant: Users directory and System Audit Logs are NEVER cached to browser localStorage
      localStorage.removeItem(STORAGE_KEYS.USERS);
      localStorage.removeItem('aetherpay_users');
      localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);

      const CLEAN_FLAG = 'swift_sweeps_prod_clean_v7';
      if (!localStorage.getItem(CLEAN_FLAG)) {
        console.log('[SwiftSweeps] Performing clean-slate migration: clearing legacy storage...');
        localStorage.removeItem('swift_sweeps_prod_clean_v6');
        const keysToClean = [
          'aetherpay_users',
          'aetherpay_wallets',
          'aetherpay_transactions',
          'aetherpay_topups',
          'aetherpay_withdrawals',
          'aetherpay_game_accounts',
          'aetherpay_conversations',
          'aetherpay_messages',
          'aetherpay_notifications',
          'aetherpay_audit_logs',
          'aetherpay_faked_cashouts',
          'aetherpay_webhook_logs',
          'aetherpay_password_reset_tokens',
          'aetherpay_mock_users',
          'aetherpay_user_credentials',
        ];
        for (const k of keysToClean) {
          localStorage.removeItem(k);
        }
        localStorage.setItem(CLEAN_FLAG, 'true');
      }

      // Purge legacy staff conversations from browser cache (e.g. haudemaxe@gmail.com)
      const STAFF_CONV_CLEAN_FLAG = 'swift_sweeps_staff_conv_clean_v1';
      if (!localStorage.getItem(STAFF_CONV_CLEAN_FLAG)) {
        try {
          const rawConvs = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
          if (rawConvs) {
            const parsed = JSON.parse(rawConvs);
            if (Array.isArray(parsed)) {
              const cleaned = parsed.filter((c: any) => {
                const email = (c.customerEmail || '').toLowerCase();
                return email !== 'haudemaxe@gmail.com' && email !== 'sachet61@gmail.com';
              });
              localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(cleaned));
            }
          }
        } catch {}
        localStorage.setItem(STAFF_CONV_CLEAN_FLAG, 'true');
      }

      // Purge any legacy automated bot greetings from cached messages and greeting flags
      const BOT_GREETINGS_PURGE_FLAG = 'swift_sweeps_bot_greeting_purged_v2';
      if (!localStorage.getItem(BOT_GREETINGS_PURGE_FLAG)) {
        try {
          const rawMsgs = localStorage.getItem(STORAGE_KEYS.MESSAGES);
          if (rawMsgs) {
            const parsed = JSON.parse(rawMsgs);
            if (parsed && typeof parsed === 'object') {
              for (const [convId, msgList] of Object.entries(parsed)) {
                if (Array.isArray(msgList)) {
                  parsed[convId] = msgList.filter((m: any) => {
                    const text = (m?.text || '').toLowerCase();
                    const isBotGreeting =
                      text.includes('welcome to swift sweeps support') ||
                      text.includes('treasury and gaming care specialists assist you today') ||
                      (m?.senderName === 'Sarah Lin' && text.includes('welcome'));
                    return !isBotGreeting;
                  });
                }
              }
              localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(parsed));
            }
          }
          // Remove all greeting flags
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('swiftsweeps_greeting_sent_')) {
              keysToRemove.push(k);
            }
          }
          for (const k of keysToRemove) {
            localStorage.removeItem(k);
          }
        } catch {}
        localStorage.setItem(BOT_GREETINGS_PURGE_FLAG, 'true');
      }
    } catch (e) {
      console.warn('Storage wipe notice:', e);
    }
  }

  private loadFromLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      for (const key of Object.values(STORAGE_KEYS)) {
        // Invariant: NEVER load user records or system audit logs from localStorage
        if (key === STORAGE_KEYS.USERS || key === STORAGE_KEYS.AUDIT_LOGS) continue;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            this.cache[key] = JSON.parse(stored);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } catch (e) {
      console.warn('LocalStorage load notice:', e);
    }
  }

  private saveToLocalStorage(key: string, value: any): void {
    if (typeof localStorage === 'undefined') return;
    // Invariant: NEVER persist user directory or system audit logs into browser localStorage
    if (key === STORAGE_KEYS.USERS || key === STORAGE_KEYS.AUDIT_LOGS) return;

    if (key === STORAGE_KEYS.MESSAGES && typeof value === 'object' && value !== null) {
      if (this.messageSaveDebounceTimer) {
        clearTimeout(this.messageSaveDebounceTimer);
      }
      this.messageSaveDebounceTimer = setTimeout(() => {
        try {
          // Bounded thread storage: cap each conversation in persistent storage to latest 100 messages
          const boundedPayload: Record<string, ChatMessage[]> = {};
          for (const convId in value) {
            const list = value[convId];
            if (Array.isArray(list)) {
              boundedPayload[convId] = list.slice(-100);
            }
          }
          localStorage.setItem(key, JSON.stringify(boundedPayload));
        } catch (e) {
          // Ignore quota errors on local storage
        }
      }, 300);
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Ignore quota errors on local storage
    }
  }

  public getSyncHealth(): SyncHealthInfo {
    return {
      status: this.syncStatus,
      lastSyncAt: this.lastSyncTimestamp,
      egressReductionActive: true,
      dormantPaused: this.syncStatus === 'sleeping',
    };
  }

  private attachVisibilityListener(): void {
    if (typeof document === 'undefined' || this.isVisibilityListenerAttached) return;
    this.isVisibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    if (document.visibilityState === 'hidden') {
      console.log('[SwiftSweeps] Browser tab backgrounded. Suspending queries — 0 egress transmitted.');
      this.syncStatus = 'sleeping';
      this.lastSyncTimestamp = new Date().toISOString();
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
      return;
    }

    if (document.visibilityState === 'visible') {
      console.log('[SwiftSweeps] Browser tab active. Running delta sync.');
      this.syncStatus = 'connected';
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));

      const now = Date.now();
      const lastSync = this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).getTime() : 0;
      if (!this.lastSyncTimestamp || (now - lastSync) > 3000) {
        this.syncDelta().catch(() => {});
      }
    }
  }

  private initPersistence(): void {
    if (isSupabaseConfigured() && supabase) {
      const activeUser = this.getCurrentUser();
      if (activeUser) {
        console.log('[SwiftSweeps] Supabase PostgreSQL mode active. Initializing Realtime stream.');
        this.initSupabaseRealtimeSync();
        void this.hydrateForSession(activeUser, { force: true });
      } else {
        this.clearUserScopedCache();
        void this.initialCompactLoad();
      }
    } else {
      console.log('[SwiftSweeps] Self-hosted API mode active.');
      const activeUser = this.getCurrentUser();
      if (activeUser) {
        this.initSelfHostedRealtimeSync();
        void this.hydrateForSession(activeUser, { force: true });
      } else {
        this.clearUserScopedCache();
        void this.initialCompactLoad();
      }
    }
  }

  private teardownRealtimeSync(): void {
    if (this.mutationDebounceTimer !== null) {
      window.clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = null;
    }
    if (this.invalidationSyncTimer !== null) {
      window.clearTimeout(this.invalidationSyncTimer);
      this.invalidationSyncTimer = null;
    }
    this.pendingInvalidatedTables.clear();
    this.mutationQueue = [];
    if (this.realtimeStreamUnsub) {
      try {
        this.realtimeStreamUnsub();
      } catch {}
      this.realtimeStreamUnsub = null;
    }
    if (this.realtimeChannel && supabase) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch {}
    }
    this.realtimeChannel = null;
    this.syncStatus = 'disconnected';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    }
  }

  private scheduleInvalidationReconciliation(tables: string[]): void {
    for (const table of tables) {
      if (table) this.pendingInvalidatedTables.add(table);
    }
    if (this.invalidationSyncTimer !== null || typeof window === 'undefined') {
      return;
    }
    this.invalidationSyncTimer = window.setTimeout(() => {
      this.invalidationSyncTimer = null;
      const queuedTables = new Set(this.pendingInvalidatedTables);
      this.pendingInvalidatedTables.clear();
      void this.reconcileInvalidatedTables(queuedTables);
    }, 250);
  }

  private async reconcileInvalidatedTables(tables: Set<string>): Promise<void> {
    if (tables.size === 0) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Defer full reconciliation until visibility restores
      return;
    }

    const user = this.getCurrentUser();
    if (!user?.id) return;
    const isStaff = user.role === 'admin' || user.role === 'agent';
    const tasks: Promise<unknown>[] = [];
    let shouldReconcileWallet = false;

    if (tables.has('app_config')) {
      tasks.push(this.fetchAppConfigFromServer({ silentEvent: true }));
    }
    if (tables.has('faked_cashouts')) {
      tasks.push(this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true }));
    }
    if (tables.has('game_catalog')) {
      tasks.push(this.fetchGameCatalogFromServer({ silentEvent: true }));
    }
    if (tables.has('official_partners')) {
      tasks.push(this.fetchOfficialPartners());
    }
    if (tables.has('topups')) {
      tasks.push(
        this.fetchDepositsFromServer({
          ...(isStaff ? { limit: 25 } : { customerId: user.id, limit: 20 }),
          replaceAll: false,
          silentEvent: true,
        })
      );
      shouldReconcileWallet = true;
    }
    if (tables.has('withdrawals')) {
      tasks.push(
        this.fetchWithdrawalsFromServer({
          ...(isStaff ? { limit: 25 } : { customerId: user.id, limit: 20 }),
          replaceAll: false,
          silentEvent: true,
        })
      );
      shouldReconcileWallet = true;
    }
    if (tables.has('wallets') || tables.has('transactions') || tables.has('wheel_spins')) {
      if (isStaff) {
        tasks.push(this.fetchWalletsFromServer({ limit: 50, silentEvent: true }));
      } else {
        tasks.push(
          this.fetchWalletFromServer({ customerId: user.id, silentEvent: true }),
          this.fetchWalletTransactionsFromServer({
            customerId: user.id,
            limit: 30,
            replaceAll: false,
            silentEvent: true,
          })
        );
      }
      shouldReconcileWallet = true;
    }
    if (tables.has('game_accounts')) {
      tasks.push(
        this.fetchGameAccountsFromServer({
          ...(isStaff ? { limit: 100 } : { customerId: user.id, limit: 50 }),
          replaceAll: true,
          silentEvent: true,
        })
      );
    }
    if (tables.has('audit_logs') && user.role === 'admin') {
      tasks.push(this.fetchAuditLogsFromServer({ limit: 100 }));
    }
    if (tables.has('users') && isStaff) {
      tasks.push(this.fetchLiveUsersDirectory(user));
    }

    if (tasks.length === 0) {
      return;
    }

    await Promise.allSettled(tasks);
    if (!isStaff && shouldReconcileWallet) {
      this.reconcileCustomerWallet(user.id);
    }
    this.lastSyncTimestamp = new Date().toISOString();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'realtime_batch', tables: Array.from(tables) },
        })
      );
      window.dispatchEvent(
        new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() })
      );
    }
  }

  private initSelfHostedRealtimeSync(): void {
    if (isSupabaseConfigured()) return;
    if (!this.getCurrentUser()) return;
    if (this.realtimeStreamUnsub) return;

    this.syncStatus = 'syncing';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    }

    this.realtimeStreamUnsub = realtimeStreamClient.subscribe({
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          this.syncStatus = 'connected';
        } else if (status === 'SUBSCRIBING') {
          this.syncStatus = 'syncing';
        } else if (status === 'CHANNEL_ERROR') {
          this.syncStatus = 'reconnecting';
        } else {
          this.syncStatus = 'disconnected';
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
        }
      },
      onAuditLog: (event) => {
        const activeUser = this.getCurrentUser();
        if (!activeUser || activeUser.role !== 'admin') return;
        this.queueRealtimeMutation('audit_logs', 'INSERT', event.log, null);
      },
      onDomainInvalidation: (event) => {
        const activeUser = this.getCurrentUser();
        if (!activeUser) return;
        const isStaff = activeUser.role === 'admin' || activeUser.role === 'agent';
        if (event.customerId && !isStaff && event.customerId !== activeUser.id) {
          return;
        }
        this.scheduleInvalidationReconciliation(event.tables || []);
      },
      onReconnect: () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        void this.syncDelta().catch(() => {});
      },
    });
  }

  private initSupabaseRealtimeSync(): void {
    if (!supabase || !isSupabaseConfigured()) return;
    if (!this.getCurrentUser()) return;
    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch (e) {}
    }

    this.syncStatus = 'syncing';
    window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));

    const channel = supabase.channel('swiftsweeps_realtime_stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (p) => {
        this.queueRealtimeMutation('audit_logs', p.eventType, p.new, p.old);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.syncStatus = 'connected';
          // Rely purely on Realtime events; do NOT burst REST sync queries upon subscription
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.syncStatus = 'reconnecting';
        }
        window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
      });

    this.realtimeChannel = channel;
  }

  private queueRealtimeMutation(table: string, eventType: string, newRow: any, oldRow: any): void {
    this.mutationQueue.push({ table, eventType, newRow, oldRow });
    if (this.mutationDebounceTimer !== null) {
      window.clearTimeout(this.mutationDebounceTimer);
    }
    this.mutationDebounceTimer = window.setTimeout(() => {
      this.flushRealtimeMutations();
    }, 300);
  }

  private flushRealtimeMutations(): void {
    if (this.mutationQueue.length === 0) return;
    const queued = [...this.mutationQueue];
    this.mutationQueue = [];
    this.mutationDebounceTimer = null;

    const tablesModified = new Set<string>();
    const rowsByTable: Record<string, any[]> = {};
    for (const item of queued) {
      if (!rowsByTable[item.table]) rowsByTable[item.table] = [];
      if (item.newRow && Object.keys(item.newRow).length > 0) {
        rowsByTable[item.table].push(item.newRow);
      }
    }

    const activeUser = this.getCurrentUser();

    const messageRows = filterRealtimeRowsForUser('messages', rowsByTable['messages'], activeUser);
    const conversationRows = filterRealtimeRowsForUser('conversations', rowsByTable['conversations'], activeUser);
    const auditLogRows = filterRealtimeRowsForUser('audit_logs', rowsByTable['audit_logs'], activeUser);

    if (messageRows.length) {
      this.applyMessageRows(messageRows, true);
      tablesModified.add('messages');
    }
    if (conversationRows.length) {
      this.applyConversationRows(conversationRows, false);
      tablesModified.add('conversations');
    }
    if (auditLogRows.length && activeUser?.role === 'admin') {
      const normalizedLogs = auditLogRows
        .map((row) => normalizeAuditLogRow(row))
        .filter((item): item is AuditLog => Boolean(item));
      if (normalizedLogs.length > 0) {
        const existing = Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
          ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[])
          : [];
        this.cache[STORAGE_KEYS.AUDIT_LOGS] = mergeAuditLogs(existing, normalizedLogs, { maxItems: 100 });
        tablesModified.add('audit_logs');
      }
    }

    if (tablesModified.size > 0) {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'realtime_batch', tables: Array.from(tablesModified) },
        })
      );
    }
    this.lastSyncTimestamp = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
  }

  public async initialCompactLoad(): Promise<void> {
    if (!supabase || !isSupabaseConfigured()) {
      const user = this.getCurrentUser();
      const isStaff = user?.role === 'admin' || user?.role === 'agent';
      const selfHostedTasks: Promise<unknown>[] = [
        this.fetchAppConfigFromServer({ silentEvent: true }),
        this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true }),
        this.fetchGameCatalogFromServer({ silentEvent: true }),
      ];
      if (user?.id) {
        if (isStaff) {
          selfHostedTasks.push(
            this.fetchWalletsFromServer({ limit: 50, silentEvent: true }),
            this.fetchDepositsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
            this.fetchWithdrawalsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
            this.fetchGameAccountsFromServer({ limit: 100, replaceAll: true, silentEvent: true }),
            this.fetchConversationsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
          );
        } else {
          selfHostedTasks.push(
            this.fetchWalletFromServer({ customerId: user.id, silentEvent: true }),
            this.fetchWalletTransactionsFromServer({
              customerId: user.id,
              limit: 50,
              replaceAll: true,
              silentEvent: true,
            }),
            this.fetchDepositsFromServer({
              customerId: user.id,
              limit: 30,
              replaceAll: true,
              silentEvent: true,
            }),
            this.fetchWithdrawalsFromServer({
              customerId: user.id,
              limit: 30,
              replaceAll: true,
              silentEvent: true,
            }),
            this.fetchGameAccountsFromServer({
              customerId: user.id,
              limit: 50,
              replaceAll: true,
              silentEvent: true,
            }),
            this.fetchConversationsFromServer({ limit: 10, replaceAll: true, silentEvent: true }),
            this.fetchMessagesForConversation(`conv_${user.id}`, { limit: 40 }),
          );
        }
        selfHostedTasks.push(
          this.fetchOfficialPartners(),
          this.fetchNotificationsFromServer({ limit: 50, silentEvent: true }),
        );
      }
      await Promise.allSettled(selfHostedTasks);
      this.lastSyncTimestamp = new Date().toISOString();
      this.syncStatus = 'connected';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'initial_compact_load' } }));
        window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
      }
      return;
    }
    this.lastHydrationError = null;
    this.syncStatus = 'syncing';
    window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));

    try {
      const user = this.getCurrentUser();
      const isAdmin = user?.role === 'admin' || user?.role === 'agent';
      const currentUserId = user?.id;

      // Always load authoritative app_config, faked_cashouts, and game_catalog from self-hosted API
      const appConfigPromise = this.fetchAppConfigFromServer({ silentEvent: true });
      const cashoutsPromise = this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true });
      const catPromise = this.fetchGameCatalogFromServer({ silentEvent: true });

      if (isAdmin) {
        // Staff/Admin session: bounded administrative queue queries (Users fetched on-demand on tab open)
        const [_appConfigRes, _cashoutsRes, _catRes, depositsApiRes, withdrawalsApiRes, walletsApiRes, _convsRes, _gameAccsApiRes] =
          await Promise.all([
            appConfigPromise,
            cashoutsPromise,
            catPromise,
            this.fetchDepositsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
            this.fetchWithdrawalsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
            this.fetchWalletsFromServer({ limit: 50, silentEvent: true }),
            this.fetchConversationsFromServer({ limit: 25, replaceAll: true, silentEvent: true }),
            this.fetchGameAccountsFromServer({ limit: 100, replaceAll: true, silentEvent: true }),
          ]);

        if (!depositsApiRes.success && !withdrawalsApiRes.success && !walletsApiRes.success) {
          this.lastHydrationError = depositsApiRes.error || withdrawalsApiRes.error || walletsApiRes.error || 'Unable to load staff operations data.';
        }
        if (user?.role === 'admin') {
          await this.fetchAuditLogsFromServer({ limit: 100 });
        } else {
          this.cache[STORAGE_KEYS.AUDIT_LOGS] = [];
        }
        void this.fetchNotificationsFromServer({ limit: 50, silentEvent: true });
      } else if (currentUserId) {
        // Customer session: strictly scoped to CURRENT user only (no global table downloads)
        const [
          _appConfigRes,
          _cashoutsRes,
          _catRes,
          profileRes,
          walletApiRes,
          depositsApiRes,
          withdrawalsApiRes,
          txApiRes,
          _gameAccsRes,
          convApiRes,
        ] = await Promise.all([
          appConfigPromise,
          cashoutsPromise,
          catPromise,
          selfHostedAuthService.fetchProfile().catch(() => null),
          this.fetchWalletFromServer({ customerId: currentUserId, silentEvent: true }),
          this.fetchDepositsFromServer({
            customerId: currentUserId,
            limit: 30,
            replaceAll: true,
            silentEvent: true,
          }),
          this.fetchWithdrawalsFromServer({
            customerId: currentUserId,
            limit: 30,
            replaceAll: true,
            silentEvent: true,
          }),
          this.fetchWalletTransactionsFromServer({
            customerId: currentUserId,
            limit: 50,
            replaceAll: true,
            silentEvent: true,
          }),
          this.fetchGameAccountsFromServer({
            customerId: currentUserId,
            limit: 50,
            replaceAll: true,
            silentEvent: true,
          }),
          this.fetchConversationsFromServer({ limit: 10, replaceAll: true, silentEvent: true }),
        ]);
        void this.fetchNotificationsFromServer({ limit: 50, silentEvent: true });

        if (profileRes?.success && profileRes.user) {
          const synced = this.syncAuthenticatedUser(profileRes.user);
          if (synced) {
            window.dispatchEvent(
              new CustomEvent('aetherpay_state_changed', {
                detail: { key: 'user_profile_synced', user: synced },
              })
            );
          }
        }

        // Apply Order Invariant: deposits & withdrawals already applied via self-hosted API; reconcile customer wallet
        if (depositsApiRes.success) {
          this.authoritativelyLoadedTopupsForUser.add(currentUserId);
        }

        this.reconcileCustomerWallet(currentUserId);
        if (!walletApiRes.success && !txApiRes.success && !depositsApiRes.success && !withdrawalsApiRes.success) {
          this.lastHydrationError = walletApiRes.error || depositsApiRes.error || withdrawalsApiRes.error || 'Unable to load wallet and transaction history.';
        }

        if (convApiRes.success && convApiRes.conversations.length > 0) {
          await this.fetchMessagesForConversation(`conv_${currentUserId}`, { limit: 40 });
        } else if (convApiRes.success) {
          const canonicalConvId = `conv_${currentUserId}`;
          const remainingConvs = this.getConversations().filter(
            (c) => c.customerId !== currentUserId && c.id !== canonicalConvId
          );
          this.cache[STORAGE_KEYS.CONVERSATIONS] = remainingConvs;
          this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, remainingConvs);

          const allMsgs = { ...this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES) };
          delete allMsgs[canonicalConvId];
          this.cache[STORAGE_KEYS.MESSAGES] = allMsgs;
          this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMsgs);
        }
      } else {
        // Unauthenticated visitor: only public app config, catalog, and ticker
        await Promise.all([
          appConfigPromise,
          cashoutsPromise,
          catPromise,
        ]);
      }

      this.lastSyncTimestamp = new Date().toISOString();
      this.syncStatus = 'connected';
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'initial_compact_load' } }));
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    } catch (e: any) {
      console.warn('Initial compact load notice:', e);
      this.lastHydrationError = e?.message || 'Unable to sync account data from server.';
      this.syncStatus = 'connected';
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    }
  }

  public async syncDelta(): Promise<void> {
    if (!supabase || !isSupabaseConfigured()) {
      if (this.isSyncingDelta) return;
      this.isSyncingDelta = true;
      this.syncStatus = 'syncing';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
      }
      try {
        const user = this.getCurrentUser();
        const isStaff = user?.role === 'admin' || user?.role === 'agent';
        const selfHostedTasks: Promise<unknown>[] = [
          this.fetchAppConfigFromServer({ silentEvent: true }),
          this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true }),
          this.fetchGameCatalogFromServer({ silentEvent: true }),
        ];
        if (user?.id) {
          if (isStaff) {
            selfHostedTasks.push(
              this.fetchDepositsFromServer({ limit: 15, replaceAll: false, silentEvent: true }),
              this.fetchWithdrawalsFromServer({ limit: 15, replaceAll: false, silentEvent: true }),
              this.fetchGameAccountsFromServer({ limit: 100, replaceAll: true, silentEvent: true }),
              this.fetchConversationsFromServer({ limit: 25, replaceAll: false, silentEvent: true }),
            );
            if (user.role === 'admin') {
              selfHostedTasks.push(this.fetchAuditLogsFromServer({ limit: 100 }));
            }
          } else {
            const querySince = this.lastSyncTimestamp
              ? new Date(Math.max(0, Date.parse(this.lastSyncTimestamp) - 10000)).toISOString()
              : undefined;
            selfHostedTasks.push(
              this.fetchWalletFromServer({ customerId: user.id, silentEvent: true }),
              this.fetchWalletTransactionsFromServer({ customerId: user.id, limit: 25, silentEvent: true }),
              this.fetchDepositsFromServer({
                customerId: user.id,
                limit: 15,
                replaceAll: false,
                silentEvent: true,
              }),
              this.fetchWithdrawalsFromServer({
                customerId: user.id,
                limit: 15,
                replaceAll: false,
                silentEvent: true,
              }),
              this.fetchGameAccountsFromServer({
                customerId: user.id,
                limit: 50,
                replaceAll: true,
                silentEvent: true,
              }),
              this.fetchConversationsFromServer({ limit: 10, replaceAll: false, silentEvent: true }),
              this.fetchMessagesForConversation(`conv_${user.id}`, {
                ...(querySince ? { afterCreatedAt: querySince } : {}),
                limit: 50,
              }),
            );
          }
        }
        await Promise.allSettled(selfHostedTasks);
        if (user?.id && !isStaff) {
          this.reconcileCustomerWallet(user.id);
        }
        this.lastSyncTimestamp = new Date().toISOString();
        this.syncStatus = 'connected';
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'delta_sync' } }));
          window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
        }
      } finally {
        this.isSyncingDelta = false;
      }
      return;
    }
    if (this.isSyncingDelta) return;
    this.isSyncingDelta = true;
    this.syncStatus = 'syncing';
    window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));

    try {
      const user = this.getCurrentUser();
      const isAdmin = user?.role === 'admin' || user?.role === 'agent';
      const currentUserId = user?.id;

      let changed = false;

      if (!isAdmin && currentUserId) {
        // Customer: refresh user's own wallet, recent requests, and delta chat messages
        const canonicalConvId = `conv_${currentUserId}`;
        const querySince = this.lastSyncTimestamp
          ? new Date(Math.max(0, Date.parse(this.lastSyncTimestamp) - 10000)).toISOString()
          : undefined;

        const [walletApiRes, depositsApiRes, withdrawalsApiRes, txApiRes, gameAccsRes, catRes, appCfgRes, fakedRes, deltaMsgs] = await Promise.all([
          this.fetchWalletFromServer({ customerId: currentUserId, silentEvent: true }),
          this.fetchDepositsFromServer({ customerId: currentUserId, limit: 15, replaceAll: false, silentEvent: true }),
          this.fetchWithdrawalsFromServer({ customerId: currentUserId, limit: 15, replaceAll: false, silentEvent: true }),
          this.fetchWalletTransactionsFromServer({ customerId: currentUserId, limit: 25, replaceAll: false, silentEvent: true }),
          this.fetchGameAccountsFromServer({ customerId: currentUserId, limit: 50, replaceAll: true, silentEvent: true }),
          this.fetchGameCatalogFromServer({ silentEvent: true }),
          this.fetchAppConfigFromServer({ silentEvent: true }),
          this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true }),
          this.fetchMessagesForConversation(canonicalConvId, {
            ...(querySince ? { afterCreatedAt: querySince } : {}),
            limit: 50,
          }),
        ]);

        // Apply requests & ledger BEFORE wallet reconciliation
        if (catRes.success || appCfgRes.success || fakedRes.success) {
          changed = true;
        }
        if (depositsApiRes.success && depositsApiRes.deposits.length > 0) {
          changed = true;
        }
        if (withdrawalsApiRes.success && withdrawalsApiRes.withdrawals.length > 0) {
          changed = true;
        }
        if (txApiRes.success && txApiRes.transactions.length > 0) {
          changed = true;
        }
        if (gameAccsRes.success && gameAccsRes.accounts.length > 0) {
          changed = true;
        }
        if (walletApiRes.success) {
          this.reconcileCustomerWallet(currentUserId);
          changed = true;
        } else if (depositsApiRes.success && depositsApiRes.deposits.length > 0) {
          this.reconcileCustomerWallet(currentUserId);
        }
        if (deltaMsgs.length > 0) {
          changed = true;
        }
      } else if (isAdmin) {
        // Admin: refresh recent deposits, withdrawals, game accounts, and conversations
        const [depositsApiRes, withdrawalsApiRes, gameAccsApiRes, convsApiRes, catRes, appCfgRes, fakedRes] = await Promise.all([
          this.fetchDepositsFromServer({ limit: 15, replaceAll: false, silentEvent: true }),
          this.fetchWithdrawalsFromServer({ limit: 15, replaceAll: false, silentEvent: true }),
          this.fetchGameAccountsFromServer({ limit: 100, replaceAll: true, silentEvent: true }),
          this.fetchConversationsFromServer({ limit: 25, replaceAll: false, silentEvent: true }),
          this.fetchGameCatalogFromServer({ silentEvent: true }),
          this.fetchAppConfigFromServer({ silentEvent: true }),
          this.fetchFakedCashoutsFromServer({ limit: 25, silentEvent: true }),
        ]);

        if (catRes.success || appCfgRes.success || fakedRes.success) {
          changed = true;
        }
        if (depositsApiRes.success && depositsApiRes.deposits.length > 0) {
          changed = true;
        }
        if (withdrawalsApiRes.success && withdrawalsApiRes.withdrawals.length > 0) {
          changed = true;
        }
        if (gameAccsApiRes.success && gameAccsApiRes.accounts.length > 0) {
          changed = true;
        }
        if (convsApiRes.success && convsApiRes.conversations.length > 0) {
          changed = true;
        }
        if (user?.role === 'admin') {
          await this.fetchAuditLogsFromServer({ limit: 100 });
        }
      }

      this.lastSyncTimestamp = new Date().toISOString();
      this.syncStatus = 'connected';
      if (changed) {
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'delta_sync' } }));
      }
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    } catch (e) {
      console.warn('Delta sync notice:', e);
      this.syncStatus = 'connected';
      window.dispatchEvent(new CustomEvent('aetherpay_sync_state_changed', { detail: this.getSyncHealth() }));
    } finally {
      this.isSyncingDelta = false;
    }
  }

  // Backward compatible on-demand poll methods (now route to targeted delta sync)
  public async pollSupabaseChat(): Promise<void> {
    return this.syncDelta();
  }

  public async pollSupabaseGeneral(): Promise<void> {
    return this.syncDelta();
  }

  // Conversation-specific direct fetch for reliable, ordered message hydration with cache-busting
  public async fetchMessagesForConversation(
    conversationId: string,
    options?: { beforeCreatedAt?: string; afterCreatedAt?: string; limit?: number }
  ): Promise<ChatMessage[]> {
    if (!conversationId) return [];
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    const localMsgs = this.getMessages(targetConvId);

    try {
      const limit = options?.limit || 50;

      // Identify all related conversation IDs for this customer to retrieve complete thread history
      const candidateIds = new Set<string>([conversationId, targetConvId].filter(Boolean));
      const conv = this.getConversations().find((c) => c.id === conversationId || c.id === targetConvId);
      const customerId = conv?.customerId || (conversationId.startsWith('conv_') ? conversationId.replace(/^conv_/, '') : undefined);
      if (customerId) {
        candidateIds.add(`conv_${customerId}`);
        for (const c of this.getConversations()) {
          if (c.customerId === customerId) {
            candidateIds.add(c.id);
          }
        }
      }

      const activeUser = this.getCurrentUser();
      const viewerRole = activeUser?.role || 'customer';

      const persistAndReturnMerged = (remoteRows: any[]): ChatMessage[] => {
        const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
        const existingPool: ChatMessage[] = [];
        for (const cid of new Set([...Array.from(candidateIds), targetConvId, conversationId])) {
          if (Array.isArray(all[cid])) {
            existingPool.push(...all[cid]);
          }
        }
        const mappedRemote = (remoteRows || []).map((row) => mapDbMessageRowToChatMessage(row, targetConvId));
        const remoteMsgs = filterVisibleMessagesForRole(mappedRemote, viewerRole);
        const filteredPool = filterVisibleMessagesForRole(existingPool, viewerRole);
        const shouldPruneSnapshot = !options?.beforeCreatedAt && !options?.afterCreatedAt;
        const merged = mergeAuthoritativeMessages(filteredPool, remoteMsgs, targetConvId, {
          pruneToServerSnapshot: shouldPruneSnapshot,
          pageLimit: limit,
        });

        for (const cid of candidateIds) {
          all[cid] = merged;
        }
        all[targetConvId] = merged;
        all[conversationId] = merged;

        this.cache[STORAGE_KEYS.MESSAGES] = all;
        this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, all);

        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'conversation_messages_fetched', conversationId: targetConvId, count: merged.length },
          })
        );
        return this.getMessages(targetConvId);
      };

      const queryCustId = customerId || (targetConvId.startsWith('conv_') ? targetConvId.replace(/^conv_/, '') : '');
      const params = new URLSearchParams({
        conversationId: targetConvId,
        limit: String(limit),
      });
      if (queryCustId) params.set('customerId', queryCustId);
      if (options?.beforeCreatedAt) params.set('beforeCreatedAt', options.beforeCreatedAt);
      if (options?.afterCreatedAt) params.set('afterCreatedAt', options.afterCreatedAt);

      const srvRes = await fetch(`/api/chat/messages?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (srvRes.ok) {
        const srvData = await srvRes.json().catch(() => ({}));
        if (srvData.success && Array.isArray(srvData.messages)) {
          return persistAndReturnMerged(srvData.messages);
        }
      }
    } catch (e) {
      console.warn('[DataService] fetchMessagesForConversation notice:', e);
    }

    return localMsgs;
  }

  // On-demand pagination for older messages with composite keyset tie-breaking
  public async fetchOlderMessages(
    conversationId: string,
    beforeCreatedAt: string,
    limit: number = 50,
    beforeId?: string
  ): Promise<{ newCount: number; hasMore: boolean }> {
    if (!conversationId || !beforeCreatedAt) {
      return { newCount: 0, hasMore: false };
    }

    const activeUser = this.getCurrentUser();
    const viewerRole = activeUser?.role || 'customer';
    const canonicalId = this.resolveCanonicalConvId(conversationId);

    const applyOlderRows = (rows: any[], hasMoreFlag: boolean) => {
      const filteredData = beforeId ? rows.filter((row: any) => row.id !== beforeId) : rows;
      const mapped = filterVisibleMessagesForRole(
        filteredData.map((row: any) => mapDbMessageRowToChatMessage(row, canonicalId)),
        viewerRole
      );

      if (mapped.length > 0) {
        const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
        const currentList = filterVisibleMessagesForRole(
          all[canonicalId] || all[conversationId] || [],
          viewerRole
        );
        const merged = mergeAuthoritativeMessages(currentList, mapped, canonicalId);

        all[canonicalId] = merged;
        if (conversationId !== canonicalId) {
          all[conversationId] = merged;
        }
        this.cache[STORAGE_KEYS.MESSAGES] = all;
        this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, all);
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'conversation_messages_fetched', conversationId: canonicalId, count: mapped.length },
          })
        );
      }

      return { newCount: mapped.length, hasMore: hasMoreFlag };
    };

    try {
      const params = new URLSearchParams({
        conversationId: canonicalId,
        beforeCreatedAt,
        limit: String(limit),
      });
      const srvRes = await fetch(`/api/chat/messages?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (srvRes.ok) {
        const srvJson = await srvRes.json().catch(() => ({}));
        if (srvJson.success && Array.isArray(srvJson.messages)) {
          return applyOlderRows(srvJson.messages, Boolean(srvJson.hasMore));
        }
      }
    } catch (e) {
      console.warn('[DataService] fetchOlderMessages notice:', e);
    }

    return { newCount: 0, hasMore: false };
  }

  // On-demand pagination for older topups (self-hosted API)
  public async fetchOlderTopups(options?: {
    beforeCreatedAt?: string;
    customerId?: string;
    limit?: number;
  }): Promise<{ newCount: number; hasMore: boolean }> {
    const limit = Math.min(Math.max(1, options?.limit || 25), 100);
    const res = await this.fetchDepositsFromServer({
      customerId: options?.customerId,
      beforeCreatedAt: options?.beforeCreatedAt,
      limit,
      replaceAll: false,
      silentEvent: true,
    });
    if (!res.success) {
      return { newCount: 0, hasMore: false };
    }

    if (res.deposits.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'topups_fetched', count: res.deposits.length },
        })
      );
    }
    return { newCount: res.deposits.length, hasMore: res.hasMore };
  }

  // On-demand pagination for older withdrawals (self-hosted API)
  public async fetchOlderWithdrawals(options?: {
    beforeCreatedAt?: string;
    customerId?: string;
    limit?: number;
  }): Promise<{ newCount: number; hasMore: boolean }> {
    const limit = Math.min(Math.max(1, options?.limit || 25), 100);
    const res = await this.fetchWithdrawalsFromServer({
      customerId: options?.customerId,
      beforeCreatedAt: options?.beforeCreatedAt,
      limit,
      replaceAll: false,
      silentEvent: true,
    });
    if (!res.success) {
      return { newCount: 0, hasMore: false };
    }

    if (res.withdrawals.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'withdrawals_fetched', count: res.withdrawals.length },
        })
      );
    }
    return { newCount: res.withdrawals.length, hasMore: res.hasMore };
  }

  // On-demand authoritative lookup for a single withdrawal request via /api/withdrawals/:id
  public async ensureWithdrawalRequest(
    requestId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<{ request: WithdrawalRequest | null; error?: string }> {
    const normalizedId = (requestId || '').trim();
    if (!normalizedId) return { request: null, error: 'Missing withdrawal request ID' };

    const cachedList = this.load<WithdrawalRequest[]>(STORAGE_KEYS.WITHDRAWALS, INITIAL_WITHDRAWALS);
    const cached = findRequestById(cachedList, normalizedId) || null;
    if (cached && !options?.forceRefresh) {
      return { request: cached };
    }

    try {
      const res = await fetch(`/api/withdrawals/${encodeURIComponent(normalizedId)}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          request: cached,
          error: parseWithdrawalApiError(res.status, rawText, 'Failed to query withdrawal request.'),
        };
      }
      let payload: { withdrawal?: Record<string, unknown> };
      try {
        payload = JSON.parse(rawText) as { withdrawal?: Record<string, unknown> };
      } catch {
        return { request: cached, error: 'Received unexpected response from withdrawal service.' };
      }
      if (!payload?.withdrawal?.id) {
        return { request: cached };
      }

      this.applyWithdrawalRows([payload.withdrawal], false);
      const refreshedList = this.load<WithdrawalRequest[]>(STORAGE_KEYS.WITHDRAWALS, INITIAL_WITHDRAWALS);
      const hydrated = findRequestById(refreshedList, normalizedId) || null;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'withdrawal_hydrated', requestId: normalizedId },
          })
        );
      }
      return { request: hydrated };
    } catch (e: any) {
      return { request: cached, error: e?.message || 'Failed to query withdrawal request' };
    }
  }

  // On-demand authoritative lookup for a single top-up request via /api/deposits/:id
  public async ensureTopUpRequest(
    requestId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<{ request: TopUpRequest | null; error?: string }> {
    const normalizedId = (requestId || '').trim();
    if (!normalizedId) return { request: null, error: 'Missing top-up request ID' };

    const cachedList = this.load<TopUpRequest[]>(STORAGE_KEYS.TOPUPS, INITIAL_TOPUPS);
    const cached = findRequestById(cachedList, normalizedId) || null;
    if (cached && !options?.forceRefresh) {
      return { request: cached };
    }

    try {
      const res = await fetch(`/api/deposits/${encodeURIComponent(normalizedId)}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          request: cached,
          error: parseDepositApiError(res.status, rawText, 'Failed to query deposit request.'),
        };
      }
      let payload: { deposit?: Record<string, unknown> };
      try {
        payload = JSON.parse(rawText) as { deposit?: Record<string, unknown> };
      } catch {
        return { request: cached, error: 'Received unexpected response from deposit service.' };
      }
      if (!payload?.deposit?.id) {
        return { request: cached };
      }

      this.applyTopupRows([payload.deposit], false);
      const refreshedList = this.load<TopUpRequest[]>(STORAGE_KEYS.TOPUPS, INITIAL_TOPUPS);
      const hydrated = findRequestById(refreshedList, normalizedId) || null;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'topup_hydrated', requestId: normalizedId },
          })
        );
      }
      return { request: hydrated };
    } catch (e: any) {
      return { request: cached, error: e?.message || 'Failed to query top-up request' };
    }
  }

  // Bounded per-customer request hydration (keeps AdminChat customer sidebar & transaction cards fresh)
  public async syncCustomerRequests(customerId: string): Promise<void> {
    const cleanCustomerId = (customerId || '').trim();
    if (!cleanCustomerId) return;

    try {
      const walletPromise = this.fetchWalletFromServer({
        customerId: cleanCustomerId,
        silentEvent: true,
      });
      const txPromise = this.fetchWalletTransactionsFromServer({
        customerId: cleanCustomerId,
        limit: 30,
        replaceAll: false,
        silentEvent: true,
      });
      const depositsPromise = this.fetchDepositsFromServer({
        customerId: cleanCustomerId,
        limit: 20,
        replaceAll: false,
        silentEvent: true,
      });
      const withdrawalsPromise = this.fetchWithdrawalsFromServer({
        customerId: cleanCustomerId,
        limit: 20,
        replaceAll: false,
        silentEvent: true,
      });

      const gameAccountsPromise = this.fetchGameAccountsFromServer({
        customerId: cleanCustomerId,
        limit: 50,
        replaceAll: false,
        silentEvent: true,
      });

      const [walletApiRes, txApiRes, depApiRes, wdrApiRes, gameAccsApiRes] = await Promise.all([
        walletPromise,
        txPromise,
        depositsPromise,
        withdrawalsPromise,
        gameAccountsPromise,
      ]);

      const changed =
        walletApiRes.success ||
        (txApiRes.success && txApiRes.transactions.length > 0) ||
        (depApiRes.success && depApiRes.deposits.length > 0) ||
        (wdrApiRes.success && wdrApiRes.withdrawals.length > 0) ||
        (gameAccsApiRes.success && gameAccsApiRes.accounts.length > 0);

      if (changed) {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'customer_requests_synced', customerId: cleanCustomerId },
          })
        );
      }
    } catch (e) {
      console.warn('syncCustomerRequests exception:', e);
    }
  }

  // Row application helpers supporting soft-delete tracking
  private applyUserRows(rows: any[]): void {
    const currentUsers = this.getUsers();
    const userMap = new Map<string, UserProfile>();
    for (const u of currentUsers) {
      userMap.set(u.id, u);
    }
    for (const dbU of rows) {
      if (dbU.deleted_at) {
        userMap.delete(dbU.id);
        continue;
      }
      const existing =
        userMap.get(dbU.id) ||
        currentUsers.find((u) => u.email.toLowerCase() === (dbU.email || '').toLowerCase());
      const isVerifiedMerged = mergeVerifiedStatus({
        dbVerified: Boolean(dbU.email_verified),
        existingVerified: Boolean(existing?.emailVerified),
        cachedVerified: readVerifiedCache(dbU.id, dbU.email),
      });
      if (isVerifiedMerged) {
        writeVerifiedCache(dbU.id, dbU.email, true);
      }
      const merged: UserProfile = {
        id: dbU.id,
        email: dbU.email,
        displayName: dbU.display_name || existing?.displayName || dbU.email?.split('@')[0] || 'User',
        role: (dbU.role as any) || existing?.role || 'customer',
        phone: dbU.phone || existing?.phone,
        avatarUrl: dbU.avatar_url || existing?.avatarUrl,
        status: dbU.status || 'active',
        emailVerified: isVerifiedMerged,
        referralCode: dbU.referral_code || existing?.referralCode || `REF_${dbU.id.slice(-5).toUpperCase()}`,
        referredBy: dbU.referred_by ?? existing?.referredBy,
        createdAt: dbU.created_at || existing?.createdAt || new Date().toISOString(),
        lastLoginAt: existing?.lastLoginAt || new Date().toISOString(),
      };
      if (existing && existing.id !== dbU.id) {
        userMap.delete(existing.id);
      }
      userMap.set(dbU.id, merged);
    }
    const updatedUsers = Array.from(userMap.values());
    this.cache[STORAGE_KEYS.USERS] = updatedUsers;
    this.saveToLocalStorage(STORAGE_KEYS.USERS, updatedUsers);
  }

  private applyTopupRows(rows: any[], replaceAll: boolean = false): void {
    const current = (this.cache[STORAGE_KEYS.TOPUPS] as TopUpRequest[]) || [];
    const updated = mergeTopupRequests(current, rows, replaceAll);
    this.cache[STORAGE_KEYS.TOPUPS] = updated;
    this.saveToLocalStorage(STORAGE_KEYS.TOPUPS, updated);

    const affectedCustomerIds = new Set<string>();
    for (const r of rows || []) {
      const cid = r?.customerId ?? r?.customer_id;
      if (cid) affectedCustomerIds.add(String(cid));
    }
    if (replaceAll && this.currentUserId) {
      affectedCustomerIds.add(this.currentUserId);
    }
    for (const cid of affectedCustomerIds) {
      this.reconcileCustomerWallet(cid);
    }
  }

  private applyWithdrawalRows(rows: any[], replaceAll: boolean = false): void {
    const current = (this.cache[STORAGE_KEYS.WITHDRAWALS] as WithdrawalRequest[]) || [];
    const updated = mergeWithdrawalRequests(current, rows, replaceAll);
    this.cache[STORAGE_KEYS.WITHDRAWALS] = updated;
    this.saveToLocalStorage(STORAGE_KEYS.WITHDRAWALS, updated);
  }

  private applyTransactionRows(rows: any[], replaceAll: boolean = false): void {
    const current = (this.cache[STORAGE_KEYS.TRANSACTIONS] as WalletTransaction[]) || [];
    const updated = mergeWalletTransactions(current, rows, replaceAll);
    this.cache[STORAGE_KEYS.TRANSACTIONS] = updated;
    this.saveToLocalStorage(STORAGE_KEYS.TRANSACTIONS, updated);
  }

  private reconcileCustomerWallet(customerId: string): void {
    if (!customerId) return;
    const walletMap = { ...((this.cache[STORAGE_KEYS.WALLETS] as Record<string, UserWallet>) || {}) };
    const existing = walletMap[customerId];
    if (!existing) return;
    const customerTopups = this.getTopUpRequests(customerId);
    const reconciled = reconcileWalletWithTopups(existing, customerTopups, {
      authoritativeTopupsLoaded: this.authoritativelyLoadedTopupsForUser.has(customerId),
    });
    if (
      reconciled.lastTopUpAmount !== existing.lastTopUpAmount ||
      reconciled.lastTopUpGame !== existing.lastTopUpGame ||
      reconciled.lastTopUpAt !== existing.lastTopUpAt
    ) {
      walletMap[customerId] = reconciled;
      this.cache[STORAGE_KEYS.WALLETS] = walletMap;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, walletMap);
    }
  }

  private applyWalletRows(rows: any[]): void {
    const walletMap = { ...((this.cache[STORAGE_KEYS.WALLETS] as Record<string, UserWallet>) || {}) };
    for (const w of rows) {
      if (!w || !w.customer_id) continue;
      const existing = walletMap[w.customer_id];
      const customerTopups = this.getTopUpRequests(w.customer_id);
      walletMap[w.customer_id] = mapDbWalletRowToWallet(w, existing, customerTopups, {
        authoritativeTopupsLoaded: this.authoritativelyLoadedTopupsForUser.has(w.customer_id),
      });
    }
    this.cache[STORAGE_KEYS.WALLETS] = walletMap;
    this.saveToLocalStorage(STORAGE_KEYS.WALLETS, walletMap);
  }

  private applyGameAccountRows(
    rows: any[],
    replaceAll: boolean = false,
    removeIds: string[] = [],
    silentEvent: boolean = false,
  ): void {
    const current = (this.cache[STORAGE_KEYS.GAME_ACCOUNTS] as GameAccount[]) || [];
    const updated = mergeGameAccounts(current, rows, replaceAll, removeIds);
    this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = updated;
    this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, updated);
    if (!silentEvent && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.GAME_ACCOUNTS } })
      );
    }
  }

  public async fetchGameAccountsFromServer(options?: {
    customerId?: string;
    customerIds?: string[];
    status?: string;
    gameCatalogId?: string;
    q?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
    replaceAll?: boolean;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    accounts: GameAccount[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const url = buildGameAccountsQueryUrl(options);
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          accounts: [],
          total: 0,
          hasMore: false,
          error: parseGameAccountApiError(
            res.status,
            rawText,
            'Failed to load game accounts from server.',
          ),
        };
      }

      const json = rawText ? JSON.parse(rawText) : {};
      const rows = Array.isArray(json.accounts) ? json.accounts : [];
      this.applyGameAccountRows(
        rows,
        Boolean(options?.replaceAll),
        [],
        Boolean(options?.silentEvent),
      );
      const scoped = options?.customerId
        ? this.getGameAccounts(options.customerId)
        : this.getGameAccounts();

      return {
        success: true,
        accounts: scoped,
        total: Number(json.total ?? rows.length),
        hasMore: Boolean(json.hasMore),
      };
    } catch (err: any) {
      return {
        success: false,
        accounts: [],
        total: 0,
        hasMore: false,
        error: err?.message || 'Unable to load game accounts from server.',
      };
    }
  }

  // Fetch Game Accounts from authoritative self-hosted API on demand
  public async fetchGameAccountsFromDb(customerId?: string): Promise<GameAccount[]> {
    const res = await this.fetchGameAccountsFromServer({
      customerId,
      limit: 100,
      replaceAll: !customerId,
      silentEvent: false,
    });
    if (res.success) {
      return res.accounts;
    }
    return this.getGameAccounts(customerId);
  }

  // Direct Staff Provisioning of Game Credentials for any Player & Game
  public async provisionGameAccountDirectly(params: {
    customerId: string;
    gameId: string;
    gameTitle: string;
    username: string;
    password: string;
    pin?: string;
    reviewerId: string;
    reviewerName: string;
  }): Promise<{ success: boolean; message: string; account?: GameAccount }> {
    try {
      const res = await fetch('/api/game-accounts/provision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: params.customerId,
          gameCatalogId: params.gameId,
          gameTitle: params.gameTitle,
          username: params.username.trim(),
          password: params.password.trim(),
          notes: params.pin?.trim() || undefined,
        }),
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Failed to provision game account.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      if (!data.account) {
        return {
          success: false,
          message: 'Server returned an invalid game account response.',
        };
      }

      this.applyGameAccountRows([data.account], false);
      const savedAccount = this.getGameAccounts(params.customerId).find(
        (a) => a.id === data.account.id || a.gameCatalogId === params.gameId,
      );

      if (typeof window !== 'undefined') {
        webPushClient.dispatchPushAlert({
          recipientId: params.customerId,
          recipientRole: 'customer',
          title: '🔑 Game Credentials Assigned!',
          body: `Your credentials for ${params.gameTitle} are ready (Username: ${params.username}). Tap to play!`,
          url: '/#games',
          tag: `game_direct_${Date.now()}`,
          actionType: 'game',
        }).catch(() => {});
      }

      try {
        const player = this.getUserById(params.customerId);
        if (player) {
          const conv = this.getOrCreateConversationForCustomer(player.id, player.displayName);
          this.sendChatMessage({
            conversationId: conv.id,
            senderId: params.reviewerId,
            senderName: params.reviewerName,
            senderRole: 'agent',
            text: formatCredentialsReadyChatMessage({
              gameTitle: params.gameTitle,
              username: params.username,
              password: params.password,
            }),
            isInternalNote: false,
          });
        }
      } catch {}

      return {
        success: true,
        message: data.message || `Successfully provisioned credentials for ${params.gameTitle}!`,
        account: savedAccount,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to provision game account' };
    }
  }

  private applyCatalogRows(rows: any[]): void {
    const existing = this.getGameCatalog();
    const updated = mergeCatalogFromServerRows(rows, INITIAL_GAME_CATALOG, existing);
    this.cache[STORAGE_KEYS.GAME_CATALOG] = updated;
    this.saveToLocalStorage(STORAGE_KEYS.GAME_CATALOG, updated);
  }

  private applyCashoutRows(rows: any[], replaceAll: boolean = false, silentEvent: boolean = true): void {
    const mapped = rows.map((c: any) => {
      const customerName = String(c.customerName ?? c.customer_name ?? c.playerHandle ?? '').trim();
      return {
        id: String(c.id),
        customerName,
        playerHandle: String(c.playerHandle ?? customerName),
        amount: Number(c.amount ?? 0),
        currency: String(c.currency || 'USD'),
        methodName: String(c.methodName ?? c.method_name ?? ''),
        gameName: String(c.gameName ?? c.game_name ?? ''),
        isFake: (c.isFake ?? c.is_fake) !== false,
        timestamp: String(c.timestamp || new Date().toISOString()),
      };
    });
    if (replaceAll) {
      this.cache[STORAGE_KEYS.FAKED_CASHOUTS] = mapped;
    } else {
      const existing = (this.cache[STORAGE_KEYS.FAKED_CASHOUTS] as any[]) || [];
      const map = new Map<string, any>();
      for (const m of existing) map.set(m.id, m);
      for (const m of mapped) map.set(m.id, m);
      this.cache[STORAGE_KEYS.FAKED_CASHOUTS] = Array.from(map.values()).slice(0, 50);
    }
    this.saveToLocalStorage(STORAGE_KEYS.FAKED_CASHOUTS, this.cache[STORAGE_KEYS.FAKED_CASHOUTS]);
    if (!silentEvent && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'cashout_feed_updated' } }));
    }
  }

  private applyConversationRows(rows: any[], replaceAll: boolean = false): void {
    const currentList = replaceAll ? [] : this.getConversations();
    const convMap = new Map<string, SupportConversation>();
    for (const c of currentList) {
      convMap.set(c.id, c);
    }
    for (const c of rows) {
      const user = this.getUserById(c.customer_id) || (c.customer_email ? this.getUserByEmail(c.customer_email) : undefined);
      // Invariant: Support agents and administrators must never have customer support tickets
      if (user && (user.role === 'agent' || user.role === 'admin')) {
        continue;
      }
      this.ensuredServerConversations.add(c.id);
      convMap.set(c.id, {
        id: c.id,
        customerId: c.customer_id,
        customerName: c.customer_name || user?.displayName || 'Customer',
        customerEmail: user?.email || c.customer_email || `${c.customer_id}@player.com`,
        assignedAgentId: c.agent_id || undefined,
        assignedAgentName: c.agent_name || undefined,
        status: c.status || 'open',
        lastMessageText: c.last_message || '',
        lastMessageTimestamp: c.last_message_at || new Date().toISOString(),
        unreadCountCustomer: 0,
        unreadCountStaff: 0,
        pinnedMessageId: c.pinned_message_id ?? c.pinnedMessageId ?? null,
        pinnedRulesVersion: c.pinned_rules_version ?? c.pinnedRulesVersion ?? null,
        pinnedAt: c.pinned_at ?? c.pinnedAt ?? null,
        pinnedById: c.pinned_by_id ?? c.pinnedById ?? null,
        pinnedByName: c.pinned_by_name ?? c.pinnedByName ?? null,
        pinnedMessageText: c.pinned_message_text ?? c.pinnedMessageText ?? null,
        createdAt: c.created_at || new Date().toISOString(),
        updatedAt: c.last_message_at || c.created_at || new Date().toISOString(),
      });
    }
    const mergedList = Array.from(convMap.values()).sort(
      (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
    );
    const cleanList = this.deduplicateAndMergeConversations(mergedList);
    this.cache[STORAGE_KEYS.CONVERSATIONS] = cleanList;
    this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, cleanList);
  }

  private applyMessageRows(rows: any[], emitIncomingAlerts: boolean = false): void {
    const activeUser = this.getCurrentUser();
    const viewerRole = activeUser?.role || 'customer';
    const currentMsgs = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const msgMap: Record<string, ChatMessage[]> = { ...currentMsgs };
    const touchedIds = new Set<string>();
    const newlyReceivedAlerts: Array<{ item: ChatMessage; canonicalId: string }> = [];

    for (const m of rows) {
      if (!m || !m.id) continue;
      const canonicalId = this.resolveCanonicalConvId(m.conversation_id);
      const item = mapDbMessageRowToChatMessage(m, canonicalId);
      if (viewerRole === 'customer' && isMessageInternalNote(item)) {
        continue;
      }
      const targetIds = Array.from(new Set([m.conversation_id, canonicalId].filter(Boolean)));
      let isBrandNewMessage = false;
      for (const tid of targetIds) {
        const list = msgMap[tid] ? [...msgMap[tid]] : [];
        const idx = list.findIndex((x) => x.id === item.id);
        if (idx >= 0) {
          list[idx] = mergeSingleMessage(list[idx], {
            ...item,
            deliveryStatus: 'sent',
            deliveryError: undefined,
          });
        } else {
          list.push(item);
          if (tid === canonicalId) {
            isBrandNewMessage = true;
          }
        }
        msgMap[tid] = list;
        touchedIds.add(tid);
      }

      if (
        emitIncomingAlerts &&
        isBrandNewMessage &&
        activeUser &&
        shouldAcceptIncomingChatMessage(item, activeUser, { forNotificationAlert: true })
      ) {
        const msgAgeMs = Date.now() - (Date.parse(item.createdAt || '') || Date.now());
        if (msgAgeMs < 120000) {
          newlyReceivedAlerts.push({ item, canonicalId });
        }
      }
    }

    for (const tid of touchedIds) {
      msgMap[tid] = filterVisibleMessagesForRole(
        sortAndDeduplicateMessages(msgMap[tid] || [], true),
        viewerRole
      );
    }

    this.cache[STORAGE_KEYS.MESSAGES] = msgMap;
    this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, msgMap);

    if (newlyReceivedAlerts.length > 0 && typeof window !== 'undefined') {
      for (const alertEntry of newlyReceivedAlerts) {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: {
              key: 'chat_incoming',
              message: alertEntry.item,
              conversationId: alertEntry.canonicalId,
            },
          })
        );
      }
    }
  }

  private applyAppConfig(data: any, silentEvent: boolean = true): void {
    const currentConfig = this.getAppConfig();
    const sanitizedData = data && typeof data === 'object' ? { ...data } : {};
    delete (sanitizedData as any).telegram;
    delete (sanitizedData as any).push_subscriptions;
    delete (sanitizedData as any).supportedPartners;
    const merged: AppConfig = {
      ...currentConfig,
      ...sanitizedData,
    };
    delete (merged as any).telegram;
    merged.referralProgram = normalizeReferralConfig(merged.referralProgram);
    merged.wheelOfLuck = normalizeWheelConfig(merged.wheelOfLuck);
    merged.cashoutRules = normalizeCashoutRulesConfig(merged.cashoutRules);
    this.cache[STORAGE_KEYS.CONFIG] = merged;
    this.saveToLocalStorage(STORAGE_KEYS.CONFIG, this.cache[STORAGE_KEYS.CONFIG]);
    if (!silentEvent && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.CONFIG } }));
    }
  }

  private load<T>(key: string, defaultValue: T): T {
    const val = this.cache[key];
    if (val === undefined || val === null) {
      return defaultValue;
    }
    return val as T;
  }

  private save<T>(key: string, value: T, skipRemotePersist: boolean = false): void {
    let finalValue = value;
    if (key === STORAGE_KEYS.GAME_ACCOUNTS && Array.isArray(value)) {
      finalValue = this.deduplicateGameAccounts(value as unknown as GameAccount[]) as unknown as T;
    }
    // 1. Immediately update reactive in-memory state
    this.cache[key] = finalValue;
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key } }));

    // 2. Persist to LocalStorage for offline and preview state preservation
    this.saveToLocalStorage(key, finalValue);

    // 3. Persist to Supabase PostgreSQL asynchronously if configured
    if (!skipRemotePersist) {
      this.persistToSupabase(key, finalValue);
    }
  }

  private async persistToSupabase(key: string, value: any): Promise<void> {
    if (!isSupabaseConfigured() || !supabase) return;

    try {
      if (key === STORAGE_KEYS.CONFIG) {
        // App Config migrated to self-hosted /api/admin/app-config endpoints
      } else if (key === STORAGE_KEYS.USERS) {
        // Users & admin directory migrated to self-hosted /api/profile and /api/admin/users
      } else if (key === STORAGE_KEYS.WALLETS && typeof value === 'object' && value !== null) {
        const currentUserId = this.getCurrentUser()?.id;
        const allWallets = Object.values(value as Record<string, UserWallet>);
        const target = currentUserId ? (value[currentUserId] || allWallets[0]) : allWallets[0];
        if (target && target.customerId) {
          const cumulativeDeposited =
            target.totalDeposited !== undefined
              ? target.totalDeposited
              : computeCumulativeCompletedDeposits(this.getTopUpRequests(target.customerId), target.customerId);
          // Never blindly overwrite referral_bonus_balance or available cash balance if row already exists
          await this.syncWalletFieldsToSupabase(
            target.customerId,
            {
              pending_withdrawal: target.reservedBalance || 0,
              pending_deposit: target.pendingDepositBalance || 0,
              total_deposited: cumulativeDeposited || 0,
              total_withdrawn: target.totalWithdrawn || 0,
              currency: target.currency || 'USD',
            },
            target
          );
        }
      } else if (key === STORAGE_KEYS.TRANSACTIONS && Array.isArray(value) && value.length > 0) {
        const t = value[0];
        if (t && t.id) {
          await supabase.from('transactions').upsert({
            id: t.id,
            customer_id: t.customerId,
            amount: t.amount,
            type: t.type,
            status: t.status,
            description: t.description,
            reference_id: t.relatedRequestId || null,
            game_name: t.targetGameName || null,
            created_at: t.createdAt,
          });
        }
      } else if (key === STORAGE_KEYS.TOPUPS) {
        // Deposits migrated to self-hosted /api/deposits endpoints
      } else if (key === STORAGE_KEYS.WITHDRAWALS) {
        // Withdrawals migrated to self-hosted /api/withdrawals endpoints
      } else if (key === STORAGE_KEYS.GAME_ACCOUNTS) {
        // Game accounts migrated to self-hosted /api/game-accounts endpoints
      } else if (key === STORAGE_KEYS.CONVERSATIONS) {
        // Conversations migrated to self-hosted /api/chat endpoints
      } else if (key === STORAGE_KEYS.MESSAGES) {
        // Messages migrated to self-hosted /api/chat endpoints
      } else if (key === STORAGE_KEYS.FAKED_CASHOUTS) {
        // Client-side simulated ticker cashouts remain purely local and are never synced to Supabase
      }
    } catch (err) {
      console.warn('Supabase async persist notice:', err);
    }
  }

  private async syncWalletFieldsToSupabase(
    customerId: string,
    patch: Record<string, any>,
    fallbackWallet?: Partial<UserWallet>
  ): Promise<void> {
    if (!isSupabaseConfigured() || !supabase || !customerId) return;
    try {
      const nowIso = new Date().toISOString();
      const { data: updatedRows, error: updErr } = await supabase
        .from('wallets')
        .update({ ...patch, updated_at: nowIso })
        .eq('customer_id', customerId)
        .select('customer_id');

      if (!updErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
        return;
      }

      if (updErr && updErr.code !== 'PGRST116') {
        console.warn('Supabase wallet partial update notice:', updErr.message);
        return;
      }

      await supabase.from('wallets').insert({
        customer_id: customerId,
        balance: Number(fallbackWallet?.availableBalance ?? 0),
        referral_bonus_balance: Number(fallbackWallet?.referralBonusBalance ?? 0),
        pending_withdrawal: Number(fallbackWallet?.reservedBalance ?? 0),
        pending_deposit: Number(fallbackWallet?.pendingDepositBalance ?? 0),
        total_deposited: Number(fallbackWallet?.totalDeposited ?? 0),
        total_withdrawn: Number(fallbackWallet?.totalWithdrawn ?? 0),
        currency: fallbackWallet?.currency || 'USD',
        ...patch,
        updated_at: nowIso,
      });
    } catch (err) {
      console.warn('Supabase wallet targeted sync notice:', err);
    }
  }

  public async migrateAllToSupabase(): Promise<{
    success: boolean;
    counts: Record<string, number>;
    message: string;
  }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        success: false,
        counts: {},
        message:
          'Supabase is not configured yet. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables or .env file before running migration.',
      };
    }

    try {
      const counts: Record<string, number> = {};

      // 1. Users migrated to self-hosted /api/profile and /api/admin/users

      // 2 & 3. Wallets & Transactions migrated to self-hosted /api/wallet and /api/wallet/transactions


      // 4 & 5. Deposits (topups) & Withdrawals migrated to self-hosted /api/deposits and /api/withdrawals endpoints

      // 6. Conversations & Messages migrated to self-hosted /api/chat endpoints

      // 8. App Config migrated to self-hosted /api/admin/app-config endpoints

      const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

      this.logAudit({
        actorId: 'admin_migrator',
        actorName: 'Supabase Migration Tool',
        actorRole: 'admin',
        action: 'SUPABASE_DATA_MIGRATED',
        entityType: 'settings',
        entityId: 'supabase_migration',
        details: `Successfully migrated ${totalItems} records across ${Object.keys(counts).length} tables into Supabase.`,
      });

      return {
        success: true,
        counts,
        message: `Successfully migrated ${totalItems} records across ${Object.keys(counts).length} tables into Supabase PostgreSQL!`,
      };
    } catch (err: any) {
      console.error('Migration error:', err);
      return {
        success: false,
        counts: {},
        message: 'Migration failed: ' + (err?.message || String(err)),
      };
    }
  }

  public async seedDatabaseWithPresets(): Promise<{ success: boolean; message: string }> {
    if (this.isSeeding) return { success: true, message: 'Seeding already in progress' };
    this.isSeeding = true;
    try {
      // Reset in-memory cache to ensure perfect alignment
      this.cache = {
        [STORAGE_KEYS.USERS]: [...INITIAL_USERS],
        [STORAGE_KEYS.WALLETS]: { ...INITIAL_WALLETS },
        [STORAGE_KEYS.TRANSACTIONS]: [...INITIAL_TRANSACTIONS],
        [STORAGE_KEYS.TOPUPS]: [...INITIAL_TOPUPS],
        [STORAGE_KEYS.WITHDRAWALS]: [...INITIAL_WITHDRAWALS],
        [STORAGE_KEYS.GAME_CATALOG]: [...INITIAL_GAME_CATALOG],
        [STORAGE_KEYS.GAME_ACCOUNTS]: [...INITIAL_GAME_ACCOUNTS],
        [STORAGE_KEYS.CONVERSATIONS]: [...INITIAL_CONVERSATIONS],
        [STORAGE_KEYS.MESSAGES]: { ...INITIAL_MESSAGES },
        [STORAGE_KEYS.NOTIFICATIONS]: [...INITIAL_NOTIFICATIONS],
        [STORAGE_KEYS.AUDIT_LOGS]: [...INITIAL_AUDIT_LOGS],
        [STORAGE_KEYS.CONFIG]: { ...INITIAL_CONFIG },
        [STORAGE_KEYS.WEBHOOK_LOGS]: [],
        [STORAGE_KEYS.FAKED_CASHOUTS]: [],
      };
      const activeUser = this.getCurrentUser();
      this.currentUserId = activeUser ? activeUser.id : null;

      // Migrate to Supabase
      await this.migrateAllToSupabase();

      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'all' } }));
      return { success: true, message: 'All demo presets and presets have been populated to Supabase.' };
    } catch (error) {
      console.warn('Supabase sync notice:', error instanceof Error ? error.message : String(error));
      return { success: false, message: 'Active storage is running via Supabase PostgreSQL & Local Storage resilience mode.' };
    } finally {
      this.isSeeding = false;
    }
  }

  // Alias for backward compatibility
  public async seedFirestoreWithPresets(): Promise<{ success: boolean; message: string }> {
    return this.seedDatabaseWithPresets();
  }

  public resetToSeedData(): void {
    // Reset in-memory cache & local storage
    this.cache = {
      [STORAGE_KEYS.USERS]: [...INITIAL_USERS],
      [STORAGE_KEYS.WALLETS]: { ...INITIAL_WALLETS },
      [STORAGE_KEYS.TRANSACTIONS]: [...INITIAL_TRANSACTIONS],
      [STORAGE_KEYS.TOPUPS]: [...INITIAL_TOPUPS],
      [STORAGE_KEYS.WITHDRAWALS]: [...INITIAL_WITHDRAWALS],
      [STORAGE_KEYS.GAME_CATALOG]: [...INITIAL_GAME_CATALOG],
      [STORAGE_KEYS.GAME_ACCOUNTS]: [...INITIAL_GAME_ACCOUNTS],
      [STORAGE_KEYS.CONVERSATIONS]: [...INITIAL_CONVERSATIONS],
      [STORAGE_KEYS.MESSAGES]: { ...INITIAL_MESSAGES },
      [STORAGE_KEYS.NOTIFICATIONS]: [...INITIAL_NOTIFICATIONS],
      [STORAGE_KEYS.AUDIT_LOGS]: [...INITIAL_AUDIT_LOGS],
      [STORAGE_KEYS.CONFIG]: { ...INITIAL_CONFIG },
      [STORAGE_KEYS.WEBHOOK_LOGS]: [],
      [STORAGE_KEYS.FAKED_CASHOUTS]: [],
      [STORAGE_KEYS.PASSWORD_RESET_TOKENS]: [],
    };
    for (const [key, val] of Object.entries(this.cache)) {
      this.saveToLocalStorage(key, val);
    }
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'all' } }));

    if (isSupabaseConfigured() && supabase) {
      this.migrateAllToSupabase().catch((e) => console.warn('Supabase reset sync note:', e));
    }
  }

  // Current session management - Self-Hosted Server Session Enforced
  public syncAuthenticatedUser(
    user: UserProfile | null,
    options?: { hydrate?: boolean }
  ): UserProfile | null {
    if (!user) {
      const hadUser = Boolean(this.authenticatedUser || this.currentUserId);
      this.teardownRealtimeSync();
      this.authenticatedUser = null;
      this.currentUserId = null;
      this.isHydratingSession = false;
      this.hydrationUserId = null;
      this.activeHydrationPromise = null;
      this.lastHydratedUserId = null;
      this.lastHydratedAt = 0;
      this.lastHydrationError = null;
      if (hadUser) {
        this.clearUserScopedCache();
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'auth' } }));
      }
      return null;
    }

    if (this.currentUserId && this.currentUserId !== user.id) {
      this.clearUserScopedCache();
      this.lastHydratedUserId = null;
    }

    const users = this.getUsers();
    const existing = users.find(
      (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()
    );
    const merged: UserProfile = {
      ...(existing || {}),
      ...user,
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerified),
      referralCode: user.referralCode || existing?.referralCode,
      referredBy: user.referredBy,
      referrerDisplayName: user.referrerDisplayName,
      isParentAdmin: Boolean(user.isParentAdmin),
      passwordResetRequired: Boolean(user.passwordResetRequired),
    };

    const nextUsers = existing
      ? users.map((u) => (u.id === existing.id ? merged : u))
      : [...users, merged];
    this.cache[STORAGE_KEYS.USERS] = nextUsers;
    this.authenticatedUser = merged;
    this.currentUserId = merged.id;

    if (merged.emailVerified) {
      writeVerifiedCache(merged.id, merged.email, true);
    }

    if (options?.hydrate) {
      void this.hydrateForSession(merged);
    }
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'auth' } }));
    return merged;
  }

  public getCurrentUser(): UserProfile | null {
    const authUser = selfHostedAuthService.getCurrentUser();
    if (!authUser) {
      this.authenticatedUser = null;
      this.currentUserId = null;
      return null;
    }

    if (
      this.authenticatedUser &&
      this.authenticatedUser.id === authUser.id &&
      this.authenticatedUser.email.toLowerCase() === authUser.email.toLowerCase()
    ) {
      this.authenticatedUser = {
        ...this.authenticatedUser,
        displayName: authUser.displayName,
        phone: authUser.phone,
        avatarUrl: authUser.avatarUrl,
        role: authUser.role,
        status: authUser.status,
        emailVerified: Boolean(authUser.emailVerified),
        referralCode: authUser.referralCode || this.authenticatedUser.referralCode,
        referredBy: authUser.referredBy,
        referrerDisplayName: authUser.referrerDisplayName,
        isParentAdmin: Boolean(authUser.isParentAdmin),
        passwordResetRequired: Boolean(authUser.passwordResetRequired),
      };
      return this.authenticatedUser;
    }

    const users = this.getUsers();
    const existing = users.find(
      (u) => u.id === authUser.id || u.email.toLowerCase() === authUser.email.toLowerCase()
    );
    const merged: UserProfile = {
      ...(existing || {}),
      ...authUser,
    };
    this.authenticatedUser = merged;
    this.currentUserId = merged.id;
    return merged;
  }

  private clearUserScopedCache(): void {
    const emptyState: Record<string, any> = {
      [STORAGE_KEYS.WALLETS]: {},
      [STORAGE_KEYS.TRANSACTIONS]: [],
      [STORAGE_KEYS.TOPUPS]: [],
      [STORAGE_KEYS.WITHDRAWALS]: [],
      [STORAGE_KEYS.GAME_ACCOUNTS]: [],
      [STORAGE_KEYS.CONVERSATIONS]: [],
      [STORAGE_KEYS.MESSAGES]: {},
      [STORAGE_KEYS.NOTIFICATIONS]: [],
      [STORAGE_KEYS.AUDIT_LOGS]: [],
    };
    for (const [key, val] of Object.entries(emptyState)) {
      this.cache[key] = val;
      this.saveToLocalStorage(key, val);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
      } catch {}
    }
    this.lastSyncTimestamp = null;
    this.authoritativelyLoadedTopupsForUser.clear();
    this.ensuredServerConversations.clear();
    this.inFlightEnsureConversations.clear();
  }

  public setCurrentUserId(userId: string): void {
    const active = this.getCurrentUser();
    if (!active || active.id !== userId) {
      return;
    }
    this.currentUserId = userId;
    void this.hydrateForSession(active, { force: true });
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'auth' } }));
  }

  public logout(reason: 'manual' | 'inactivity' | 'session_expired' = 'manual'): void {
    const prevUser = this.getCurrentUser();
    const dispatchServerLogout = async () => {
      // Unsubscribe Web Push BEFORE Better Auth revokes the session cookie
      await webPushClient.unsubscribeFromPushNotifications(prevUser).catch(() => {});
      await Promise.allSettled([
        selfHostedAuthService.logout(reason),
        supabaseAuthService.logout(),
      ]);
    };

    this.teardownRealtimeSync();
    this.authenticatedUser = null;
    this.currentUserId = null;
    this.isHydratingSession = false;
    this.hydrationUserId = null;
    this.activeHydrationPromise = null;
    this.lastHydratedUserId = null;
    this.lastHydratedAt = 0;
    this.lastHydrationError = null;
    this.clearUserScopedCache();
    authSessionService.destroySession();
    void dispatchServerLogout();
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'auth' } }));
  }

  // ==========================================
  // Self-Hosted Authentication Bridges
  // ==========================================

  public async loginWithSupabaseAuth(
    email: string,
    pass: string
  ): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
    const authRes = await selfHostedAuthService.loginWithEmail(email, pass);
    if (authRes.success && authRes.user) {
      const synced = this.syncAuthenticatedUser(authRes.user);
      return { success: true, user: synced || authRes.user };
    }

    return {
      success: false,
      message: authRes.error || 'Authentication failed. Please check your credentials.',
    };
  }

  // Alias for backward compatibility
  public async loginWithFirebaseAuth(
    email: string,
    pass: string
  ): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
    return this.loginWithSupabaseAuth(email, pass);
  }

  public async registerWithSupabaseAuth(
    email: string,
    pass: string,
    displayName: string,
    _phone?: string,
    _referralCode?: string,
    _role?: UserRole
  ): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
    const regRes = await selfHostedAuthService.registerWithEmail({
      email,
      password: pass,
      displayName,
    });
    if (regRes.success) {
      return { success: true, message: regRes.message };
    }

    return {
      success: false,
      message: regRes.error || 'Registration failed.',
    };
  }

  // Alias for backward compatibility
  public async registerWithFirebaseAuth(
    email: string,
    pass: string,
    displayName: string,
    phone?: string,
    referralCode?: string,
    role?: UserRole
  ): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
    return this.registerWithSupabaseAuth(email, pass, displayName, phone, referralCode, role);
  }

  public async loginWithGoogle(
    _intendedRole: UserRole = 'customer'
  ): Promise<{ success: boolean; user?: UserProfile; message?: string; code?: string }> {
    return {
      success: false,
      code: 'OAUTH_NOT_CONFIGURED',
      message: 'Google Sign-In is not enabled on the self-hosted authentication API. Please sign in with your email and password.',
    };
  }

  public async sendVerificationEmail(): Promise<{ success: boolean; message?: string; actionLink?: string }> {
    const user = this.getCurrentUser();
    if (!user) {
      return { success: false, message: 'No active user found.' };
    }
    return selfHostedAuthService.resendEmailOtp(user.email);
  }

  public async reloadAndCheckEmailVerification(): Promise<{
    verified: boolean;
    message: string;
    user: UserProfile | null;
  }> {
    const user = this.getCurrentUser();
    if (!user) {
      return { verified: false, message: 'No active session found', user: null };
    }

    const meSnapshot = await selfHostedAuthService.fetchCurrentUser({
      preservePreviousStateOnUnavailable: true,
    });

    if (meSnapshot.status === 'expired') {
      return {
        verified: false,
        message: meSnapshot.expiredReason || 'Session expired. Please sign in again.',
        user: null,
      };
    }

    if (meSnapshot.status === 'authenticated' && meSnapshot.user) {
      const synced = this.syncAuthenticatedUser(meSnapshot.user) || meSnapshot.user;
      const isVerified = Boolean(synced.emailVerified);
      if (isVerified) {
        writeVerifiedCache(synced.id, synced.email, true);
        void this.triggerServerReferralEvaluation(synced.id);
      }
      return {
        verified: isVerified,
        message: isVerified
          ? 'Email address confirmed and verified! Cashouts and referral bonuses are now unlocked.'
          : 'Email address is still unverified. Check your inbox for your 6-digit code.',
        user: synced,
      };
    }

    return {
      verified: Boolean(user.emailVerified),
      message: meSnapshot.errorMessage || 'Unable to check verification status right now.',
      user,
    };
  }

  public async confirmEmailNow(_email?: string): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Please enter the 6-digit verification code sent to your email.',
    };
  }

  public async sendPasswordResetViaSupabase(
    email: string
  ): Promise<{ success: boolean; message?: string }> {
    return selfHostedAuthService.requestPasswordReset(email);
  }

  // Alias for backward compatibility
  public async sendPasswordResetViaFirebase(
    email: string
  ): Promise<{ success: boolean; message?: string }> {
    return this.sendPasswordResetViaSupabase(email);
  }

  // ==========================================
  // Self-Service Password Reset
  // ==========================================

  public getPasswordResetTokens(): PasswordResetToken[] {
    return this.load<PasswordResetToken[]>(STORAGE_KEYS.PASSWORD_RESET_TOKENS, []);
  }

  public savePasswordResetToken(tokenRecord: PasswordResetToken): void {
    const tokens = this.getPasswordResetTokens();
    const filtered = tokens.filter((t) => t.token !== tokenRecord.token && t.id !== tokenRecord.id);
    filtered.unshift(tokenRecord);
    this.save(STORAGE_KEYS.PASSWORD_RESET_TOKENS, filtered);
  }

  public async requestPasswordReset(
    emailInput: string
  ): Promise<{ success: boolean; token?: string; pin?: string; expiresAt?: number; message?: string }> {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    const res = await selfHostedAuthService.requestPasswordReset(email);
    if (!res.success) {
      return { success: false, message: res.message || 'Password reset request failed.' };
    }

    return {
      success: true,
      message: res.message || `Password reset instructions dispatched to ${email}.`,
    };
  }

  public async verifyPasswordResetToken(
    tokenInput: string,
    emailInput?: string
  ): Promise<{ valid: boolean; email?: string; message?: string; remainingSeconds?: number }> {
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      return { valid: false, message: 'Please enter your password reset token or 6-digit code.' };
    }

    // 1. Check server endpoint first
    try {
      const resp = await fetch('/api/auth/verify-reset-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, email: emailInput }),
      });
      const data = await resp.json();
      if (resp.ok && data.valid) {
        return {
          valid: true,
          email: data.email,
          remainingSeconds: data.remainingSeconds,
          message: 'Token is valid.',
        };
      } else if (!resp.ok && data.message && !data.message.includes('not found')) {
        return { valid: false, message: data.message };
      }
    } catch {
      // Fallback to local tokens cache
    }

    // 2. Check local tokens cache
    const tokens = this.getPasswordResetTokens();
    const match = tokens.find(
      (t) => t.token.toLowerCase() === cleanToken.toLowerCase() || t.id.toLowerCase() === cleanToken.toLowerCase()
    );

    if (!match) {
      return { valid: false, message: 'Reset token not found or invalid.' };
    }

    if (match.used) {
      return { valid: false, message: 'This reset token has already been used.' };
    }

    if (Date.now() > match.expiresAt) {
      return { valid: false, message: 'This reset token has expired. Please request a new token.' };
    }

    if (emailInput && match.email.toLowerCase() !== emailInput.trim().toLowerCase()) {
      return { valid: false, message: 'Email does not match this reset token.' };
    }

    const remainingSeconds = Math.max(0, Math.ceil((match.expiresAt - Date.now()) / 1000));
    return {
      valid: true,
      email: match.email,
      remainingSeconds,
      message: 'Token verified successfully.',
    };
  }

  public async resetPasswordWithToken(
    tokenInput: string,
    emailInput: string,
    newPasswordInput: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanToken = tokenInput.trim();
    const email = emailInput.trim().toLowerCase();

    if (!cleanToken) {
      return { success: false, message: 'Reset token is required.' };
    }
    if (!email) {
      return { success: false, message: 'Email is required.' };
    }
    if (newPasswordInput.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters long.' };
    }
    const hasLetter = /[a-zA-Z]/.test(newPasswordInput);
    const hasNumber = /[0-9]/.test(newPasswordInput);
    if (!hasLetter || !hasNumber) {
      return { success: false, message: 'New password must contain both letters and numbers.' };
    }

    // 1. Verify token
    const verification = await this.verifyPasswordResetToken(cleanToken, email);
    if (!verification.valid) {
      return { success: false, message: verification.message || 'Invalid or expired token.' };
    }

    // 2. Update credentials in authSessionService
    const updateRes = authSessionService.updatePassword(email, newPasswordInput);
    if (!updateRes.success) {
      return { success: false, message: updateRes.message || 'Failed to update password.' };
    }

    // 3. Inform server endpoint
    try {
      await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, email, newPassword: newPasswordInput }),
      });
    } catch (e) {
      console.warn('[Self-Service Reset] Server reset password notify note:', e);
    }

    // 4. Mark token used in cache & Supabase
    const tokens = this.getPasswordResetTokens();
    const updatedTokens = tokens.map((t) => {
      if (t.token.toLowerCase() === cleanToken.toLowerCase() || t.id.toLowerCase() === cleanToken.toLowerCase()) {
        return { ...t, used: true, usedAt: Date.now() };
      }
      return t;
    });
    this.save(STORAGE_KEYS.PASSWORD_RESET_TOKENS, updatedTokens);

    // 5. Audit log
    const user = this.getUsers().find((u) => u.email.toLowerCase() === email);
    this.logAudit({
      actorId: user?.id || 'system',
      actorName: user?.displayName || email,
      actorRole: user?.role || 'customer',
      action: 'PASSWORD_RESET_SUCCESSFUL',
      entityType: 'user',
      entityId: user?.id || 'anonymous',
      details: `Self-service password reset completed via verified token for ${email}.`,
    });

    return {
      success: true,
      message: 'Your password has been successfully updated! You can now sign in with your new credentials.',
    };
  }

  // Users: In-memory runtime session store only (0 localStorage caching)
  public getUsers(): UserProfile[] {
    return Array.isArray(this.cache[STORAGE_KEYS.USERS]) ? this.cache[STORAGE_KEYS.USERS] : [];
  }

  // Pure on-demand database fetch for Users & Staff Governance (0 local storage caching)
  public async fetchLiveUsersDirectory(
    _actingUser?: UserProfile | null,
    options?: {
      limit?: number;
      offset?: number;
      search?: string;
      role?: 'all' | UserRole;
      status?: 'all' | 'active' | 'suspended' | 'pending';
      sortBy?: 'createdAt' | 'updatedAt' | 'displayName' | 'email' | 'role' | 'status';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    success: boolean;
    users: UserProfile[];
    total?: number;
    pagination?: { limit: number; offset: number; total: number; hasMore: boolean };
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.offset !== undefined) params.set('offset', String(options.offset));
      if (options?.search && options.search.trim()) params.set('search', options.search.trim());
      if (options?.role && options.role !== 'all') params.set('role', options.role);
      if (options?.status && options.status !== 'all') params.set('status', options.status);
      if (options?.sortBy) params.set('sortBy', options.sortBy);
      if (options?.sortOrder) params.set('sortOrder', options.sortOrder);

      const queryStr = params.toString();
      const url = queryStr ? `/api/admin/users?${queryStr}` : '/api/admin/users';

      const resp = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        return {
          success: false,
          users: [],
          error: extractServerApiError(data, `Server returned HTTP ${resp.status}`),
        };
      }

      if (data?.success && Array.isArray(data.users)) {
        // Keep in-memory cache updated strictly for current active session; NEVER write to localStorage
        this.cache[STORAGE_KEYS.USERS] = data.users;
        return {
          success: true,
          users: data.users,
          total: typeof data.total === 'number' ? data.total : data.users.length,
          pagination: data.pagination,
        };
      }

      return {
        success: false,
        users: [],
        error: extractServerApiError(data, 'Failed to parse user directory response from server.'),
      };
    } catch (err: any) {
      return {
        success: false,
        users: [],
        error: err?.message || 'Network error fetching user directory.',
      };
    }
  }

  public getUserById(userId: string): UserProfile | undefined {
    if (!userId) return undefined;
    const users = this.getUsers();
    const found = users.find((u) => u.id === userId || u.email?.toLowerCase() === userId.toLowerCase());
    if (found) return found;

    // Fetch from self-hosted admin user endpoint if staff and not yet cached
    const currentUser = this.getCurrentUser();
    const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'agent';
    if (
      isStaff &&
      !userId.includes('@') &&
      !this.inFlightUserLookups.has(userId)
    ) {
      this.inFlightUserLookups.add(userId);
      (async () => {
        try {
          const resp = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          if (!resp.ok) return;
          const data = await resp.json().catch(() => null);
          if (data?.success && data?.user) {
            const cur = this.getUsers();
            if (!cur.some((x) => x.id === data.user.id)) {
              this.cache[STORAGE_KEYS.USERS] = [...cur, data.user];
              window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'users' } }));
            }
          }
        } catch {
          // Ignore background lookup error
        } finally {
          this.inFlightUserLookups.delete(userId);
        }
      })();
    }

    return undefined;
  }

  public getUserByEmail(email: string): UserProfile | undefined {
    if (!email) return undefined;
    const clean = email.trim().toLowerCase();
    return this.getUsers().find((u) => u.email?.toLowerCase() === clean);
  }

  public isProtectedParentAdmin(emailOrId?: string, user?: UserProfile): boolean {
    if (!emailOrId && !user) return false;
    const clean = (emailOrId || user?.email || '').trim().toLowerCase();
    if (clean === 'sachet61@gmail.com') return true;
    if (user && user.role !== 'admin') return false;
    if (user?.isParentAdmin && user.role === 'admin') return true;
    if (!emailOrId) return false;

    const foundUser = this.getUserById(emailOrId) || this.getUserByEmail(emailOrId);
    if (foundUser && foundUser.role !== 'admin' && clean !== 'sachet61@gmail.com') return false;

    return (
      clean === 'sachet61@gmail.com' ||
      clean === 'admin@swiftsweeps.com' ||
      clean === 'admin@aetherpay.com' ||
      clean === 'nduphasetwo@gmail.com' ||
      clean === 'blithesweeps@gmail.com' ||
      clean === 'usr_admin_master'
    );
  }

  public async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    actingUser: UserProfile
  ): Promise<{ success: boolean; message: string; user?: UserProfile }> {
    if (actingUser.role !== 'admin') {
      return {
        success: false,
        message: 'Access Denied: Support Agents have read-only permissions. Only Administrators can promote or alter user roles.',
      };
    }

    const targetUser = this.getUserById(targetUserId) || this.getUserByEmail(targetUserId);
    const resolvedTargetId = targetUser?.id || targetUserId;

    if (targetUser) {
      const isParentAdmin =
        this.isProtectedParentAdmin(targetUser.email, targetUser) ||
        this.isProtectedParentAdmin(targetUser.id, targetUser) ||
        targetUser.isParentAdmin;

      if (isParentAdmin && newRole !== 'admin') {
        return {
          success: false,
          message: 'Security Guard: Newly appointed administrators cannot demote the Parent Admin. The primary platform administrator role is permanently protected.',
        };
      }

      if (actingUser.id === targetUser.id && newRole !== 'admin') {
        return {
          success: false,
          message: 'Self-Demotion Guard: You cannot demote your own administrator account. Another admin must perform this action.',
        };
      }
    }

    let data: any = null;
    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(resolvedTargetId)}/role`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ newRole }),
      });

      data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success || !data?.user) {
        return {
          success: false,
          message: extractServerApiError(data, `Failed to update user role (HTTP ${resp.status}).`),
        };
      }
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Network error while updating user role.',
      };
    }

    const updatedUser: UserProfile = {
      ...(targetUser || {}),
      ...data.user,
      promotedBy: actingUser.id,
      promotedByName: actingUser.displayName,
      promotedAt: new Date().toISOString(),
    };

    const existingUsers = this.getUsers();
    const hasExisting = existingUsers.some((u) => u.id === updatedUser.id);
    const allUsers = hasExisting
      ? existingUsers.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
      : [...existingUsers, updatedUser];
    this.cache[STORAGE_KEYS.USERS] = allUsers;

    if (newRole === 'agent' || newRole === 'admin') {
      // Purge any cached customer support conversation belonging to this newly elevated staff member
      const convs = (this.cache[STORAGE_KEYS.CONVERSATIONS] as SupportConversation[] || []).filter(
        (c) =>
          c.customerId !== updatedUser.id &&
          (!c.customerEmail || c.customerEmail.toLowerCase() !== updatedUser.email.toLowerCase())
      );
      this.cache[STORAGE_KEYS.CONVERSATIONS] = convs;
      this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, convs);
    }

    if (updatedUser.id === this.getCurrentUser()?.id) {
      authSessionService.updateUserProfile(updatedUser);
    }

    window.dispatchEvent(
      new CustomEvent('aetherpay_state_changed', {
        detail: { key: 'user_role_updated', userId: updatedUser.id, newRole: updatedUser.role },
      })
    );
    return {
      success: true,
      message: data.message || `Role successfully updated to ${updatedUser.role.toUpperCase()} for ${updatedUser.displayName}.`,
      user: updatedUser,
    };
  }

  public async updateUserStatus(
    targetUserId: string,
    status: 'active' | 'suspended',
    actingUser: UserProfile
  ): Promise<{ success: boolean; message: string; user?: UserProfile }> {
    if (actingUser.role !== 'admin') {
      return {
        success: false,
        message: 'Access Denied: Only administrators can update user status.',
      };
    }

    const targetUser = this.getUserById(targetUserId) || this.getUserByEmail(targetUserId);
    const resolvedTargetId = targetUser?.id || targetUserId;

    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(resolvedTargetId)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success || !data?.user) {
        return {
          success: false,
          message: extractServerApiError(data, `Failed to update user status (HTTP ${resp.status}).`),
        };
      }

      const updatedUser: UserProfile = {
        ...(targetUser || {}),
        ...data.user,
      };
      const existingUsers = this.getUsers();
      this.cache[STORAGE_KEYS.USERS] = existingUsers.some((u) => u.id === updatedUser.id)
        ? existingUsers.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
        : [...existingUsers, updatedUser];

      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'users', userId: updatedUser.id, status: updatedUser.status },
        })
      );

      return {
        success: true,
        message: data.message || `Status updated to ${updatedUser.status} for ${updatedUser.displayName}.`,
        user: updatedUser,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Network error while updating user status.',
      };
    }
  }

  public async deleteUserCompletely(
    targetUserId: string,
    actingUser: UserProfile
  ): Promise<{ success: boolean; message: string }> {
    if (actingUser.role !== 'admin') {
      return { success: false, message: 'Access Denied: Only administrators can delete users.' };
    }

    const targetUser = this.getUserById(targetUserId) || this.getUserByEmail(targetUserId);
    if (!targetUser) {
      return { success: false, message: 'User not found.' };
    }

    if (this.isProtectedParentAdmin(targetUser.email) || this.isProtectedParentAdmin(targetUser.id)) {
      return { success: false, message: 'Security Guard: Cannot delete the permanent Super/Parent Administrator.' };
    }

    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(targetUser.id)}`, {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        return {
          success: false,
          message: extractServerApiError(data, `Failed to delete user on server (HTTP ${resp.status}).`),
        };
      }

      // Remove from in-memory session caches (never cache users directory in localStorage)
      const users = this.getUsers().filter((u) => u.id !== targetUser.id && u.email !== targetUser.email);
      this.cache[STORAGE_KEYS.USERS] = users;

      // Clean wallets
      const wallets = { ...this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, {}) };
      delete wallets[targetUser.id];
      this.cache[STORAGE_KEYS.WALLETS] = wallets;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);

      // Clean game accounts
      const accounts = this.getGameAccounts().filter((a) => a.customerId !== targetUser.id);
      this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = accounts;
      this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, accounts);

      // Clean topups & withdrawals
      const topups = this.getTopUpRequests().filter((t) => t.customerId !== targetUser.id);
      this.cache[STORAGE_KEYS.TOPUPS] = topups;
      this.saveToLocalStorage(STORAGE_KEYS.TOPUPS, topups);

      const withdrawals = this.getWithdrawalRequests().filter((w) => w.customerId !== targetUser.id);
      this.cache[STORAGE_KEYS.WITHDRAWALS] = withdrawals;
      this.saveToLocalStorage(STORAGE_KEYS.WITHDRAWALS, withdrawals);

      // Clean conversations
      const convs = this.getConversations().filter((c) => c.customerId !== targetUser.id);
      this.cache[STORAGE_KEYS.CONVERSATIONS] = convs;
      this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, convs);

      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'user_deleted' } }));
      return {
        success: true,
        message: `User ${targetUser.displayName} (${targetUser.email}) and all associated records have been completely purged.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error executing complete user deletion.' };
    }
  }

  public getCmsPolicies(): {
    cashoutPolicyHtml: string;
    privacyPolicyHtml: string;
    termsPolicyHtml: string;
  } {
    const config = this.getAppConfig();
    const policies = (config as any).policies || {};
    return {
      cashoutPolicyHtml:
        policies.cashoutPolicyHtml ||
        `<p>All withdrawals require verified identification and prior deposit history through the matching payout channel.</p><p><strong>Important Warning:</strong> Please review your cashtag before submission. Once sent the amount cannot be refunded.</p><p>Standard processing window is 15-45 minutes during operational desk hours.</p>`,
      privacyPolicyHtml:
        policies.privacyPolicyHtml ||
        `<p>Swift Sweeps respects your privacy and complies with industry data security standards. We never sell or share player personal records with unauthorized third parties.</p>`,
      termsPolicyHtml:
        policies.termsPolicyHtml ||
        `<p>Participation in games is restricted to eligible players of legal age in their respective jurisdiction. Wagering and bonus turnover terms apply.</p>`,
    };
  }

  public updateCmsPolicies(updated: Partial<{
    cashoutPolicyHtml: string;
    privacyPolicyHtml: string;
    termsPolicyHtml: string;
  }>): { success: boolean; message: string } {
    const config = this.getAppConfig();
    const prevPolicies = { ...(config as any).policies };
    delete prevPolicies.supportedPartners;
    (config as any).policies = {
      ...this.getCmsPolicies(),
      ...prevPolicies,
      ...updated,
    };
    delete (config as any).supportedPartners;
    this.save(STORAGE_KEYS.CONFIG, config, true);
    void this.updateCmsPoliciesAsync(updated);
    return { success: true, message: 'Policy settings saved successfully!' };
  }

  public async updateCmsPoliciesAsync(updated: Partial<{
    cashoutPolicyHtml: string;
    privacyPolicyHtml: string;
    termsPolicyHtml: string;
  }>): Promise<{ success: boolean; message: string }> {
    try {
      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/app-config/policies', (headers) => ({
        method: 'PATCH',
        headers,
        body: JSON.stringify(updated),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          message: extractServerApiError(
            json,
            `Failed to save policy settings (${attempt.response?.status || 401}).`,
          ),
        };
      }
      const config = this.getAppConfig();
      const nextCfg: AppConfig = {
        ...config,
        policies: json.policies || {
          ...this.getCmsPolicies(),
          ...updated,
        },
      };
      this.cache[STORAGE_KEYS.CONFIG] = nextCfg;
      this.saveToLocalStorage(STORAGE_KEYS.CONFIG, nextCfg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.CONFIG } }));
      }
      return { success: true, message: json.message || 'Policy settings saved successfully!' };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to save policy settings.',
      };
    }
  }

  public getUserRegisteredMethod(userId: string): {
    method: PaymentMethodType | null;
    methodName: string;
    details?: string;
  } {
    const user = this.getUserById(userId);
    const wallet = this.getWallet(userId);
    let method: PaymentMethodType | null = user?.registeredPaymentMethod || wallet?.registeredPaymentMethod || null;
    let details: string | undefined = user?.registeredPaymentDetails || wallet?.registeredPaymentDetails;

    // Fallback: check most recent topup request for this customer
    if (!method) {
      const topups = this.getTopUpRequests(userId);
      if (topups.length > 0) {
        const last = topups[0];
        method = last.method;
        details = last.providerRef || last.cryptoTxHash || last.depositAddress;
      }
    }

    const config = this.getAppConfig();
    const pm = method ? config.paymentMethods.find((m) => m.type === method) : null;
    let methodName = pm?.name || '';
    if (!methodName && method) {
      if (method === 'cashapp') methodName = 'Direct CashApp Payment';
      else if (method === 'chime') methodName = 'Chime Direct Payment';
      else if (method === 'crypto') methodName = 'Crypto Payment';
      else if (method === 'payment_link') methodName = 'Payment via Link';
      else methodName = 'Registered Payment Method';
    }

    return {
      method,
      methodName: methodName || 'None Registered',
      details,
    };
  }

  public setUserRegisteredMethod(userId: string, method: PaymentMethodType, details?: string): void {
    const users = this.getUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.registeredPaymentMethod = method;
      if (details) user.registeredPaymentDetails = details;
      this.save(STORAGE_KEYS.USERS, users);
    }
    const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
    if (wallets[userId]) {
      wallets[userId].registeredPaymentMethod = method;
      if (details) wallets[userId].registeredPaymentDetails = details;
      wallets[userId].lastUpdatedAt = new Date().toISOString();
      this.save(STORAGE_KEYS.WALLETS, wallets);
    }
  }

  public registerUser(params: {
    id?: string;
    email: string;
    displayName: string;
    phone?: string;
    role?: 'customer' | 'agent' | 'admin';
    referralCode?: string;
    emailVerified?: boolean;
    status?: string;
    avatarUrl?: string;
  }): { success: boolean; user?: UserProfile; message?: string } {
    const users = this.getUsers();
    const existing = users.find(
      (u) => (params.id && u.id === params.id) || u.email.toLowerCase() === params.email.toLowerCase() || (params.phone && u.phone === params.phone)
    );
    if (existing) {
      if (params.emailVerified !== undefined) {
        existing.emailVerified = params.emailVerified;
      }
      if (params.displayName) existing.displayName = params.displayName;
      if (params.role) existing.role = params.role;
      if (params.phone) existing.phone = params.phone;
      if (params.avatarUrl !== undefined) existing.avatarUrl = params.avatarUrl;
      return { success: true, user: existing, message: 'User already exists, profile synchronized.' };
    }

    let referredBy: string | undefined = undefined;
    if (params.referralCode) {
      const codeClean = params.referralCode.trim().toUpperCase();
      const referrer = users.find((u) => u.referralCode.toUpperCase() === codeClean);
      if (referrer) {
        referredBy = referrer.referralCode;
      }
    }

    const newId = params.id || `usr_customer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const generatedRefCode = `AP_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newUser: UserProfile = {
      id: newId,
      email: params.email,
      displayName: params.displayName,
      phone: params.phone,
      role: params.role || 'customer',
      emailVerified: Boolean(params.emailVerified),
      avatarUrl: params.avatarUrl,
      referralCode: generatedRefCode,
      referredBy,
      status: (params.status as any) || 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.save(STORAGE_KEYS.USERS, users);

    // Initialize clean wallet
    const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
    wallets[newId] = {
      customerId: newId,
      currency: 'USD',
      availableBalance: 0,
      referralBonusBalance: 0,
      reservedBalance: 0,
      pendingDepositBalance: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.save(STORAGE_KEYS.WALLETS, wallets);

    // Initial welcome notification (only once per user)
    const welcomeKey = `welcome_shown_${newId}`;
    if (typeof window !== 'undefined' && !localStorage.getItem(welcomeKey)) {
      this.createNotification({
        userId: newId,
        title: 'Welcome to Swift Sweeps',
        message: 'Your gaming wallet and customer support portal are ready.',
        type: 'system',
        linkTab: 'dashboard',
      });
      localStorage.setItem(welcomeKey, 'true');
    }

    this.setCurrentUserId(newId);
    return { success: true, user: newUser };
  }

  public async updateOwnProfile(params: {
    displayName?: string;
    phone?: string | null;
  }): Promise<{ success: boolean; error?: string; code?: string; user?: UserProfile }> {
    const current = this.getCurrentUser();
    if (!current) {
      return { success: false, error: 'You must be signed in to update your profile.' };
    }

    const res = await selfHostedAuthService.updateProfile(params);
    if (!res.success || !res.user) {
      return {
        success: false,
        code: res.code,
        error: res.error || 'Failed to update profile.',
      };
    }

    const synced = this.syncAuthenticatedUser(res.user) || res.user;
    window.dispatchEvent(
      new CustomEvent('aetherpay_state_changed', {
        detail: { key: 'profile_updated', userId: synced.id },
      })
    );
    return { success: true, user: synced };
  }

  public async updateUserAvatar(
    userId: string,
    avatarUrl: string | null
  ): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
    const current = this.getCurrentUser();
    if (!current || current.id !== userId) {
      return {
        success: false,
        error: 'You can only update your own profile picture.',
      };
    }

    const res = await selfHostedAuthService.updateProfileAvatar(avatarUrl);
    if (!res.success || !res.user) {
      return {
        success: false,
        error: res.error || 'Failed to update profile picture.',
      };
    }

    const synced = this.syncAuthenticatedUser(res.user) || res.user;
    window.dispatchEvent(
      new CustomEvent('aetherpay_state_changed', {
        detail: { key: 'avatar_updated', userId: synced.id, avatarUrl: synced.avatarUrl },
      })
    );

    return { success: true, user: synced };
  }

  // Wallets & Authoritative Ledger
  public getWallet(customerId: string): UserWallet {
    const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
    if (!wallets[customerId]) {
      wallets[customerId] = {
        customerId,
        currency: 'USD',
        availableBalance: 0,
        referralBonusBalance: 0,
        freePlayBalance: 0,
        reservedBalance: 0,
        pendingDepositBalance: 0,
        lastTopUpAmount: 0,
        lastUpdatedAt: new Date().toISOString(),
      };
      this.cache[STORAGE_KEYS.WALLETS] = wallets;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
    } else if (
      wallets[customerId].referralBonusBalance === undefined ||
      wallets[customerId].freePlayBalance === undefined
    ) {
      if (wallets[customerId].referralBonusBalance === undefined) {
        wallets[customerId].referralBonusBalance = 0;
      }
      if (wallets[customerId].freePlayBalance === undefined) {
        wallets[customerId].freePlayBalance = 0;
      }
      this.cache[STORAGE_KEYS.WALLETS] = wallets;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
    }

    const existing = wallets[customerId];
    const customerTopups = this.getTopUpRequests(customerId);
    const reconciled = reconcileWalletWithTopups(existing, customerTopups, {
      authoritativeTopupsLoaded: this.authoritativelyLoadedTopupsForUser.has(customerId),
    });

    if (
      reconciled.lastTopUpAmount !== existing.lastTopUpAmount ||
      reconciled.lastTopUpGame !== existing.lastTopUpGame ||
      reconciled.lastTopUpAt !== existing.lastTopUpAt
    ) {
      wallets[customerId] = reconciled;
      this.cache[STORAGE_KEYS.WALLETS] = wallets;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
    }

    return wallets[customerId];
  }

  public getTransactions(customerId?: string): WalletTransaction[] {
    const txs = this.load<WalletTransaction[]>(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
    if (customerId) {
      return txs.filter((t) => t.customerId === customerId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async fetchWalletFromServer(options?: {
    customerId?: string;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    wallet?: UserWallet;
    error?: string;
  }> {
    try {
      const targetCustomerId = options?.customerId?.trim();
      const url = targetCustomerId
        ? `/api/wallet?customerId=${encodeURIComponent(targetCustomerId)}`
        : '/api/wallet';

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          error: parseWalletApiError(res.status, rawText, 'Failed to load wallet from server.'),
        };
      }

      let payload: { wallet?: Record<string, unknown> };
      try {
        payload = JSON.parse(rawText) as { wallet?: Record<string, unknown> };
      } catch {
        return {
          success: false,
          error: 'Received an unexpected response from wallet service.',
        };
      }

      if (!payload?.wallet || !(payload.wallet.customerId ?? payload.wallet.customer_id)) {
        return {
          success: false,
          error: 'Invalid wallet response payload.',
        };
      }

      this.applyWalletRows([payload.wallet]);
      const resolvedId = String(payload.wallet.customerId ?? payload.wallet.customer_id);
      const updatedWallet = this.getWallet(resolvedId);

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.WALLETS, customerId: resolvedId },
          }),
        );
      }

      return {
        success: true,
        wallet: updatedWallet,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unable to load wallet from server.',
      };
    }
  }

  public async fetchWalletsFromServer(options?: {
    customerIds?: string[];
    limit?: number;
    offset?: number;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    wallets: UserWallet[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.set('offset', String(options.offset));
      }
      if (options?.customerIds && options.customerIds.length > 0) {
        params.set('customerIds', options.customerIds.slice(0, 100).join(','));
      }
      const query = params.toString();
      const url = query ? `/api/wallets?${query}` : '/api/wallets';

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          wallets: [],
          total: 0,
          hasMore: false,
          error: parseWalletApiError(res.status, rawText, 'Failed to load wallets from server.'),
        };
      }

      let payload: { wallets?: unknown[]; total?: number; hasMore?: boolean };
      try {
        payload = JSON.parse(rawText) as {
          wallets?: unknown[];
          total?: number;
          hasMore?: boolean;
        };
      } catch {
        return {
          success: false,
          wallets: [],
          total: 0,
          hasMore: false,
          error: 'Received an unexpected response from wallets service.',
        };
      }

      const rawWallets = Array.isArray(payload?.wallets) ? payload.wallets : [];
      if (rawWallets.length > 0) {
        this.applyWalletRows(rawWallets);
      }

      const walletMap =
        (this.cache[STORAGE_KEYS.WALLETS] as Record<string, UserWallet>) || {};
      const resolvedWallets = rawWallets
        .map((r: any) => String(r?.customerId ?? r?.customer_id ?? ''))
        .filter(Boolean)
        .map((id) => walletMap[id])
        .filter((w): w is UserWallet => Boolean(w));

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.WALLETS },
          }),
        );
      }

      return {
        success: true,
        wallets: resolvedWallets,
        total: Number(payload?.total ?? resolvedWallets.length),
        hasMore: Boolean(payload?.hasMore),
      };
    } catch (err: any) {
      return {
        success: false,
        wallets: [],
        total: 0,
        hasMore: false,
        error: err?.message || 'Unable to load wallets from server.',
      };
    }
  }

  public async fetchWalletTransactionsFromServer(options?: {
    customerId?: string;
    type?: string;
    status?: string;
    q?: string;
    sortBy?: 'createdAt' | 'amount';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    replaceAll?: boolean;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    transactions: WalletTransaction[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.customerId) {
        params.set('customerId', options.customerId);
      }
      if (options?.type) {
        params.set('type', options.type);
      }
      if (options?.status) {
        params.set('status', options.status);
      }
      if (options?.q) {
        params.set('q', options.q);
      }
      if (options?.sortBy) {
        params.set('sortBy', options.sortBy);
      }
      if (options?.sortOrder) {
        params.set('sortOrder', options.sortOrder);
      }
      if (options?.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.set('offset', String(options.offset));
      }

      const query = params.toString();
      const url = query ? `/api/wallet/transactions?${query}` : '/api/wallet/transactions';

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          transactions: this.getTransactions(options?.customerId),
          total: 0,
          hasMore: false,
          error: parseWalletApiError(
            res.status,
            rawText,
            'Failed to load wallet transactions from server.',
          ),
        };
      }

      let payload: {
        transactions?: unknown[];
        total?: number;
        hasMore?: boolean;
      };
      try {
        payload = JSON.parse(rawText) as {
          transactions?: unknown[];
          total?: number;
          hasMore?: boolean;
        };
      } catch {
        return {
          success: false,
          transactions: this.getTransactions(options?.customerId),
          total: 0,
          hasMore: false,
          error: 'Received an unexpected response from wallet transactions service.',
        };
      }

      if (!Array.isArray(payload?.transactions)) {
        return {
          success: false,
          transactions: this.getTransactions(options?.customerId),
          total: 0,
          hasMore: false,
          error: 'Invalid wallet transactions response payload.',
        };
      }

      this.applyTransactionRows(payload.transactions, Boolean(options?.replaceAll));

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.TRANSACTIONS, customerId: options?.customerId },
          }),
        );
      }

      return {
        success: true,
        transactions: this.getTransactions(options?.customerId),
        total: Number(payload?.total ?? payload.transactions.length),
        hasMore: Boolean(payload?.hasMore),
      };
    } catch (err: any) {
      return {
        success: false,
        transactions: this.getTransactions(options?.customerId),
        total: 0,
        hasMore: false,
        error: err?.message || 'Unable to load wallet transactions from server.',
      };
    }
  }

  // Top-Up Workflow
  public getTopUpRequests(customerId?: string): TopUpRequest[] {
    const reqs = this.load<TopUpRequest[]>(STORAGE_KEYS.TOPUPS, INITIAL_TOPUPS);
    if (customerId) {
      return reqs.filter((r) => r.customerId === customerId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getPendingRequests(): Array<TopUpRequest | WithdrawalRequest> {
    const topups = this.getTopUpRequests().filter((t) => t.status === 'pending' || t.status === 'submitted' || t.status === 'verifying');
    const withdrawals = this.getWithdrawalRequests().filter((w) => w.status === 'pending' || w.status === 'submitted' || w.status === 'processing');
    return [...topups, ...withdrawals];
  }

  public async fetchDepositsFromServer(options?: {
    customerId?: string;
    status?: string;
    beforeCreatedAt?: string;
    q?: string;
    limit?: number;
    offset?: number;
    replaceAll?: boolean;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    deposits: TopUpRequest[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.customerId?.trim()) {
        params.set('customerId', options.customerId.trim());
      }
      if (options?.status?.trim()) {
        params.set('status', options.status.trim());
      }
      if (options?.beforeCreatedAt?.trim()) {
        params.set('beforeCreatedAt', options.beforeCreatedAt.trim());
      }
      if (options?.q?.trim()) {
        params.set('q', options.q.trim());
      }
      if (options?.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.set('offset', String(options.offset));
      }

      const query = params.toString();
      const url = query ? `/api/deposits?${query}` : '/api/deposits';
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          deposits: [],
          total: 0,
          hasMore: false,
          error: parseDepositApiError(
            res.status,
            rawText,
            'Failed to load deposit requests from server.',
          ),
        };
      }

      let payload: {
        deposits?: unknown[];
        total?: number;
        hasMore?: boolean;
      };
      try {
        payload = JSON.parse(rawText) as {
          deposits?: unknown[];
          total?: number;
          hasMore?: boolean;
        };
      } catch {
        return {
          success: false,
          deposits: [],
          total: 0,
          hasMore: false,
          error: 'Received an unexpected response from deposit service.',
        };
      }

      const rows = Array.isArray(payload?.deposits) ? payload.deposits : [];
      this.applyTopupRows(rows, Boolean(options?.replaceAll));
      if (options?.customerId && options?.replaceAll) {
        this.authoritativelyLoadedTopupsForUser.add(options.customerId.trim());
      }

      const mapped = rows
        .filter((r: any) => r && r.id)
        .map((r: any) => mapDbTopupRowToRequest(r));

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.TOPUPS },
          }),
        );
      }

      return {
        success: true,
        deposits: mapped,
        total: Number(payload?.total ?? mapped.length),
        hasMore: Boolean(payload?.hasMore),
      };
    } catch (err: any) {
      return {
        success: false,
        deposits: [],
        total: 0,
        hasMore: false,
        error: err?.message || 'Unable to load deposit requests from server.',
      };
    }
  }

  public async submitTopUpAsync(params: {
    customerId: string;
    customerName: string;
    amount: number;
    method: PaymentMethodType;
    methodName: string;
    targetGameCatalogId?: string;
    targetGameName?: string;
    targetGameUsername?: string;
    providerRef?: string;
    receiptUrl: string;
    receiptName?: string;
    cryptoNetwork?: string;
    cryptoTxHash?: string;
    depositAddress?: string;
  }): Promise<{ success: boolean; message: string; request?: TopUpRequest }> {
    const cleanReceiptUrl = (params.receiptUrl || '').trim();
    if (!cleanReceiptUrl) {
      return {
        success: false,
        message: 'Please upload a screenshot of your payment receipt before submitting.',
      };
    }

    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: Number.isFinite(params.amount) ? Number(params.amount.toFixed(2)) : 0,
          method: params.method,
          methodName: params.methodName,
          targetGameCatalogId: params.targetGameCatalogId?.trim() || undefined,
          targetGameName: params.targetGameName?.trim() || undefined,
          targetGameUsername: params.targetGameUsername?.trim() || undefined,
          receiptUrl: cleanReceiptUrl,
          receiptName: params.receiptName?.trim() || undefined,
          providerRef: params.providerRef?.trim() || undefined,
          cryptoNetwork: params.cryptoNetwork?.trim() || undefined,
          cryptoTxHash: params.cryptoTxHash?.trim() || undefined,
          depositAddress: params.depositAddress?.trim() || undefined,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseDepositApiError(
            res.status,
            rawText,
            'Failed to submit deposit request.',
          ),
        };
      }

      let payload: {
        deposit?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          deposit?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response from deposit service.',
        };
      }

      if (!payload?.deposit?.id) {
        return {
          success: false,
          message: 'Invalid deposit response from server.',
        };
      }

      this.applyTopupRows([payload.deposit], false);
      const newReq =
        findRequestById(this.getTopUpRequests(), String(payload.deposit.id)) ||
        mapDbTopupRowToRequest(payload.deposit);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        this.reconcileCustomerWallet(newReq.customerId);
      }

      this.setUserRegisteredMethod(
        newReq.customerId,
        newReq.method,
        newReq.providerRef || newReq.cryptoTxHash || newReq.depositAddress,
      );

      this.createNotification({
        userId: newReq.customerId,
        title: 'Top-Up Submitted',
        message:
          newReq.amount > 0
            ? `Your top-up of $${newReq.amount.toFixed(2)} for ${newReq.targetGameName || 'game'} (${newReq.methodName}) is under review.`
            : `Your payment proof for ${newReq.targetGameName || 'game'} (${newReq.methodName}) has been submitted for review.`,
        type: 'topup',
        linkTab: 'topup',
        linkRequestId: newReq.id,
      });

      // Automatically forward transaction to customer support chat for review & approval
      try {
        const conv = this.getOrCreateConversationForCustomer(
          newReq.customerId,
          newReq.customerName,
        );
        this.sendChatMessage({
          conversationId: conv.id,
          senderId: newReq.customerId,
          senderName: newReq.customerName,
          senderRole: 'customer',
          text: formatTopUpSubmittedChatMessage({
            amount: newReq.amount,
            bonusAmount: newReq.bonusAmount,
            methodName: newReq.methodName,
            gameName: newReq.targetGameName,
            isCompleted: false,
          }),
          attachmentUrl: newReq.receiptUrl,
          attachmentName: newReq.receiptName,
          isInternalNote: false,
          transactionData: {
            transactionType: 'topup',
            requestId: newReq.id,
            gameName: newReq.targetGameName,
            gameUsername: newReq.targetGameUsername,
            amount: newReq.amount,
            bonusAmount: newReq.bonusAmount,
            bonusPercentage: newReq.bonusPercentage,
            finalCredit: newReq.finalWalletCredit,
            methodName: newReq.methodName,
            status: 'pending',
            proofUrl: newReq.receiptUrl,
            proofName: newReq.receiptName,
            details: newReq.providerRef || newReq.cryptoTxHash,
          },
        });
      } catch (chatErr) {
        console.warn('Customer topup chat notice:', chatErr);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'topup_submitted', requestId: newReq.id },
          }),
        );
      }

      return {
        success: true,
        message:
          payload.message ||
          `Payment proof submitted! Your deposit (+${newReq.bonusPercentage || 0}% bonus) will be credited to ${newReq.targetGameName || 'your game'} shortly.`,
        request: newReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to deposit service.',
      };
    }
  }

  public async approveTopUpAsync(params: {
    requestId: string;
    reviewerId: string;
    reviewerName: string;
    notes?: string;
    verifiedAmount?: number;
  }): Promise<{ success: boolean; message: string; request?: TopUpRequest }> {
    const cleanId = (params.requestId || '').trim();
    if (!cleanId) {
      return { success: false, message: 'Deposit request ID is required.' };
    }

    try {
      const res = await fetch(`/api/deposits/${encodeURIComponent(cleanId)}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          verifiedAmount:
            params.verifiedAmount !== undefined && Number.isFinite(params.verifiedAmount)
              ? Number(params.verifiedAmount.toFixed(2))
              : undefined,
          notes: params.notes?.trim() || undefined,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseDepositApiError(
            res.status,
            rawText,
            'Failed to approve deposit request.',
          ),
        };
      }

      let payload: {
        deposit?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          deposit?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response when approving deposit.',
        };
      }

      if (!payload?.deposit?.id) {
        return {
          success: false,
          message: 'Invalid deposit approval response from server.',
        };
      }

      this.applyTopupRows([payload.deposit], false);
      const updatedReq =
        findRequestById(this.getTopUpRequests(), String(payload.deposit.id)) ||
        mapDbTopupRowToRequest(payload.deposit);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        void this.fetchWalletFromServer({ customerId: updatedReq.customerId, silentEvent: true });
      }
      this.reconcileCustomerWallet(updatedReq.customerId);
      void this.fetchWalletTransactionsFromServer({
        customerId: updatedReq.customerId,
        limit: 25,
        replaceAll: false,
        silentEvent: true,
      });

      const allAccounts = this.getGameAccounts();
      const gameAcc = allAccounts.find(
        (a) =>
          a.customerId === updatedReq.customerId &&
          (a.gameCatalogId === updatedReq.targetGameCatalogId ||
            a.gameName.toLowerCase() === updatedReq.targetGameName?.toLowerCase()),
      );
      const hasActiveCredentials = Boolean(
        gameAcc && gameAcc.status === 'active' && gameAcc.username,
      );

      if (hasActiveCredentials && gameAcc) {
        gameAcc.balance = (gameAcc.balance || 0) + (updatedReq.finalWalletCredit || updatedReq.amount);
        gameAcc.updatedAt = updatedReq.updatedAt;
        this.save(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
      }

      this.createNotification({
        userId: updatedReq.customerId,
        title: 'Game Top-Up Approved & Loaded',
        message: `Your deposit of $${updatedReq.amount.toFixed(2)}${updatedReq.bonusAmount > 0 ? ` plus $${updatedReq.bonusAmount.toFixed(2)} bonus` : ''} was loaded directly into your ${updatedReq.targetGameName || 'game'} account! (Tracked as latest top-up).`,
        type: 'topup',
        linkTab: 'topup',
        linkRequestId: updatedReq.id,
      });

      this.updateChatTransactionStatus(
        updatedReq.id,
        'completed',
        updatedReq.reviewerName || params.reviewerName,
        updatedReq.reviewNotes,
        {
          amount: updatedReq.amount,
          bonusAmount: updatedReq.bonusAmount,
          finalCredit: updatedReq.finalWalletCredit,
        },
      );
      await this.persistChatTransactionStatusOnServer({
        requestId: updatedReq.id,
        customerId: updatedReq.customerId,
        status: 'completed',
        notes: updatedReq.reviewNotes,
        amount: updatedReq.amount,
        bonusAmount: updatedReq.bonusAmount,
        finalCredit: updatedReq.finalWalletCredit,
      });

      try {
        const conv = this.getOrCreateConversationForCustomer(
          updatedReq.customerId,
          updatedReq.customerName,
        );
        this.sendChatMessage({
          conversationId: conv.id,
          senderId: updatedReq.reviewerId || params.reviewerId,
          senderName: updatedReq.reviewerName || params.reviewerName,
          senderRole: 'agent',
          text: formatTopUpApprovedChatMessage({
            totalCredit: updatedReq.finalWalletCredit,
            baseAmount: updatedReq.amount,
            bonusAmount: updatedReq.bonusAmount,
            gameName: updatedReq.targetGameName,
            gameUsername: hasActiveCredentials ? gameAcc?.username : undefined,
            hasActiveCredentials,
          }),
          isInternalNote: false,
        });
      } catch (chatErr) {
        console.warn('Top-up approval chat dispatch warning:', chatErr);
      }

      if (typeof window !== 'undefined') {
        webPushClient
          .dispatchPushAlert({
            recipientId: updatedReq.customerId,
            recipientRole: 'customer',
            title: '🎉 Deposit Approved & Loaded!',
            body: `$${updatedReq.amount.toFixed(2)}${updatedReq.bonusAmount > 0 ? ` (+ $${updatedReq.bonusAmount.toFixed(2)} bonus = $${updatedReq.finalWalletCredit.toFixed(2)} total)` : ''} loaded to ${updatedReq.targetGameName || 'your game'}.`,
            url: '/#games',
            tag: `topup_${updatedReq.id}`,
            actionType: 'deposit',
          })
          .catch(() => {});
      }

      await this.triggerServerReferralEvaluation(updatedReq.customerId);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'topup_approved', requestId: updatedReq.id },
          }),
        );
      }

      return {
        success: true,
        message: payload.message || 'Deposit successfully approved and credited.',
        request: updatedReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to deposit service.',
      };
    }
  }

  public async rejectTopUpAsync(params: {
    requestId: string;
    reviewerId: string;
    reviewerName: string;
    reason: string;
  }): Promise<{ success: boolean; message: string; request?: TopUpRequest }> {
    const cleanId = (params.requestId || '').trim();
    if (!cleanId) {
      return { success: false, message: 'Deposit request ID is required.' };
    }
    const cleanReason = (params.reason || '').trim();
    if (!cleanReason) {
      return { success: false, message: 'Rejection reason is required.' };
    }

    try {
      const res = await fetch(`/api/deposits/${encodeURIComponent(cleanId)}/reject`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          reason: cleanReason,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseDepositApiError(
            res.status,
            rawText,
            'Failed to reject deposit request.',
          ),
        };
      }

      let payload: {
        deposit?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          deposit?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response when rejecting deposit.',
        };
      }

      if (!payload?.deposit?.id) {
        return {
          success: false,
          message: 'Invalid deposit rejection response from server.',
        };
      }

      this.applyTopupRows([payload.deposit], false);
      const updatedReq =
        findRequestById(this.getTopUpRequests(), String(payload.deposit.id)) ||
        mapDbTopupRowToRequest(payload.deposit);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        void this.fetchWalletFromServer({ customerId: updatedReq.customerId, silentEvent: true });
      }
      this.reconcileCustomerWallet(updatedReq.customerId);

      this.createNotification({
        userId: updatedReq.customerId,
        title: 'Deposit Request Declined',
        message: `Your deposit was rejected. Reason: ${cleanReason}`,
        type: 'topup',
        linkTab: 'topup',
        linkRequestId: updatedReq.id,
      });

      this.updateChatTransactionStatus(
        updatedReq.id,
        'rejected',
        updatedReq.reviewerName || params.reviewerName,
        cleanReason,
      );
      await this.persistChatTransactionStatusOnServer({
        requestId: updatedReq.id,
        customerId: updatedReq.customerId,
        status: 'rejected',
        notes: cleanReason,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'topup_rejected', requestId: updatedReq.id },
          }),
        );
      }

      return {
        success: true,
        message: payload.message || 'Deposit rejected.',
        request: updatedReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to deposit service.',
      };
    }
  }

  public async createStaffTopUpAsync(params: {
    customerId: string;
    customerName: string;
    reviewerId: string;
    reviewerName: string;
    amount: number;
    bonusPercentage?: number;
    method: PaymentMethodType;
    methodName: string;
    targetGameCatalogId?: string;
    targetGameName?: string;
    targetGameUsername?: string;
    providerRef?: string;
    receiptUrl?: string;
    receiptName?: string;
    notes?: string;
    status: 'completed' | 'submitted';
    postToChat: boolean;
  }): Promise<{ success: boolean; message: string; request?: TopUpRequest }> {
    const config = this.getAppConfig();
    const pm = config.paymentMethods.find((m) => m.type === params.method);
    const resolvedBonusPct =
      params.bonusPercentage !== undefined
        ? params.bonusPercentage
        : getDefaultBonusPercentageForMethod(params.method, config.paymentMethods);

    const draft = buildStaffTopUpDraft({
      customerId: params.customerId,
      customerName: params.customerName,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      amount: params.amount,
      bonusPercentage: resolvedBonusPct,
      feePercentage: pm?.feePercentage || 0,
      method: params.method,
      methodName: params.methodName,
      targetGameCatalogId: params.targetGameCatalogId,
      targetGameName: params.targetGameName,
      targetGameUsername: params.targetGameUsername,
      providerRef: params.providerRef,
      receiptUrl: params.receiptUrl,
      receiptName: params.receiptName,
      notes: params.notes,
      status: params.status,
      currency: config.currency,
    });

    if (!draft.valid || !draft.request || !draft.chatTransactionData) {
      return { success: false, message: draft.error || 'Invalid top-up parameters.' };
    }

    try {
      const res = await fetch('/api/deposits/staff', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          customerId: params.customerId,
          amount: draft.request.amount,
          bonusPercentage: draft.request.bonusPercentage,
          method: params.method,
          methodName: params.methodName || 'Direct Support Desk',
          targetGameCatalogId: params.targetGameCatalogId?.trim() || undefined,
          targetGameName: params.targetGameName?.trim() || undefined,
          targetGameUsername: params.targetGameUsername?.trim() || undefined,
          providerRef: params.providerRef?.trim() || undefined,
          receiptUrl: params.receiptUrl?.trim() || undefined,
          receiptName: params.receiptName?.trim() || undefined,
          notes: params.notes?.trim() || undefined,
          status: params.status,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseDepositApiError(
            res.status,
            rawText,
            'Failed to create staff deposit on server.',
          ),
        };
      }

      let payload: {
        deposit?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          deposit?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response when saving deposit.',
        };
      }

      if (!payload?.deposit?.id) {
        return {
          success: false,
          message: 'Invalid deposit response from server.',
        };
      }

      this.applyTopupRows([payload.deposit], false);
      const savedReq =
        findRequestById(this.getTopUpRequests(), String(payload.deposit.id)) ||
        mapDbTopupRowToRequest(payload.deposit);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        void this.fetchWalletFromServer({ customerId: params.customerId, silentEvent: true });
      }
      this.reconcileCustomerWallet(params.customerId);
      void this.fetchWalletTransactionsFromServer({
        customerId: params.customerId,
        limit: 25,
        replaceAll: false,
        silentEvent: true,
      });

      const isCompleted = savedReq.status === 'completed';

      if (isCompleted) {
        if (savedReq.targetGameCatalogId) {
          const allAccounts = this.getGameAccounts();
          const gameAcc = allAccounts.find(
            (a) =>
              a.customerId === params.customerId &&
              (a.gameCatalogId === savedReq.targetGameCatalogId ||
                (savedReq.targetGameName &&
                  a.gameName?.toLowerCase() === savedReq.targetGameName.toLowerCase())),
          );
          if (gameAcc) {
            gameAcc.balance =
              (gameAcc.balance || 0) + (savedReq.finalWalletCredit || savedReq.amount);
            gameAcc.updatedAt = savedReq.updatedAt;
            this.save(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
          }
        }

        await this.triggerServerReferralEvaluation(params.customerId);
      }

      if (params.postToChat) {
        const conv = this.getOrCreateConversationForCustomer(
          savedReq.customerId,
          savedReq.customerName,
        );
        this.sendChatMessage({
          conversationId: conv.id,
          senderId: savedReq.reviewerId || params.reviewerId,
          senderName: savedReq.reviewerName || params.reviewerName,
          senderRole: 'agent',
          text: formatTopUpSubmittedChatMessage({
            amount: savedReq.amount,
            bonusAmount: savedReq.bonusAmount,
            methodName: savedReq.methodName,
            gameName: savedReq.targetGameName,
            isCompleted,
          }),
          attachmentUrl: savedReq.receiptUrl,
          attachmentName: savedReq.receiptName,
          isInternalNote: false,
          transactionData: {
            transactionType: 'topup',
            requestId: savedReq.id,
            gameName: savedReq.targetGameName,
            gameUsername: savedReq.targetGameUsername,
            amount: savedReq.amount,
            bonusAmount: savedReq.bonusAmount,
            bonusPercentage: savedReq.bonusPercentage,
            finalCredit: savedReq.finalWalletCredit,
            methodName: savedReq.methodName,
            status: isCompleted ? 'completed' : 'pending',
            proofUrl: savedReq.receiptUrl,
            proofName: savedReq.receiptName,
            details: savedReq.providerRef,
            notes: savedReq.reviewNotes,
            approvedBy: isCompleted ? savedReq.reviewerName : undefined,
            approvedAt: isCompleted ? savedReq.updatedAt : undefined,
          },
        });

        this.createNotification({
          userId: savedReq.customerId,
          title: isCompleted ? 'Deposit Logged & Credited' : 'Deposit Request Created',
          message: isCompleted
            ? `$${(savedReq.finalWalletCredit || savedReq.amount).toFixed(2)} has been credited${savedReq.targetGameName ? ` to ${savedReq.targetGameName}` : ''}.`
            : `A deposit request of $${savedReq.amount.toFixed(2)} was created for your review.`,
          type: 'topup',
          linkTab: 'wallet',
          linkRequestId: savedReq.id,
        });

        if (isCompleted && typeof window !== 'undefined') {
          webPushClient
            .dispatchPushAlert({
              recipientId: savedReq.customerId,
              recipientRole: 'customer',
              title: '💳 Deposit Credited!',
              body: `$${(savedReq.finalWalletCredit || savedReq.amount).toFixed(2)} credited${savedReq.targetGameName ? ` to ${savedReq.targetGameName}` : ''}.`,
              url: '/#wallet',
              tag: `topup_${savedReq.id}`,
              actionType: 'deposit',
            })
            .catch(() => {});
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: isCompleted ? 'topup_approved' : 'topup_submitted', requestId: savedReq.id },
          }),
        );
      }

      return {
        success: true,
        message:
          payload.message ||
          (isCompleted
            ? `Completed deposit of $${(savedReq.finalWalletCredit || savedReq.amount).toFixed(2)} saved.`
            : `Pending deposit request of $${savedReq.amount.toFixed(2)} created.`),
        request: savedReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to deposit service.',
      };
    }
  }

  public async fetchWithdrawalsFromServer(options?: {
    customerId?: string;
    status?: string;
    beforeCreatedAt?: string;
    q?: string;
    limit?: number;
    offset?: number;
    replaceAll?: boolean;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    withdrawals: WithdrawalRequest[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.customerId?.trim()) {
        params.set('customerId', options.customerId.trim());
      }
      if (options?.status?.trim()) {
        params.set('status', options.status.trim());
      }
      if (options?.beforeCreatedAt?.trim()) {
        params.set('beforeCreatedAt', options.beforeCreatedAt.trim());
      }
      if (options?.q?.trim()) {
        params.set('q', options.q.trim());
      }
      if (options?.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options?.offset !== undefined) {
        params.set('offset', String(options.offset));
      }

      const query = params.toString();
      const url = query ? `/api/withdrawals?${query}` : '/api/withdrawals';
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          withdrawals: [],
          total: 0,
          hasMore: false,
          error: parseWithdrawalApiError(
            res.status,
            rawText,
            'Failed to load withdrawal requests from server.',
          ),
        };
      }

      let payload: {
        withdrawals?: unknown[];
        total?: number;
        hasMore?: boolean;
      };
      try {
        payload = JSON.parse(rawText) as {
          withdrawals?: unknown[];
          total?: number;
          hasMore?: boolean;
        };
      } catch {
        return {
          success: false,
          withdrawals: [],
          total: 0,
          hasMore: false,
          error: 'Received an unexpected response from withdrawal service.',
        };
      }

      const rows = Array.isArray(payload?.withdrawals) ? payload.withdrawals : [];
      this.applyWithdrawalRows(rows, Boolean(options?.replaceAll));

      const mapped = rows
        .filter((r: any) => r && r.id)
        .map((r: any) => mapDbWithdrawalRowToRequest(r));

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.WITHDRAWALS },
          }),
        );
      }

      return {
        success: true,
        withdrawals: mapped,
        total: Number(payload?.total ?? mapped.length),
        hasMore: Boolean(payload?.hasMore),
      };
    } catch (err: any) {
      return {
        success: false,
        withdrawals: [],
        total: 0,
        hasMore: false,
        error: err?.message || 'Unable to load withdrawal requests from server.',
      };
    }
  }

  public async createStaffWithdrawalAsync(params: {
    customerId: string;
    customerName: string;
    reviewerId: string;
    reviewerName: string;
    amount: number;
    feeAmount?: number;
    method: PayoutMethodType | string;
    methodName: string;
    payoutHandle?: string;
    payoutReference?: string;
    sourceGameCatalogId?: string;
    sourceGameName?: string;
    sourceGameUsername?: string;
    notes?: string;
    status: 'completed' | 'submitted';
    postToChat: boolean;
  }): Promise<{ success: boolean; message: string; request?: WithdrawalRequest }> {
    const config = this.getAppConfig();
    const draft = buildStaffWithdrawalDraft({
      customerId: params.customerId,
      customerName: params.customerName,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      amount: params.amount,
      feeAmount: params.feeAmount,
      method: params.method,
      methodName: params.methodName,
      payoutHandle: params.payoutHandle,
      payoutReference: params.payoutReference,
      sourceGameCatalogId: params.sourceGameCatalogId,
      sourceGameName: params.sourceGameName,
      sourceGameUsername: params.sourceGameUsername,
      notes: params.notes,
      status: params.status,
      currency: config.currency,
    });

    if (!draft.valid || !draft.request) {
      return { success: false, message: draft.error || 'Invalid cashout parameters.' };
    }

    try {
      const res = await fetch('/api/withdrawals/staff', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          customerId: params.customerId,
          amount: draft.request.amount,
          feeAmount: draft.request.feeAmount || 0,
          method: params.method || 'manual_support',
          methodName: params.methodName || 'Customer Support Manual Payout',
          payoutHandle: params.payoutHandle?.trim() || undefined,
          payoutReference: params.payoutReference?.trim() || undefined,
          sourceGameCatalogId: params.sourceGameCatalogId?.trim() || undefined,
          sourceGameName: params.sourceGameName?.trim() || undefined,
          sourceGameUsername: params.sourceGameUsername?.trim() || undefined,
          notes: params.notes?.trim() || undefined,
          status: params.status,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseWithdrawalApiError(
            res.status,
            rawText,
            'Failed to create staff cashout on server.',
          ),
        };
      }

      let payload: {
        withdrawal?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          withdrawal?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response when saving cashout.',
        };
      }

      if (!payload?.withdrawal?.id) {
        return {
          success: false,
          message: 'Invalid cashout response from server.',
        };
      }

      this.applyWithdrawalRows([payload.withdrawal], false);
      const savedReq =
        findRequestById(this.getWithdrawalRequests(), String(payload.withdrawal.id)) ||
        mapDbWithdrawalRowToRequest(payload.withdrawal);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        void this.fetchWalletFromServer({ customerId: params.customerId, silentEvent: true });
      }
      void this.fetchWalletTransactionsFromServer({
        customerId: params.customerId,
        limit: 25,
        replaceAll: false,
        silentEvent: true,
      });

      const isCompleted = savedReq.status === 'completed';

      if (params.postToChat) {
        const conv = this.getOrCreateConversationForCustomer(
          savedReq.customerId,
          savedReq.customerName,
        );
        this.sendChatMessage({
          conversationId: conv.id,
          senderId: params.reviewerId,
          senderName: params.reviewerName,
          senderRole: 'agent',
          text: formatCashoutChatMessage({
            amount: savedReq.amount,
            netPayout: savedReq.netPayout,
            methodName: savedReq.methodName,
            gameName: savedReq.sourceGameName,
            status: isCompleted ? 'completed' : 'submitted',
            payoutReference: savedReq.payoutReference,
          }),
          isInternalNote: false,
          transactionData: {
            transactionType: 'withdrawal',
            requestId: savedReq.id,
            gameName: savedReq.sourceGameName,
            gameUsername: savedReq.sourceGameUsername,
            amount: savedReq.amount,
            methodName: savedReq.methodName,
            status: isCompleted ? 'completed' : 'pending',
            details: [params.payoutHandle?.trim(), savedReq.payoutReference]
              .filter(Boolean)
              .join(' • ') || undefined,
            notes: savedReq.reviewNotes,
            approvedBy: isCompleted ? savedReq.reviewerName : undefined,
            approvedAt: isCompleted ? savedReq.updatedAt : undefined,
          },
        });

        this.createNotification({
          userId: savedReq.customerId,
          title: isCompleted ? 'Cashout Logged & Completed' : 'Cashout Request Created',
          message: isCompleted
            ? `Your cashout of $${(savedReq.netPayout ?? savedReq.amount).toFixed(2)} via ${savedReq.methodName} has been recorded as completed.`
            : `A cashout request of $${savedReq.amount.toFixed(2)} via ${savedReq.methodName} was created for review.`,
          type: 'withdrawal',
          linkTab: 'wallet',
          linkRequestId: savedReq.id,
        });

        if (isCompleted && typeof window !== 'undefined') {
          webPushClient
            .dispatchPushAlert({
              recipientId: savedReq.customerId,
              recipientRole: 'customer',
              title: '💸 Payout Recorded & Completed!',
              body: `Your $${(savedReq.netPayout ?? savedReq.amount).toFixed(2)} cashout via ${savedReq.methodName} is complete.`,
              url: '/#wallet',
              tag: `wdr_comp_${savedReq.id}`,
              actionType: 'payout',
            })
            .catch(() => {});
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'withdrawal_updated', requestId: savedReq.id },
          }),
        );
      }

      return {
        success: true,
        message:
          payload.message ||
          (isCompleted
            ? `Completed cashout of $${savedReq.amount.toFixed(2)} logged.`
            : `Pending cashout request of $${savedReq.amount.toFixed(2)} created.`),
        request: savedReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to withdrawal service.',
      };
    }
  }

  // Cashout / Withdrawal Workflow
  public getWithdrawalRequests(customerId?: string): WithdrawalRequest[] {
    const reqs = this.load<WithdrawalRequest[]>(STORAGE_KEYS.WITHDRAWALS, INITIAL_WITHDRAWALS);
    if (customerId) {
      return reqs
        .filter((r) => r.customerId === customerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async submitWithdrawalAsync(params: {
    customerId: string;
    customerName: string;
    amount: number;
    method?: string;
    methodName?: string;
    sourceGameCatalogId?: string;
    sourceGameName?: string;
    sourceGameUsername?: string;
    playerNotes?: string;
    payoutDetails?: WithdrawalRequest['payoutDetails'];
  }): Promise<{ success: boolean; message: string; request?: WithdrawalRequest }> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { success: false, message: 'Please enter a valid cashout amount to request.' };
    }

    try {
      const sanitizedPayoutDetails: Record<string, unknown> = {};
      if (params.payoutDetails && typeof params.payoutDetails === 'object') {
        for (const key of [
          'methodType',
          'cashtag',
          'chimeHandle',
          'cryptoAddress',
          'linkAccountRef',
          'payoutHandle',
          'collectedBySupport',
        ]) {
          if (params.payoutDetails[key] !== undefined) {
            sanitizedPayoutDetails[key] = params.payoutDetails[key];
          }
        }
      }

      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: Number(params.amount.toFixed(2)),
          method: params.method || 'manual_support',
          methodName: params.methodName || 'Customer Support Manual Payout',
          sourceGameCatalogId: params.sourceGameCatalogId?.trim() || undefined,
          sourceGameName: params.sourceGameName?.trim() || undefined,
          sourceGameUsername: params.sourceGameUsername?.trim() || undefined,
          playerNotes: params.playerNotes?.trim() || undefined,
          payoutDetails: sanitizedPayoutDetails,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseWithdrawalApiError(
            res.status,
            rawText,
            'Failed to submit withdrawal request.',
          ),
        };
      }

      let payload: { withdrawal?: Record<string, unknown>; message?: string };
      try {
        payload = JSON.parse(rawText) as {
          withdrawal?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response from withdrawal service.',
        };
      }

      if (!payload?.withdrawal?.id) {
        return {
          success: false,
          message: 'Invalid withdrawal response from server.',
        };
      }

      this.applyWithdrawalRows([payload.withdrawal], false);
      const newReq =
        findRequestById(this.getWithdrawalRequests(), String(payload.withdrawal.id)) ||
        mapDbWithdrawalRowToRequest(payload.withdrawal);

      void this.fetchWalletTransactionsFromServer({
        customerId: newReq.customerId,
        limit: 25,
        replaceAll: false,
        silentEvent: true,
      });

      // Automatically initialize support chat so customer support can manually process cashout
      const lastMethodInfo = this.getUserRegisteredMethod(newReq.customerId);
      const lastMethodName = lastMethodInfo.methodName || newReq.methodName || 'Standard Method';
      const lastMethodDetail = lastMethodInfo.details ? ` (${lastMethodInfo.details})` : '';

      const conv = this.getOrCreateConversationForCustomer(
        newReq.customerId,
        newReq.customerName,
      );
      this.sendChatMessage({
        conversationId: conv.id,
        senderId: newReq.customerId,
        senderName: newReq.customerName,
        senderRole: 'customer',
        text: formatCashoutChatMessage({
          amount: newReq.amount,
          methodName: lastMethodName,
          methodDetail: lastMethodDetail,
          gameName: newReq.sourceGameName,
          status: 'submitted',
        }),
        isInternalNote: false,
        transactionData: {
          transactionType: 'withdrawal',
          requestId: newReq.id,
          gameName: newReq.sourceGameName,
          gameUsername: newReq.sourceGameUsername,
          amount: newReq.amount,
          methodName: lastMethodName,
          status: 'pending',
          notes: newReq.playerNotes,
          details: lastMethodDetail,
        },
      });

      this.createNotification({
        userId: newReq.customerId,
        title: 'Cashout Request Submitted',
        message: `Your $${newReq.amount.toFixed(2)} cashout request for ${newReq.sourceGameName || 'Game'} is under manual review. Support will message you for payout info.`,
        type: 'withdrawal',
        linkTab: 'chat',
        linkRequestId: newReq.id,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'withdrawal_updated', requestId: newReq.id },
          }),
        );
      }

      return {
        success: true,
        message:
          payload.message ||
          'Withdrawal request created! Customer Support is reviewing your request.',
        request: newReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to withdrawal service.',
      };
    }
  }

  public async updateWithdrawalStatusAsync(params: {
    requestId: string;
    newStatus: WithdrawalStatus;
    reviewerId: string;
    reviewerName: string;
    note?: string;
    payoutReference?: string;
  }): Promise<{ success: boolean; message: string; request?: WithdrawalRequest }> {
    const cleanId = (params.requestId || '').trim();
    if (!cleanId) {
      return { success: false, message: 'Withdrawal request ID is required.' };
    }

    try {
      const res = await fetch(`/api/withdrawals/${encodeURIComponent(cleanId)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          newStatus: params.newStatus,
          note: params.note?.trim() || undefined,
          payoutReference: params.payoutReference?.trim() || undefined,
        }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseWithdrawalApiError(
            res.status,
            rawText,
            'Failed to update withdrawal status.',
          ),
        };
      }

      let payload: {
        withdrawal?: Record<string, unknown>;
        wallet?: Record<string, unknown>;
        message?: string;
      };
      try {
        payload = JSON.parse(rawText) as {
          withdrawal?: Record<string, unknown>;
          wallet?: Record<string, unknown>;
          message?: string;
        };
      } catch {
        return {
          success: false,
          message: 'Received unexpected response when updating withdrawal status.',
        };
      }

      if (!payload?.withdrawal?.id) {
        return {
          success: false,
          message: 'Invalid withdrawal update response from server.',
        };
      }

      this.applyWithdrawalRows([payload.withdrawal], false);
      const updatedReq =
        findRequestById(this.getWithdrawalRequests(), String(payload.withdrawal.id)) ||
        mapDbWithdrawalRowToRequest(payload.withdrawal);

      if (payload.wallet && (payload.wallet.customerId || payload.wallet.customer_id)) {
        this.applyWalletRows([payload.wallet]);
      } else {
        void this.fetchWalletFromServer({ customerId: updatedReq.customerId, silentEvent: true });
      }
      void this.fetchWalletTransactionsFromServer({
        customerId: updatedReq.customerId,
        limit: 25,
        replaceAll: false,
        silentEvent: true,
      });

      const actorDisplayName = updatedReq.reviewerName || params.reviewerName;

      if (params.newStatus === 'completed') {
        this.createNotification({
          userId: updatedReq.customerId,
          title: 'Withdrawal Completed',
          message: `Your $${(updatedReq.netPayout ?? updatedReq.amount).toFixed(2)} cashout was dispatched. Reference: ${updatedReq.payoutReference || 'Completed'}`,
          type: 'withdrawal',
          linkTab: 'withdrawal',
        });

        this.updateChatTransactionStatus(
          updatedReq.id,
          'completed',
          actorDisplayName,
          params.note,
        );
        if (typeof window !== 'undefined') {
          webPushClient
            .dispatchPushAlert({
              recipientId: updatedReq.customerId,
              recipientRole: 'customer',
              title: '💸 Payout Sent & Completed!',
              body: `Your cashout of $${updatedReq.amount.toFixed(2)} has been sent! ${updatedReq.payoutReference ? `Ref: ${updatedReq.payoutReference}` : ''}`,
              url: '/#wallet',
              tag: `wdr_comp_${updatedReq.id}`,
              actionType: 'payout',
            })
            .catch(() => {});
        }
      } else if (params.newStatus === 'rejected' || params.newStatus === 'cancelled') {
        // Restore source game balance if cashout originated from a specific game (non-migrated game_accounts cache)
        if (updatedReq.sourceGameCatalogId) {
          const allAccounts = this.getGameAccounts();
          const gameAcc = allAccounts.find(
            (a) =>
              a.customerId === updatedReq.customerId &&
              a.gameCatalogId === updatedReq.sourceGameCatalogId,
          );
          if (gameAcc) {
            gameAcc.balance = (gameAcc.balance || 0) + updatedReq.amount;
            gameAcc.updatedAt = new Date().toISOString();
            this.save(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
          }
        }

        this.createNotification({
          userId: updatedReq.customerId,
          title:
            params.newStatus === 'cancelled'
              ? 'Withdrawal Cancelled'
              : 'Withdrawal Rejected - Funds Released',
          message:
            params.newStatus === 'cancelled'
              ? `Your $${updatedReq.amount.toFixed(2)} cashout request was cancelled.`
              : `Your $${updatedReq.amount.toFixed(2)} cashout was declined. Reason: ${params.note || 'None'}`,
          type: 'withdrawal',
          linkTab: 'wallet',
          linkRequestId: updatedReq.id,
        });

        this.updateChatTransactionStatus(
          updatedReq.id,
          'rejected',
          actorDisplayName,
          params.note,
        );
      } else {
        this.createNotification({
          userId: updatedReq.customerId,
          title: 'Withdrawal Update',
          message: `Your cashout #${updatedReq.id} is now ${params.newStatus.replace('_', ' ')}.`,
          type: 'withdrawal',
          linkTab: 'withdrawal',
          linkRequestId: updatedReq.id,
        });

        if (params.newStatus === 'processing' && typeof window !== 'undefined') {
          webPushClient
            .dispatchPushAlert({
              recipientId: updatedReq.customerId,
              recipientRole: 'customer',
              title: '⏳ Cashout In Processing',
              body: `Your cashout of $${updatedReq.amount.toFixed(2)} is being processed by the payout operator.`,
              url: '/#wallet',
              tag: `wdr_proc_${updatedReq.id}`,
              actionType: 'payout',
            })
            .catch(() => {});
        }
      }

      if (
        params.newStatus === 'completed' ||
        params.newStatus === 'rejected' ||
        params.newStatus === 'cancelled'
      ) {
        await this.persistChatTransactionStatusOnServer({
          requestId: updatedReq.id,
          customerId: updatedReq.customerId,
          status: params.newStatus === 'completed' ? 'completed' : 'rejected',
          notes: params.note,
        });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'withdrawal_updated', requestId: updatedReq.id },
          }),
        );
      }

      return {
        success: true,
        message: payload.message || `Withdrawal status updated to ${updatedReq.status}.`,
        request: updatedReq,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to connect to withdrawal service.',
      };
    }
  }

  // Master Game Catalog (Admin Account Managed)
  public getGameCatalog(): GameCatalogItem[] {
    const list = this.load<GameCatalogItem[]>(STORAGE_KEYS.GAME_CATALOG, INITIAL_GAME_CATALOG);
    return list.map((g) => {
      const resolvedIcon = resolveGameImageUrl(g.iconUrl || g.imageUrl);
      return {
        ...g,
        links: g.links && g.links.length > 0 ? g.links : [{ label: 'Web Play', url: g.gameUrl || 'https://games.swiftsweeps.com' }],
        iconUrl: resolvedIcon,
        imageUrl: resolvedIcon,
      };
    });
  }

  public async fetchGameCatalogFromServer(options?: {
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    catalog: GameCatalogItem[];
    error?: string;
  }> {
    try {
      const currentUser = this.getCurrentUser();
      const isStaff =
        currentUser?.role === 'admin' || currentUser?.role === 'agent';
      const queryUrl = isStaff
        ? '/api/game-catalog?includeDisabled=true&limit=100'
        : '/api/game-catalog?limit=100';

      const res = await fetch(queryUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          catalog: this.getGameCatalog(),
          error: parseGameCatalogApiError(
            res.status,
            rawText,
            'Failed to load game catalog from server.',
          ),
        };
      }

      let payload: { games?: unknown[]; catalogPopulated?: boolean };
      try {
        payload = JSON.parse(rawText) as {
          games?: unknown[];
          catalogPopulated?: boolean;
        };
      } catch {
        return {
          success: false,
          catalog: this.getGameCatalog(),
          error: 'Received an unexpected response from game catalog service.',
        };
      }

      if (!Array.isArray(payload?.games)) {
        return {
          success: false,
          catalog: this.getGameCatalog(),
          error: 'Invalid game catalog response payload.',
        };
      }

      const existing = this.getGameCatalog();
      const updated = applyServerGameCatalogResponse({
        games: payload.games,
        catalogPopulated: Boolean(payload.catalogPopulated),
        fallbackSeedCatalog: INITIAL_GAME_CATALOG,
        existingCatalog: existing,
      });

      this.cache[STORAGE_KEYS.GAME_CATALOG] = updated;
      this.saveToLocalStorage(STORAGE_KEYS.GAME_CATALOG, updated);

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.GAME_CATALOG },
          }),
        );
      }

      return {
        success: true,
        catalog: this.getGameCatalog(),
      };
    } catch (err: any) {
      return {
        success: false,
        catalog: this.getGameCatalog(),
        error: err?.message || 'Unable to refresh game catalog from server.',
      };
    }
  }

  public async saveGameCatalogConfig(
    items: GameCatalogItem[],
    _actorId?: string,
    _actorName?: string,
  ): Promise<{ success: boolean; savedCount: number; error?: string }> {
    const normalizedItems = items
      .filter((item) => Boolean(item && item.id))
      .map((item) => {
        const resolvedIcon = resolveGameImageUrl(item.iconUrl || item.imageUrl);
        const resolvedImage = resolveGameImageUrl(item.imageUrl || item.iconUrl);
        const links =
          Array.isArray(item.links) && item.links.length > 0
            ? item.links
                .filter((l) => l && l.label?.trim() && l.url?.trim())
                .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
            : item.gameUrl
              ? [{ label: 'Web Play', url: item.gameUrl }]
              : [];
        const primaryUrl = links[0]?.url || item.gameUrl || null;
        const downloadUrl =
          item.downloadUrl ||
          links.find((l) => l.label.toLowerCase().includes('download'))?.url ||
          links[1]?.url ||
          primaryUrl;

        return {
          id: item.id,
          title: item.title.trim(),
          platform: (item.platform || 'General').trim() || 'General',
          description: item.description ? item.description.trim() : null,
          enabled: item.enabled !== false,
          iconUrl: resolvedIcon || null,
          imageUrl: resolvedImage || null,
          gameUrl: primaryUrl,
          downloadUrl: downloadUrl || null,
          links,
          createdAt: item.createdAt,
        };
      });

    if (normalizedItems.length === 0) {
      return {
        success: false,
        savedCount: 0,
        error: 'Game catalog cannot be empty.',
      };
    }

    try {
      const res = await fetch('/api/game-catalog/config', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ games: normalizedItems }),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          savedCount: 0,
          error: parseGameCatalogApiError(
            res.status,
            rawText,
            'Failed to save game catalog configuration.',
          ),
        };
      }

      let payload: { games?: unknown[]; savedCount?: number };
      try {
        payload = JSON.parse(rawText) as {
          games?: unknown[];
          savedCount?: number;
        };
      } catch {
        return {
          success: false,
          savedCount: 0,
          error: 'Received an unexpected response while saving catalog config.',
        };
      }

      const persisted = Array.isArray(payload?.games)
        ? mergeCatalogFromServerRows(
            payload.games,
            INITIAL_GAME_CATALOG,
            this.getGameCatalog(),
          )
        : this.getGameCatalog();

      this.save(STORAGE_KEYS.GAME_CATALOG, persisted, true);
      void this.fetchAuditLogsFromServer({ limit: 50 }).catch(() => {});

      return {
        success: true,
        savedCount: payload?.savedCount ?? persisted.length,
      };
    } catch (err: any) {
      return {
        success: false,
        savedCount: 0,
        error: err?.message || 'Unexpected error while saving game catalog config.',
      };
    }
  }

  public async saveGameCatalogItemToServer(
    item: Omit<GameCatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    _actorId?: string,
    _actorName?: string,
  ): Promise<{ success: boolean; item?: GameCatalogItem; error?: string }> {
    const list = this.getGameCatalog();
    const existingIndex = item.id ? list.findIndex((g) => g.id === item.id) : -1;
    const resolvedIcon = resolveGameImageUrl(item.iconUrl || item.imageUrl);
    const resolvedImage = resolveGameImageUrl(item.imageUrl || item.iconUrl);
    const cleanLinks = Array.isArray(item.links)
      ? item.links
          .filter((l) => l && l.label?.trim() && l.url?.trim())
          .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      : [];
    const primaryGameUrl = cleanLinks[0]?.url || item.gameUrl || null;
    const downloadUrl =
      item.downloadUrl ||
      cleanLinks.find((l) => l.label.toLowerCase().includes('download'))?.url ||
      cleanLinks[1]?.url ||
      primaryGameUrl;

    const requestBody = {
      ...(item.id ? { id: item.id } : {}),
      title: item.title.trim(),
      platform: (item.platform || 'General').trim() || 'General',
      description: item.description ? item.description.trim() : null,
      enabled: item.enabled !== false,
      iconUrl: resolvedIcon || null,
      imageUrl: resolvedImage || null,
      gameUrl: primaryGameUrl,
      downloadUrl: downloadUrl || null,
      links: cleanLinks,
    };

    const endpoint =
      existingIndex !== -1 && item.id
        ? `/api/game-catalog/${encodeURIComponent(item.id)}`
        : '/api/game-catalog';
    const method = existingIndex !== -1 && item.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          error: parseGameCatalogApiError(
            res.status,
            rawText,
            'Failed to save game to catalog.',
          ),
        };
      }

      let payload: { game?: any };
      try {
        payload = JSON.parse(rawText) as { game?: any };
      } catch {
        return {
          success: false,
          error: 'Received an unexpected response while saving game.',
        };
      }

      if (!payload?.game?.id) {
        return {
          success: false,
          error: 'Server did not return the saved game entry.',
        };
      }

      const savedItem = mapDbRowToGameCatalogItem(
        payload.game,
        INITIAL_GAME_CATALOG,
        list,
      );

      const nextList = [...list];
      const matchIdx = nextList.findIndex((g) => g.id === savedItem.id);
      if (matchIdx === -1) {
        nextList.unshift(savedItem);
      } else {
        nextList[matchIdx] = savedItem;
      }
      this.save(STORAGE_KEYS.GAME_CATALOG, nextList, true);
      void this.fetchAuditLogsFromServer({ limit: 50 }).catch(() => {});

      return { success: true, item: savedItem };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unexpected error saving game to catalog.',
      };
    }
  }

  public saveGameCatalogItem(
    item: Omit<GameCatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    actorId: string,
    actorName: string
  ): GameCatalogItem {
    const list = this.getGameCatalog();
    const existingIndex = item.id ? list.findIndex((g) => g.id === item.id) : -1;
    const now = new Date().toISOString();
    const resolvedIcon = resolveGameImageUrl(item.iconUrl || item.imageUrl);
    const resolvedImage = resolveGameImageUrl(item.imageUrl || item.iconUrl);

    const previewItem: GameCatalogItem =
      existingIndex === -1
        ? {
            ...item,
            platform: (item.platform || 'General').trim() || 'General',
            iconUrl: resolvedIcon,
            imageUrl: resolvedImage,
            enabled: item.enabled !== false,
            id: item.id || `gc_${Date.now()}`,
            createdAt: now,
            updatedAt: now,
          }
        : {
            ...list[existingIndex],
            ...item,
            platform: (item.platform || list[existingIndex].platform || 'General').trim() || 'General',
            iconUrl: resolvedIcon,
            imageUrl: resolvedImage,
            enabled: item.enabled !== false,
            updatedAt: now,
          };

    void this.saveGameCatalogItemToServer(previewItem, actorId, actorName);
    return previewItem;
  }

  public async deleteGameCatalogItem(
    gameId: string,
    _actorId?: string,
    _actorName?: string,
  ): Promise<void> {
    const res = await fetch(`/api/game-catalog/${encodeURIComponent(gameId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(
        parseGameCatalogApiError(
          res.status,
          rawText,
          'Failed to delete game from catalog.',
        ),
      );
    }

    const updated = this.getGameCatalog().filter((g) => g.id !== gameId);
    this.save(STORAGE_KEYS.GAME_CATALOG, updated, true);
    void this.fetchAuditLogsFromServer({ limit: 50 }).catch(() => {});
  }

  /**
   * Enforces the fundamental invariant: A user CANNOT have multiple IDs for the same game.
   * Exactly 1 GameAccount per game per customer.
   * If duplicates exist, merges them:
   * - Consolidates game credit balances so player never loses funds.
   * - Prefers the active account with real credentials.
   * - Replaces duplicate rows with the single canonical account.
   */
  public deduplicateGameAccounts(accounts: GameAccount[]): GameAccount[] {
    return deduplicateGameAccountsList(accounts);
  }

  // Player Game IDs & Credentials (Fixed games, handled by Customer Support)
  public getGameAccounts(customerId?: string): GameAccount[] {
    const rawList = this.load<GameAccount[]>(STORAGE_KEYS.GAME_ACCOUNTS, INITIAL_GAME_ACCOUNTS);
    const cleaned = this.deduplicateGameAccounts(rawList);
    // If raw list had duplicates, self-heal immediately
    if (cleaned.length !== rawList.length) {
      this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = cleaned;
      this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, cleaned);
    }
    if (customerId) return cleaned.filter((g) => g.customerId === customerId);
    return cleaned;
  }

  public getPendingGameRequests(): GameAccount[] {
    const list = this.getGameAccounts();
    return list.filter((g) => g.status === 'pending_assignment' || g.status === 'pending_reset');
  }

  public async requestGameCredentials(params: {
    customerId: string;
    customerName: string;
    gameCatalogId: string;
  }): Promise<{ success: boolean; message: string; account?: GameAccount }> {
    const catalog = this.getGameCatalog();
    const game = catalog.find((g) => g.id === params.gameCatalogId);
    if (!game) return { success: false, message: 'Game title not found in active catalog.' };

    try {
      const res = await fetch('/api/game-accounts/requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCatalogId: game.id,
          gameTitle: game.title,
          platformName: game.platform,
        }),
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Unable to submit Game ID request.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      if (!data.account) {
        return {
          success: false,
          message: 'Server returned an invalid response for Game ID request.',
        };
      }

      this.applyGameAccountRows([data.account], false);
      const savedAccount = this.getGameAccounts(params.customerId).find(
        (a) => a.id === data.account.id || a.gameCatalogId === game.id,
      );

      // Auto dispatch into support chat channel after authoritative server confirmation
      const conv = this.getOrCreateConversationForCustomer(params.customerId, params.customerName);
      this.sendChatMessage({
        conversationId: conv.id,
        senderId: params.customerId,
        senderName: params.customerName,
        senderRole: 'customer',
        text: formatGameIdRequestChatMessage({
          gameTitle: savedAccount?.gameName || game.title,
          platform: savedAccount?.platformName || game.platform,
        }),
        isInternalNote: false,
      });

      this.createNotification({
        userId: params.customerId,
        title: 'Game ID Request Forwarded',
        message: `Your request for ${savedAccount?.gameName || game.title} has been forwarded to customer support specialists.`,
        type: 'game_account',
        linkTab: 'game_accounts',
      });

      return {
        success: true,
        message: data.message || 'Request forwarded to Customer Support specialists.',
        account: savedAccount,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to submit Game ID request.',
      };
    }
  }

  public async requestGamePasswordReset(params: {
    accountId: string;
    customerId: string;
    customerName: string;
  }): Promise<{ success: boolean; message: string; account?: GameAccount }> {
    try {
      const res = await fetch(
        `/api/game-accounts/${encodeURIComponent(params.accountId)}/reset-request`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Unable to submit password reset request.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      if (!data.account) {
        return {
          success: false,
          message: 'Server returned an invalid response for password reset.',
        };
      }

      this.applyGameAccountRows([data.account], false);
      const updated = this.getGameAccounts(params.customerId).find(
        (a) => a.id === params.accountId,
      );

      const conv = this.getOrCreateConversationForCustomer(params.customerId, params.customerName);
      this.sendChatMessage({
        conversationId: conv.id,
        senderId: params.customerId,
        senderName: params.customerName,
        senderRole: 'customer',
        text: formatGamePasswordResetChatMessage({
          gameTitle: updated?.gameName || data.account.gameName || 'Game',
          username: updated?.username || data.account.username || '',
        }),
        isInternalNote: false,
      });

      this.createNotification({
        userId: params.customerId,
        title: 'Credential Reset Request Forwarded',
        message: `Your password reset request for ${updated?.gameName || data.account.gameName} is dispatched to customer care specialists.`,
        type: 'game_account',
        linkTab: 'chat',
      });

      return {
        success: true,
        message: data.message || 'Password reset request dispatched to customer care.',
        account: updated,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to submit password reset request.',
      };
    }
  }

  // Authoritative Provisioning / Updating of a Player's Game Credentials
  // Guarantees: Strictly 1 Game ID per game per user
  public async provisionGameAccount(params: {
    customerId: string;
    customerName?: string;
    gameCatalogId: string;
    gameName?: string;
    platformName?: string;
    gameUrl?: string;
    username: string;
    password?: string;
    notes?: string;
    reviewerId: string;
    reviewerName: string;
    status?: GameAccountStatus;
  }): Promise<{ success: boolean; message: string; account?: GameAccount }> {
    const catalog = this.getGameCatalog();
    const game = catalog.find((g) => g.id === params.gameCatalogId);
    const gameTitle = game?.title || params.gameName || 'Game';
    const platform = game?.platform || params.platformName || 'Sweepstakes';

    try {
      const res = await fetch('/api/game-accounts/provision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: params.customerId,
          gameCatalogId: params.gameCatalogId,
          gameName: gameTitle,
          platformName: platform,
          username: params.username.trim(),
          password: params.password ? params.password.trim() : undefined,
          notes: params.notes?.trim() || undefined,
          status: params.status === 'suspended' ? 'suspended' : 'active',
        }),
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Failed to provision game account.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      if (!data.account) {
        return {
          success: false,
          message: 'Server returned an invalid game account response.',
        };
      }

      this.applyGameAccountRows([data.account], false);
      const targetAccount = this.getGameAccounts(params.customerId).find(
        (a) => a.id === data.account.id || a.gameCatalogId === params.gameCatalogId,
      );

      const conv = this.getOrCreateConversationForCustomer(
        params.customerId,
        params.customerName || this.getUserById(params.customerId)?.displayName || 'Player'
      );
      this.sendChatMessage({
        conversationId: conv.id,
        senderId: params.reviewerId,
        senderName: params.reviewerName,
        senderRole: 'agent',
        text: formatCredentialsReadyChatMessage({
          gameTitle: targetAccount?.gameName || gameTitle,
          username: targetAccount?.username || params.username.trim(),
          password: params.password ? params.password.trim() : undefined,
        }),
        isInternalNote: false,
      });

      this.createNotification({
        userId: params.customerId,
        title: 'Game Credentials Configured',
        message: `Login credentials configured for ${targetAccount?.gameName || gameTitle}. Username: ${targetAccount?.username || params.username.trim()}`,
        type: 'game_account',
        linkTab: 'game_accounts',
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'game_account_provisioned', accountId: data.account.id } }));
      }

      return {
        success: true,
        message:
          data.message ||
          `Successfully provisioned credentials for ${targetAccount?.gameName || gameTitle}. Player notified.`,
        account: targetAccount,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to provision game account.',
      };
    }
  }

  // Customer Support handles assigning / updating credentials
  public async assignOrUpdateGameCredentials(params: {
    accountId: string;
    username: string;
    password: string;
    notes?: string;
    reviewerId: string;
    reviewerName: string;
  }): Promise<{ success: boolean; message: string; account?: GameAccount }> {
    try {
      const res = await fetch(
        `/api/game-accounts/${encodeURIComponent(params.accountId)}/credentials`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: params.username.trim(),
            password: params.password ? params.password.trim() : undefined,
            notes: params.notes?.trim() || undefined,
            status: 'active',
          }),
        },
      );
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Failed to update game credentials.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      if (!data.account) {
        return {
          success: false,
          message: 'Server returned an invalid game credentials response.',
        };
      }

      this.applyGameAccountRows([data.account], false);
      const acc = this.getGameAccounts().find((a) => a.id === params.accountId);
      const customerId = acc?.customerId || data.account.customerId;
      const gameName = acc?.gameName || data.account.gameName || 'Game';
      const username = acc?.username || params.username.trim();
      const password = acc?.password || params.password.trim();

      const conv = this.getOrCreateConversationForCustomer(
        customerId,
        this.getUserById(customerId)?.displayName || 'Player',
      );
      this.sendChatMessage({
        conversationId: conv.id,
        senderId: params.reviewerId,
        senderName: params.reviewerName,
        senderRole: 'agent',
        text: formatCredentialsReadyChatMessage({
          gameTitle: gameName,
          username,
          password,
        }),
        isInternalNote: false,
      });

      this.createNotification({
        userId: customerId,
        title: 'Game Credentials Configured',
        message: `Customer support assigned your login credentials for ${gameName}. Username: ${username}`,
        type: 'game_account',
        linkTab: 'game_accounts',
      });

      if (typeof window !== 'undefined') {
        webPushClient
          .dispatchPushAlert({
            recipientId: customerId,
            recipientRole: 'customer',
            title: '🔑 Game Credentials Assigned!',
            body: `Your login for ${gameName} is ready (Username: ${username}). Tap to view and start playing!`,
            url: '/#games',
            tag: `game_acc_${params.accountId}`,
            actionType: 'game',
          })
          .catch(() => {});
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'game_credentials_assigned', accountId: params.accountId } }));
      }

      return {
        success: true,
        message:
          data.message ||
          `Successfully assigned credentials for ${gameName}. Player notified.`,
        account: acc,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to update game credentials.',
      };
    }
  }

  // Delete a game account
  public async deleteGameAccount(
    accountId: string,
    _actorId?: string,
    _actorName?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`/api/game-accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          message: parseGameAccountApiError(
            res.status,
            rawText,
            'Failed to delete game account.',
          ),
        };
      }

      const data = rawText ? JSON.parse(rawText) : {};
      this.applyGameAccountRows([], false, [accountId]);

      return {
        success: true,
        message: data.message || 'Successfully deleted game account.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to delete game account.',
      };
    }
  }

  // Data Migration for user account ID reconciliation (e.g. Supabase recreation / session matching)
  public migrateUserEntityIds(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) return;
    console.log(`[SwiftSweeps] Migrating user data from old ID ${oldId} to canonical ID ${newId}`);

    // 1. Users
    const users = this.getUsers();
    let usersUpdated = false;
    for (const u of users) {
      if (u.id === oldId) {
        u.id = newId;
        usersUpdated = true;
      }
    }
    if (usersUpdated) {
      this.cache[STORAGE_KEYS.USERS] = users;
      this.saveToLocalStorage(STORAGE_KEYS.USERS, users);
    }

    // 2. Wallets
    const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
    if (wallets[oldId]) {
      wallets[newId] = {
        ...wallets[oldId],
        customerId: newId,
      };
      delete wallets[oldId];
      this.cache[STORAGE_KEYS.WALLETS] = wallets;
      this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
    }

    // 3. Conversations
    const convs = this.getConversations();
    let convsUpdated = false;
    for (const c of convs) {
      if (c.customerId === oldId) {
        c.customerId = newId;
        convsUpdated = true;
      }
    }
    if (convsUpdated) {
      this.cache[STORAGE_KEYS.CONVERSATIONS] = convs;
      this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, convs);
    }

    // 4. Messages
    const msgs = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    let msgsUpdated = false;
    for (const convId of Object.keys(msgs)) {
      for (const m of msgs[convId]) {
        if (m.senderId === oldId) {
          m.senderId = newId;
          msgsUpdated = true;
        }
      }
    }
    if (msgsUpdated) {
      this.cache[STORAGE_KEYS.MESSAGES] = msgs;
      this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, msgs);
    }

    // 5. Game Accounts
    const accounts = this.load<GameAccount[]>(STORAGE_KEYS.GAME_ACCOUNTS, INITIAL_GAME_ACCOUNTS);
    let accountsUpdated = false;
    for (const a of accounts) {
      if (a.customerId === oldId) {
        a.customerId = newId;
        accountsUpdated = true;
      }
    }
    if (accountsUpdated) {
      this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = accounts;
      this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, accounts);
    }

    // 6. Top-Ups & Withdrawals
    const topups = this.load<TopUpRequest[]>(STORAGE_KEYS.TOPUPS, INITIAL_TOPUPS);
    let topupsUpdated = false;
    for (const t of topups) {
      if (t.customerId === oldId) {
        t.customerId = newId;
        topupsUpdated = true;
      }
    }
    if (topupsUpdated) {
      this.cache[STORAGE_KEYS.TOPUPS] = topups;
      this.saveToLocalStorage(STORAGE_KEYS.TOPUPS, topups);
    }

    const withdrawals = this.load<WithdrawalRequest[]>(STORAGE_KEYS.WITHDRAWALS, INITIAL_WITHDRAWALS);
    let wdrUpdated = false;
    for (const w of withdrawals) {
      if (w.customerId === oldId) {
        w.customerId = newId;
        wdrUpdated = true;
      }
    }
    if (wdrUpdated) {
      this.cache[STORAGE_KEYS.WITHDRAWALS] = withdrawals;
      this.saveToLocalStorage(STORAGE_KEYS.WITHDRAWALS, withdrawals);
    }

    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'user_migrated' } }));
  }

  // Real-Time Chat & Customer Support Center (Invariant: Strictly 1 persistent conversation per customer)
  public resolveCanonicalConvId(convId: string): string {
    if (!convId) return '';
    const mapped = this.conversationAliasMap.get(convId);
    if (mapped) return mapped;

    // 1. Direct user ID or email resolution
    const directUser = this.getUserById(convId) || this.getUserByEmail(convId);
    if (directUser) {
      const canonical = `conv_${directUser.id}`;
      this.conversationAliasMap.set(convId, canonical);
      return canonical;
    }

    // 2. Candidate customer ID from conv_ prefix
    if (convId.startsWith('conv_')) {
      const candidateCustId = convId.slice(5);
      const user = this.getUserById(candidateCustId) || this.getUserByEmail(candidateCustId);
      if (user) {
        const canonical = `conv_${user.id}`;
        this.conversationAliasMap.set(convId, canonical);
        return canonical;
      }
      return convId;
    }

    // 3. Search cached conversations
    const convs = this.cache[STORAGE_KEYS.CONVERSATIONS] as SupportConversation[];
    if (Array.isArray(convs)) {
      const found = convs.find(
        (c) => c.id === convId || c.customerId === convId || (c.customerId && `conv_${c.customerId}` === convId)
      );
      if (found && found.customerId) {
        const canonicalId = `conv_${found.customerId}`;
        this.conversationAliasMap.set(convId, canonicalId);
        return canonicalId;
      }
    }
    return convId;
  }

  private getCustomerGroupKey(c: SupportConversation): string {
    if (c.customerId && c.customerId.trim()) {
      return `usr_${c.customerId.trim().toLowerCase()}`;
    }
    const user = this.getUserById(c.customerId) || (c.customerEmail ? this.getUsers().find((u) => u.email.toLowerCase() === c.customerEmail?.toLowerCase()) : undefined);
    if (user) {
      return `usr_${user.id}`;
    }
    if (c.customerEmail && c.customerEmail.trim()) {
      return `email_${c.customerEmail.trim().toLowerCase()}`;
    }
    if (c.customerName && c.customerName.trim()) {
      return `name_${c.customerName.trim().toLowerCase()}`;
    }
    return `conv_${c.id}`;
  }

  public deduplicateAndMergeConversations(rawList?: SupportConversation[]): SupportConversation[] {
    const list = rawList || (this.cache[STORAGE_KEYS.CONVERSATIONS] as SupportConversation[]) || [];
    if (!Array.isArray(list) || list.length === 0) return [];

    const messagesDict = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    let messagesUpdated = false;

    // Group conversations by customer
    const groups = new Map<string, SupportConversation[]>();
    for (const c of list) {
      const key = this.getCustomerGroupKey(c);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(c);
    }

    const deduplicated: SupportConversation[] = [];
    const duplicateIdsToDeleteInDb: string[] = [];
    const messagesToReassignInDb: { fromIds: string[]; toId: string }[] = [];

    for (const [, convs] of groups.entries()) {
      const sampleConv = convs[0];
      const user = this.getUserById(sampleConv.customerId) || (sampleConv.customerEmail ? this.getUsers().find((u) => u.email.toLowerCase() === sampleConv.customerEmail?.toLowerCase()) : undefined);

      // Support agents and administrators must never have customer support tickets
      if (user && (user.role === 'agent' || user.role === 'admin')) {
        const allIds = convs.map((c) => c.id);
        duplicateIdsToDeleteInDb.push(...allIds);
        for (const cid of allIds) {
          delete messagesDict[cid];
        }
        messagesUpdated = true;
        continue;
      }

      // Enforce strictly deterministic canonical ID: conv_${customerId}
      const resolvedCustomerId = user?.id || sampleConv.customerId;
      const canonicalId = resolvedCustomerId ? `conv_${resolvedCustomerId}` : sampleConv.id;

      // Multiple conversations found or non-canonical ID: merge them
      convs.sort((a, b) => {
        const countA = (messagesDict[a.id] || []).length;
        const countB = (messagesDict[b.id] || []).length;
        if (countA !== countB) return countB - countA;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const primary = { ...convs[0] };
      const duplicates = convs.slice(1);
      const dupIds: string[] = [];

      // Collect all messages across canonical and duplicates
      const allMsgs: ChatMessage[] = [];
      const primaryMsgs = messagesDict[primary.id] || [];
      allMsgs.push(...primaryMsgs);
      if (primary.id !== canonicalId) {
        dupIds.push(primary.id);
        this.conversationAliasMap.set(primary.id, canonicalId);
        delete messagesDict[primary.id];
        messagesUpdated = true;
      }

      let maxUnreadStaff = primary.unreadCountStaff || 0;
      let maxUnreadCustomer = primary.unreadCountCustomer || 0;
      let hasOpenStatus = primary.status === 'open';

      for (const dup of duplicates) {
        if (dup.id !== canonicalId) {
          dupIds.push(dup.id);
        }
        this.conversationAliasMap.set(dup.id, canonicalId);

        if (dup.status === 'open') hasOpenStatus = true;
        maxUnreadStaff = Math.max(maxUnreadStaff, dup.unreadCountStaff || 0);
        maxUnreadCustomer = Math.max(maxUnreadCustomer, dup.unreadCountCustomer || 0);
        if (!primary.pinnedMessageId && dup.pinnedMessageId) {
          primary.pinnedMessageId = dup.pinnedMessageId;
          primary.pinnedRulesVersion = dup.pinnedRulesVersion;
          primary.pinnedAt = dup.pinnedAt;
          primary.pinnedById = dup.pinnedById;
          primary.pinnedByName = dup.pinnedByName;
          primary.pinnedMessageText = dup.pinnedMessageText;
        }

        const dupMsgs = messagesDict[dup.id] || [];
        if (dupMsgs.length > 0) {
          allMsgs.push(...dupMsgs);
          delete messagesDict[dup.id];
          messagesUpdated = true;
        }
      }

      // Re-assign all collected messages to canonical ID, deduplicating by id
      const seenMsgIds = new Set<string>();
      const cleanMsgs: ChatMessage[] = [];
      for (const m of allMsgs) {
        if (!seenMsgIds.has(m.id)) {
          seenMsgIds.add(m.id);
          cleanMsgs.push({
            ...m,
            conversationId: canonicalId,
          });
        }
      }
      cleanMsgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      messagesDict[canonicalId] = cleanMsgs;
      messagesUpdated = true;

      // Update canonical conversation attributes
      primary.id = canonicalId;
      if (resolvedCustomerId) primary.customerId = resolvedCustomerId;
      if (user?.displayName) primary.customerName = user.displayName;
      if (user?.email) primary.customerEmail = user.email;
      primary.status = hasOpenStatus ? 'open' : primary.status;
      primary.unreadCountStaff = maxUnreadStaff;
      primary.unreadCountCustomer = maxUnreadCustomer;

      if (cleanMsgs.length > 0) {
        const lastMsg = cleanMsgs[cleanMsgs.length - 1];
        primary.lastMessageText = lastMsg.text || primary.lastMessageText;
        primary.lastMessageTimestamp = lastMsg.createdAt || primary.lastMessageTimestamp;
        primary.updatedAt = lastMsg.createdAt || primary.updatedAt;
      }

      deduplicated.push(primary);
      if (dupIds.length > 0) {
        duplicateIdsToDeleteInDb.push(...dupIds);
        messagesToReassignInDb.push({ fromIds: dupIds, toId: canonicalId });
      }
    }

    if (messagesUpdated) {
      this.cache[STORAGE_KEYS.MESSAGES] = messagesDict;
      this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, messagesDict);
    }

    deduplicated.sort(
      (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
    );

    this.cache[STORAGE_KEYS.CONVERSATIONS] = deduplicated;
    this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, deduplicated);

    return deduplicated;
  }

  public getIsHydrating(): boolean {
    return this.isHydratingSession;
  }

  public getHydrationState(): {
    isHydrating: boolean;
    hydratedUserId: string | null;
    activeUserId: string | null;
    error: string | null;
    isConfigured: boolean;
  } {
    const activeUserId = this.currentUserId || this.getCurrentUser()?.id || null;
    return {
      isHydrating: this.isHydratingSession,
      hydratedUserId: this.lastHydratedUserId,
      activeUserId,
      error: this.lastHydrationError,
      isConfigured: Boolean(supabase && isSupabaseConfigured()),
    };
  }

  public async hydrateForSession(user?: UserProfile, options?: { force?: boolean }): Promise<void> {
    const target = user || this.getCurrentUser();
    if (!target?.id) return;

    // Clear stale cross-user caches whenever switching accounts
    if (this.currentUserId && this.currentUserId !== target.id) {
      this.clearUserScopedCache();
      this.lastHydratedUserId = null;
    }
    this.currentUserId = target.id;

    // Ensure Realtime stream is active for this authenticated session
    if (isSupabaseConfigured() && supabase) {
      if (!this.realtimeChannel) {
        this.initSupabaseRealtimeSync();
      }
    } else if (!this.realtimeStreamUnsub) {
      this.initSelfHostedRealtimeSync();
    }

    // Rebind this device's push subscription strictly to the active logged-in user (all roles)
    if (typeof window !== 'undefined') {
      void webPushClient.autoSyncIfGranted(target).catch(() => {});
    }

    // Deduplicate concurrent hydration bursts for the same user session
    if (this.activeHydrationPromise && this.hydrationUserId === target.id) {
      return this.activeHydrationPromise;
    }

    // Never unmount active screens (e.g. Top-Up file uploaders resuming from mobile gallery)
    // when the exact same user session is already hydrated without error.
    if (
      shouldRunSilentBackgroundRefresh({
        targetUserId: target.id,
        lastHydratedUserId: this.lastHydratedUserId,
        lastHydrationError: this.lastHydrationError,
        force: options?.force,
      })
    ) {
      if (Date.now() - this.lastHydratedAt >= 2500) {
        this.lastHydratedAt = Date.now();
        void this.syncDelta().catch(() => {});
      }
      return;
    }

    this.hydrationUserId = target.id;
    this.isHydratingSession = true;
    this.lastHydrationError = null;
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'hydration_started', userId: target.id } }));

    const run = this.initialCompactLoad()
      .then(() => {
        if (!this.lastHydrationError) {
          this.lastHydratedUserId = target.id;
          this.lastHydratedAt = Date.now();
        }
      })
      .catch((err: any) => {
        this.lastHydrationError = err?.message || 'Unable to sync account data.';
      })
      .finally(() => {
        if (this.activeHydrationPromise === run) {
          this.activeHydrationPromise = null;
        }
        this.isHydratingSession = false;
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'hydration_finished', userId: target.id } }));
      });

    this.activeHydrationPromise = run;
    return run;
  }

  public async fetchConversationsFromServer(options?: {
    status?: TicketStatusValue;
    q?: string;
    limit?: number;
    offset?: number;
    replaceAll?: boolean;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    conversations: SupportConversation[];
    total: number;
    error?: string;
  }> {
    const activeUser = this.getCurrentUser();
    if (!activeUser?.id || typeof fetch !== 'function') {
      return {
        success: false,
        conversations: this.getConversations(),
        total: this.getConversations().length,
      };
    }

    try {
      const limit = Math.min(Math.max(1, options?.limit ?? 50), 200);
      const offset = Math.max(0, options?.offset ?? 0);
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (options?.status) params.set('status', options.status);
      if (options?.q) params.set('q', options.q);

      const res = await fetch(`/api/chat/conversations?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !Array.isArray(data.conversations)) {
        return {
          success: false,
          conversations: this.getConversations(),
          total: this.getConversations().length,
          error:
            typeof data?.error === 'string'
              ? data.error
              : data?.error?.message || `Failed to load conversations (${res.status}).`,
        };
      }

      const replaceAll =
        options?.replaceAll !== undefined
          ? options.replaceAll
          : data.conversations.length < limit && offset === 0;
      this.applyConversationRows(data.conversations, replaceAll);

      if (replaceAll && data.conversations.length === 0) {
        this.cache[STORAGE_KEYS.MESSAGES] = {};
        this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, {});
      }

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'conversations_fetched', count: data.conversations.length },
          }),
        );
      }

      return {
        success: true,
        conversations: this.getConversations(),
        total: Number(data.total ?? data.conversations.length),
      };
    } catch (err: any) {
      return {
        success: false,
        conversations: this.getConversations(),
        total: this.getConversations().length,
        error: err?.message || 'Unable to connect to chat service.',
      };
    }
  }

  public async fetchConversations(): Promise<SupportConversation[]> {
    const res = await this.fetchConversationsFromServer({ limit: 50, replaceAll: true });
    return res.conversations;
  }

  private async ensureConversationOnServer(customerId: string): Promise<void> {
    const cleanId = (customerId || '').trim();
    if (!cleanId || typeof fetch !== 'function') return;
    const activeUser = this.getCurrentUser();
    if (!activeUser?.id) return;
    const canonicalId = `conv_${cleanId}`;
    if (
      this.ensuredServerConversations.has(canonicalId) ||
      this.inFlightEnsureConversations.has(canonicalId)
    ) {
      return;
    }

    this.inFlightEnsureConversations.add(canonicalId);
    try {
      const res = await fetch('/api/chat/conversations/ensure', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ customerId: cleanId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.success && data?.conversation) {
          this.ensuredServerConversations.add(canonicalId);
          this.applyConversationRows([data.conversation], false);
        }
      }
    } catch {
      // Non-blocking background ensure; sendMessage also ensures atomically on server
    } finally {
      this.inFlightEnsureConversations.delete(canonicalId);
    }
  }

  public getConversations(): SupportConversation[] {
    const raw = this.load<SupportConversation[]>(STORAGE_KEYS.CONVERSATIONS, INITIAL_CONVERSATIONS);
    const deduplicated = this.deduplicateAndMergeConversations(raw);
    const currentUser = this.getCurrentUser();
    return deduplicated.filter((c) => {
      const u = this.getUserById(c.customerId) || (c.customerEmail ? this.getUserByEmail(c.customerEmail) : undefined);
      if (u && (u.role === 'agent' || u.role === 'admin')) return false;
      if (currentUser && (currentUser.role === 'agent' || currentUser.role === 'admin')) {
        if (c.customerId === currentUser.id || (c.customerEmail && c.customerEmail.toLowerCase() === currentUser.email?.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }

  public getOrCreateConversationForCustomer(customerId: string, customerName: string): SupportConversation {
    const canonicalId = `conv_${customerId}`;
    const user = this.getUserById(customerId) || this.getUserByEmail(customerId);
    if (user && (user.role === 'agent' || user.role === 'admin')) {
      // Support staff accounts must not have active player support channels
      return {
        id: canonicalId,
        customerId,
        customerName: user.displayName || customerName,
        customerEmail: user.email,
        assignedAgentId: null,
        assignedAgentName: 'Live Support Desk',
        status: 'closed',
        lastMessageText: '',
        lastMessageTimestamp: new Date().toISOString(),
        unreadCountCustomer: 0,
        unreadCountStaff: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const list = this.getConversations();
    const userEmail = user?.email?.toLowerCase();
    const cleanCustomerName = customerName?.trim().toLowerCase();

    // 1. Look strictly by canonical ID
    let conv = list.find((c) => c.id === canonicalId);

    // 2. Look by customerId
    if (!conv) {
      conv = list.find((c) => c.customerId === customerId);
    }

    // 3. Look by email
    if (!conv && userEmail) {
      conv = list.find((c) => c.customerEmail && c.customerEmail.toLowerCase() === userEmail);
    }

    // 4. Look by customer name
    if (!conv && cleanCustomerName) {
      conv = list.find((c) => c.customerName && c.customerName.trim().toLowerCase() === cleanCustomerName);
    }

    if (conv) {
      let needsSave = false;
      if (conv.id !== canonicalId) {
        const oldId = conv.id;
        this.conversationAliasMap.set(oldId, canonicalId);
        conv.id = canonicalId;
        needsSave = true;

        // Migrate local cached messages
        const allMsgs = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
        if (allMsgs[oldId]) {
          const remapped = allMsgs[oldId].map((m) => ({ ...m, conversationId: canonicalId }));
          allMsgs[canonicalId] = [...(allMsgs[canonicalId] || []), ...remapped];
          delete allMsgs[oldId];
          this.cache[STORAGE_KEYS.MESSAGES] = allMsgs;
          this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, allMsgs);
        }
      }

      if (conv.customerId !== customerId) {
        conv.customerId = customerId;
        needsSave = true;
      }
      if (user?.displayName && conv.customerName !== user.displayName) {
        conv.customerName = user.displayName;
        needsSave = true;
      }
      if (user?.email && conv.customerEmail !== user.email) {
        conv.customerEmail = user.email;
        needsSave = true;
      }
      if (needsSave) {
        this.save(STORAGE_KEYS.CONVERSATIONS, list, true);
      }
    }

    if (!conv) {
      conv = {
        id: canonicalId,
        customerId,
        customerName: user?.displayName || customerName,
        customerEmail: user?.email || `${customerId}@user.com`,
        assignedAgentId: null,
        assignedAgentName: 'Live Support Desk',
        status: 'open',
        lastMessageText: '',
        lastMessageTimestamp: new Date().toISOString(),
        unreadCountCustomer: 0,
        unreadCountStaff: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      list.unshift(conv);
      this.save(STORAGE_KEYS.CONVERSATIONS, list, true);
    }

    void this.ensureConversationOnServer(customerId);

    return conv;
  }

  public getMessages(conversationId: string): ChatMessage[] {
    const targetId = this.resolveCanonicalConvId(conversationId);
    const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const combined = [
      ...(targetId && Array.isArray(all[targetId]) ? all[targetId] : []),
      ...(conversationId && conversationId !== targetId && Array.isArray(all[conversationId]) ? all[conversationId] : []),
    ];
    const sorted = sortAndDeduplicateMessages(combined, true);
    const activeUser = this.getCurrentUser();
    return filterVisibleMessagesForRole(sorted, activeUser?.role);
  }

  private updateCachedMessageDelivery(
    targetConvId: string,
    msgId: string,
    updater: (existing: ChatMessage) => ChatMessage
  ): ChatMessage | null {
    const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const list = all[targetConvId] ? [...all[targetConvId]] : [];
    const idx = list.findIndex((m) => m.id === msgId);
    if (idx < 0) return null;
    const updated = updater(list[idx]);
    list[idx] = updated;
    all[targetConvId] = sortAndDeduplicateMessages(list, true);
    this.cache[STORAGE_KEYS.MESSAGES] = all;
    this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, all);
    window.dispatchEvent(
      new CustomEvent('aetherpay_state_changed', {
        detail: { key: 'chat_message', message: updated, conversationId: targetConvId },
      })
    );
    return updated;
  }

  private inFlightMessageDeliveries = new Map<string, Promise<ChatMessage>>();

  private dispatchMessageDelivery(newMsg: ChatMessage, conv?: SupportConversation): Promise<ChatMessage> {
    const existingPromise = this.inFlightMessageDeliveries.get(newMsg.id);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = this.executeMessageDelivery(newMsg, conv).finally(() => {
      this.inFlightMessageDeliveries.delete(newMsg.id);
    });
    this.inFlightMessageDeliveries.set(newMsg.id, promise);
    return promise;
  }

  private async executeMessageDelivery(newMsg: ChatMessage, conv?: SupportConversation): Promise<ChatMessage> {
    const targetConvId = this.resolveCanonicalConvId(newMsg.conversationId || '');
    const customerId =
      conv?.customerId ||
      (newMsg.senderRole === 'customer'
        ? newMsg.senderId
        : targetConvId.startsWith('conv_')
        ? targetConvId.replace(/^conv_/, '')
        : '');

    const normalizedAttachmentUrl = newMsg.attachmentUrl
      ? toProxyStorageUrl(newMsg.attachmentUrl) || newMsg.attachmentUrl
      : undefined;

    const txPayload =
      newMsg.transactionData || normalizedAttachmentUrl || newMsg.attachmentName || newMsg.isInternalNote
        ? {
            ...(newMsg.transactionData || {}),
            ...(normalizedAttachmentUrl
              ? { attachmentUrl: normalizedAttachmentUrl || (newMsg.transactionData as any)?.attachmentUrl }
              : {}),
            ...(newMsg.attachmentName
              ? { attachmentName: newMsg.attachmentName || (newMsg.transactionData as any)?.attachmentName }
              : {}),
            ...(newMsg.isInternalNote ? { isInternalNote: true } : {}),
          }
        : null;

    let confirmedMsg: ChatMessage | null = null;
    let lastErrorMessage = '';

    // Authoritative self-hosted server write (derives senderId & senderRole from session cookie)
    try {
      const sendBody: Record<string, unknown> = {
        id: newMsg.id,
        conversationId: targetConvId,
        text: newMsg.text,
        isInternalNote: Boolean(newMsg.isInternalNote),
        createdAt: newMsg.createdAt,
      };
      if (customerId) sendBody.recipientId = customerId;
      if (normalizedAttachmentUrl) sendBody.attachmentUrl = normalizedAttachmentUrl;
      if (newMsg.attachmentName) sendBody.attachmentName = newMsg.attachmentName;
      if (txPayload) sendBody.transactionData = txPayload;
      if (newMsg.deskLabel) sendBody.deskLabel = newMsg.deskLabel;

      const srvRes = await fetch('/api/chat/send', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(sendBody),
      });

      const srvJson = await srvRes.json().catch(() => ({}));
      if (srvRes.ok && srvJson?.success && srvJson?.message) {
        if (srvJson.conversation) {
          this.applyConversationRows([srvJson.conversation], false);
        }
        const mapped = mapDbMessageRowToChatMessage(srvJson.message, targetConvId);
        confirmedMsg = {
          ...newMsg,
          ...mapped,
          attachmentUrl: mapped.attachmentUrl || normalizedAttachmentUrl,
          attachmentName: mapped.attachmentName || newMsg.attachmentName,
          intentAction: newMsg.intentAction,
          deliveryStatus: 'sent',
          deliveryError: undefined,
        };
      } else {
        lastErrorMessage =
          typeof srvJson?.error === 'string'
            ? srvJson.error
            : srvJson?.error?.message || `Server rejected message (${srvRes.status})`;
      }
    } catch (apiErr: any) {
      lastErrorMessage = apiErr?.message || 'Network error reaching chat server';
      console.warn('[DataService] /api/chat/send notice:', apiErr);
    }

    if (confirmedMsg) {
      const updated =
        this.updateCachedMessageDelivery(targetConvId, newMsg.id, (existing) => ({
          ...existing,
          ...confirmedMsg!,
          deliveryStatus: 'sent',
          deliveryError: undefined,
        })) || confirmedMsg;

      // Instant Web Push Notification
      if (
        !updated.isInternalNote &&
        updated.senderRole !== 'system' &&
        typeof window !== 'undefined'
      ) {
        try {
          const isFromCustomer = updated.senderRole === 'customer';
          const recipientRole = isFromCustomer ? 'agent' : 'customer';
          const recipientId = isFromCustomer
            ? 'staff'
            : conv?.customerId || customerId || '';

          if (recipientId) {
            webPushClient
              .notifyRecipientViaPush({
                recipientId,
                recipientRole,
                senderId: updated.senderId,
                senderName: updated.senderName || 'Support',
                messageText: updated.text || '',
                conversationId: targetConvId,
                messageId: updated.id,
              })
              .catch(() => {});
          }
        } catch {}
      }

      return updated;
    }

    // Fail explicitly in UI cache so user can click Retry rather than silently dropping on reload
    const failed =
      this.updateCachedMessageDelivery(targetConvId, newMsg.id, (existing) => ({
        ...existing,
        deliveryStatus: 'failed',
        deliveryError: lastErrorMessage || 'Message failed to save. Tap retry.',
      })) || {
        ...newMsg,
        deliveryStatus: 'failed' as const,
        deliveryError: lastErrorMessage || 'Message failed to save. Tap retry.',
      };

    return failed;
  }

  public sendChatMessage(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: 'customer' | 'agent' | 'admin' | 'system';
    text: string;
    attachmentUrl?: string;
    attachmentName?: string;
    isInternalNote?: boolean;
    transactionData?: ChatTransactionData;
    deskLabel?: string;
  }): ChatMessage {
    const targetConvId = this.resolveCanonicalConvId(params.conversationId);
    const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    if (!all[targetConvId]) {
      all[targetConvId] = [];
    }

    // Deterministic Intent Parsing
    let intentAction: ChatMessage['intentAction'] = undefined;
    if (params.senderRole === 'customer') {
      const lower = params.text.toLowerCase();
      const numberMatch = lower.match(/(?:\$|\s|^)(\d+(?:\.\d{1,2})?)/);
      const matchedAmount = numberMatch ? parseFloat(numberMatch[1]) : undefined;

      if (lower.includes('withdraw') || lower.includes('cashout') || lower.includes('payout')) {
        intentAction = {
          type: 'open_withdrawal',
          prefilledAmount: matchedAmount,
          title: matchedAmount ? `Start Cashout for $${matchedAmount.toFixed(2)}` : 'Open Cashout Request',
        };
      } else if (lower.includes('topup') || lower.includes('top up') || lower.includes('deposit') || lower.includes('add balance')) {
        intentAction = {
          type: 'open_topup',
          prefilledAmount: matchedAmount,
          title: matchedAmount ? `Top-Up $${matchedAmount.toFixed(2)}` : 'Open Add Balance Form',
        };
      } else if (lower.includes('game') || lower.includes('gaming account') || lower.includes('password') || lower.includes('login')) {
        intentAction = {
          type: 'open_game_account',
          title: 'Manage Gaming Accounts',
        };
      } else if (lower.includes('rule') || lower.includes('policy') || lower.includes('refund') || lower.includes('fee')) {
        intentAction = {
          type: 'view_rules',
          title: 'Review Platform & Refund Policies',
        };
      }
    }

    const nowIso = new Date().toISOString();
    const normalizedParamAttachment = params.attachmentUrl
      ? toProxyStorageUrl(params.attachmentUrl) || params.attachmentUrl
      : undefined;
    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: targetConvId,
      senderId: params.senderId,
      senderName: params.senderName,
      senderRole: params.senderRole,
      text: params.text,
      attachmentUrl: normalizedParamAttachment,
      attachmentName: params.attachmentName,
      isInternalNote: !!params.isInternalNote,
      intentAction,
      transactionData: params.transactionData,
      deskLabel: params.deskLabel,
      createdAt: nowIso,
      isRead: false,
      deliveryStatus: 'sending',
    };

    all[targetConvId] = sortAndDeduplicateMessages([...all[targetConvId], newMsg], true);
    this.cache[STORAGE_KEYS.MESSAGES] = all;
    this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, all);

    // Update conversation summary locally
    const conversations = this.getConversations();
    const conv = conversations.find((c) => c.id === targetConvId);
    if (conv) {
      if (!params.isInternalNote) {
        conv.lastMessageText = params.text || (params.attachmentUrl ? '[Photo Attachment]' : conv.lastMessageText);
        conv.lastMessageTimestamp = nowIso;
      }
      if (params.senderRole === 'customer') {
        conv.unreadCountStaff += 1;
      } else if (!params.isInternalNote) {
        conv.unreadCountCustomer += 1;
      }
      conv.updatedAt = nowIso;
      this.cache[STORAGE_KEYS.CONVERSATIONS] = conversations;
      this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, conversations);
    }

    window.dispatchEvent(
      new CustomEvent('aetherpay_state_changed', {
        detail: { key: 'chat_message', message: newMsg, conversationId: targetConvId },
      })
    );

    void this.dispatchMessageDelivery(newMsg, conv);

    return newMsg;
  }

  public async sendChatMessageConfirmed(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: 'customer' | 'agent' | 'admin' | 'system';
    text: string;
    attachmentUrl?: string;
    attachmentName?: string;
    isInternalNote?: boolean;
    transactionData?: ChatTransactionData;
    deskLabel?: string;
  }): Promise<ChatMessage> {
    const newMsg = this.sendChatMessage(params);
    const inFlight = this.inFlightMessageDeliveries.get(newMsg.id);
    if (inFlight) return inFlight;
    const targetConvId = this.resolveCanonicalConvId(params.conversationId);
    const conv = this.getConversations().find((c) => c.id === targetConvId);
    return this.dispatchMessageDelivery(newMsg, conv);
  }

  public async retryChatMessage(conversationId: string, messageId: string): Promise<ChatMessage | null> {
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    const existing = this.updateCachedMessageDelivery(targetConvId, messageId, (m) => ({
      ...m,
      deliveryStatus: 'sending',
      deliveryError: undefined,
    }));
    if (!existing) return null;
    const conv = this.getConversations().find((c) => c.id === targetConvId);
    return this.dispatchMessageDelivery(existing, conv);
  }

  public appendIncomingMessage(msg: ChatMessage): void {
    if (!msg || !msg.conversationId || !msg.id) return;
    const activeUser = this.getCurrentUser();
    const normalizedCheckMsg: ChatMessage = {
      ...msg,
      isInternalNote: isMessageInternalNote(msg),
    };
    if (!shouldAcceptIncomingChatMessage(normalizedCheckMsg, activeUser)) {
      return;
    }
    const targetConvId = this.resolveCanonicalConvId(msg.conversationId);
    const normalizedMsg: ChatMessage = {
      ...msg,
      conversationId: targetConvId,
      isInternalNote: isMessageInternalNote(msg),
      deliveryStatus: 'sent',
      deliveryError: undefined,
    };

    if (!normalizedMsg.attachmentUrl && (normalizedMsg.transactionData as any)?.attachmentUrl) {
      normalizedMsg.attachmentUrl = (normalizedMsg.transactionData as any).attachmentUrl;
    }
    if (!normalizedMsg.attachmentName && (normalizedMsg.transactionData as any)?.attachmentName) {
      normalizedMsg.attachmentName = (normalizedMsg.transactionData as any).attachmentName;
    }

    const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    const existingList = all[targetConvId] || [];
    const alreadyPresent = existingList.some((m) => m.id === normalizedMsg.id);
    const existingEntry = existingList.find((m) => m.id === normalizedMsg.id);

    all[targetConvId] = sortAndDeduplicateMessages([...existingList, normalizedMsg], true);
    this.cache[STORAGE_KEYS.MESSAGES] = all;
    this.saveToLocalStorage(STORAGE_KEYS.MESSAGES, all);

    if (!alreadyPresent || existingEntry?.deliveryStatus !== 'sent') {
      // Also ensure conversation summary has latest message and increment unread counts when new
      const conversations = this.getConversations();
      const conv = conversations.find((c) => c.id === targetConvId);
      if (conv && !alreadyPresent) {
        const msgTime = Date.parse(normalizedMsg.createdAt || '') || 0;
        const convTime = Date.parse(conv.lastMessageTimestamp || '') || 0;
        if (msgTime >= convTime) {
          if (!normalizedMsg.isInternalNote) {
            conv.lastMessageText = normalizedMsg.text || (normalizedMsg.attachmentUrl ? '[Photo Attachment]' : conv.lastMessageText);
            conv.lastMessageTimestamp = normalizedMsg.createdAt || new Date().toISOString();
          }
          conv.updatedAt = normalizedMsg.createdAt || new Date().toISOString();
        }
        if (normalizedMsg.senderRole === 'customer') {
          conv.unreadCountStaff = (conv.unreadCountStaff || 0) + 1;
        } else if (!normalizedMsg.isInternalNote) {
          conv.unreadCountCustomer = (conv.unreadCountCustomer || 0) + 1;
        }
        this.cache[STORAGE_KEYS.CONVERSATIONS] = conversations;
        this.saveToLocalStorage(STORAGE_KEYS.CONVERSATIONS, conversations);
      }

      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: alreadyPresent ? 'chat_message' : 'chat_incoming', message: normalizedMsg, conversationId: targetConvId },
        })
      );
    }
  }

  private async persistChatTransactionStatusOnServer(params: {
    requestId: string;
    customerId?: string;
    status: 'completed' | 'rejected';
    notes?: string;
    amount?: number;
    bonusAmount?: number;
    finalCredit?: number;
  }): Promise<void> {
    if (typeof fetch !== 'function') return;
    try {
      const res = await fetch('/api/chat/messages/transaction-status', {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          requestId: params.requestId,
          customerId: params.customerId,
          status: params.status,
          ...(params.notes ? { notes: params.notes } : {}),
          ...(params.amount !== undefined ? { amount: params.amount } : {}),
          ...(params.bonusAmount !== undefined ? { bonusAmount: params.bonusAmount } : {}),
          ...(params.finalCredit !== undefined ? { finalCredit: params.finalCredit } : {}),
        }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.success && Array.isArray(json.messages) && json.messages.length > 0) {
          this.applyMessageRows(json.messages, false);
        }
      }
    } catch (e) {
      console.warn('[DataService] Chat transaction card DB sync error:', e);
    }
  }

  public updateChatTransactionStatus(
    requestId: string,
    status: 'completed' | 'rejected',
    reviewerName: string,
    notes?: string,
    updatedValues?: { amount?: number; bonusAmount?: number; finalCredit?: number }
  ): void {
    const all = this.load<Record<string, ChatMessage[]>>(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES);
    let updated = false;
    let targetConvId: string | null = null;
    let txData: ChatTransactionData | null = null;

    for (const convId in all) {
      for (const msg of all[convId]) {
        if (msg.transactionData && msg.transactionData.requestId === requestId) {
          msg.transactionData.status = status;
          msg.transactionData.approvedBy = reviewerName;
          msg.transactionData.approvedAt = new Date().toISOString();
          if (notes) msg.transactionData.notes = notes;
          if (updatedValues) {
            if (updatedValues.amount !== undefined) msg.transactionData.amount = updatedValues.amount;
            if (updatedValues.bonusAmount !== undefined) msg.transactionData.bonusAmount = updatedValues.bonusAmount;
            if (updatedValues.finalCredit !== undefined) msg.transactionData.finalCredit = updatedValues.finalCredit;
          }
          updated = true;
          targetConvId = convId;
          txData = msg.transactionData;
        }
      }
    }

    if (updated) {
      this.save(STORAGE_KEYS.MESSAGES, all, true);
      if (targetConvId && txData) {
        const isCompleted = status === 'completed';
        const actor = this.getCurrentUser();
        const actorRole =
          actor?.role === 'admin' || actor?.role === 'agent' ? actor.role : 'agent';
        this.sendChatMessage({
          conversationId: targetConvId,
          senderId: actor?.id || 'usr_agent_system',
          senderName: 'Customer Support Desk',
          senderRole: actorRole,
          deskLabel: 'Customer Support Desk',
          text: formatTransactionStatusChatMessage({
            transactionType: txData.transactionType === 'topup' ? 'topup' : 'withdrawal',
            status: isCompleted ? 'completed' : 'rejected',
            amount: Number(txData.amount || 0),
            bonusAmount: txData.bonusAmount,
            finalCredit: txData.finalCredit,
            gameName: txData.gameName,
            notes,
          }),
          isInternalNote: false,
        });
      }
    }
  }

  public markConversationRead(conversationId: string, role: 'customer' | 'staff'): void {
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    const conversations = this.getConversations();
    const conv = conversations.find((c) => c.id === targetConvId);
    if (conv) {
      if (role === 'customer') conv.unreadCountCustomer = 0;
      else conv.unreadCountStaff = 0;
      this.save(STORAGE_KEYS.CONVERSATIONS, conversations, true);
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'chat_read', conversationId: targetConvId, role },
        })
      );
    }
  }

  public async updateConversationStatusAsync(
    conversationId: string,
    status: TicketStatusValue
  ): Promise<{ success: boolean; status?: TicketStatusValue; message?: string }> {
    const actingUser = this.getCurrentUser();
    if (!actingUser || (actingUser.role !== 'agent' && actingUser.role !== 'admin')) {
      return { success: false, message: 'Only support staff can update ticket status.' };
    }
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    const normalizedStatus = normalizeTicketStatus(status);
    let persisted = false;
    let errorMessage = '';
    let serverConv: any = null;

    try {
      const res = await fetch('/api/chat/conversation-status', {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          conversationId: targetConvId,
          status: normalizedStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        persisted = true;
        serverConv = json.conversation;
      } else {
        errorMessage =
          typeof json?.error === 'string'
            ? json.error
            : json?.error?.message || `Failed to update status (${res.status})`;
      }
    } catch (err: any) {
      errorMessage = err?.message || 'Network error updating ticket status';
    }

    if (!persisted) {
      return { success: false, message: errorMessage || 'Unable to persist ticket status change.' };
    }

    if (serverConv) {
      this.applyConversationRows([serverConv], false);
    }
    const conversations = this.getConversations();
    const conv = conversations.find((c) => c.id === targetConvId || c.id === conversationId);
    if (conv) {
      conv.status = normalizedStatus;
      conv.updatedAt = new Date().toISOString();
      this.save(STORAGE_KEYS.CONVERSATIONS, conversations, true);
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'conversation_status_updated', conversationId: targetConvId, status: normalizedStatus },
        })
      );
    }

    return { success: true, status: normalizedStatus };
  }

  public applyConversationFromStream(convRow: any): void {
    if (!convRow || !convRow.id) return;
    this.applyConversationRows([convRow], false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: {
            key: 'conversation_pin_updated',
            conversationId: this.resolveCanonicalConvId(String(convRow.id)),
          },
        }),
      );
    }
  }

  public async pinConversationCashoutRulesAsync(
    conversationId: string,
  ): Promise<{
    success: boolean;
    message?: string;
    conversation?: SupportConversation;
    postedMessage?: ChatMessage;
    deduplicated?: boolean;
  }> {
    const actingUser = this.getCurrentUser();
    if (!actingUser || (actingUser.role !== 'agent' && actingUser.role !== 'admin')) {
      return { success: false, message: 'Only support staff can pin cashout rules.' };
    }
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    try {
      const res = await fetch(
        `/api/chat/conversations/${encodeURIComponent(targetConvId)}/pin-cashout-rules`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        return {
          success: false,
          message: extractServerApiError(
            json,
            `Failed to pin cashout rules (${res.status}).`,
          ),
        };
      }
      if (json.message?.id) {
        this.applyMessageRows([json.message], false);
      }
      if (json.conversation) {
        this.applyConversationRows([json.conversation], false);
      }
      const updatedConv = this.getConversations().find(
        (c) => c.id === targetConvId || c.id === conversationId,
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'conversation_pin_updated', conversationId: targetConvId },
          }),
        );
      }
      return {
        success: true,
        conversation: updatedConv,
        postedMessage: json.message
          ? mapDbMessageRowToChatMessage(json.message, targetConvId)
          : undefined,
        deduplicated: Boolean(json.deduplicated),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error pinning cashout rules.',
      };
    }
  }

  public async unpinConversationCashoutRulesAsync(
    conversationId: string,
  ): Promise<{
    success: boolean;
    message?: string;
    conversation?: SupportConversation;
  }> {
    const actingUser = this.getCurrentUser();
    if (!actingUser || (actingUser.role !== 'agent' && actingUser.role !== 'admin')) {
      return { success: false, message: 'Only support staff can unpin cashout rules.' };
    }
    const targetConvId = this.resolveCanonicalConvId(conversationId);
    try {
      const res = await fetch(
        `/api/chat/conversations/${encodeURIComponent(targetConvId)}/pin-cashout-rules`,
        {
          method: 'DELETE',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        return {
          success: false,
          message: extractServerApiError(
            json,
            `Failed to unpin cashout rules (${res.status}).`,
          ),
        };
      }
      if (json.conversation) {
        this.applyConversationRows([json.conversation], false);
      }
      const updatedConv = this.getConversations().find(
        (c) => c.id === targetConvId || c.id === conversationId,
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'conversation_pin_updated', conversationId: targetConvId },
          }),
        );
      }
      return {
        success: true,
        conversation: updatedConv,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error unpinning cashout rules.',
      };
    }
  }

  // Notifications
  private applyNotificationRows(rows: unknown[], replaceForUserId?: string): void {
    const incoming: AppNotification[] = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const id = String(r.id ?? '').trim();
      const userId = String(r.userId ?? r.user_id ?? '').trim();
      if (!id || !userId) continue;
      incoming.push({
        id,
        userId,
        title: String(r.title ?? ''),
        message: String(r.message ?? ''),
        type: String(r.type ?? 'system') as AppNotification['type'],
        isRead: Boolean(r.isRead ?? r.is_read ?? r.read ?? false),
        linkTab: r.linkTab ? String(r.linkTab) : r.link_tab ? String(r.link_tab) : undefined,
        linkRequestId: r.linkRequestId
          ? String(r.linkRequestId)
          : r.link_request_id
            ? String(r.link_request_id)
            : undefined,
        createdAt: String(r.createdAt ?? r.created_at ?? new Date().toISOString()),
      });
    }

    const existing = this.load<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    const base = replaceForUserId
      ? existing.filter((n) => n.userId !== replaceForUserId)
      : existing;
    const byId = new Map<string, AppNotification>();
    for (const item of base) {
      byId.set(item.id, item);
    }
    for (const item of incoming) {
      byId.set(item.id, item);
    }
    const merged = Array.from(byId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    this.save(STORAGE_KEYS.NOTIFICATIONS, merged);
  }

  public async fetchNotificationsFromServer(options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    notifications: AppNotification[];
    total: number;
    unreadCount: number;
    error?: string;
  }> {
    const activeUser = this.getCurrentUser();
    if (!activeUser?.id || typeof fetch !== 'function') {
      return { success: false, notifications: [], total: 0, unreadCount: 0 };
    }

    try {
      const params = new URLSearchParams();
      if (options?.unreadOnly) params.set('unreadOnly', 'true');
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.offset !== undefined) params.set('offset', String(options.offset));
      const query = params.toString();
      const url = query ? `/api/notifications?${query}` : '/api/notifications';

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const rawText = await res.text();
      if (!res.ok) {
        let errMsg = `Failed to load notifications (HTTP ${res.status}).`;
        try {
          const errJson = JSON.parse(rawText);
          errMsg = errJson?.error?.message || errJson?.error || errMsg;
        } catch {}
        return {
          success: false,
          notifications: this.getNotifications(activeUser.id),
          total: 0,
          unreadCount: 0,
          error: errMsg,
        };
      }

      const payload = rawText ? (JSON.parse(rawText) as {
        notifications?: unknown[];
        total?: number;
        unreadCount?: number;
      }) : {};
      const rows = Array.isArray(payload.notifications) ? payload.notifications : [];
      this.applyNotificationRows(
        rows,
        (options?.offset ?? 0) === 0 && !options?.unreadOnly ? activeUser.id : undefined,
      );

      if (!options?.silentEvent && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.NOTIFICATIONS },
          }),
        );
      }

      const list = this.getNotifications(activeUser.id);
      return {
        success: true,
        notifications: list,
        total: Number(payload.total ?? list.length),
        unreadCount: Number(
          payload.unreadCount ?? list.filter((n) => !n.isRead).length,
        ),
      };
    } catch (err: any) {
      return {
        success: false,
        notifications: this.getNotifications(activeUser.id),
        total: 0,
        unreadCount: 0,
        error: err?.message || 'Unable to load notifications.',
      };
    }
  }

  public getNotifications(userId: string): AppNotification[] {
    const list = this.load<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    return list
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public createNotification(
    params: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>,
  ): AppNotification {
    const list = this.load<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    const nowMs = Date.now();
    const existing = list.find(
      (n) =>
        n.userId === params.userId &&
        n.type === params.type &&
        n.title === params.title &&
        ((params.linkRequestId && n.linkRequestId === params.linkRequestId) ||
          (!params.linkRequestId &&
            n.message === params.message &&
            Math.abs(nowMs - Date.parse(n.createdAt || '')) < 15000)),
    );
    if (existing) {
      return existing;
    }
    const optimisticId = `notif_${nowMs}_${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: AppNotification = {
      ...params,
      id: optimisticId,
      createdAt: new Date(nowMs).toISOString(),
      isRead: false,
    };
    list.unshift(newNotif);
    this.save(STORAGE_KEYS.NOTIFICATIONS, list);

    if (typeof fetch === 'function' && selfHostedAuthService.getCurrentUser()?.id) {
      void fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          userId: params.userId,
          title: params.title,
          message: params.message,
          type: params.type,
          linkTab: params.linkTab,
          linkRequestId: params.linkRequestId,
        }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const json = (await res.json().catch(() => null)) as {
            notification?: Record<string, unknown>;
          } | null;
          const serverNotif = json?.notification;
          if (!serverNotif?.id) return;
          const current = this.load<AppNotification[]>(
            STORAGE_KEYS.NOTIFICATIONS,
            INITIAL_NOTIFICATIONS,
          );
          const filtered = current.filter((item) => item.id !== optimisticId);
          this.save(STORAGE_KEYS.NOTIFICATIONS, filtered);
          this.applyNotificationRows([serverNotif]);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('aetherpay_state_changed', {
                detail: { key: STORAGE_KEYS.NOTIFICATIONS },
              }),
            );
          }
        })
        .catch(() => {});
    }

    return newNotif;
  }

  public markNotificationAsRead(notifId: string): void {
    const list = this.load<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    const item = list.find((n) => n.id === notifId);
    if (item) {
      item.isRead = true;
      this.save(STORAGE_KEYS.NOTIFICATIONS, list);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.NOTIFICATIONS },
          }),
        );
      }
    }

    if (typeof fetch === 'function' && notifId && selfHostedAuthService.getCurrentUser()?.id) {
      void fetch(`/api/notifications/${encodeURIComponent(notifId)}/read`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({}),
      }).catch(() => {});
    }
  }

  public markAllNotificationsAsRead(userId: string): void {
    const list = this.load<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    list.forEach((n) => {
      if (n.userId === userId) n.isRead = true;
    });
    this.save(STORAGE_KEYS.NOTIFICATIONS, list);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: STORAGE_KEYS.NOTIFICATIONS },
        }),
      );
    }

    const activeUser = selfHostedAuthService.getCurrentUser();
    if (typeof fetch === 'function' && activeUser?.id && activeUser.id === userId) {
      void fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }
  }

  // Referral Program & Server-Enforced Referral Engine
  public getBrowserDeviceFingerprint(): string {
    if (typeof window === 'undefined') return '';
    try {
      const existing = localStorage.getItem('ss_device_fp');
      if (existing && existing.length >= 8) return existing;
      const raw = [
        navigator.userAgent || '',
        navigator.language || '',
        String(screen?.width || 0),
        String(screen?.height || 0),
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      ].join('|');
      let hash = 2166136261;
      for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const fp = `fp_${(hash >>> 0).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('ss_device_fp', fp);
      return fp;
    } catch {
      return '';
    }
  }

  public getReferralSummary(userId: string): ReferralSummary {
    const user = this.getUserById(userId);
    const config = this.getAppConfig();
    const refCfg = normalizeReferralConfig(config.referralProgram);
    const allUsers = this.getUsers();
    const allTopups = this.getTopUpRequests();
    const allTxs = this.getTransactions();

    const referralCode = user?.referralCode || `REF_${userId.slice(-5).toUpperCase()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const referralLink = origin ? `${origin}/signup?ref=${referralCode}` : `/signup?ref=${referralCode}`;

    const referredUsersList = allUsers.filter(
      (u) => normalizeReferralCodeInput(u.referredBy) === normalizeReferralCodeInput(referralCode)
    );

    const referredSummaryUsers = referredUsersList.map((ru) => {
      const realCashDeposits = allTopups
        .filter(
          (t) =>
            t.customerId === ru.id &&
            (t.status === 'completed' || t.status === 'approved') &&
            t.method !== ('referral_bonus' as any)
        )
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const isEmailVerified = Boolean(ru.emailVerified);
      const hasRealDepositMet = realCashDeposits >= refCfg.qualificationDepositMin;
      const matchedTx = allTxs.find(
        (t) =>
          t.customerId === userId &&
          t.type === 'referral_reward' &&
          String(t.status || '').toLowerCase() === 'completed' &&
          (t.referenceId === `refaw_${ru.id}` ||
            t.relatedRequestId === `refaw_${ru.id}` ||
            t.description.includes(ru.displayName))
      );
      const hasEarnedReward = Boolean(matchedTx);

      const status = hasEarnedReward
        ? 'rewarded'
        : isEmailVerified
        ? 'pending_deposit'
        : 'registered';

      return {
        id: ru.id,
        displayName: ru.displayName,
        joinedAt: ru.createdAt,
        status,
        depositTotal: Number(realCashDeposits.toFixed(2)),
        rewardEarned: matchedTx ? Number(Number(matchedTx.amount || 0).toFixed(2)) : 0,
        emailVerified: isEmailVerified,
        hasRealDepositMet,
      };
    });

    const totalRewardsEarned = referredSummaryUsers.reduce((sum, u) => sum + u.rewardEarned, 0);

    // Local fallback Welcome Bonus snapshot for referred user
    const hasReferrer = Boolean(user?.referredBy && String(user.referredBy).trim() !== '');
    const myRealCashDeposits = allTopups
      .filter(
        (t) =>
          t.customerId === userId &&
          (t.status === 'completed' || t.status === 'approved') &&
          t.method !== ('referral_bonus' as any)
      )
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const welcomeTx = allTxs.find(
      (t) =>
        t.customerId === userId &&
        t.type === 'referral_reward' &&
        String(t.status || '').toLowerCase() === 'completed' &&
        (t.id.startsWith('tx_ref_f_') ||
          t.referenceId === `refaw_${userId}` ||
          t.relatedRequestId === `refaw_${userId}` ||
          String(t.description || '').toLowerCase().includes('welcome'))
    );
    const expectedWelcome = hasReferrer
      ? calculateReferralPayouts(
          refCfg,
          myRealCashDeposits > 0 ? myRealCashDeposits : refCfg.qualificationDepositMin
        ).refereeAmount
      : 0;
    const referrerUser = hasReferrer
      ? allUsers.find(
          (u) => normalizeReferralCodeInput(u.referralCode) === normalizeReferralCodeInput(user?.referredBy)
        )
      : undefined;

    return {
      referralCode,
      referralLink,
      totalReferred: referredUsersList.length,
      activeReferred: referredSummaryUsers.filter((u) => u.status === 'rewarded').length,
      totalRewardsEarned: Number(totalRewardsEarned.toFixed(2)),
      pendingRewards: 0,
      heldRewardsCount: 0,
      rewardMode: refCfg.rewardMode,
      referrerRewardValue: refCfg.referrerRewardValue,
      refereeRewardValue: refCfg.refereeRewardValue,
      rewardPerReferral: refCfg.referrerRewardValue,
      qualifyingDepositMin: refCfg.qualificationDepositMin,
      payoutTarget: refCfg.payoutTarget,
      maxReferralsPerUser: refCfg.maxReferralsPerUser,
      programEnabled: refCfg.enabled,
      referredUsers: referredSummaryUsers,
      welcomeBonus: hasReferrer
        ? {
            hasReferrer: true,
            awardId: `refaw_${userId}`,
            referrerId: referrerUser?.id,
            referrerName: referrerUser?.displayName,
            referralCodeUsed: user?.referredBy,
            status: welcomeTx
              ? 'rewarded'
              : myRealCashDeposits >= refCfg.qualificationDepositMin && Boolean(user?.emailVerified)
              ? 'processing'
              : 'pending',
            expectedAmount: expectedWelcome,
            creditedAmount: welcomeTx ? Number(Number(welcomeTx.amount || 0).toFixed(2)) : 0,
            depositTotal: Number(myRealCashDeposits.toFixed(2)),
            qualifyingDepositMin: refCfg.qualificationDepositMin,
            payoutTarget: refCfg.payoutTarget,
            txId: welcomeTx?.id,
            rewardedAt: welcomeTx?.createdAt,
          }
        : undefined,
    };
  }

  public checkAndAwardReferral(customerId: string, _newDepositAmount: number = 0): void {
    if (!customerId) return;
    // Always invoke authoritative server evaluation so staff-approved or payment-link deposits
    // reconcile cumulative deposits and awards without relying on local user cache.
    void this.triggerServerReferralEvaluation(customerId);
  }

  public async attributeSignupReferral(params: {
    refereeId: string;
    referralCode?: string;
    accessToken?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await this.buildAuditAuthHeaders(false);
      if (params.accessToken) {
        headers['x-supabase-token'] = params.accessToken;
      }
      const fp = this.getBrowserDeviceFingerprint();
      if (fp) headers['x-device-fingerprint'] = fp;

      const res = await fetch('/api/referrals/attribute', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          refereeId: params.refereeId,
          referralCode: params.referralCode ? normalizeReferralCodeInput(params.referralCode) : undefined,
          deviceFingerprint: fp || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          error: extractServerApiError(json, `Attribution failed (${res.status})`),
        };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Attribution request failed' };
    }
  }

  public async triggerServerReferralEvaluation(refereeId?: string): Promise<void> {
    try {
      const targetId = refereeId || this.getCurrentUser()?.id;
      if (!targetId) return;
      const fp = this.getBrowserDeviceFingerprint();

      const attempt = await this.fetchWithAuthTokenRetry('/api/referrals/evaluate', (headers) => ({
        method: 'POST',
        headers: {
          ...headers,
          ...(fp ? { 'x-device-fingerprint': fp } : {}),
        },
        body: JSON.stringify({ refereeId: targetId }),
      }));
      const res = attempt.response;
      const json = attempt.json || {};
      if (res?.ok) {
        if (json?.status === 'rewarded' || json?.depositSynced || json?.reconciled) {
          await this.syncDelta().catch(() => {});
          window.dispatchEvent(
            new CustomEvent('aetherpay_state_changed', {
              detail: { key: 'referrals_updated', status: json?.status },
            })
          );
          if (json?.status === 'rewarded' || json?.reconciled) {
            window.dispatchEvent(
              new CustomEvent('aetherpay_state_changed', {
                detail: { key: 'wallet_updated', tables: ['wallets', 'transactions'] },
              })
            );
          }
        }
      }
    } catch {
      // Non-blocking server evaluation
    }
  }

  public async reconcileReferralRewards(userId?: string): Promise<{
    success: boolean;
    checkedAwards?: number;
    reconciledAwards?: number;
    creditedLegs?: number;
    totalCreditedAmount?: number;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const targetUserId = userId || activeUser?.id;
      const attempt = await this.fetchWithAuthTokenRetry('/api/referrals/reconcile', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: targetUserId }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Reconciliation failed (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      if ((json.reconciledAwards || 0) > 0 || (json.creditedLegs || 0) > 0) {
        void this.syncDelta();
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'referrals_updated' } }));
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'wallet_updated', tables: ['wallets', 'transactions'] },
          })
        );
      }
      return {
        success: true,
        checkedAwards: Number(json.checkedAwards || json.scanned || 0),
        reconciledAwards: Number(json.reconciledAwards || json.reconciledCount || 0),
        creditedLegs: Number(json.creditedLegs || 0),
        totalCreditedAmount: Number(json.totalCreditedAmount || 0),
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unable to reconcile referral rewards' };
    }
  }

  public async fetchReferralSummaryFromServer(
    userId?: string
  ): Promise<{ success: boolean; summary?: ReferralSummary; error?: string; code?: string; requiresReauth?: boolean }> {
    try {
      const targetId = userId || this.getCurrentUser()?.id || '';
      const params = new URLSearchParams();
      if (targetId) params.set('userId', targetId);
      const attempt = await this.fetchWithAuthTokenRetry(`/api/referrals/summary?${params.toString()}`, (headers) => ({
        cache: 'no-store',
        headers,
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.summary) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to load referral summary (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }

      const summary = json.summary as ReferralSummary;
      const activeUserId = this.getCurrentUser()?.id;
      if (targetId && activeUserId && targetId === activeUserId) {
        let needsDeltaSync = false;
        const sb = summary.walletBalances;
        if (sb && typeof sb.availableBalance === 'number' && typeof sb.referralBonusBalance === 'number') {
          const wallets = { ...this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS) };
          const curW = wallets[targetId];
          const curAvail = Number(curW?.availableBalance ?? 0);
          const curRefBonus = Number(curW?.referralBonusBalance ?? 0);
          if (!curW || Math.abs(curAvail - sb.availableBalance) > 0.005 || Math.abs(curRefBonus - sb.referralBonusBalance) > 0.005) {
            wallets[targetId] = {
              ...(curW || {
                customerId: targetId,
                currency: 'USD',
                availableBalance: 0,
                referralBonusBalance: 0,
                reservedBalance: 0,
                pendingDepositBalance: 0,
              }),
              availableBalance: sb.availableBalance,
              referralBonusBalance: sb.referralBonusBalance,
              lastUpdatedAt: new Date().toISOString(),
            };
            this.cache[STORAGE_KEYS.WALLETS] = wallets;
            this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
            window.dispatchEvent(
              new CustomEvent('aetherpay_state_changed', {
                detail: { key: 'wallet_updated', tables: ['wallets'] },
              })
            );
            needsDeltaSync = true;
          }
        }

        const welcomeTxId = summary.welcomeBonus?.txId;
        if (
          summary.welcomeBonus?.status === 'rewarded' &&
          welcomeTxId &&
          !this.getTransactions(targetId).some((t) => t.id === welcomeTxId)
        ) {
          needsDeltaSync = true;
        }

        if (needsDeltaSync) {
          void this.syncDelta();
        }
      }

      return { success: true, summary };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unable to load referral summary' };
    }
  }

  public async fetchAdminReferralLedger(params?: {
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    awards: ReferralLedgerEntry[];
    topReferrers: TopReferrerEntry[];
    stats?: any;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.search) q.set('search', params.search);
      if (params?.limit) q.set('limit', String(params.limit));
      const activeId = this.getCurrentUser()?.id;
      if (activeId) q.set('userId', activeId);

      const attempt = await this.fetchWithAuthTokenRetry(`/api/referrals/admin-ledger?${q.toString()}`, (headers) => ({
        cache: 'no-store',
        headers,
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          awards: [],
          topReferrers: [],
          error: extractServerApiError(
            json,
            `Failed to load referral ledger (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      return {
        success: true,
        awards: Array.isArray(json.awards) ? json.awards : [],
        topReferrers: Array.isArray(json.topReferrers) ? json.topReferrers : [],
        stats: json.stats,
      };
    } catch (err: any) {
      return {
        success: false,
        awards: [],
        topReferrers: [],
        error: err?.message || 'Network error loading referral ledger',
      };
    }
  }

  public async manualAssignReferral(params: {
    refereeId: string;
    referrerQuery: string;
    mode: 'link_only' | 'link_and_reward';
    reason?: string;
  }): Promise<{
    success: boolean;
    message?: string;
    status?: string;
    award?: ReferralLedgerEntry;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const attempt = await this.fetchWithAuthTokenRetry('/api/referrals/manual-assign', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...params,
          actingUserId: activeUser?.id,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Manual assignment failed (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'referrals_updated' } }));
      return {
        success: true,
        message: json.message,
        status: json.status,
        award: json.award,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to assign referral' };
    }
  }

  public async setVanityReferralCode(params: {
    userId: string;
    vanityCode: string;
  }): Promise<{
    success: boolean;
    referralCode?: string;
    message?: string;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const attempt = await this.fetchWithAuthTokenRetry('/api/referrals/vanity-code', (headers) => ({
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          userId: params.userId,
          vanityCode: normalizeReferralCodeInput(params.vanityCode),
          actingUserId: activeUser?.id,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to save vanity code (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'referrals_updated' } }));
      return {
        success: true,
        referralCode: json.referralCode,
        message: json.message,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save vanity code' };
    }
  }

  public async reviewHeldReferral(params: {
    awardId: string;
    decision: 'approve' | 'reject';
    reviewNotes?: string;
  }): Promise<{
    success: boolean;
    status?: string;
    message?: string;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const attempt = await this.fetchWithAuthTokenRetry('/api/referrals/review', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...params,
          actingUserId: activeUser?.id,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Review failed (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'referrals_updated' } }));
      return {
        success: true,
        status: json.status,
        message: json.message,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to review referral' };
    }
  }

  public async saveReferralProgramSettings(
    referralProgram: ReferralProgramConfig
  ): Promise<{
    success: boolean;
    referralProgram?: ReferralProgramConfig;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const normalized = normalizeReferralConfig(referralProgram);
      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/referral-config', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          referralProgram: normalized,
          actingUserId: activeUser?.id,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to save referral settings (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      const current = this.getAppConfig();
      const nextCfg: AppConfig = {
        ...current,
        referralProgram: normalizeReferralConfig(json.referralProgram || normalized),
      };
      this.cache[STORAGE_KEYS.CONFIG] = nextCfg;
      this.saveToLocalStorage(STORAGE_KEYS.CONFIG, nextCfg);
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.CONFIG } }));
      return { success: true, referralProgram: nextCfg.referralProgram };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save referral settings' };
    }
  }

  // Wheel of Luck Free-Play Reward & Game Credit Transfers (Server-Enforced)
  public async fetchWheelStatusFromServer(
    userId?: string
  ): Promise<{
    success: boolean;
    status?: WheelStatusResponse;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const targetId = userId || this.getCurrentUser()?.id || '';
      const params = new URLSearchParams();
      if (targetId) params.set('userId', targetId);
      const queryStr = params.toString();
      const primaryUrl = `/api/wheel/status${queryStr ? `?${queryStr}` : ''}`;

      const attempt = await this.fetchWithAuthTokenRetry(primaryUrl, (headers) => ({
        cache: 'no-store',
        headers,
      }));

      const json = attempt.json;
      if (!attempt.response?.ok) {
        return {
          success: false,
          error: formatWheelHttpError({
            actionLabel: 'Wheel of Luck status',
            status: attempt.response?.status,
            json,
            contentType: attempt.contentType,
            rawText: attempt.rawText,
          }),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      if (!json || typeof json !== 'object') {
        return {
          success: false,
          error: formatWheelHttpError({
            actionLabel: 'Wheel of Luck status',
            status: attempt.response?.status,
            json,
            contentType: attempt.contentType,
            rawText: attempt.rawText,
          }),
          code: 'INVALID_WHEEL_RESPONSE',
        };
      }
      if (json.online === true && !json.eligibility) {
        return {
          success: false,
          error: formatWheelHttpError({
            actionLabel: 'Wheel of Luck status',
            status: attempt.response?.status,
            json,
            contentType: attempt.contentType,
            rawText: attempt.rawText,
          }),
          code: 'WHEEL_ROUTE_MISROUTED',
        };
      }
      if (!json.eligibility || typeof json.eligibility !== 'object') {
        return {
          success: false,
          error: formatWheelHttpError({
            actionLabel: 'Wheel of Luck status',
            status: attempt.response?.status,
            json,
            contentType: attempt.contentType,
            rawText: attempt.rawText,
          }),
          code: json?.code || 'MISSING_ELIGIBILITY',
          requiresReauth: attempt.requiresReauth,
        };
      }

      const status: WheelStatusResponse = {
        config: normalizeWheelConfig(json.config),
        eligibility: json.eligibility as WheelEligibilityState,
        freePlayBalance: Number(json.freePlayBalance ?? 0),
        availableBalance: Number(json.availableBalance ?? 0),
        referralBonusBalance: Number(json.referralBonusBalance ?? 0),
        recentSpins: Array.isArray(json.recentSpins) ? json.recentSpins : [],
        latestSpin: json.latestSpin || null,
      };

      const activeUserId = this.getCurrentUser()?.id;
      if (targetId && activeUserId && targetId === activeUserId) {
        const wallets = { ...this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS) };
        const curW = wallets[targetId] || this.getWallet(targetId);
        if (
          Math.abs(Number(curW.freePlayBalance ?? 0) - status.freePlayBalance) > 0.005 ||
          Math.abs(Number(curW.availableBalance ?? 0) - status.availableBalance) > 0.005 ||
          Math.abs(Number(curW.referralBonusBalance ?? 0) - status.referralBonusBalance) > 0.005
        ) {
          wallets[targetId] = {
            ...curW,
            freePlayBalance: status.freePlayBalance,
            availableBalance: status.availableBalance,
            referralBonusBalance: status.referralBonusBalance,
            lastUpdatedAt: new Date().toISOString(),
          };
          this.cache[STORAGE_KEYS.WALLETS] = wallets;
          this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
          window.dispatchEvent(
            new CustomEvent('aetherpay_state_changed', {
              detail: { key: 'wallet_updated', tables: ['wallets'] },
            })
          );
        }
      }

      return { success: true, status };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unable to load Wheel of Luck status.' };
    }
  }

  public async spinWheelOfLuck(
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    data?: WheelSpinResponse;
    eligibility?: WheelEligibilityState;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const spinBody = JSON.stringify({
        userId: activeUser?.id,
        idempotencyKey: idempotencyKey || `wspin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      });
      const attempt = await this.fetchWithAuthTokenRetry('/api/wheel/spin', (headers) => ({
        method: 'POST',
        headers,
        body: spinBody,
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          error: formatWheelHttpError({
            actionLabel: 'Wheel spin',
            status: attempt.response?.status,
            json: attempt.json,
            contentType: attempt.contentType,
            rawText: attempt.rawText,
          }),
          code: extractServerApiCode(json),
          eligibility: json?.eligibility,
          requiresReauth: attempt.requiresReauth,
        };
      }

      const data = json as WheelSpinResponse;
      if (activeUser?.id) {
        const wallets = { ...this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS) };
        const curW = wallets[activeUser.id] || this.getWallet(activeUser.id);
        wallets[activeUser.id] = {
          ...curW,
          freePlayBalance: Number(data.freePlayBalance ?? curW.freePlayBalance ?? 0),
          availableBalance: Number(data.availableBalance ?? curW.availableBalance ?? 0),
          referralBonusBalance: Number(data.referralBonusBalance ?? curW.referralBonusBalance ?? 0),
          lastUpdatedAt: new Date().toISOString(),
        };
        this.cache[STORAGE_KEYS.WALLETS] = wallets;
        this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: 'wheel_spin_claimed', tables: ['wallets', 'wheel_spins', 'transactions'] },
          })
        );
        void this.syncDelta();
      }

      return { success: true, data, eligibility: data.eligibility };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unable to spin Wheel of Luck.' };
    }
  }

  public async saveWheelOfLuckConfig(
    wheelOfLuck: WheelOfLuckConfig
  ): Promise<{
    success: boolean;
    wheelOfLuck?: WheelOfLuckConfig;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const normalized = normalizeWheelConfig(wheelOfLuck);
      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/wheel-config', (headers) => ({
        method: 'POST',
        headers: {
          ...headers,
          'x-api-route': '/api/admin/wheel-config',
        },
        body: JSON.stringify({
          wheelOfLuck: normalized,
          actingUserId: activeUser?.id,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to save Wheel of Luck settings (${attempt.response?.status || 401})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }
      const current = this.getAppConfig();
      const nextCfg: AppConfig = {
        ...current,
        wheelOfLuck: normalizeWheelConfig(json.wheelOfLuck || normalized),
      };
      this.cache[STORAGE_KEYS.CONFIG] = nextCfg;
      this.saveToLocalStorage(STORAGE_KEYS.CONFIG, nextCfg);
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.CONFIG } }));
      return { success: true, wheelOfLuck: nextCfg.wheelOfLuck };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save Wheel of Luck settings.' };
    }
  }

  public async transferGameCreditsAsync(params: {
    gameAccountId?: string;
    gameCatalogId?: string;
    direction: 'load' | 'unload';
    source?: 'free_play' | 'referral_bonus' | 'wallet_cash';
    amount: number;
  }): Promise<{
    success: boolean;
    message: string;
    freePlayReturn?: number;
    cashReturn?: number;
    wallet?: { availableBalance: number; referralBonusBalance: number; freePlayBalance: number };
    gameAccount?: GameAccount;
    staffMessage?: ChatMessage;
    staffNotificationDelivered?: boolean;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const activeUser = this.getCurrentUser();
      const attempt = await this.fetchWithAuthTokenRetry('/api/game-accounts/transfer', (headers) => ({
        method: 'POST',
        headers: {
          ...headers,
          'x-api-route': '/api/game-accounts/transfer',
        },
        body: JSON.stringify({
          userId: activeUser?.id,
          gameAccountId: params.gameAccountId,
          gameCatalogId: params.gameCatalogId,
          direction: params.direction,
          source: params.source || 'wallet_cash',
          amount: params.amount,
        }),
      }));
      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          message: extractServerApiError(
            json,
            `Game credit transfer failed (${attempt.response?.status || 500})`,
          ),
          code: extractServerApiCode(json),
          requiresReauth: attempt.requiresReauth,
        };
      }

      if (activeUser?.id && json.wallet) {
        const wallets = { ...this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS) };
        const curW = wallets[activeUser.id] || this.getWallet(activeUser.id);
        wallets[activeUser.id] = {
          ...curW,
          availableBalance: Number(json.wallet.availableBalance ?? curW.availableBalance ?? 0),
          referralBonusBalance: Number(json.wallet.referralBonusBalance ?? curW.referralBonusBalance ?? 0),
          freePlayBalance: Number(json.wallet.freePlayBalance ?? curW.freePlayBalance ?? 0),
          lastUpdatedAt: new Date().toISOString(),
        };
        this.cache[STORAGE_KEYS.WALLETS] = wallets;
        this.saveToLocalStorage(STORAGE_KEYS.WALLETS, wallets);
      }

      let updatedAccount: GameAccount | undefined;
      if (json.gameAccount?.id) {
        const allAccounts = [...this.getGameAccounts()];
        const idx = allAccounts.findIndex((a) => a.id === json.gameAccount.id);
        if (idx !== -1) {
          updatedAccount = {
            ...allAccounts[idx],
            balance: Number(json.gameAccount.balance ?? allAccounts[idx].balance ?? 0),
            freePlayBalance: Number(json.gameAccount.freePlayBalance ?? allAccounts[idx].freePlayBalance ?? 0),
            updatedAt: new Date().toISOString(),
          };
          allAccounts[idx] = updatedAccount;
          this.cache[STORAGE_KEYS.GAME_ACCOUNTS] = allAccounts;
          this.saveToLocalStorage(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
        }
      }

      let staffMessage: ChatMessage | undefined;
      if (json.staffMessage && json.staffMessage.id) {
        const targetConvId = this.resolveCanonicalConvId(
          json.staffMessage.conversation_id ||
            json.staffMessage.conversationId ||
            (activeUser?.id ? `conv_${activeUser.id}` : '')
        );
        if (targetConvId && activeUser?.id) {
          this.getOrCreateConversationForCustomer(activeUser.id, activeUser.displayName || 'Customer');
        }
        const mappedMsg = mapDbMessageRowToChatMessage(json.staffMessage, targetConvId || undefined);
        staffMessage = mappedMsg;
        this.appendIncomingMessage(mappedMsg);

        if (typeof window !== 'undefined') {
          try {
            webPushClient
              .notifyRecipientViaPush({
                recipientId: 'staff',
                recipientRole: 'agent',
                senderId: mappedMsg.senderId || activeUser?.id || '',
                senderName: mappedMsg.senderName || activeUser?.displayName || 'Player',
                messageText: mappedMsg.text || '',
                conversationId: mappedMsg.conversationId,
                messageId: mappedMsg.id,
              })
              .catch(() => {});
          } catch {
            // Non-blocking push alert
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: STORAGE_KEYS.GAME_ACCOUNTS, tables: ['wallets', 'game_accounts', 'transactions', 'conversations', 'messages'] },
        })
      );
      void this.syncDelta();

      const isManualBonusLoad =
        params.direction === 'load' &&
        (params.source === 'free_play' || params.source === 'referral_bonus');

      const msg =
        params.direction === 'load'
          ? isManualBonusLoad
            ? `Successfully loaded $${Number(params.amount).toFixed(2)} to ${updatedAccount?.gameName || 'game account'}! Support has been notified to confirm it on your game.`
            : `Successfully loaded $${Number(params.amount).toFixed(2)} to ${updatedAccount?.gameName || 'game account'}!`
          : `Unloaded $${Number(params.amount).toFixed(2)} from ${updatedAccount?.gameName || 'game account'} (Free-Play returned: $${Number(json.freePlayReturn ?? 0).toFixed(2)}, Cash returned: $${Number(json.cashReturn ?? 0).toFixed(2)}).`;

      return {
        success: true,
        message: msg,
        freePlayReturn: Number(json.freePlayReturn ?? 0),
        cashReturn: Number(json.cashReturn ?? 0),
        wallet: json.wallet,
        gameAccount: updatedAccount,
        staffMessage,
        staffNotificationDelivered: Boolean(json.staffNotificationDelivered),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unable to process game credit transfer.',
      };
    }
  }

  // App Settings & Configuration
  public getAppConfig(): AppConfig {
    const cfg = this.load<AppConfig>(STORAGE_KEYS.CONFIG, INITIAL_CONFIG);
    let dirty = false;
    const normalizedRef = normalizeReferralConfig(cfg.referralProgram);
    if (
      !cfg.referralProgram ||
      cfg.referralProgram.rewardMode !== normalizedRef.rewardMode ||
      cfg.referralProgram.payoutTarget !== normalizedRef.payoutTarget ||
      cfg.referralProgram.maxReferralsPerUser === undefined ||
      cfg.referralProgram.refereeRewardValue === undefined
    ) {
      cfg.referralProgram = normalizedRef;
      dirty = true;
    }
    const normalizedWheel = normalizeWheelConfig(cfg.wheelOfLuck);
    if (!cfg.wheelOfLuck || !Array.isArray(cfg.wheelOfLuck.segments) || cfg.wheelOfLuck.segments.length === 0) {
      cfg.wheelOfLuck = normalizedWheel;
      dirty = true;
    }
    const normalizedCashout = normalizeCashoutRulesConfig(cfg.cashoutRules);
    if (!cfg.cashoutRules || !Array.isArray(cfg.cashoutRules.categories) || cfg.cashoutRules.categories.length === 0) {
      cfg.cashoutRules = normalizedCashout;
      dirty = true;
    }
    if (!cfg.gatewaySimulator) {
      cfg.gatewaySimulator = INITIAL_CONFIG.gatewaySimulator;
      dirty = true;
    }
    if (!cfg.cashoutFeed) {
      cfg.cashoutFeed = { ...INITIAL_CONFIG.cashoutFeed };
      dirty = true;
    } else {
      if (cfg.cashoutFeed.enabled === undefined) {
        cfg.cashoutFeed.enabled = true;
        dirty = true;
      }
      if (!cfg.cashoutFeed.namesPool || cfg.cashoutFeed.namesPool.length === 0) {
        cfg.cashoutFeed.namesPool = [...INITIAL_CONFIG.cashoutFeed.namesPool];
        dirty = true;
      }
      if (!cfg.cashoutFeed.probableAmounts || cfg.cashoutFeed.probableAmounts.length === 0) {
        cfg.cashoutFeed.probableAmounts = [...INITIAL_CONFIG.cashoutFeed.probableAmounts];
        dirty = true;
      }
      if (!cfg.cashoutFeed.minAmount) {
        cfg.cashoutFeed.minAmount = 50;
        dirty = true;
      }
      if (!cfg.cashoutFeed.maxAmount) {
        cfg.cashoutFeed.maxAmount = 250;
        dirty = true;
      }
    }
    if (dirty) {
      this.cache[STORAGE_KEYS.CONFIG] = cfg;
      this.saveToLocalStorage(STORAGE_KEYS.CONFIG, cfg);
    }
    return cfg;
  }

  public async fetchAppConfigFromServer(options?: {
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    config: AppConfig;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/app-config', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          config: this.getAppConfig(),
          error: `Failed to fetch app config (${res.status})`,
        };
      }
      const payload = rawText ? JSON.parse(rawText) : {};
      if (payload?.config && typeof payload.config === 'object') {
        this.applyAppConfig(payload.config, Boolean(options?.silentEvent));
      }
      return {
        success: true,
        config: this.getAppConfig(),
      };
    } catch (err: any) {
      return {
        success: false,
        config: this.getAppConfig(),
        error: err?.message || 'Unable to fetch app config.',
      };
    }
  }

  public async updateAppConfigAsync(
    newConfig: AppConfig,
  ): Promise<{ success: boolean; config?: AppConfig; error?: string }> {
    try {
      const payload = {
        currency: newConfig.currency || 'USD',
        paymentMethods: Array.isArray(newConfig.paymentMethods)
          ? newConfig.paymentMethods
          : [],
        withdrawalMethods: Array.isArray(newConfig.withdrawalMethods)
          ? newConfig.withdrawalMethods
          : [],
        gatewaySimulator: newConfig.gatewaySimulator,
        cashoutFeed: newConfig.cashoutFeed,
        platformRules: newConfig.platformRules,
        ...(newConfig.cashoutRules
          ? { cashoutRules: normalizeCashoutRulesConfig(newConfig.cashoutRules) }
          : {}),
        ...(newConfig.policies ? { policies: newConfig.policies } : {}),
      };

      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/app-config', (headers) => ({
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      }));

      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to save application configuration (${attempt.response?.status || 401}).`,
          ),
        };
      }

      this.applyAppConfig(json.config || newConfig, false);
      return {
        success: true,
        config: this.getAppConfig(),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to save application configuration.',
      };
    }
  }

  public updateAppConfig(newConfig: AppConfig, _actorId?: string, _actorName?: string): void {
    this.save(STORAGE_KEYS.CONFIG, newConfig, true);
    void this.updateAppConfigAsync(newConfig);
  }

  // Audit Logs (Admin-Only Read, Server-Side Vercel API Writes, Zero LocalStorage)
  private async buildAuditAuthHeadersWithMeta(
    forceRefresh: boolean = false,
    rejectedToken?: string | null
  ): Promise<{
    headers: Record<string, string>;
    token: string | null;
    requiresReauth: boolean;
    isTransientError: boolean;
    error?: string;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };
    const activeUser = this.getCurrentUser();
    if (activeUser?.id) {
      headers['x-user-id'] = activeUser.id;
    }
    const res = await supabaseTokenManager.getAccessToken({ forceRefresh, rejectedToken });
    if (res.token) {
      headers['x-supabase-token'] = res.token;
    }
    return {
      headers,
      token: res.token,
      requiresReauth: res.requiresReauth,
      isTransientError: Boolean(res.isTransientError),
      error: res.error,
    };
  }

  private async buildAuditAuthHeaders(
    forceRefresh: boolean = false,
    rejectedToken?: string | null
  ): Promise<Record<string, string>> {
    const meta = await this.buildAuditAuthHeadersWithMeta(forceRefresh, rejectedToken);
    return meta.headers;
  }

  private async fetchWithAuthTokenRetry(
    url: string,
    buildInit: (headers: Record<string, string>) => RequestInit
  ): Promise<{
    response: Response | null;
    json: any;
    rawText: string;
    contentType: string;
    requiresReauth: boolean;
    isTransientError: boolean;
  }> {
    const withAccept = (headers: Record<string, string>) => ({
      Accept: 'application/json',
      ...headers,
    });
    const initial = await this.buildAuditAuthHeadersWithMeta(false);
    if (initial.requiresReauth) {
      return {
        response: null,
        json: {
          error: initial.error || SESSION_EXPIRED_USER_MESSAGE,
          code: 'TOKEN_EXPIRED',
          requiresReauth: true,
        },
        rawText: '',
        contentType: 'application/json',
        requiresReauth: true,
        isTransientError: false,
      };
    }

    const withCredentials = (headers: Record<string, string>): RequestInit => {
      const built = buildInit(withAccept(headers));
      return {
        credentials: built.credentials ?? 'include',
        ...built,
      };
    };

    let res = await fetch(url, withCredentials(initial.headers));
    if (res.status === 401) {
      const refreshed = await this.buildAuditAuthHeadersWithMeta(true, initial.token);
      if (refreshed.requiresReauth) {
        return {
          response: res,
          json: {
            error: refreshed.error || SESSION_EXPIRED_USER_MESSAGE,
            code: 'TOKEN_EXPIRED',
            requiresReauth: true,
          },
          rawText: '',
          contentType: res.headers.get('content-type') || '',
          requiresReauth: true,
          isTransientError: false,
        };
      }
      if (refreshed.isTransientError) {
        return {
          response: res,
          json: {
            error: refreshed.error || 'Temporary network error refreshing authentication. Please retry.',
            code: 'TOKEN_REFRESH_FAILED',
          },
          rawText: '',
          contentType: res.headers.get('content-type') || '',
          requiresReauth: false,
          isTransientError: true,
        };
      }
      if (refreshed.token) {
        res = await fetch(url, withCredentials(refreshed.headers));
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text().catch(() => '');
    let json: any = null;
    if (rawText && rawText.trim()) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    const requiresReauth = res.status === 401 && json?.code === 'TOKEN_EXPIRED';
    return {
      response: res,
      json,
      rawText,
      contentType,
      requiresReauth,
      isTransientError: false,
    };
  }

  public getAuditLogs(): AuditLog[] {
    if (this.getCurrentUser()?.role !== 'admin') {
      return [];
    }
    const cached = Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
      ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[])
      : [];
    return mergeAuditLogs([], cached);
  }

  private async fetchAuditLogsDirectViaRls(options?: {
    limit?: number;
    entityType?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    beforeTimestamp?: string;
    append?: boolean;
    format?: 'json' | 'csv';
    skipCacheUpdate?: boolean;
  }): Promise<{ logs: AuditLog[]; hasMore: boolean; nextCursor: string | null; error: string | null }> {
    if (!supabase || !isSupabaseConfigured()) {
      return {
        logs: [],
        hasMore: false,
        nextCursor: null,
        error: 'Supabase connection is not configured.',
      };
    }

    const maxAllowed = options?.format === 'csv' ? 500 : 100;
    const limit =
      typeof options?.limit === 'number' && options.limit > 0
        ? Math.min(options.limit, maxAllowed)
        : 100;
    const entityType = (options?.entityType || 'all').trim().toLowerCase();
    const sanitizedSearch = (options?.search || '')
      .replace(/[,()*%\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const runRlsQuery = async (legacyMode: boolean) => {
      const tsCol = legacyMode ? 'created_at' : 'timestamp';
      const actorCol = legacyMode ? 'user_email' : 'actor_name';
      const cols = legacyMode
        ? 'id, user_id, user_email, action, entity_type, entity_id, details, created_at'
        : 'id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp';

      let q = supabase.from('audit_logs').select(cols);

      if (entityType && entityType !== 'all') {
        q = q.eq('entity_type', entityType);
      }
      if (options?.beforeTimestamp) {
        q = q.lt(tsCol, options.beforeTimestamp);
      }
      if (options?.fromDate) {
        const startIso = options.fromDate.includes('T')
          ? options.fromDate
          : `${options.fromDate}T00:00:00.000Z`;
        if (Number.isFinite(Date.parse(startIso))) {
          q = q.gte(tsCol, startIso);
        }
      }
      if (options?.toDate) {
        const endIso = options.toDate.includes('T')
          ? options.toDate
          : `${options.toDate}T23:59:59.999Z`;
        if (Number.isFinite(Date.parse(endIso))) {
          q = q.lte(tsCol, endIso);
        }
      }
      if (sanitizedSearch) {
        q = q.or(
          `action.ilike.%${sanitizedSearch}%,${actorCol}.ilike.%${sanitizedSearch}%,entity_id.ilike.%${sanitizedSearch}%,details.ilike.%${sanitizedSearch}%`
        );
      }

      return q
        .order(tsCol, { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
    };

    try {
      let { data, error } = await runRlsQuery(false);
      if (
        error &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          String(error.message || '').toLowerCase().includes('does not exist') ||
          String(error.message || '').toLowerCase().includes('schema cache'))
      ) {
        const legacyRes = await runRlsQuery(true);
        data = legacyRes.data;
        error = legacyRes.error;
      }

      if (error) {
        return {
          logs: [],
          hasMore: false,
          nextCursor: null,
          error: error.message || 'Failed to read audit logs from Supabase.',
        };
      }

      const rows = Array.isArray(data) ? data : [];
      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const normalized = sliced
        .map((row: any) => normalizeAuditLogRow(row))
        .filter((item: AuditLog | null): item is AuditLog => Boolean(item));

      if (!options?.skipCacheUpdate) {
        const existing =
          options?.append && Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
            ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[])
            : [];
        this.cache[STORAGE_KEYS.AUDIT_LOGS] = mergeAuditLogs(existing, normalized, {
          replace: !options?.append,
          maxItems: options?.append ? 500 : 100,
        });
        window.dispatchEvent(
          new CustomEvent('aetherpay_state_changed', {
            detail: { key: STORAGE_KEYS.AUDIT_LOGS, count: normalized.length },
          })
        );
      }

      const nextCursor = normalized.length > 0 ? normalized[normalized.length - 1].timestamp : null;
      return { logs: normalized, hasMore, nextCursor, error: null };
    } catch (err: any) {
      return {
        logs: [],
        hasMore: false,
        nextCursor: null,
        error: err?.message || 'Failed to read audit logs directly.',
      };
    }
  }

  public async fetchAuditLogsFromServer(options?: {
    limit?: number;
    entityType?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    beforeTimestamp?: string;
    append?: boolean;
    format?: 'json' | 'csv';
    skipCacheUpdate?: boolean;
  }): Promise<{
    logs: AuditLog[];
    hasMore: boolean;
    nextCursor: string | null;
    error: string | null;
    code?: string;
    requiresReauth?: boolean;
  }> {
    const currentUser = this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      this.cache[STORAGE_KEYS.AUDIT_LOGS] = [];
      return { logs: [], hasMore: false, nextCursor: null, error: 'Admin authorization required.' };
    }

    const params = new URLSearchParams();
    params.set('limit', String(options?.limit || 100));
    params.set('userId', currentUser.id);
    if (options?.entityType && options.entityType !== 'all') params.set('entityType', options.entityType);
    if (options?.search?.trim()) params.set('search', options.search.trim());
    if (options?.fromDate) params.set('fromDate', options.fromDate);
    if (options?.toDate) params.set('toDate', options.toDate);
    if (options?.beforeTimestamp) params.set('beforeTimestamp', options.beforeTimestamp);
    if (options?.format === 'csv') params.set('format', 'csv');

    try {
      const attempt = await this.fetchWithAuthTokenRetry(`/api/audit-logs?${params.toString()}`, (headers) => ({
        method: 'GET',
        cache: 'no-store',
        headers,
      }));
      const res = attempt.response;
      const data = attempt.json;

      if (attempt.requiresReauth) {
        return {
          logs: [],
          hasMore: false,
          nextCursor: null,
          error: extractServerApiError(data, SESSION_EXPIRED_USER_MESSAGE),
          code: 'TOKEN_EXPIRED',
          requiresReauth: true,
        };
      }

      if (res && res.ok && data?.success) {
        const normalized = (Array.isArray(data.logs) ? data.logs : [])
          .map((row: any) => normalizeAuditLogRow(row))
          .filter((item: AuditLog | null): item is AuditLog => Boolean(item));

        if (!options?.skipCacheUpdate) {
          const existing =
            options?.append && Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
              ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[])
              : [];
          this.cache[STORAGE_KEYS.AUDIT_LOGS] = mergeAuditLogs(existing, normalized, {
            replace: !options?.append,
            maxItems: options?.append ? 500 : 100,
          });
          window.dispatchEvent(
            new CustomEvent('aetherpay_state_changed', {
              detail: { key: STORAGE_KEYS.AUDIT_LOGS, count: normalized.length },
            })
          );
        }

        return {
          logs: normalized,
          hasMore: Boolean(data.hasMore),
          nextCursor: data.nextCursor || null,
          error: null,
        };
      }

      const contentType = res ? (res.headers.get('content-type') || '').toLowerCase() : '';
      const isJson = contentType.includes('application/json');

      // Explicit backend JSON 403/401/400 must never be bypassed by client fallback
      if (
        res &&
        (res.status === 403 || res.status === 401 || res.status === 400) &&
        isJson &&
        data?.error
      ) {
        const errCode =
          typeof data?.code === 'string'
            ? data.code
            : typeof data?.error === 'object' && typeof data.error?.code === 'string'
              ? data.error.code
              : undefined;
        return {
          logs: [],
          hasMore: false,
          nextCursor: null,
          error: extractServerApiError(
            data,
            `Failed to load audit logs (${res.status})`,
          ),
          code: errCode,
          requiresReauth: res.status === 401 && errCode === 'TOKEN_EXPIRED',
        };
      }

      // Upstream proxy block (non-JSON 403), 404, or 5xx: fall back to RLS-enforced direct Supabase query
      const rlsResult = await this.fetchAuditLogsDirectViaRls(options);
      if (!rlsResult.error) {
        return rlsResult;
      }

      return {
        logs: [],
        hasMore: false,
        nextCursor: null,
        error: extractServerApiError(
          data,
          rlsResult.error || `Failed to load audit logs (${res?.status || 'network'})`,
        ),
      };
    } catch (err: any) {
      const rlsResult = await this.fetchAuditLogsDirectViaRls(options);
      if (!rlsResult.error) {
        return rlsResult;
      }
      return {
        logs: [],
        hasMore: false,
        nextCursor: null,
        error: err?.message || rlsResult.error || 'Network error fetching audit logs',
      };
    }
  }

  public logAudit(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const activeUser = this.getCurrentUser();
    const optimistic: AuditLog = {
      ...entry,
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    if (activeUser?.role === 'admin') {
      const existing = Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
        ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[])
        : [];
      this.cache[STORAGE_KEYS.AUDIT_LOGS] = mergeAuditLogs(existing, [optimistic], { maxItems: 100 });
      window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.AUDIT_LOGS } }));
    }

    void this.persistAuditLogViaApi(entry, optimistic.id);
  }

  private async persistAuditLogViaApi(
    entry: Omit<AuditLog, 'id' | 'timestamp'>,
    optimisticId?: string
  ): Promise<void> {
    try {
      const attempt = await this.fetchWithAuthTokenRetry('/api/audit-logs', (headers) => ({
        method: 'POST',
        keepalive: true,
        headers,
        body: JSON.stringify(entry),
      }));
      const res = attempt.response;
      const data = attempt.json;
      if (!res?.ok) {
        console.warn(
          '[DataService] Server audit log write failed:',
          extractServerApiError(data, String(res?.status || 'unknown')),
        );
        return;
      }
      const saved = data?.log ? normalizeAuditLogRow(data.log) : null;
      if (saved && this.getCurrentUser()?.role === 'admin') {
        const existing = Array.isArray(this.cache[STORAGE_KEYS.AUDIT_LOGS])
          ? (this.cache[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[]).filter((x) => x.id !== optimisticId)
          : [];
        this.cache[STORAGE_KEYS.AUDIT_LOGS] = mergeAuditLogs(existing, [saved], { maxItems: 100 });
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.AUDIT_LOGS } }));
      }
    } catch (err) {
      console.warn('[DataService] Server audit log network notice:', err);
    }
  }

  private recordTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): void {
    const all = this.load<WalletTransaction[]>(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
    const newTx: WalletTransaction = {
      ...tx,
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    all.unshift(newTx);
    this.save(STORAGE_KEYS.TRANSACTIONS, all);
  }

  // Real-Time Mixed Cashouts Feed (Real + Admin-Configured Fake Pool)
  public async fetchFakedCashoutsFromServer(options?: {
    limit?: number;
    offset?: number;
    silentEvent?: boolean;
  }): Promise<{
    success: boolean;
    items: CashoutFeedItem[];
    total: number;
    error?: string;
  }> {
    try {
      const limit = Math.min(50, Math.max(1, Math.trunc(options?.limit ?? 25)));
      const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
      const res = await fetch(`/api/faked-cashouts?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      const rawText = await res.text();
      if (!res.ok) {
        return {
          success: false,
          items: this.getFakedCashouts(),
          total: this.getFakedCashouts().length,
          error: `Failed to fetch cashout feed (${res.status}).`,
        };
      }
      const json = rawText ? JSON.parse(rawText) : {};
      const rows = Array.isArray(json.items) ? json.items : [];
      this.applyCashoutRows(rows, true, Boolean(options?.silentEvent));
      return {
        success: true,
        items: this.getFakedCashouts(),
        total: Number(json.total ?? rows.length),
      };
    } catch (err: any) {
      return {
        success: false,
        items: this.getFakedCashouts(),
        total: this.getFakedCashouts().length,
        error: err?.message || 'Unable to load cashout feed.',
      };
    }
  }

  public async reseedFakedCashoutsOnServer(cfg: AppConfig): Promise<{
    success: boolean;
    items?: CashoutFeedItem[];
    error?: string;
  }> {
    try {
      const generated = this.generateInitialFakeCashouts(cfg);
      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/faked-cashouts/reseed', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: generated.map((item) => ({
            customerName: item.customerName || item.playerHandle || 'Player',
            amount: item.amount,
            currency: item.currency || cfg.currency || 'USD',
            methodName: item.methodName || 'Verified CashApp',
            gameName: item.gameName || 'Orion Stars Elite',
            isFake: true,
            timestamp: item.timestamp,
          })),
        }),
      }));

      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to reseed live cashout feed (${attempt.response?.status || 401}).`,
          ),
        };
      }

      const items = Array.isArray(json.items) ? json.items : generated;
      this.applyCashoutRows(items, true, false);
      return { success: true, items: this.getFakedCashouts() };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unable to reseed live cashout feed.',
      };
    }
  }

  public async createFakedCashoutOnServer(cfg?: AppConfig): Promise<{
    success: boolean;
    item?: CashoutFeedItem;
    error?: string;
  }> {
    try {
      const activeCfg = cfg || this.getAppConfig();
      const pool = activeCfg.cashoutFeed?.namesPool?.length
        ? activeCfg.cashoutFeed.namesPool
        : ['Marcus_V', 'Elena_R', 'Tyler_K', 'LuckyHunter', 'ApexPro', 'Chloe_B'];
      const randomName = pool[Math.floor(Math.random() * pool.length)];
      const min = activeCfg.cashoutFeed?.minAmount || 50;
      const max = activeCfg.cashoutFeed?.maxAmount || 250;
      const probableAmounts = activeCfg.cashoutFeed?.probableAmounts?.length
        ? activeCfg.cashoutFeed.probableAmounts
        : [50, 75, 100, 120, 140, 150, 180, 200, 220, 250];
      const pickedAmt = probableAmounts[Math.floor(Math.random() * probableAmounts.length)];
      const amount = Math.min(max, Math.max(min, pickedAmt));
      const methods = ['Verified CashApp', 'Chime Direct', 'Crypto USDT', 'Payment via Link', 'Crypto BTC'];
      const games = ['Orion Stars Elite', 'Fire Kirin Ultra', 'Game Vault 999', 'Panda Master Pro', 'Apex Championship Arena'];

      const attempt = await this.fetchWithAuthTokenRetry('/api/admin/faked-cashouts', (headers) => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerName: randomName,
          amount,
          currency: activeCfg.currency || 'USD',
          methodName: methods[Math.floor(Math.random() * methods.length)],
          gameName: games[Math.floor(Math.random() * games.length)],
          isFake: true,
          timestamp: new Date().toISOString(),
        }),
      }));

      const json = attempt.json || {};
      if (!attempt.response?.ok || !json?.success || !json?.item) {
        return {
          success: false,
          error: extractServerApiError(
            json,
            `Failed to create live cashout entry (${attempt.response?.status || 401}).`,
          ),
        };
      }

      const created = json.item as CashoutFeedItem;
      const currentFakes = this.getFakedCashouts();
      this.saveFakedCashouts([created, ...currentFakes].slice(0, 40));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'cashout_feed_updated' } }));
      }
      return { success: true, item: created };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Unable to create live cashout entry.',
      };
    }
  }

  public getFakedCashouts(): CashoutFeedItem[] {
    return this.load<CashoutFeedItem[]>(STORAGE_KEYS.FAKED_CASHOUTS, []);
  }

  public saveFakedCashouts(items: CashoutFeedItem[]): void {
    this.cache[STORAGE_KEYS.FAKED_CASHOUTS] = items;
    this.saveToLocalStorage(STORAGE_KEYS.FAKED_CASHOUTS, items);
    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: STORAGE_KEYS.FAKED_CASHOUTS } }));
  }

  public getMixedCashoutFeed(limit: number = 20): CashoutFeedItem[] {
    const cfg = this.getAppConfig();
    if (cfg.cashoutFeed?.enabled === false) return [];

    // 1. Gather Real Cashouts (from completed or processing withdrawals)
    const realWithdrawals = this.getWithdrawalRequests();
    const realItems: CashoutFeedItem[] = realWithdrawals
      .filter((w) => w.status === 'completed' || w.status === 'processing')
      .map((w) => ({
        id: `real_${w.id}`,
        playerHandle: w.customerName,
        customerName: w.customerName,
        amount: w.amount,
        currency: w.currency,
        methodName: w.methodName || 'Bank Transfer',
        gameName: w.sourceGameName || 'Platform Vault',
        isFake: false,
        timestamp: w.updatedAt || w.createdAt || new Date().toISOString(),
      }));

    // 2. Load stored faked cashouts or generate initial seed batch
    let fakeItems = this.getFakedCashouts();
    if (fakeItems.length === 0) {
      fakeItems = this.generateInitialFakeCashouts(cfg);
      this.saveFakedCashouts(fakeItems);
    }

    // 3. Merge both sets and sort by most recent timestamp
    const combined = [...realItems, ...fakeItems].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return combined.slice(0, limit);
  }

  public generateInitialFakeCashouts(cfg: AppConfig): CashoutFeedItem[] {
    const pool = cfg.cashoutFeed?.namesPool?.length ? cfg.cashoutFeed.namesPool : ['Marcus_V', 'Elena_R', 'Tyler_K', 'LuckyHunter', 'ApexPro', 'Chloe_B'];
    const methods = ['Verified CashApp', 'Chime Direct', 'Crypto USDT', 'Payment via Link', 'Crypto BTC'];
    const games = ['Orion Stars Elite', 'Fire Kirin Ultra', 'Game Vault 999', 'Panda Master Pro', 'Apex Championship Arena'];
    const probableAmounts = cfg.cashoutFeed?.probableAmounts?.length
      ? cfg.cashoutFeed.probableAmounts
      : [50, 75, 100, 120, 140, 150, 180, 200, 220, 250];

    const items: CashoutFeedItem[] = [];
    const now = Date.now();
    const count = 18;

    for (let i = 0; i < count; i++) {
      const name = pool[i % pool.length];
      // Pick from probable amounts or clamp between minAmount ($50) and maxAmount ($250)
      const min = cfg.cashoutFeed?.minAmount || 50;
      const max = cfg.cashoutFeed?.maxAmount || 250;
      const candidateAmt = probableAmounts[i % probableAmounts.length];
      const finalAmt = Math.min(max, Math.max(min, candidateAmt));

      const method = methods[i % methods.length];
      const game = games[i % games.length];
      // Start from 2 hours ago (120 minutes) staggered down to 2 minutes ago
      // (count - i) spreads out across ~120 minutes
      const minutesAgo = Math.floor(((i + 1) / (count + 1)) * 120) + Math.floor(Math.random() * 4);
      const timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();

      items.push({
        id: `fake_${now}_${i}`,
        playerHandle: name,
        customerName: name,
        amount: finalAmt,
        currency: cfg.currency || 'USD',
        methodName: method,
        gameName: game,
        isFake: true,
        timestamp,
      });
    }

    return items;
  }

  public injectNewFakeCashout(): CashoutFeedItem | null {
    const cfg = this.getAppConfig();
    if (cfg.cashoutFeed?.enabled === false) return null;

    const pool = cfg.cashoutFeed?.namesPool?.length ? cfg.cashoutFeed.namesPool : ['Marcus_V', 'Elena_R', 'Tyler_K', 'LuckyHunter', 'ApexPro', 'Chloe_B'];
    const randomName = pool[Math.floor(Math.random() * pool.length)];
    const min = cfg.cashoutFeed?.minAmount || 50;
    const max = cfg.cashoutFeed?.maxAmount || 250;
    const probableAmounts = cfg.cashoutFeed?.probableAmounts?.length
      ? cfg.cashoutFeed.probableAmounts
      : [50, 75, 100, 120, 140, 150, 180, 200, 220, 250];

    const pickedAmt = probableAmounts[Math.floor(Math.random() * probableAmounts.length)];
    const amount = Math.min(max, Math.max(min, pickedAmt));

    const methods = ['Verified CashApp', 'Chime Direct', 'Crypto USDT', 'Payment via Link', 'Crypto BTC'];
    const games = ['Orion Stars Elite', 'Fire Kirin Ultra', 'Game Vault 999', 'Panda Master Pro', 'Apex Championship Arena'];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const game = games[Math.floor(Math.random() * games.length)];

    const newItem: CashoutFeedItem = {
      id: `fake_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      playerHandle: randomName,
      customerName: randomName,
      amount,
      currency: cfg.currency || 'USD',
      methodName: method,
      gameName: game,
      isFake: true,
      timestamp: new Date().toISOString(), // Realtime mixed in
    };

    const currentFakes = this.getFakedCashouts();
    currentFakes.unshift(newItem);
    if (currentFakes.length > 40) currentFakes.pop();
    this.saveFakedCashouts(currentFakes);

    window.dispatchEvent(new CustomEvent('aetherpay_state_changed', { detail: { key: 'cashout_feed_updated' } }));
    return newItem;
  }

  // Load funds into game account from wallet cash balance OR promotional referral balance
  public loadFundsToGame(params: {
    customerId: string;
    customerName: string;
    gameCatalogId: string;
    amount: number;
    fundingSource: 'wallet_cash' | 'referral_bonus';
  }): { success: boolean; message: string; gameAccount?: GameAccount } {
    if (params.amount <= 0) {
      return { success: false, message: 'Amount must be greater than zero.' };
    }

    const accounts = this.getGameAccounts(params.customerId);
    const targetAccount = accounts.find((a) => a.gameCatalogId === params.gameCatalogId);
    if (!targetAccount) {
      return { success: false, message: 'No game credentials found for this game. Please request Game credentials first.' };
    }

    const wallet = this.getWallet(params.customerId);

    if (params.fundingSource === 'referral_bonus') {
      if ((wallet.referralBonusBalance || 0) < params.amount) {
        return {
          success: false,
          message: `Insufficient referral bonus funds ($${(wallet.referralBonusBalance || 0).toFixed(2)}).`,
        };
      }

      // Deduct from non-withdrawable promotional referral balance
      wallet.referralBonusBalance = Number(Math.max(0, (wallet.referralBonusBalance || 0) - params.amount).toFixed(2));
      wallet.lastUpdatedAt = new Date().toISOString();
      const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
      wallets[params.customerId] = wallet;
      this.save(STORAGE_KEYS.WALLETS, wallets, true);

      // Credit directly into game account
      targetAccount.balance = (targetAccount.balance || 0) + params.amount;
      targetAccount.updatedAt = new Date().toISOString();
      const allAccounts = this.getGameAccounts();
      const idx = allAccounts.findIndex((a) => a.id === targetAccount.id);
      if (idx !== -1) {
        allAccounts[idx] = targetAccount;
        this.save(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
      }

      // Record transaction
      this.recordTransaction({
        customerId: params.customerId,
        type: 'bonus',
        amount: params.amount,
        fee: 0,
        netAmount: params.amount,
        currency: wallet.currency,
        balanceAfter: wallet.availableBalance,
        targetGameName: targetAccount.gameName,
        targetGameUsername: targetAccount.username,
        description: `Referral Bonus Loaded to ${targetAccount.gameName} (User: ${targetAccount.username})`,
        idempotencyKey: `idemp_load_ref_${Date.now()}`,
        status: 'completed',
      });

      this.createNotification({
        userId: params.customerId,
        title: 'Referral Bonus Transferred to Game',
        message: `$${params.amount.toFixed(2)} referral reward loaded to ${targetAccount.gameName} account. Game balance: $${targetAccount.balance.toFixed(2)}`,
        type: 'game_account',
        linkTab: 'game_accounts',
      });

      this.logAudit({
        actorId: params.customerId,
        actorName: params.customerName,
        actorRole: 'customer',
        action: 'REFERRAL_LOADED_TO_GAME',
        entityType: 'game_account',
        entityId: targetAccount.id,
        details: `Loaded $${params.amount} non-cashable referral bonus directly into ${targetAccount.gameName}.`,
      });

      // Promotional referral bonus loads must never qualify a referral reward
      return {
        success: true,
        message: `Successfully loaded $${params.amount.toFixed(2)} from referral bonus to ${targetAccount.gameName}!`,
        gameAccount: targetAccount,
      };
    } else {
      // From standard wallet available cash
      if (wallet.availableBalance < params.amount) {
        return {
          success: false,
          message: `Insufficient wallet cash balance ($${wallet.availableBalance.toFixed(2)}).`,
        };
      }

      wallet.availableBalance = Number(Math.max(0, wallet.availableBalance - params.amount).toFixed(2));
      wallet.lastUpdatedAt = new Date().toISOString();
      const wallets = this.load<Record<string, UserWallet>>(STORAGE_KEYS.WALLETS, INITIAL_WALLETS);
      wallets[params.customerId] = wallet;
      this.save(STORAGE_KEYS.WALLETS, wallets, true);

      targetAccount.balance = (targetAccount.balance || 0) + params.amount;
      targetAccount.updatedAt = new Date().toISOString();
      const allAccounts = this.getGameAccounts();
      const idx = allAccounts.findIndex((a) => a.id === targetAccount.id);
      if (idx !== -1) {
        allAccounts[idx] = targetAccount;
        this.save(STORAGE_KEYS.GAME_ACCOUNTS, allAccounts);
      }

      this.recordTransaction({
        customerId: params.customerId,
        type: 'adjustment',
        amount: params.amount,
        fee: 0,
        netAmount: params.amount,
        currency: wallet.currency,
        balanceAfter: wallet.availableBalance,
        targetGameName: targetAccount.gameName,
        targetGameUsername: targetAccount.username,
        description: `Wallet Balance Loaded to ${targetAccount.gameName} (User: ${targetAccount.username})`,
        idempotencyKey: `idemp_load_cash_${Date.now()}`,
        status: 'completed',
      });

      this.createNotification({
        userId: params.customerId,
        title: 'Game Loaded from Wallet',
        message: `$${params.amount.toFixed(2)} transferred to ${targetAccount.gameName}. Game balance: $${targetAccount.balance.toFixed(2)}`,
        type: 'game_account',
        linkTab: 'game_accounts',
      });

      // Wallet-to-game transfers do not trigger referral payouts (only approved real deposits qualify)
      return {
        success: true,
        message: `Successfully loaded $${params.amount.toFixed(2)} from wallet to ${targetAccount.gameName}!`,
        gameAccount: targetAccount,
      };
    }
  }

  // =========================================================================
  // OFFICIAL PARTNERS DIRECTORY (Self-Hosted Node API + Admin RBAC)
  // =========================================================================

  public getCachedOfficialPartners(): OfficialPartner[] {
    return this.officialPartnersCache ? [...this.officialPartnersCache] : [];
  }

  private emitOfficialPartnersChanged(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aetherpay_state_changed', {
          detail: { key: 'official_partners_updated', tables: ['official_partners'] },
        })
      );
    }
  }

  private parseOfficialPartnerApiError(
    status: number,
    json: any,
    fallback: string
  ): { message: string; code?: string; requiresReauth: boolean } {
    const code =
      typeof json?.code === 'string'
        ? json.code
        : typeof json?.error?.code === 'string'
          ? json.error.code
          : undefined;
    const message =
      typeof json?.error === 'string'
        ? json.error
        : typeof json?.error?.message === 'string'
          ? json.error.message
          : typeof json?.message === 'string'
            ? json.message
            : `${fallback} (${status || 'network error'}).`;
    const requiresReauth =
      status === 401 || code === 'UNAUTHENTICATED' || code === 'TOKEN_EXPIRED';
    return { message, code, requiresReauth };
  }

  public async fetchOfficialPartners(options?: {
    includeHidden?: boolean;
  }): Promise<{
    success: boolean;
    partners: OfficialPartner[];
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const includeHidden = Boolean(options?.includeHidden);
      const baseRoute = includeHidden
        ? '/api/admin/official-partners?includeHidden=1'
        : '/api/official-partners';

      const res = await fetch(baseRoute, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await res.text().catch(() => '');
      let json: any = {};
      if (rawText && rawText.trim()) {
        try {
          json = JSON.parse(rawText);
        } catch {
          json = {};
        }
      }

      if (!res.ok || !json?.success) {
        const parsed = this.parseOfficialPartnerApiError(
          res.status,
          json,
          'Unable to load official partners'
        );
        return {
          success: false,
          partners: [],
          error: parsed.message,
          code: parsed.code,
          requiresReauth: parsed.requiresReauth,
        };
      }

      const rows: OfficialPartner[] = Array.isArray(json.partners)
        ? sortOfficialPartners(
            json.partners
              .map((r: any) => normalizeOfficialPartnerRow(r))
              .filter((p: OfficialPartner | null): p is OfficialPartner => Boolean(p))
          )
        : [];

      this.officialPartnersCache = rows.filter((p) => p.isVisible);
      return { success: true, partners: rows };
    } catch (err: any) {
      return {
        success: false,
        partners: [],
        error: err?.message || 'Unable to load official partners.',
      };
    }
  }

  public async createOfficialPartner(input: OfficialPartnerInput): Promise<{
    success: boolean;
    partner?: OfficialPartner;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const res = await fetch('/api/admin/official-partners', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !json?.partner) {
        const parsed = this.parseOfficialPartnerApiError(
          res.status,
          json,
          'Failed to create official partner'
        );
        return {
          success: false,
          error: parsed.message,
          code: parsed.code,
          requiresReauth: parsed.requiresReauth,
        };
      }

      const partner = normalizeOfficialPartnerRow(json.partner);
      if (!partner) {
        return {
          success: false,
          error: 'Received invalid partner record from server.',
        };
      }
      if (this.officialPartnersCache) {
        const filtered = this.officialPartnersCache.filter((p) => p.id !== partner.id);
        if (partner.isVisible) {
          filtered.push(partner);
        }
        this.officialPartnersCache = sortOfficialPartners(filtered);
      }
      this.emitOfficialPartnersChanged();
      return { success: true, partner };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to create official partner.',
      };
    }
  }

  public async updateOfficialPartner(
    id: string,
    patch: Partial<OfficialPartnerInput>
  ): Promise<{
    success: boolean;
    partner?: OfficialPartner;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const res = await fetch(`/api/admin/official-partners/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !json?.partner) {
        const parsed = this.parseOfficialPartnerApiError(
          res.status,
          json,
          'Failed to update official partner'
        );
        return {
          success: false,
          error: parsed.message,
          code: parsed.code,
          requiresReauth: parsed.requiresReauth,
        };
      }

      const partner = normalizeOfficialPartnerRow(json.partner);
      if (!partner) {
        return {
          success: false,
          error: 'Received invalid partner record from server.',
        };
      }
      if (this.officialPartnersCache) {
        const filtered = this.officialPartnersCache.filter((p) => p.id !== partner.id);
        if (partner.isVisible) {
          filtered.push(partner);
        }
        this.officialPartnersCache = sortOfficialPartners(filtered);
      }
      this.emitOfficialPartnersChanged();
      return { success: true, partner };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to update official partner.',
      };
    }
  }

  public async reorderOfficialPartners(orderedIds: string[]): Promise<{
    success: boolean;
    partners?: OfficialPartner[];
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const res = await fetch('/api/admin/official-partners/reorder', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderedIds }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        const parsed = this.parseOfficialPartnerApiError(
          res.status,
          json,
          'Failed to save partner order'
        );
        return {
          success: false,
          error: parsed.message,
          code: parsed.code,
          requiresReauth: parsed.requiresReauth,
        };
      }

      const partners = Array.isArray(json.partners)
        ? sortOfficialPartners(
            json.partners
              .map((r: any) => normalizeOfficialPartnerRow(r))
              .filter((p: OfficialPartner | null): p is OfficialPartner => Boolean(p))
          )
        : undefined;
      if (partners) {
        this.officialPartnersCache = partners.filter((p) => p.isVisible);
      }
      this.emitOfficialPartnersChanged();
      return { success: true, partners };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to save partner order.',
      };
    }
  }

  public async deleteOfficialPartner(id: string): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    requiresReauth?: boolean;
  }> {
    try {
      const res = await fetch(`/api/admin/official-partners/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        const parsed = this.parseOfficialPartnerApiError(
          res.status,
          json,
          'Failed to delete official partner'
        );
        return {
          success: false,
          error: parsed.message,
          code: parsed.code,
          requiresReauth: parsed.requiresReauth,
        };
      }

      if (this.officialPartnersCache) {
        this.officialPartnersCache = this.officialPartnersCache.filter((p) => p.id !== id);
      }
      this.emitOfficialPartnersChanged();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to delete official partner.',
      };
    }
  }

  public async uploadOfficialPartnerIcon(file: File): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    return storageService.uploadPartnerIcon(file);
  }
}

export const dataService = new DataService();
