# Graph Report - swiftsweeps  (2026-11-28)

## Corpus Check
- 284 files · ~475,200 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3376 nodes · 10168 edges · 119 communities (105 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 155 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d6a129e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- gameAccounts.ts
- scripts
- App.tsx
- InMemoryDatabasePool
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- officialPartners.ts
- lucide-react
- wheelOfLuckUtils.ts
- compilerOptions
- DataService
- referralRepo.ts
- dataService.ts
- react
- UserRole
- appConfig.ts
- SelfHostedAuthService
- dataMigrationTool.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- wheelRepo.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- extractServerApiError
- env.ts
- api/index.ts
- gameAccounts.ts
- UserProfile
- app.ts
- withdrawalRepo.ts
- deposits.ts
- .createStaffTopUpAsync
- react
- tests/auditLogs.test.ts
- storage.ts
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- HttpError
- migrations.ts
- NotificationSoundService
- better-auth
- GameCatalogItem
- notifications.ts
- AdminGameCatalog.tsx
- adminAuth.ts
- InMemoryAdminUsersDatabase
- userDirectoryRepo.ts
- GameAccount
- chatRepo.ts
- types.ts
- chatStreamClient.ts
- ref_node_http
- DepositRepo
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- realtime.test.ts
- referrals.ts
- logger.ts
- notifications.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- wallet.ts
- express
- deposits.test.ts
- AppConfigRepo
- AdminReferralGovernancePanel.tsx
- profile.test.ts
- adminUsers.test.ts
- InMemoryGameAccountDatabase
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- pushUtils.ts
- chatPresentationUtils.ts
- ref_node_assert
- supabaseClient.ts
- TelegramService
- runExportSnapshot
- extractCanonicalSourceBundle
- .getPasswordResetTokens
- appConfig.test.ts
- ChatTransactionCard.tsx
- InMemoryWithdrawalDatabase
- realtimeChatHub.ts
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- InMemoryDepositDatabase
- dataMigration.test.ts
- devDependencies
- dataService
- dataMigration.ts
- PWAInstallService
- InMemoryOfficialPartnersDatabase
- runDataMigrationImport
- officialPartnerHandlers.ts
- chat.test.ts
- SupabaseAuthService
- InMemoryAppConfigDatabase
- UserRole
- chatEvents.ts
- AuthTokenCoordinator
- safeAreaUtils.ts
- web-push
- EmailDeliveryAdapter

## God Nodes (most connected - your core abstractions)
1. `DataService` - 241 edges
2. `HttpError` - 196 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 76 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 65 edges
8. `UserDirectoryRepo` - 54 edges
9. `App()` - 54 edges
10. `createLogger()` - 52 edges

## Surprising Connections (you probably didn't know these)
- `handleCreateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleUpdateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleGetOfficialPartners()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleUpdateOfficialPartner()` --calls--> `isPartnerPlatform()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (119 total, 14 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.09
Nodes (3): DataService, isSupabaseConfigured(), AppNotification

### Community 1 - "gameAccounts.ts"
Cohesion: 0.13
Nodes (32): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+24 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (50): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), LazyPageFallback(), LiveCashoutTicker(), SessionTimeoutWarningModal(), CustomerMobileNav(), StaffMobileNav() (+42 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (42): AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus, GameCatalogItem (+34 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.10
Nodes (47): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+39 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "officialPartners.ts"
Cohesion: 0.06
Nodes (55): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+47 more)

### Community 10 - "lucide-react"
Cohesion: 0.19
Nodes (23): CashoutRulesAdminCard(), CashoutRulesAdminCardProps, PinnedCashoutRulesBanner(), PinnedCashoutRulesBannerProps, CashoutRulesShowcase(), CashoutRulesShowcaseProps, LiveCashoutFeedList(), CustomerWithdrawal() (+15 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (66): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+58 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.08
Nodes (40): AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, filterRealtimeRowsForUser() (+32 more)

### Community 16 - "react"
Cohesion: 0.07
Nodes (35): lucide-react, react, react-dom, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps (+27 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (36): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+28 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (16): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+8 more)

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.09
Nodes (23): CANONICAL_IMPORT_ORDER, CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, DryRunReport, EnvValidationInput, fetchAllOrderedBatched(), FinancialAggregateSummary (+15 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.16
Nodes (27): CustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits(), computeCumulativeCompletedWithdrawals(), deriveLatestCompletedTopUp() (+19 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (40): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+32 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.16
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 27 - "WebPushClient"
Cohesion: 0.15
Nodes (8): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.13
Nodes (18): pg, createEmailDeliveryAdapter(), ConfigValidationError, PgSslMode, loadLocalDotEnv(), resolveCandidateEnvPaths(), AuthMigrateCommand, run() (+10 more)

### Community 29 - "extractServerApiError"
Cohesion: 0.15
Nodes (5): extractServerApiCode(), extractServerApiError(), AppConfig, CashoutFeedItem, ReferralSummary

### Community 30 - "env.ts"
Cohesion: 0.13
Nodes (22): better-auth, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+14 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (47): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+39 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.06
Nodes (33): DatabaseClient, DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError (+25 more)

### Community 33 - "UserProfile"
Cohesion: 0.07
Nodes (37): AdminOfficialPartnersTabProps, EmailOtpModalProps, BackgroundNotificationPromptProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, PWAInstallButtonProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps (+29 more)

### Community 34 - "app.ts"
Cohesion: 0.11
Nodes (26): ApiAppDependencies, createApiApp(), createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), ServerConfig, checkDatabaseConnectivity() (+18 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.06
Nodes (53): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+45 more)

### Community 36 - "deposits.ts"
Cohesion: 0.13
Nodes (32): DepositSortField, DepositSortOrder, DepositStatusValue, ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS (+24 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.12
Nodes (14): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+6 more)

### Community 38 - "react"
Cohesion: 0.14
Nodes (24): PWAInstallButton(), WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS (+16 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.13
Nodes (14): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, AuditLogRepo, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult (+6 more)

### Community 40 - "storage.ts"
Cohesion: 0.10
Nodes (37): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+29 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.14
Nodes (34): ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), chatStreamClient, notificationSoundService, supabaseUrl, CHAT_QUICK_EMOJIS (+26 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.31
Nodes (12): GlobalChatNotificationManager(), compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls() (+4 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.16
Nodes (20): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+12 more)

### Community 48 - "better-auth"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+9 more)

### Community 49 - "GameCatalogItem"
Cohesion: 0.17
Nodes (15): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+7 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (45): mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo, NotificationTargetUserNotFoundError (+37 more)

### Community 51 - "AdminGameCatalog.tsx"
Cohesion: 0.06
Nodes (51): AdminChatTopUpModalProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), countUnsavedCatalogChanges() (+43 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.07
Nodes (57): AuthRuntime, AdminUserSortField, AdminUserSortOrder, AppUserStatus, requireRole(), HttpError, validateRequestBody(), AdminAuthRouterDeps (+49 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (30): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserForbiddenError, AdminUserGameAccountSummary, AdminUserNotFoundError, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource (+22 more)

### Community 55 - "GameAccount"
Cohesion: 0.19
Nodes (12): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), parseGameAccountApiError(), toFixedMoney(), VALID_STATUSES (+4 more)

### Community 56 - "chatRepo.ts"
Cohesion: 0.07
Nodes (40): AppConfigActor, AppUserRole, ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ChatTicketStatus, ChatAttachmentRecord (+32 more)

### Community 57 - "types.ts"
Cohesion: 0.12
Nodes (19): GamePlatformCard(), GamePlatformCardProps, WheelSpinResultModalProps, WheelStrip(), WheelStripProps, AdminRequestsProps, CustomerHome(), loadAdminRequests() (+11 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (18): ChatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus, AppRealtimeListener (+10 more)

### Community 59 - "ref_node_http"
Cohesion: 0.22
Nodes (5): @tailwindcss/vite@^4.0.0, @tailwindcss/vite, attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured(), isSelfHostedAuthPath()

### Community 60 - "DepositRepo"
Cohesion: 0.27
Nodes (11): DepositConflictError, DepositNotFoundError, DepositRepo, ensureWalletLocked(), insertAuditLog(), mapWalletRow(), recomputeCompletedRealCashTotal(), resolveConfiguredMethodRates() (+3 more)

### Community 61 - "ChatRepo"
Cohesion: 0.22
Nodes (13): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+5 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.17
Nodes (15): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), MinimalAuthSession, SESSION_EXPIRED_USER_MESSAGE (+7 more)

### Community 65 - "DatabasePool"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 66 - "chat.ts"
Cohesion: 0.10
Nodes (38): CashoutRuleCategory, CashoutRuleKind, CashoutRuleOption, CashoutRulesConfig, cloneCategory(), cloneDefaultCashoutRulesConfig(), computeCashoutRulesVersion(), DEFAULT_CASHOUT_RULES_CONFIG (+30 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+6 more)

### Community 68 - "realtime.test.ts"
Cohesion: 0.13
Nodes (18): canUserReceiveRealtimeEvent(), createRealtimeRouter(), readLastEventId(), RealtimeRouterDeps, createTestConfig(), createTestServer(), httpRequest(), InMemoryAppConfigRow (+10 more)

### Community 69 - "referrals.ts"
Cohesion: 0.23
Nodes (23): ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter(), resolveActor() (+15 more)

### Community 70 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 71 - "notifications.test.ts"
Cohesion: 0.13
Nodes (15): WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer(), httpJsonRequest(), InMemoryAuthLinkRow (+7 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryUserRow (+2 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.16
Nodes (12): EmailDeliveryUnavailableError, createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow (+4 more)

### Community 75 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 76 - "express"
Cohesion: 0.11
Nodes (26): express, AdminDirectoryUserRecord, ResolvedAppUser, AuthContext, AuthSessionSummary, createOptionalAuthMiddleware(), createRequireAuthMiddleware(), Express (+18 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow, InMemoryUserRow (+3 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.07
Nodes (44): AdminAppConfigResult, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, ClaimTelegramDispatchResult, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+36 more)

### Community 79 - "AdminReferralGovernancePanel.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 80 - "profile.test.ts"
Cohesion: 0.22
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+3 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.10
Nodes (21): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, defaultBonusPctForMethod(), DepositRecord, DepositValidationError, escapeIlikePattern(), ListDepositsOptions (+13 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.21
Nodes (11): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+3 more)

### Community 87 - "chatPresentationUtils.ts"
Cohesion: 0.36
Nodes (10): buildGroupedMessages(), filterVisibleMessagesForRole(), formatChatDateDivider(), formatConversationTimestamp(), getLocalDateKey(), getTicketStatusMeta(), GroupedChatMessage, isMessageInternalNote() (+2 more)

### Community 88 - "ref_node_assert"
Cohesion: 0.15
Nodes (13): QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer(), createCaptureEmailAdapter() (+5 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.18
Nodes (14): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, getSupabaseConfig(), isPlaceholder(), resolveProjectId(), resolveSupabaseAnonKey() (+6 more)

### Community 90 - "TelegramService"
Cohesion: 0.22
Nodes (10): TelegramBotConfigCard(), TelegramService, telegramService, TelegramStatus, coerceSafeFeedbackText(), extractTelegramApiError(), MAX_TELEGRAM_SUPPRESSION_MINUTES, MIN_TELEGRAM_SUPPRESSION_MINUTES (+2 more)

### Community 91 - "runExportSnapshot"
Cohesion: 0.22
Nodes (13): canonicalizeJsonValue(), compareFinancialAggregates(), computeFinancialAggregates(), computeTableChecksum(), DataMigrationIntegrityError, formatCents(), normalizeMoneyString(), runExportSnapshot() (+5 more)

### Community 92 - "extractCanonicalSourceBundle"
Cohesion: 0.27
Nodes (10): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), deterministicBaUserId(), extractCanonicalSourceBundle(), getTimestampBounds(), inspectSchemaMeta(), normalizeIsoTimestamp(), normalizePartnerUpdatedBy() (+2 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.18
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow, InMemoryMessageRow (+4 more)

### Community 95 - "ChatTransactionCard.tsx"
Cohesion: 0.39
Nodes (6): ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), ChatTransactionData

### Community 97 - "realtimeChatHub.ts"
Cohesion: 0.20
Nodes (8): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.13
Nodes (12): ChatEventEnvelope, SseEventMeta, AuditLogRealtimePayload, RealtimeAudience, RealtimeEventBroker, RealtimeEventEnvelope, RealtimeStreamEvent, RealtimeStreamSubscriber (+4 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.13
Nodes (22): AdminChatTopUpModal(), TopUpModalMode, CustomerTopUp(), CustomerTopUpProps, loadCustomerTopUp(), fileToBase64(), StorageService, storageService (+14 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.27
Nodes (13): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, escapeHtml() (+5 more)

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.15
Nodes (7): DataMigrationConfig, MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 104 - "dataService"
Cohesion: 0.17
Nodes (16): PolicyAndPartnerCmsCard(), LegalContent(), LegalContentProps, renderInlines(), SafeFormattedText(), SafeFormattedTextProps, AdminConfig(), AdminConfigProps (+8 more)

### Community 105 - "dataMigration.ts"
Cohesion: 0.22
Nodes (10): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), databaseIdentityKey(), DataMigrationConfigError, loadDataMigrationConfig(), parseBoundedInt() (+2 more)

### Community 106 - "PWAInstallService"
Cohesion: 0.13
Nodes (13): BeforeInstallPromptEvent, Listener, PWAInstallService, pwaInstallService, PWAInstallSnapshot, detectInstallEnvironment(), getInstallPlatformLabel(), INSTALL_BANNER_DISMISS_STORAGE_KEY (+5 more)

### Community 108 - "runDataMigrationImport"
Cohesion: 0.31
Nodes (9): advanceTargetSequences(), deserializeBundleFromDisk(), MigrationQueryable, runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly(), upsertBatchIntoTarget() (+1 more)

### Community 109 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 110 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 113 - "UserRole"
Cohesion: 0.09
Nodes (28): SessionHydrationScreen(), SessionHydrationScreenProps, SessionTimeoutWarningModalProps, StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, authSessionService (+20 more)

### Community 114 - "chatEvents.ts"
Cohesion: 0.17
Nodes (5): ChatEventBroker, parseSseEventCursor(), SseReplayResult, ChatRouterDeps, WheelRouterDeps

### Community 117 - "safeAreaUtils.ts"
Cohesion: 0.27
Nodes (10): checkElementClearsSafeArea(), computeSafeModalBounds(), computeSafeSheetMaxHeight(), computeSafeToastTopOffset(), DYNAMIC_ISLAND_PWA_INSETS, IPHONE_11_PWA_INSETS, SafeAreaClearanceResult, SafeAreaInsets (+2 more)

### Community 120 - "web-push"
Cohesion: 0.67
Nodes (3): getWebPushClient(), web-push@^3.6.7, web-push

### Community 121 - "EmailDeliveryAdapter"
Cohesion: 0.09
Nodes (16): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, RecordingEmailDelivery, createCaptureEmailAdapter() (+8 more)

## Knowledge Gaps
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `App.tsx`, `officialPartnersUtils.ts`, `lucide-react`, `wheelOfLuckUtils.ts`, `DataService`, `dataService.ts`, `react`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `extractServerApiError`, `UserProfile`, `.createStaffTopUpAsync`, `react`, `AdminUsers.tsx`, `AdminChat.tsx`, `chatOrderUtils.ts`, `GameCatalogItem`, `AdminGameCatalog.tsx`, `GameAccount`, `types.ts`, `authTokenUtils.ts`, `AdminReferralGovernancePanel.tsx`, `.getPasswordResetTokens`, `ChatTransactionCard.tsx`, `CustomerTopUp.tsx`, `dataService`, `UserRole`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08797814207650273 - nodes in this community are weakly interconnected._
- **Why does `express` connect `express` to `gameAccounts.ts`, `app.ts`, `chat.ts`, `deposits.ts`, `realtime.test.ts`, `referrals.ts`, `devDependencies`, `storage.ts`, `officialPartners.ts`, `withdrawalRepo.ts`, `wallet.ts`, `HttpError`, `better-auth`, `appConfig.ts`, `notifications.ts`, `adminAuth.ts`, `env.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `app.ts` to `InMemoryDatabasePool`, `officialPartners.ts`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `env.ts`, `gameAccounts.ts`, `withdrawalRepo.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `notifications.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `DepositRepo`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `realtime.test.ts`, `notifications.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `profile.test.ts`, `adminUsers.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `appConfig.test.ts`, `chat.test.ts`, `EmailDeliveryAdapter`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08686868686868687 - nodes in this community are weakly interconnected._