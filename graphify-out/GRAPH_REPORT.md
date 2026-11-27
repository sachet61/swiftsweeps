# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 263 files · ~455,037 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3238 nodes · 9682 edges · 115 communities (100 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce317ec9`
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
- tests/auditLogs.test.ts
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- DatabaseClient
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
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
- officialPartnerRepo.ts
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
- chat.test.ts
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
- wallet.test.ts
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- pushUtils.ts
- .getAppConfig
- profile.test.ts
- supabaseClient.ts
- uiCopyUtils.ts
- InMemoryWalletDatabase
- pwaAssets.ts
- DatabasePool
- appConfig.test.ts
- wallet.ts
- InMemoryWithdrawalDatabase
- InMemoryDepositDatabase
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- .getCurrentUser
- dataMigration.test.ts
- devDependencies
- InMemoryOfficialPartnersDatabase
- dataMigration.ts
- extractCanonicalSourceBundle
- api/auditLogs.test.ts
- runDataMigrationImport
- @supabase/supabase-js
- realtimeChatHub.ts
- tailwindcss@^4.0.0
- gameAccountUtils.ts
- runExportSnapshot
- realtime.test.ts

## God Nodes (most connected - your core abstractions)
1. `DataService` - 237 edges
2. `HttpError` - 194 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 69 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 60 edges
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

## Communities (115 total, 15 thin omitted)

### Community 1 - "gameAccounts.ts"
Cohesion: 0.13
Nodes (32): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+24 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (46): App(), LazyEmailVerificationBanner, LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, LiveCashoutTicker(), SessionTimeoutWarningModal() (+38 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.06
Nodes (82): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+74 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "officialPartners.ts"
Cohesion: 0.11
Nodes (36): OfficialPartnerSortField, OfficialPartnerSortOrder, PartnerPlatform, ALLOWED_ICON_MIME_TYPES, ALLOWED_ICON_UPLOAD_BODY_KEYS, ALLOWED_PARTNER_BODY_KEYS, ALLOWED_PARTNER_HOSTS, ALLOWED_PLATFORMS (+28 more)

### Community 10 - ".saveToLocalStorage"
Cohesion: 0.13
Nodes (3): AppNotification, PasswordResetToken, WalletTransaction

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (66): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+58 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.07
Nodes (54): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+46 more)

### Community 15 - "dataService.ts"
Cohesion: 0.09
Nodes (32): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS (+24 more)

### Community 16 - "lucide-react"
Cohesion: 0.12
Nodes (21): lucide-react, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+13 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (35): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+27 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.09
Nodes (22): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+14 more)

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.09
Nodes (25): PgSslMode, CANONICAL_IMPORT_ORDER, CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, DataMigrationConfig, DryRunReport, EnvValidationInput (+17 more)

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
Cohesion: 0.09
Nodes (24): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+16 more)

### Community 27 - "WebPushClient"
Cohesion: 0.15
Nodes (8): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.13
Nodes (22): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+14 more)

### Community 29 - "tests/auditLogs.test.ts"
Cohesion: 0.36
Nodes (7): QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer()

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (15): CustomerTopUp(), loadCustomerTopUp(), TelegramService, telegramService, TelegramStatus, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft() (+7 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), fetchSupabaseJwksKeys() (+35 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.07
Nodes (34): AppUserRole, DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError (+26 more)

### Community 33 - "DatabaseClient"
Cohesion: 0.18
Nodes (4): DatabaseClient, InMemoryAppConfigDatabase, InMemoryRealtimeDatabase, InMemoryWheelDatabase

### Community 34 - "app.ts"
Cohesion: 0.08
Nodes (40): express, createApiApp(), AuditLogRepo, AdminDirectoryUserRecord, ResolvedAppUser, AuthContext, AuthSessionSummary, createOptionalAuthMiddleware() (+32 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.09
Nodes (25): CreateCustomerWithdrawalInput, CreateStaffWithdrawalInput, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow(), mapWithdrawalRow() (+17 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.13
Nodes (17): ApiAppDependencies, ServerConfig, WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer() (+9 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.17
Nodes (12): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+4 more)

### Community 38 - "react"
Cohesion: 0.11
Nodes (31): react-dom@^19.0.0, react, react-dom, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps (+23 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.09
Nodes (24): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult, mapAuditLogRow() (+16 more)

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
Cohesion: 0.11
Nodes (46): AdminChatTopUpModal(), ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), chatStreamClient (+38 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.10
Nodes (28): loadLocalDotEnv(), resolveCandidateEnvPaths(), buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES (+20 more)

### Community 48 - "better-auth"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, @tailwindcss/vite@^4.0.0, @types/express@^5.0.6 (+9 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.23
Nodes (13): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+5 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (46): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+38 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.09
Nodes (33): SessionHydrationScreen(), SessionHydrationScreenProps, StartupSplash(), StartupSplashProps, getPrefetchRouteKeysForRole(), HydrationGateInput, HydrationPhaseLabelInput, resolveHydrationPhaseLabel() (+25 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.10
Nodes (31): AuthRuntime, AdminUserSortField, AdminUserSortOrder, AppUserStatus, AdminAuthRouterDeps, ALLOWED_CREATE_BODY_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_ROLE_BODY_KEYS (+23 more)

### Community 53 - "officialPartnerRepo.ts"
Cohesion: 0.09
Nodes (21): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+13 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.10
Nodes (22): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource, createEmptyWalletSummary(), EnsureUserForSignupInput (+14 more)

### Community 55 - "GameAccount"
Cohesion: 0.33
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "chatRepo.ts"
Cohesion: 0.08
Nodes (29): ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ChatTicketStatus, ChatAttachmentRecord, ChatConflictError, ChatSenderRole (+21 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.16
Nodes (22): LiveCashoutFeedList(), AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, CustomerWithdrawal(), loadAdminGameCatalog(), loadCustomerWithdrawal(), applyGameCatalogRealtimeEvents() (+14 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (18): ChatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus, AppRealtimeListener (+10 more)

### Community 59 - "ref_node_http"
Cohesion: 0.16
Nodes (9): createCaptureEmailAdapter(), createStorageTestServer(), signupAndLogin(), createTestConfig(), extractCookies(), httpRequest(), attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured() (+1 more)

### Community 60 - "mapJoinedRow"
Cohesion: 0.26
Nodes (6): AdminUserForbiddenError, AdminUserNotFoundError, isParentAdminUser(), mapJoinedRow(), normalizeRole(), normalizeStatus()

### Community 61 - "ChatRepo"
Cohesion: 0.21
Nodes (13): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+5 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.12
Nodes (14): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+6 more)

### Community 65 - "DatabasePool"
Cohesion: 0.21
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 66 - "chat.ts"
Cohesion: 0.15
Nodes (26): ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_TICKET_STATUSES (+18 more)

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

### Community 71 - "chat.test.ts"
Cohesion: 0.07
Nodes (24): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, createTestConfig(), createTestServer(), httpRequest(), ilikeMatch() (+16 more)

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
Cohesion: 0.05
Nodes (55): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab (+47 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow, InMemoryUserRow (+3 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.09
Nodes (28): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+20 more)

### Community 80 - "wheel.ts"
Cohesion: 0.15
Nodes (17): ChatEventBroker, TelegramFetchFn, ChatRouterDeps, ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor() (+9 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.27
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow, signupAndSignIn() (+1 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+3 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.06
Nodes (65): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo (+57 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.31
Nodes (8): deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList(), RESERVED_NON_USER_IDS

### Community 88 - "profile.test.ts"
Cohesion: 0.22
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.11
Nodes (25): TelegramBotConfigCard(), ChatTransactionCardProps, AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), storageService (+17 more)

### Community 90 - "uiCopyUtils.ts"
Cohesion: 0.18
Nodes (18): PolicyAndPartnerCmsCard(), renderInlines(), SafeFormattedText(), SafeFormattedTextProps, decodeBasicHtmlEntities(), escapeHtmlText(), formatCompactDollar(), formatGameIdRequestChatMessage() (+10 more)

### Community 92 - "pwaAssets.ts"
Cohesion: 0.09
Nodes (20): MIN_SIGNUP_PASSWORD_LENGTH, RegistrationValidationInput, RegistrationValidationResult, validateRegistrationForm(), BrowserNotificationEnv, BrowserNotificationResult, claimNotificationAlertId(), dispatchBrowserNotification() (+12 more)

### Community 93 - "DatabasePool"
Cohesion: 0.09
Nodes (20): pg@^8.23.1, better-auth, pg, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), createConfiguredAdapter() (+12 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.19
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow, InMemoryUserRow (+3 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.10
Nodes (18): ChatEventEnvelope, parseSseEventCursor(), SseEventMeta, SseReplayResult, AuditLogRealtimePayload, canUserReceiveRealtimeEvent(), RealtimeAudience, RealtimeEventBroker (+10 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.22
Nodes (12): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl() (+4 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.30
Nodes (12): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, EmailDeliveryAdapterOptions, escapeHtml(), OtpEmailPurpose (+4 more)

### Community 101 - ".getCurrentUser"
Cohesion: 0.21
Nodes (4): extractServerApiCode(), extractServerApiError(), AuditLog, normalizeAuditLogRow()

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.18
Nodes (6): MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "extractCanonicalSourceBundle"
Cohesion: 0.36
Nodes (8): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), deterministicBaUserId(), extractCanonicalSourceBundle(), inspectSchemaMeta(), normalizeIsoTimestamp(), normalizePartnerUpdatedBy(), unpackPushSubscriptionsFromAppConfig()

### Community 107 - "api/auditLogs.test.ts"
Cohesion: 0.19
Nodes (8): decodeJwtPartJson(), handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), verifyJwtWithJwkSet(), writeServerAuditLog()

### Community 108 - "runDataMigrationImport"
Cohesion: 0.29
Nodes (9): advanceTargetSequences(), deserializeBundleFromDisk(), MigrationQueryable, runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly(), upsertBatchIntoTarget() (+1 more)

### Community 110 - "realtimeChatHub.ts"
Cohesion: 0.29
Nodes (6): realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 112 - "gameAccountUtils.ts"
Cohesion: 0.33
Nodes (9): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccountStatus (+1 more)

### Community 113 - "runExportSnapshot"
Cohesion: 0.20
Nodes (14): canonicalizeJsonValue(), compareFinancialAggregates(), computeFinancialAggregates(), computeTableChecksum(), DataMigrationIntegrityError, formatCents(), getTimestampBounds(), normalizeMoneyString() (+6 more)

### Community 121 - "realtime.test.ts"
Cohesion: 0.15
Nodes (14): createTestConfig(), createTestServer(), httpRequest(), InMemoryAppConfigRow, InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow (+6 more)

## Knowledge Gaps
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `officialPartners.ts`, `appConfig.ts`, `env.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `better-auth`, `notifications.ts`, `adminAuth.ts`, `chat.ts`, `withdrawals.ts`, `referrals.ts`, `wheel.ts`, `depositRepo.ts`, `DatabasePool`, `wallet.ts`, `RealtimeEventBroker`, `devDependencies`, `realtime.test.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.10175763182238667 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `DatabasePool` to `InMemoryDatabasePool`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `notifications.test.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `migrations.ts`, `notifications.ts`, `officialPartnerRepo.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `chat.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `adminUsers.test.ts`, `wallet.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `profile.test.ts`, `appConfig.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._
- **Why does `HttpError` connect `referrals.ts` to `gameAccounts.ts`, `app.ts`, `chat.ts`, `withdrawals.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `officialPartners.ts`, `HttpError`, `migrations.ts`, `wheel.ts`, `appConfig.ts`, `notifications.ts`, `adminAuth.ts`, `depositRepo.ts`, `wallet.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09023569023569024 - nodes in this community are weakly interconnected._