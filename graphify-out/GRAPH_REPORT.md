# Graph Report - swiftsweeps  (2026-11-28)

## Corpus Check
- 281 files · ~473,512 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3359 nodes · 10126 edges · 114 communities (105 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 155 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bcca43f4`
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
- CustomerProfile.tsx
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
- AuthPage.tsx
- lucide-react
- api/index.ts
- gameAccounts.ts
- selfHostedAuthService.ts
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
- GlobalChatNotificationManager.tsx
- better-auth
- GameCatalogItem
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
- DepositRepo
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
- ref_node_crypto
- express
- deposits.test.ts
- AppConfigRepo
- webPushClient.ts
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- uiCopyUtils.ts
- PWAInstallService
- ref_node_assert
- supabaseClient.ts
- TelegramService
- runExportSnapshot
- authSessionService.ts
- .getPasswordResetTokens
- appConfig.test.ts
- realtimeChatHub.ts
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- dataMigration.test.ts
- devDependencies
- CustomerRules.tsx
- dataMigration.ts
- PWAInstallService
- runDataMigrationImport
- officialPartnerHandlers.ts
- chat.test.ts
- SupabaseAuthService
- UserRole
- chatEvents.ts
- AuthTokenCoordinator
- safeAreaUtils.ts
- web-push
- realtime.test.ts

## God Nodes (most connected - your core abstractions)
1. `DataService` - 241 edges
2. `HttpError` - 196 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 75 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 64 edges
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

## Communities (114 total, 9 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.08
Nodes (4): DataService, isSupabaseConfigured(), AppConfig, CashoutFeedItem

### Community 1 - "gameAccounts.ts"
Cohesion: 0.13
Nodes (32): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+24 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (56): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, SessionTimeoutWarningModal(), SessionTimeoutWarningModalProps (+48 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (46): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+38 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.10
Nodes (48): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+40 more)

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
Cohesion: 0.25
Nodes (18): CashoutRulesAdminCard(), CashoutRulesAdminCardProps, PinnedCashoutRulesBanner(), PinnedCashoutRulesBannerProps, CashoutRulesShowcase(), CashoutRulesShowcaseProps, CashoutRuleCategory, CashoutRulesConfig (+10 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (65): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+57 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "DataService"
Cohesion: 0.12
Nodes (7): extractServerApiCode(), extractServerApiError(), ChatMessage, ChatTransactionData, ReferralLedgerEntry, SupportConversation, TicketStatusValue

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.04
Nodes (78): AdminOfficialPartnersTabProps, AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, AdminChatCashoutModalProps, CashoutModalTab (+70 more)

### Community 16 - "CustomerProfile.tsx"
Cohesion: 0.17
Nodes (15): EmailOtpModal(), EmailOtpModalProps, EmailVerificationBanner(), EmailVerificationBannerProps, IOSPwaInstallModal(), IOSPwaInstallModalProps, ANDROID_STEPS, IOS_STEPS (+7 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (40): buildSuppressionLogMetadata(), canonicalCustomerIdFromInput(), validateSuppressionWindowMinutes(), HttpError, ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES (+32 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.18
Nodes (5): AuthStateSnapshot, deriveAuthMeTransition(), mapAuthErrorResponse(), ParsedAuthHttpPayload, SelfHostedAuthService

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.08
Nodes (33): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), CANONICAL_IMPORT_ORDER, CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, deterministicBaUserId(), DryRunReport (+25 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (31): CATEGORY_LABELS, CustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits(), computeCumulativeCompletedWithdrawals() (+23 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.14
Nodes (42): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+34 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (40): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+32 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.16
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 28 - "env.ts"
Cohesion: 0.09
Nodes (32): pg, ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret() (+24 more)

### Community 29 - "AuthPage.tsx"
Cohesion: 0.19
Nodes (12): ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, LiveCashoutTicker(), AuthPage(), AuthPageProps, selfHostedAuthService (+4 more)

### Community 30 - "lucide-react"
Cohesion: 0.22
Nodes (15): lucide-react, LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerWithdrawal(), dataService, applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), countUnsavedCatalogChanges() (+7 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (52): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+44 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.08
Nodes (29): escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord, GameAccountRepo (+21 more)

### Community 33 - "selfHostedAuthService.ts"
Cohesion: 0.12
Nodes (16): AuthMeResponsePayload, AuthStatus, buildUserProfileFromAuthMe(), looksLikeHtmlDocument(), MappedAuthFailure, normalizeAuthRole(), parseAuthHttpPayload(), FetchLike (+8 more)

### Community 34 - "app.ts"
Cohesion: 0.10
Nodes (28): ApiAppDependencies, createApiApp(), createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), EmailDeliveryAdapter, ServerConfig (+20 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.09
Nodes (26): WithdrawalRouterDeps, CreateCustomerWithdrawalInput, CreateStaffWithdrawalInput, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow() (+18 more)

### Community 36 - "deposits.ts"
Cohesion: 0.15
Nodes (28): ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_VALUES (+20 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.15
Nodes (13): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+5 more)

### Community 38 - "react"
Cohesion: 0.12
Nodes (29): react, react-dom, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopup() (+21 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.11
Nodes (14): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, AuditLogRepo, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult (+6 more)

### Community 40 - "storage.ts"
Cohesion: 0.09
Nodes (37): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+29 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.20
Nodes (18): RoleSwitcher(), AdminMobileDrawer(), ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer(), getAdminDrawerListItems() (+10 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.13
Nodes (40): AdminChatCashoutModal(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), filterVisibleMessagesForRole() (+32 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.23
Nodes (17): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage() (+9 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 47 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.09
Nodes (19): chatStreamClient, NotificationSoundService, notificationSoundService, BrowserNotificationEnv, BrowserNotificationResult, claimNotificationAlertId(), dispatchBrowserNotification(), resolveSwRegistration() (+11 more)

### Community 48 - "better-auth"
Cohesion: 0.11
Nodes (19): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+11 more)

### Community 49 - "GameCatalogItem"
Cohesion: 0.14
Nodes (16): AdminAudit(), AdminAuditProps, parseGameCatalogApiError(), AuditLog, GameCatalogItem, AuditEntityFilter, AuditFilterOptions, buildAuditCsv() (+8 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (45): mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo, NotificationTargetUserNotFoundError (+37 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.11
Nodes (33): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog() (+25 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.08
Nodes (40): AuthRuntime, AdminDirectoryUserRecord, AdminUserSortField, AdminUserSortOrder, AppUserStatus, ResolvedAppUser, AuthContext, AuthSessionSummary (+32 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (30): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserForbiddenError, AdminUserGameAccountSummary, AdminUserNotFoundError, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource (+22 more)

### Community 55 - "GameAccount"
Cohesion: 0.16
Nodes (11): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), parseGameAccountApiError(), toFixedMoney(), VALID_STATUSES (+3 more)

### Community 56 - "chatRepo.ts"
Cohesion: 0.08
Nodes (37): AppUserRole, ChatConversationPayload, ChatMessagePayload, ChatTicketStatus, ChatAttachmentRecord, ChatSenderRole, EnsureConversationInput, escapeIlikePattern() (+29 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.26
Nodes (10): PWAInstallBanner(), PWAInstallBannerProps, GamePlatformCard(), WheelStrip(), CustomerHome(), loadCustomerHome(), isSafeExternalHttpUrl(), ResolvedGameCardLinks (+2 more)

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
Cohesion: 0.21
Nodes (13): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+5 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.07
Nodes (38): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+30 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.16
Nodes (16): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+8 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "chat.ts"
Cohesion: 0.13
Nodes (27): ChatConflictError, ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS (+19 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (16): DatabaseClient, createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow (+8 more)

### Community 68 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 69 - "referrals.ts"
Cohesion: 0.21
Nodes (24): ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter(), resolveActor() (+16 more)

### Community 70 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 71 - "notifications.test.ts"
Cohesion: 0.13
Nodes (16): createWebPushSender(), WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer(), httpJsonRequest() (+8 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.17
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryOfficialPartnersDatabase (+3 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "ref_node_crypto"
Cohesion: 0.21
Nodes (6): handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), writeServerAuditLog()

### Community 76 - "express"
Cohesion: 0.16
Nodes (17): express, BodyParserLikeError, createAuthProfileRouter(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter() (+9 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.06
Nodes (54): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, ClaimTelegramDispatchResult, CmsPoliciesPayload, CreateFakedCashoutInput (+46 more)

### Community 79 - "webPushClient.ts"
Cohesion: 0.21
Nodes (9): BackgroundNotificationPromptProps, arrayBufferToBase64(), DevicePlatform, webPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv (+1 more)

### Community 80 - "wheel.ts"
Cohesion: 0.14
Nodes (25): requireRole(), validateRequestBody(), ALLOWED_POST_BODY_KEYS, ALLOWED_QUERY_KEYS, assertSingleQueryString(), createAuditLogRouter(), FORBIDDEN_IMMUTABLE_FIELDS, parseBoundIsoDate() (+17 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletDatabase, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+4 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.09
Nodes (25): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, defaultBonusPctForMethod(), DepositRecord, DepositSortField, DepositSortOrder, DepositStatusValue (+17 more)

### Community 86 - "uiCopyUtils.ts"
Cohesion: 0.24
Nodes (11): decodeBasicHtmlEntities(), escapeHtmlText(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml(), formatTopUpApprovedChatMessage(), formatTopUpSubmittedChatMessage() (+3 more)

### Community 88 - "ref_node_assert"
Cohesion: 0.10
Nodes (23): better-auth, QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer() (+15 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.11
Nodes (25): PolicyAndPartnerCmsCard(), TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY (+17 more)

### Community 90 - "TelegramService"
Cohesion: 0.24
Nodes (3): TelegramService, telegramService, TelegramStatus

### Community 91 - "runExportSnapshot"
Cohesion: 0.22
Nodes (13): canonicalizeJsonValue(), compareFinancialAggregates(), computeFinancialAggregates(), computeTableChecksum(), DataMigrationIntegrityError, formatCents(), normalizeMoneyString(), runExportSnapshot() (+5 more)

### Community 92 - "authSessionService.ts"
Cohesion: 0.29
Nodes (6): authSessionService, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential, UserSession

### Community 94 - "appConfig.test.ts"
Cohesion: 0.15
Nodes (13): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow (+5 more)

### Community 97 - "realtimeChatHub.ts"
Cohesion: 0.24
Nodes (6): realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.12
Nodes (16): ChatEventEnvelope, SseEventMeta, AuditLogRealtimePayload, canUserReceiveRealtimeEvent(), RealtimeAudience, RealtimeEventBroker, RealtimeEventEnvelope, RealtimeStreamEvent (+8 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.13
Nodes (21): AdminChatTopUpModal(), TopUpModalMode, CustomerTopUp(), loadCustomerTopUp(), fileToBase64(), StorageService, storageService, StorageUploadResult (+13 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.22
Nodes (15): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), createEmailDeliveryAdapter(), EmailDeliveryAdapterOptions (+7 more)

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.15
Nodes (7): DataMigrationConfig, MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 104 - "CustomerRules.tsx"
Cohesion: 0.33
Nodes (7): LegalContent(), LegalContentProps, renderInlines(), SafeFormattedText(), SafeFormattedTextProps, parseSafeFormattedBlocks(), SafeFormattedInline

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "PWAInstallService"
Cohesion: 0.21
Nodes (12): BeforeInstallPromptEvent, Listener, pwaInstallService, PWAInstallSnapshot, detectInstallEnvironment(), getInstallPlatformLabel(), INSTALL_BANNER_DISMISS_STORAGE_KEY, INSTALL_BANNER_SNOOZE_MS (+4 more)

### Community 108 - "runDataMigrationImport"
Cohesion: 0.29
Nodes (9): advanceTargetSequences(), deserializeBundleFromDisk(), MigrationQueryable, runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly(), upsertBatchIntoTarget() (+1 more)

### Community 109 - "officialPartnerHandlers.ts"
Cohesion: 0.23
Nodes (19): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+11 more)

### Community 110 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 113 - "UserRole"
Cohesion: 0.19
Nodes (10): SessionHydrationScreenProps, ServerAuthUser, getPrefetchRouteKeysForRole(), HydrationGateInput, HydrationPhaseLabelInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate() (+2 more)

### Community 114 - "chatEvents.ts"
Cohesion: 0.15
Nodes (7): ChatEventBroker, ChatStreamEvent, ChatStreamSubscriber, parseSseEventCursor(), SseReplayResult, ChatRouterDeps, WheelRouterDeps

### Community 117 - "safeAreaUtils.ts"
Cohesion: 0.27
Nodes (10): checkElementClearsSafeArea(), computeSafeModalBounds(), computeSafeSheetMaxHeight(), computeSafeToastTopOffset(), DYNAMIC_ISLAND_PWA_INSETS, IPHONE_11_PWA_INSETS, SafeAreaClearanceResult, SafeAreaInsets (+2 more)

### Community 120 - "web-push"
Cohesion: 0.67
Nodes (3): getWebPushClient(), web-push@^3.6.7, web-push

### Community 121 - "realtime.test.ts"
Cohesion: 0.08
Nodes (21): SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, createTestConfig(), createTestServer(), httpRequest() (+13 more)

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `DataService`, `dataService.ts`, `CustomerProfile.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AuthPage.tsx`, `lucide-react`, `selfHostedAuthService.ts`, `.createStaffTopUpAsync`, `react`, `AdminUsers.tsx`, `AdminChat.tsx`, `chatOrderUtils.ts`, `GlobalChatNotificationManager.tsx`, `GameCatalogItem`, `assetPreloader.ts`, `GameAccount`, `CustomerHome.tsx`, `authTokenUtils.ts`, `supabaseClient.ts`, `.getPasswordResetTokens`, `CustomerTopUp.tsx`, `CustomerRules.tsx`, `UserRole`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.07757885763000852 - nodes in this community are weakly interconnected._
- **Why does `express` connect `express` to `gameAccounts.ts`, `app.ts`, `chat.ts`, `deposits.ts`, `RealtimeEventBroker`, `referrals.ts`, `devDependencies`, `storage.ts`, `officialPartners.ts`, `withdrawals.ts`, `HttpError`, `better-auth`, `wheel.ts`, `appConfig.ts`, `notifications.ts`, `adminAuth.ts`, `realtime.test.ts`, `walletRepo.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `tests/auditLogs.test.ts` to `InMemoryDatabasePool`, `officialPartners.ts`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `env.ts`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `storage.ts`, `HttpError`, `notifications.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `DepositRepo`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `notifications.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `adminUsers.test.ts`, `wallet.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `ref_node_assert`, `appConfig.test.ts`, `chat.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07244843997884717 - nodes in this community are weakly interconnected._