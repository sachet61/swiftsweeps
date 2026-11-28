# Graph Report - swiftsweeps  (2026-11-28)

## Corpus Check
- 285 files · ~477,036 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3389 nodes · 10233 edges · 123 communities (105 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 155 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `544465a3`
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
- officialPartnerRepo.ts
- env.ts
- ref_node_assert
- appConfigRepo.ts
- api/index.ts
- gameAccounts.ts
- wallet.ts
- pool.ts
- withdrawalRepo.ts
- deposits.ts
- .createStaffTopUpAsync
- SwiftSweepsLogo
- tests/auditLogs.test.ts
- storage.ts
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- HttpError
- migrations.ts
- WebPushClient
- better-auth
- GameCatalogItem
- notifications.ts
- CustomerHome.tsx
- adminAuth.ts
- InMemoryAdminUsersDatabase
- userDirectoryRepo.ts
- GameAccount
- chatRepo.ts
- .getAppConfig
- chatStreamClient.ts
- foundation.test.ts
- AppConfigRepo
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- DatabaseClient
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
- cashoutRules.ts
- app.ts
- deposits.test.ts
- telegramSuppression.ts
- pushUtils.ts
- wheel.ts
- adminUsers.test.ts
- DatabasePool
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- uiCopyUtils.ts
- GlobalChatNotificationManager.tsx
- profile.test.ts
- supabaseClient.ts
- TelegramBotConfigCard.tsx
- runExportSnapshot
- RealtimeStreamClient
- .save
- appConfig.test.ts
- tests/auditLogs.test.ts
- NotificationSoundService
- realtimeChatHub.ts
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- telegramDispatch.ts
- dataMigration.test.ts
- devDependencies
- extractCanonicalSourceBundle
- dataMigration.ts
- PWAInstallService
- InMemoryGameAccountDatabase
- runDataMigrationImport
- officialPartnerHandlers.ts
- chat.test.ts
- InMemoryWalletDatabase
- InMemoryWithdrawalDatabase
- InMemoryDepositDatabase
- chatEvents.ts
- InMemoryOfficialPartnersDatabase
- AuthTokenCoordinator
- safeAreaUtils.ts
- MockEventSource
- InMemoryRealtimeDatabase
- InMemoryWheelDatabase
- realtime.test.ts
- ChatConflictError

## God Nodes (most connected - your core abstractions)
1. `DataService` - 241 edges
2. `HttpError` - 196 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 85 edges
5. `react` - 76 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 65 edges
8. `UserDirectoryRepo` - 54 edges
9. `App()` - 54 edges
10. `createLogger()` - 52 edges

## Surprising Connections (you probably didn't know these)
- `handleGetOfficialPartners()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleUpdateOfficialPartner()` --calls--> `isPartnerPlatform()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleUpdateOfficialPartner()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (123 total, 18 thin omitted)

### Community 1 - "gameAccounts.ts"
Cohesion: 0.15
Nodes (28): ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS, ALLOWED_STAFF_UPDATE_KEYS, ALLOWED_STATUS_VALUES, assertAllowedKeys() (+20 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.08
Nodes (54): App(), LazyEmailVerificationBanner, GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), SessionTimeoutWarningModal(), CustomerMobileNav() (+46 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (42): AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus, GameCatalogItem (+34 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.07
Nodes (62): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, PolicyAndPartnerCmsCard() (+54 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "officialPartners.ts"
Cohesion: 0.12
Nodes (37): HttpError, OfficialPartnerSortField, OfficialPartnerSortOrder, PartnerPlatform, ALLOWED_ICON_MIME_TYPES, ALLOWED_ICON_UPLOAD_BODY_KEYS, ALLOWED_PARTNER_BODY_KEYS, ALLOWED_PARTNER_HOSTS (+29 more)

### Community 10 - "lucide-react"
Cohesion: 0.20
Nodes (21): CashoutRulesAdminCard(), CashoutRulesAdminCardProps, PinnedCashoutRulesBanner(), PinnedCashoutRulesBannerProps, CashoutRulesShowcase(), CashoutRulesShowcaseProps, AppConfig, CashoutRuleCategory (+13 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (62): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+54 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.04
Nodes (86): AdminOfficialPartnersTabProps, AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS (+78 more)

### Community 16 - "react"
Cohesion: 0.07
Nodes (37): lucide-react, react, react-dom, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword() (+29 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (36): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+28 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.11
Nodes (15): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+7 more)

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.08
Nodes (25): PgSslMode, CANONICAL_IMPORT_ORDER, CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, DataMigrationConfig, DryRunReport, EnvValidationInput (+17 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (32): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+24 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.14
Nodes (43): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+35 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (39): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+31 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.09
Nodes (23): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+15 more)

### Community 27 - "officialPartnerRepo.ts"
Cohesion: 0.11
Nodes (19): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+11 more)

### Community 28 - "env.ts"
Cohesion: 0.13
Nodes (22): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+14 more)

### Community 29 - "ref_node_assert"
Cohesion: 0.17
Nodes (12): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccount (+4 more)

### Community 30 - "appConfigRepo.ts"
Cohesion: 0.10
Nodes (19): AdminAppConfigResult, AppConfigUpdateInput, AppConfigValidationError, ClaimTelegramDispatchResult, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError, FakedCashoutRecord (+11 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (50): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+42 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.07
Nodes (34): DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord (+26 more)

### Community 33 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 34 - "pool.ts"
Cohesion: 0.12
Nodes (24): pg@^8.23.1, better-auth, pg, ApiAppDependencies, TelegramFetchFn, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS (+16 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.09
Nodes (25): CreateCustomerWithdrawalInput, CreateStaffWithdrawalInput, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow(), mapWithdrawalRow() (+17 more)

### Community 36 - "deposits.ts"
Cohesion: 0.13
Nodes (32): DepositSortField, DepositSortOrder, DepositStatusValue, ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS (+24 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.14
Nodes (13): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+5 more)

### Community 38 - "SwiftSweepsLogo"
Cohesion: 0.14
Nodes (24): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS (+16 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.10
Nodes (25): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, AuditLogRepo, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult (+17 more)

### Community 40 - "storage.ts"
Cohesion: 0.12
Nodes (32): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+24 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.10
Nodes (31): PWAInstallButton(), AuthenticatedUserMenuProps, RoleSwitcher(), WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, AdminMobileDrawer() (+23 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.11
Nodes (46): AdminChatCashoutModal(), AdminChatTopUpModal(), AdminChat(), AdminChatProps, TICKET_STATUS_OPTIONS, CustomerChat(), CustomerChatProps, notificationSoundService (+38 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.21
Nodes (18): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage() (+10 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.12
Nodes (26): loadLocalDotEnv(), resolveCandidateEnvPaths(), buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES (+18 more)

### Community 47 - "WebPushClient"
Cohesion: 0.07
Nodes (24): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, BrowserNotificationEnv, BrowserNotificationResult, claimNotificationAlertId(), dispatchBrowserNotification(), resolveSwRegistration() (+16 more)

### Community 48 - "better-auth"
Cohesion: 0.11
Nodes (18): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, react-dom@^19.0.0, tailwindcss@^4.0.0 (+10 more)

### Community 49 - "GameCatalogItem"
Cohesion: 0.16
Nodes (13): extractServerApiCode(), extractServerApiError(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+5 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (46): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+38 more)

### Community 51 - "CustomerHome.tsx"
Cohesion: 0.07
Nodes (49): LiveCashoutFeedList(), LiveCashoutFeedListProps, PWAInstallBanner(), GamePlatformCard(), GamePlatformCardProps, WheelStrip(), WheelStripProps, AdminGameCatalog() (+41 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.11
Nodes (29): AuthRuntime, AdminUserSortField, AdminUserSortOrder, AppUserStatus, AdminAuthRouterDeps, ALLOWED_CREATE_BODY_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_ROLE_BODY_KEYS (+21 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (30): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserForbiddenError, AdminUserGameAccountSummary, AdminUserNotFoundError, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource (+22 more)

### Community 55 - "GameAccount"
Cohesion: 0.32
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "chatRepo.ts"
Cohesion: 0.08
Nodes (33): AppConfigActor, AppUserRole, ChatTicketStatus, ChatAttachmentRecord, ChatSenderRole, EnsureConversationInput, escapeIlikePattern(), extractStorageLocationFromUrl() (+25 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.12
Nodes (17): ChatStreamClient, chatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus (+9 more)

### Community 59 - "foundation.test.ts"
Cohesion: 0.11
Nodes (10): createSilentLogger(), createCaptureEmailAdapter(), createStorageTestServer(), signupAndLogin(), createTestConfig(), extractCookies(), httpRequest(), attachSelfHostedProxyMiddleware() (+2 more)

### Community 60 - "AppConfigRepo"
Cohesion: 0.27
Nodes (7): AppConfigRepo, mapFakedCashoutRow(), roundMoney(), runQuery(), toIsoString(), writeSettingsAuditLog(), pruneTimestampMap()

### Community 61 - "ChatRepo"
Cohesion: 0.25
Nodes (12): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+4 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "DatabaseClient"
Cohesion: 0.18
Nodes (7): DatabaseClient, StorageRouterDeps, mapStorageRow(), StorageRepo, toBuffer(), toIsoString(), InMemoryAppConfigDatabase

### Community 65 - "DatabasePool"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 66 - "chat.ts"
Cohesion: 0.13
Nodes (28): TelegramDispatcher, ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS (+20 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+6 more)

### Community 68 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

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
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "cashoutRules.ts"
Cohesion: 0.24
Nodes (12): CashoutRuleCategory, CashoutRuleKind, CashoutRuleOption, CashoutRulesConfig, cloneCategory(), cloneDefaultCashoutRulesConfig(), computeCashoutRulesVersion(), DEFAULT_CASHOUT_RULES_CONFIG (+4 more)

### Community 76 - "app.ts"
Cohesion: 0.08
Nodes (40): express, createApiApp(), AdminDirectoryUserRecord, ResolvedAppUser, GameAccountRepo, AuthContext, AuthSessionSummary, createOptionalAuthMiddleware() (+32 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow, InMemoryUserRow (+3 more)

### Community 78 - "telegramSuppression.ts"
Cohesion: 0.17
Nodes (20): parseJsonObject(), redactTelegramConfig(), sanitizeAdminAppConfigData(), sanitizePublicAppConfigData(), canonicalCooldownKeyForCustomer(), canonicalCustomerIdFromInput(), DEFAULT_TELEGRAM_SUPPRESSION_MINUTES, evaluateTelegramSuppression() (+12 more)

### Community 79 - "pushUtils.ts"
Cohesion: 0.21
Nodes (11): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+3 more)

### Community 80 - "wheel.ts"
Cohesion: 0.17
Nodes (15): ChatEventBroker, ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor(), dispatchBonusLoadTelegramAlert(), mapRepoError() (+7 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "DatabasePool"
Cohesion: 0.10
Nodes (10): DatabasePool, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+3 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.11
Nodes (32): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo (+24 more)

### Community 86 - "uiCopyUtils.ts"
Cohesion: 0.10
Nodes (26): AdminReferralGovernancePanel(), RealtimeSyncBadge(), RealtimeSyncBadgeProps, renderInlines(), SafeFormattedTextProps, AdminAudit(), AdminAuditProps, AdminDashboard() (+18 more)

### Community 87 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.33
Nodes (7): GlobalChatNotificationManagerProps, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage()

### Community 88 - "profile.test.ts"
Cohesion: 0.24
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.18
Nodes (14): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, getSupabaseConfig(), isPlaceholder(), resolveProjectId(), resolveSupabaseAnonKey() (+6 more)

### Community 90 - "TelegramBotConfigCard.tsx"
Cohesion: 0.23
Nodes (12): TelegramBotConfigCard(), TelegramService, telegramService, TelegramStatus, coerceSafeFeedbackText(), extractTelegramApiError(), formatTelegramDiagnosticSummary(), MAX_TELEGRAM_SUPPRESSION_MINUTES (+4 more)

### Community 91 - "runExportSnapshot"
Cohesion: 0.20
Nodes (14): canonicalizeJsonValue(), compareFinancialAggregates(), computeFinancialAggregates(), computeTableChecksum(), DataMigrationIntegrityError, formatCents(), getTimestampBounds(), normalizeMoneyString() (+6 more)

### Community 93 - ".save"
Cohesion: 0.14
Nodes (3): parseGameCatalogApiError(), AppNotification, PasswordResetToken

### Community 94 - "appConfig.test.ts"
Cohesion: 0.18
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow, InMemoryMessageRow (+4 more)

### Community 95 - "tests/auditLogs.test.ts"
Cohesion: 0.36
Nodes (7): QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer()

### Community 97 - "realtimeChatHub.ts"
Cohesion: 0.22
Nodes (7): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.09
Nodes (20): ChatEventEnvelope, parseSseEventCursor(), SseEventMeta, SseReplayResult, AuditLogRealtimePayload, canUserReceiveRealtimeEvent(), RealtimeAudience, RealtimeEventBroker (+12 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.14
Nodes (20): CustomerTopUp(), CustomerTopUpProps, loadCustomerTopUp(), fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), PaymentMethodType (+12 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.30
Nodes (12): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, EmailDeliveryAdapterOptions, escapeHtml(), OtpEmailPurpose (+4 more)

### Community 101 - "telegramDispatch.ts"
Cohesion: 0.43
Nodes (7): createTelegramDispatcher(), DispatchTelegramNotificationParams, sendTelegramText(), TelegramSendResult, buildSuppressionLogMetadata(), scrubTelegramSecret(), TelegramDiagnosticEventType

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.16
Nodes (6): MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 104 - "extractCanonicalSourceBundle"
Cohesion: 0.43
Nodes (7): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), deterministicBaUserId(), extractCanonicalSourceBundle(), normalizeIsoTimestamp(), normalizePartnerUpdatedBy(), unpackPushSubscriptionsFromAppConfig()

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "PWAInstallService"
Cohesion: 0.13
Nodes (13): BeforeInstallPromptEvent, Listener, PWAInstallService, pwaInstallService, PWAInstallSnapshot, detectInstallEnvironment(), getInstallPlatformLabel(), INSTALL_BANNER_DISMISS_STORAGE_KEY (+5 more)

### Community 108 - "runDataMigrationImport"
Cohesion: 0.27
Nodes (10): advanceTargetSequences(), deserializeBundleFromDisk(), inspectSchemaMeta(), MigrationQueryable, runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly() (+2 more)

### Community 109 - "officialPartnerHandlers.ts"
Cohesion: 0.23
Nodes (20): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+12 more)

### Community 110 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 114 - "chatEvents.ts"
Cohesion: 0.28
Nodes (8): ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ListConversationsResult, ListMessagesResult, PinCashoutRulesResult, SendMessageResult

### Community 116 - "AuthTokenCoordinator"
Cohesion: 0.14
Nodes (10): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+2 more)

### Community 117 - "safeAreaUtils.ts"
Cohesion: 0.27
Nodes (10): checkElementClearsSafeArea(), computeSafeModalBounds(), computeSafeSheetMaxHeight(), computeSafeToastTopOffset(), DYNAMIC_ISLAND_PWA_INSETS, IPHONE_11_PWA_INSETS, SafeAreaClearanceResult, SafeAreaInsets (+2 more)

### Community 121 - "realtime.test.ts"
Cohesion: 0.08
Nodes (21): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, createTestConfig(), createTestServer() (+13 more)

## Knowledge Gaps
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `DataService`, `dataService.ts`, `react`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `.createStaffTopUpAsync`, `AdminUsers.tsx`, `AdminChat.tsx`, `chatOrderUtils.ts`, `GameCatalogItem`, `CustomerHome.tsx`, `GameAccount`, `.getAppConfig`, `uiCopyUtils.ts`, `GlobalChatNotificationManager.tsx`, `.save`, `CustomerTopUp.tsx`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08735150244584207 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `officialPartners.ts`, `appConfig.ts`, `env.ts`, `wallet.ts`, `pool.ts`, `deposits.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `better-auth`, `notifications.ts`, `adminAuth.ts`, `chat.ts`, `withdrawals.ts`, `referrals.ts`, `wheel.ts`, `RealtimeEventBroker`, `devDependencies`, `realtime.test.ts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1477832512315271 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `DatabasePool` to `InMemoryDatabasePool`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `officialPartnerRepo.ts`, `appConfigRepo.ts`, `gameAccounts.ts`, `pool.ts`, `withdrawalRepo.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `migrations.ts`, `notifications.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `foundation.test.ts`, `AppConfigRepo`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabaseClient`, `DatabasePool`, `tests/wheel.test.ts`, `notifications.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `app.ts`, `deposits.test.ts`, `adminUsers.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `profile.test.ts`, `appConfig.test.ts`, `chat.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07814207650273224 - nodes in this community are weakly interconnected._