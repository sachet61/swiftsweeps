# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 281 files · ~474,071 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3359 nodes · 10120 edges · 118 communities (110 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 155 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d91f32ba`
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
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- AdminOfficialPartnersTab.tsx
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
- UserProfile
- express
- deposits.test.ts
- AppConfigRepo
- AdminReferralGovernancePanel.tsx
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- InMemoryReferralDatabase
- depositRepo.ts
- pushUtils.ts
- .getAppConfig
- ref_node_assert
- supabaseClient.ts
- TelegramService
- runExportSnapshot
- pwaAssets.ts
- SwiftSweepsLogo
- appConfig.test.ts
- wallet.ts
- AgentMobileDrawer.tsx
- realtimeChatHub.ts
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- OfficialPartner
- dataMigration.test.ts
- devDependencies
- CustomerRules.tsx
- dataMigration.ts
- PWAInstallService
- GameCatalogItem
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
1. `DataService` - 240 edges
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

## Communities (118 total, 8 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.09
Nodes (7): extractServerApiCode(), extractServerApiError(), isSupabaseConfigured(), AuditLog, ReferralLedgerEntry, mergeAuditLogs(), normalizeAuditLogRow()

### Community 1 - "gameAccounts.ts"
Cohesion: 0.13
Nodes (32): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+24 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (58): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps (+50 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (46): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+38 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.13
Nodes (25): OfficialPartnerDrawer(), PLATFORMS, PartnerPlatform, ALLOWED_PARTNER_HOSTS, ALLOWED_PARTNER_ICON_EXTENSIONS, ALLOWED_PARTNER_ICON_MIME_TYPES, cleanHandleSegment(), extractPlatformUsername() (+17 more)

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
Nodes (23): lucide-react, CashoutRulesAdminCard(), CashoutRulesAdminCardProps, PinnedCashoutRulesBanner(), PinnedCashoutRulesBannerProps, CashoutRulesShowcase(), CashoutRulesShowcaseProps, LiveCashoutFeedList() (+15 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (65): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+57 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "DataService"
Cohesion: 0.09
Nodes (6): DataService, ChatMessage, ChatTransactionData, PasswordResetToken, SupportConversation, TicketStatusValue

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.06
Nodes (48): AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, filterRealtimeRowsForUser(), globalNotificationAlertIds (+40 more)

### Community 16 - "CustomerProfile.tsx"
Cohesion: 0.15
Nodes (16): react-dom, BackgroundNotificationPromptProps, IOSPwaInstallModal(), IOSPwaInstallModalProps, ANDROID_STEPS, IOS_STEPS, PWAInstallModal(), PWAInstallModalHost() (+8 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (40): buildSuppressionLogMetadata(), canonicalCustomerIdFromInput(), validateSuppressionWindowMinutes(), HttpError, ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES (+32 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (21): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+13 more)

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

### Community 27 - "WebPushClient"
Cohesion: 0.16
Nodes (7): urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.09
Nodes (32): pg, ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret() (+24 more)

### Community 29 - "AuthPage.tsx"
Cohesion: 0.13
Nodes (18): EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, EmailVerificationBanner(), EmailVerificationBannerProps (+10 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.16
Nodes (21): CustomerTopUp(), loadCustomerTopUp(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), countUnsavedCatalogChanges(), filterEnabledGameAccounts(), filterEnabledGames(), mapDbRowToGameCatalogItem() (+13 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (47): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+39 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.08
Nodes (29): escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord, GameAccountRepo (+21 more)

### Community 33 - "AdminOfficialPartnersTab.tsx"
Cohesion: 0.30
Nodes (17): AdminOfficialPartnersTab(), SortMode, OfficialPartnersPreviewModal(), getPlatformDisplayName(), PartnerIcon(), PlatformBadge(), VerifiedPartnerTick(), CustomerOfficialPartners() (+9 more)

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
Cohesion: 0.16
Nodes (13): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+5 more)

### Community 38 - "react"
Cohesion: 0.18
Nodes (18): react, PWAInstallButton(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, WheelStrip() (+10 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.11
Nodes (14): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, AuditLogRepo, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult (+6 more)

### Community 40 - "storage.ts"
Cohesion: 0.09
Nodes (37): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+29 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.12
Nodes (41): AdminChatCashoutModal(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), chatStreamClient, buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus() (+33 more)

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
Cohesion: 0.15
Nodes (7): NotificationSoundService, notificationSoundService, BrowserNotificationEnv, BrowserNotificationResult, claimNotificationAlertId(), dispatchBrowserNotification(), resolveSwRegistration()

### Community 48 - "better-auth"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+9 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.26
Nodes (10): AdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs(), normalizeAuditActorRole(), sortAuditLogsDesc() (+2 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (45): mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo, NotificationTargetUserNotFoundError (+37 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.13
Nodes (23): GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS (+15 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.08
Nodes (40): AuthRuntime, AdminDirectoryUserRecord, AdminUserSortField, AdminUserSortOrder, AppUserStatus, ResolvedAppUser, AuthContext, AuthSessionSummary (+32 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (30): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserForbiddenError, AdminUserGameAccountSummary, AdminUserNotFoundError, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource (+22 more)

### Community 55 - "GameAccount"
Cohesion: 0.19
Nodes (11): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), parseGameAccountApiError(), toFixedMoney(), VALID_STATUSES (+3 more)

### Community 56 - "chatRepo.ts"
Cohesion: 0.08
Nodes (37): AppUserRole, ChatConversationPayload, ChatMessagePayload, ChatTicketStatus, ChatAttachmentRecord, ChatSenderRole, EnsureConversationInput, escapeIlikePattern() (+29 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.26
Nodes (11): PlatformGlyph(), GamePlatformCard(), CustomerGameAccounts(), CustomerHome(), loadCustomerGameAccounts(), loadCustomerHome(), GameLink, isSafeExternalHttpUrl() (+3 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (18): ChatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus, AppRealtimeListener (+10 more)

### Community 59 - "ref_node_http"
Cohesion: 0.22
Nodes (5): @tailwindcss/vite@^4.0.0, @tailwindcss/vite, attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured(), isSelfHostedAuthPath()

### Community 60 - "DepositRepo"
Cohesion: 0.25
Nodes (12): defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRepo, ensureWalletLocked(), insertAuditLog(), mapWalletRow(), recomputeCompletedRealCashTotal() (+4 more)

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

### Community 75 - "UserProfile"
Cohesion: 0.09
Nodes (28): AdminOfficialPartnersTabProps, AdminChatTopUpModalProps, GlobalChatNotificationManagerProps, PWAInstallButtonProps, AuthenticatedUserMenuProps, WheelOfLuckModalProps, CustomerMobileDrawerProps, CustomerMobileNavProps (+20 more)

### Community 76 - "express"
Cohesion: 0.16
Nodes (17): express, BodyParserLikeError, createAuthProfileRouter(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter() (+9 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.06
Nodes (54): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, ClaimTelegramDispatchResult, CmsPoliciesPayload, CreateFakedCashoutInput (+46 more)

### Community 79 - "AdminReferralGovernancePanel.tsx"
Cohesion: 0.20
Nodes (12): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+4 more)

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
Nodes (24): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, DepositRecord, DepositSortField, DepositSortOrder, DepositStatusValue, DepositValidationError (+16 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.21
Nodes (11): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+3 more)

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

### Community 92 - "pwaAssets.ts"
Cohesion: 0.23
Nodes (10): APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, LEGACY_BADGE_URLS, LEGACY_ICON_URLS, NOTIFICATION_BADGE_URL, PWA_ICON_192_URL, PWA_ICON_512_URL, PWA_MASKABLE_512_URL (+2 more)

### Community 93 - "SwiftSweepsLogo"
Cohesion: 0.32
Nodes (12): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), resolveHydrationPhaseLabel(), isImageCached(), normalizeAssetUrlList(), preloadAssetPool() (+4 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.15
Nodes (13): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow (+5 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 96 - "AgentMobileDrawer.tsx"
Cohesion: 0.30
Nodes (11): AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem, canRenderAgentDrawer() (+3 more)

### Community 97 - "realtimeChatHub.ts"
Cohesion: 0.20
Nodes (8): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.12
Nodes (16): ChatEventEnvelope, SseEventMeta, AuditLogRealtimePayload, canUserReceiveRealtimeEvent(), RealtimeAudience, RealtimeEventBroker, RealtimeEventEnvelope, RealtimeStreamEvent (+8 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.23
Nodes (10): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP() (+2 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.22
Nodes (15): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), createEmailDeliveryAdapter(), EmailDeliveryAdapterOptions (+7 more)

### Community 101 - "OfficialPartner"
Cohesion: 0.29
Nodes (4): OfficialPartnerDrawerProps, OfficialPartnersPreviewModalProps, OfficialPartner, OfficialPartnerInput

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.15
Nodes (7): DataMigrationConfig, MigrationDbClient, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 104 - "CustomerRules.tsx"
Cohesion: 0.31
Nodes (7): renderInlines(), SafeFormattedText(), SafeFormattedTextProps, CustomerRulesProps, loadCustomerRules(), parseSafeFormattedBlocks(), SafeFormattedInline

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "PWAInstallService"
Cohesion: 0.13
Nodes (13): BeforeInstallPromptEvent, Listener, PWAInstallService, pwaInstallService, PWAInstallSnapshot, detectInstallEnvironment(), getInstallPlatformLabel(), INSTALL_BANNER_DISMISS_STORAGE_KEY (+5 more)

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
Cohesion: 0.14
Nodes (12): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential (+4 more)

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
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `DataService`, `App.tsx`, `officialPartnersUtils.ts`, `lucide-react`, `wheelOfLuckUtils.ts`, `dataService.ts`, `CustomerProfile.tsx`, `SelfHostedAuthService`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AuthPage.tsx`, `AdminConfig.tsx`, `AdminOfficialPartnersTab.tsx`, `.createStaffTopUpAsync`, `react`, `AdminUsers.tsx`, `AdminChat.tsx`, `chatOrderUtils.ts`, `GlobalChatNotificationManager.tsx`, `AdminAudit.tsx`, `assetPreloader.ts`, `GameAccount`, `CustomerHome.tsx`, `authTokenUtils.ts`, `UserProfile`, `AdminReferralGovernancePanel.tsx`, `.getAppConfig`, `supabaseClient.ts`, `CustomerTopUp.tsx`, `OfficialPartner`, `CustomerRules.tsx`, `GameCatalogItem`, `UserRole`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.09117475160724722 - nodes in this community are weakly interconnected._
- **Why does `express` connect `express` to `gameAccounts.ts`, `app.ts`, `chat.ts`, `deposits.ts`, `RealtimeEventBroker`, `referrals.ts`, `devDependencies`, `storage.ts`, `officialPartners.ts`, `withdrawals.ts`, `HttpError`, `better-auth`, `wheel.ts`, `appConfig.ts`, `notifications.ts`, `adminAuth.ts`, `realtime.test.ts`, `wallet.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `gameAccounts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `tests/auditLogs.test.ts` to `InMemoryDatabasePool`, `officialPartners.ts`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `env.ts`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `storage.ts`, `HttpError`, `notifications.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `DepositRepo`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `notifications.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `adminUsers.test.ts`, `wallet.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `ref_node_assert`, `appConfig.test.ts`, `chat.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06993006993006994 - nodes in this community are weakly interconnected._