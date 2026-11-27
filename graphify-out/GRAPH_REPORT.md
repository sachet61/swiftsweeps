# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 271 files · ~459,097 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3288 nodes · 9807 edges · 124 communities (105 shown, 19 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `370eb55f`
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
- .saveToLocalStorage
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- referralRepo.ts
- dataService.ts
- lucide-react
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
- ref_node_assert
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- DatabaseClient
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
- toProxyStorageUrl
- HttpError
- migrations.ts
- NotificationSoundService
- better-auth
- AdminAudit.tsx
- notifications.ts
- assetPreloader.ts
- adminAuth.ts
- InMemoryAdminUsersDatabase
- userDirectoryRepo.ts
- GameAccount
- chatRepo.ts
- CustomerHome.tsx
- chatStreamClient.ts
- ref_node_http
- mapJoinedRow
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- withdrawals.ts
- referrals.ts
- logger.ts
- notifications.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- types.ts
- UserDirectoryRepo
- deposits.test.ts
- AppConfigRepo
- InMemoryGameAccountDatabase
- wheel.ts
- adminUsers.test.ts
- DatabasePool
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- pushUtils.ts
- .getAppConfig
- profile.test.ts
- supabaseClient.ts
- dataService
- InMemoryWalletDatabase
- pwaAssets.ts
- createLogger
- appConfig.test.ts
- wallet.ts
- InMemoryWithdrawalDatabase
- InMemoryDepositDatabase
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- ref_node_crypto
- dataMigration.test.ts
- devDependencies
- InMemoryOfficialPartnersDatabase
- dataMigration.ts
- PWAInstallService
- AdminChat
- runDataMigrationImport
- officialPartnerHandlers.ts
- chat.test.ts
- SupabaseAuthService
- AppUserRole
- UserRole
- chatEvents.ts
- GlobalChatNotificationManager.tsx
- AuthTokenCoordinator
- safeAreaUtils.ts
- InMemoryChatDatabase
- InMemoryWheelDatabase
- web-push
- realtime.test.ts
- nodemailer
- ChatNotFoundError

## God Nodes (most connected - your core abstractions)
1. `DataService` - 237 edges
2. `HttpError` - 194 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 72 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 61 edges
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

## Communities (124 total, 19 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.09
Nodes (4): DataService, extractServerApiCode(), extractServerApiError(), isSupabaseConfigured()

### Community 1 - "gameAccounts.ts"
Cohesion: 0.12
Nodes (33): GameAccountRecord, GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS (+25 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (50): App(), LazyEmailVerificationBanner, LazyPageFallback(), LegalContent(), SessionTimeoutWarningModal(), CustomerMobileNav(), StaffMobileNav(), useDataService() (+42 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

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
Nodes (56): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+48 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (66): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+58 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "ChatMessage"
Cohesion: 0.16
Nodes (6): mergeAuthoritativeMessages(), mergeSingleMessage(), sortAndDeduplicateMessages(), ChatMessage, SupportConversation, filterVisibleMessagesForRole()

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.08
Nodes (36): AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS (+28 more)

### Community 16 - "lucide-react"
Cohesion: 0.11
Nodes (28): lucide-react, react, react-dom, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps (+20 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (35): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+27 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (19): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+11 more)

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.08
Nodes (45): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), CANONICAL_IMPORT_ORDER, canonicalizeJsonValue(), CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, compareFinancialAggregates() (+37 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (32): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+24 more)

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
Cohesion: 0.14
Nodes (10): arrayBufferToBase64(), DevicePlatform, urlBase64ToUint8Array(), WebPushClient, webPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload (+2 more)

### Community 28 - "env.ts"
Cohesion: 0.13
Nodes (22): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+14 more)

### Community 29 - "ref_node_assert"
Cohesion: 0.10
Nodes (12): QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer(), createSilentLogger() (+4 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.14
Nodes (24): CustomerTopUp(), CustomerWithdrawal(), loadCustomerTopUp(), loadCustomerWithdrawal(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), countUnsavedCatalogChanges(), filterEnabledGameAccounts() (+16 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (47): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+39 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.09
Nodes (27): DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRepo (+19 more)

### Community 33 - "DatabaseClient"
Cohesion: 0.24
Nodes (3): DatabaseClient, InMemoryAppConfigDatabase, InMemoryRealtimeDatabase

### Community 34 - "app.ts"
Cohesion: 0.10
Nodes (34): express, ApiAppDependencies, createApiApp(), CreateAuthInstanceDeps, ServerConfig, checkDatabaseConnectivity(), resolveSslOption(), StartedApiServer (+26 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.09
Nodes (26): WithdrawalRouterDeps, CreateCustomerWithdrawalInput, CreateStaffWithdrawalInput, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow() (+18 more)

### Community 36 - "deposits.ts"
Cohesion: 0.13
Nodes (32): DepositSortField, DepositSortOrder, DepositStatusValue, ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS (+24 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.18
Nodes (12): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+4 more)

### Community 38 - "react"
Cohesion: 0.13
Nodes (26): PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, AgentMobileDrawer() (+18 more)

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
Cohesion: 0.17
Nodes (23): AdminChatTopUpModal(), TICKET_STATUS_OPTIONS, loadAdminChat(), loadCustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), formatChatDateDivider() (+15 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.47
Nodes (7): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId(), parseTransactionDataField()

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 48 - "better-auth"
Cohesion: 0.11
Nodes (18): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0, tailwindcss@^4.0.0 (+10 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.14
Nodes (16): AdminAudit(), AdminAuditProps, loadAdminAudit(), parseGameCatalogApiError(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv() (+8 more)

### Community 50 - "notifications.ts"
Cohesion: 0.13
Nodes (32): NotificationType, ALLOWED_CREATE_NOTIFICATION_KEYS, ALLOWED_NOTIFICATION_QUERY_KEYS, ALLOWED_NOTIFICATION_TYPES, ALLOWED_NOTIFY_KEYS, ALLOWED_PUSH_ACTION_TYPES, ALLOWED_PUSH_STATUS_QUERY_KEYS, ALLOWED_SUBSCRIBE_KEYS (+24 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.11
Nodes (33): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog(), loadCustomerGameAccounts() (+25 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.09
Nodes (34): AuthRuntime, AdminDirectoryUserRecord, AdminUserSortField, AdminUserSortOrder, AppUserStatus, ResolvedAppUser, AuthContext, AdminAuthRouterDeps (+26 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.10
Nodes (22): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource, createEmptyWalletSummary(), EnsureUserForSignupInput (+14 more)

### Community 55 - "GameAccount"
Cohesion: 0.19
Nodes (12): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), parseGameAccountApiError(), toFixedMoney(), VALID_STATUSES (+4 more)

### Community 56 - "chatRepo.ts"
Cohesion: 0.11
Nodes (24): ChatConversationPayload, ChatMessagePayload, ChatTicketStatus, ChatAttachmentRecord, ChatConflictError, ChatSenderRole, enrichMessageRow(), extractStorageLocationFromUrl() (+16 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.17
Nodes (14): LiveCashoutFeedList(), LiveCashoutFeedListProps, PWAInstallBanner(), PWAInstallBannerProps, GamePlatformCard(), WheelStrip(), WheelStripProps, CustomerHome() (+6 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (19): ChatStreamClient, chatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus (+11 more)

### Community 59 - "ref_node_http"
Cohesion: 0.16
Nodes (9): createCaptureEmailAdapter(), createStorageTestServer(), signupAndLogin(), createTestConfig(), extractCookies(), httpRequest(), attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured() (+1 more)

### Community 60 - "mapJoinedRow"
Cohesion: 0.26
Nodes (6): AdminUserForbiddenError, AdminUserNotFoundError, isParentAdminUser(), mapJoinedRow(), normalizeRole(), normalizeStatus()

### Community 61 - "ChatRepo"
Cohesion: 0.25
Nodes (10): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatRepo, ChatValidationError, escapeIlikePattern(), extractCustomerIdFromConvId(), isStaffRole(), mapConversationRow() (+2 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.16
Nodes (16): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+8 more)

### Community 65 - "DatabasePool"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 66 - "chat.ts"
Cohesion: 0.13
Nodes (28): ListMessagesOptions, SendMessageInput, ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS (+20 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+6 more)

### Community 68 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 69 - "referrals.ts"
Cohesion: 0.25
Nodes (24): HttpError, ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter() (+16 more)

### Community 70 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 71 - "notifications.test.ts"
Cohesion: 0.08
Nodes (20): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, WebPushSendOptions, WebPushSubscriptionTarget, RecordingEmailDelivery, createTestConfig() (+12 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryUserRow (+2 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "types.ts"
Cohesion: 0.04
Nodes (57): AdminOfficialPartnersTabProps, AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, EmailOtpModalProps, AdminChatTopUpModalProps (+49 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow, InMemoryUserRow (+3 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.10
Nodes (27): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+19 more)

### Community 80 - "wheel.ts"
Cohesion: 0.13
Nodes (27): requireRole(), validateRequestBody(), TelegramFetchFn, ALLOWED_POST_BODY_KEYS, ALLOWED_QUERY_KEYS, assertSingleQueryString(), createAuditLogRouter(), FORBIDDEN_IMMUTABLE_FIELDS (+19 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "DatabasePool"
Cohesion: 0.12
Nodes (10): DatabasePool, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+3 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.12
Nodes (29): ApproveDepositInput, defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo, DepositValidationError, ensureWalletLocked() (+21 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.21
Nodes (11): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+3 more)

### Community 88 - "profile.test.ts"
Cohesion: 0.24
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.09
Nodes (25): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChatTransactionCardProps, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig (+17 more)

### Community 90 - "dataService"
Cohesion: 0.12
Nodes (15): PolicyAndPartnerCmsCard(), TelegramBotConfigCard(), renderInlines(), SafeFormattedText(), SafeFormattedTextProps, AdminConfig(), AdminConfigProps, QrCodeUploadBox() (+7 more)

### Community 92 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 93 - "createLogger"
Cohesion: 0.19
Nodes (15): better-auth, createAuthInstance(), EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), createEmailDeliveryAdapter(), EmailDeliveryUnavailableError, loadLocalDotEnv(), resolveCandidateEnvPaths() (+7 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.19
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow, InMemoryUserRow (+3 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.09
Nodes (24): ChatEventEnvelope, SseEventMeta, AuditLogRealtimePayload, RealtimeAudience, RealtimeEventBroker, RealtimeEventEnvelope, RealtimeStreamEvent, RealtimeStreamSubscriber (+16 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.22
Nodes (12): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl() (+4 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.27
Nodes (13): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, escapeHtml() (+5 more)

### Community 101 - "ref_node_crypto"
Cohesion: 0.11
Nodes (13): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+5 more)

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.15
Nodes (8): PgSslMode, DataMigrationConfig, MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "PWAInstallService"
Cohesion: 0.13
Nodes (12): BeforeInstallPromptEvent, Listener, PWAInstallService, pwaInstallService, PWAInstallSnapshot, detectInstallEnvironment(), INSTALL_BANNER_DISMISS_STORAGE_KEY, INSTALL_BANNER_SNOOZE_MS (+4 more)

### Community 107 - "AdminChat"
Cohesion: 0.18
Nodes (20): ChatTransactionCard(), AdminChat(), CustomerChat(), buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot (+12 more)

### Community 108 - "runDataMigrationImport"
Cohesion: 0.29
Nodes (9): advanceTargetSequences(), deserializeBundleFromDisk(), MigrationQueryable, runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly(), upsertBatchIntoTarget() (+1 more)

### Community 109 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 110 - "chat.test.ts"
Cohesion: 0.14
Nodes (15): createTestConfig(), createTestServer(), httpRequest(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryConversationRow, InMemoryMessageRow (+7 more)

### Community 112 - "AppUserRole"
Cohesion: 0.12
Nodes (16): AppUserRole, EnsureConversationInput, SaveChatAttachmentInput, UpdateTransactionCardStatusInput, CreateCustomerDepositInput, CreateStaffDepositInput, RejectDepositInput, ProvisionGameAccountInput (+8 more)

### Community 113 - "UserRole"
Cohesion: 0.15
Nodes (11): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential (+3 more)

### Community 114 - "chatEvents.ts"
Cohesion: 0.16
Nodes (6): ChatEventBroker, ChatStreamEvent, ChatStreamSubscriber, parseSseEventCursor(), SseReplayResult, ChatRouterDeps

### Community 115 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.26
Nodes (10): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage() (+2 more)

### Community 117 - "safeAreaUtils.ts"
Cohesion: 0.27
Nodes (10): checkElementClearsSafeArea(), computeSafeModalBounds(), computeSafeSheetMaxHeight(), computeSafeToastTopOffset(), DYNAMIC_ISLAND_PWA_INSETS, IPHONE_11_PWA_INSETS, SafeAreaClearanceResult, SafeAreaInsets (+2 more)

### Community 120 - "web-push"
Cohesion: 0.67
Nodes (3): getWebPushClient(), web-push@^3.6.7, web-push

### Community 121 - "realtime.test.ts"
Cohesion: 0.13
Nodes (18): canUserReceiveRealtimeEvent(), createRealtimeRouter(), readLastEventId(), RealtimeRouterDeps, createTestConfig(), createTestServer(), httpRequest(), InMemoryAppConfigRow (+10 more)

## Knowledge Gaps
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `chat.ts`, `RealtimeEventBroker`, `deposits.ts`, `referrals.ts`, `withdrawals.ts`, `devDependencies`, `storage.ts`, `officialPartners.ts`, `HttpError`, `better-auth`, `wheel.ts`, `appConfig.ts`, `notifications.ts`, `adminAuth.ts`, `realtime.test.ts`, `env.ts`, `wallet.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.09174714661984197 - nodes in this community are weakly interconnected._
- **Why does `DataService` connect `DataService` to `App.tsx`, `officialPartnersUtils.ts`, `.saveToLocalStorage`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `lucide-react`, `SelfHostedAuthService`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `.createStaffTopUpAsync`, `react`, `AdminUsers.tsx`, `AdminChat.tsx`, `AdminAudit.tsx`, `assetPreloader.ts`, `GameAccount`, `CustomerHome.tsx`, `authTokenUtils.ts`, `types.ts`, `.getAppConfig`, `supabaseClient.ts`, `dataService`, `UserRole`, `GlobalChatNotificationManager.tsx`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `DatabasePool` to `InMemoryDatabasePool`, `officialPartners.ts`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `ref_node_assert`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `userDirectoryRepo.ts`, `chatRepo.ts`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `notifications.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `adminUsers.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `profile.test.ts`, `createLogger`, `appConfig.test.ts`, `ref_node_crypto`, `chat.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08896103896103896 - nodes in this community are weakly interconnected._