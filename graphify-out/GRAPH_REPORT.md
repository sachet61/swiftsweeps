# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 258 files · ~432,403 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 3135 nodes · 9426 edges · 102 communities (90 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 142 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7915024`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- dataService.ts
- package.json
- App.tsx
- InMemoryDatabasePool
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- officialPartners.ts
- .getPasswordResetTokens
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- referralRepo.ts
- selfHostedAuthService.ts
- react
- UserRole
- appConfigRepo.ts
- SelfHostedAuthService
- deposits.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- wheelRepo.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- DatabaseClient
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- AdminConfig.tsx
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- tests/auditLogs.test.ts
- storage.ts
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- toProxyStorageUrl
- HttpError
- migrations.ts
- NotificationSoundService
- dependencies
- AdminAudit.tsx
- notifications.ts
- assetPreloader.ts
- adminAuth.ts
- officialPartnerRepo.ts
- userDirectoryRepo.ts
- .load
- AppUserRole
- CustomerHome.tsx
- chatStreamClient.ts
- vite.config.ts
- react
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- withdrawals.ts
- referrals.ts
- officialPartnerHandlers.ts
- chat.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- dataService.ts
- UserDirectoryRepo
- deposits.test.ts
- validateRequestBody
- mapJoinedRow
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- profile.test.ts
- depositRepo.ts
- pushUtils.ts
- .getAppConfig
- storage.test.ts
- InMemoryAdminUsersDatabase
- redactSensitive
- SupabaseAuthService
- pwaAssets.ts
- DatabasePool
- appConfig.test.ts
- wallet.ts
- supabaseAuthService.ts
- AdminChatCashoutModal.tsx
- realtime.test.ts
- storageService.ts
- emailDelivery.ts
- web-push

## God Nodes (most connected - your core abstractions)
1. `DataService` - 237 edges
2. `HttpError` - 193 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 68 edges
6. `DatabasePool` - 66 edges
7. `lucide-react` - 60 edges
8. `UserDirectoryRepo` - 54 edges
9. `App()` - 54 edges
10. `createLogger()` - 49 edges

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

## Communities (102 total, 12 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.09
Nodes (4): DataService, extractServerApiCode(), extractServerApiError(), isSupabaseConfigured()

### Community 1 - "dataService.ts"
Cohesion: 0.06
Nodes (49): AdminOfficialPartnersTabProps, AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, AdminChatCashoutModalProps, AdminChatTopUpModalProps (+41 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (38): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+30 more)

### Community 3 - "App.tsx"
Cohesion: 0.08
Nodes (53): App(), LazyEmailVerificationBanner, LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), CustomerMobileNav() (+45 more)

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
Cohesion: 0.11
Nodes (36): OfficialPartnerSortField, OfficialPartnerSortOrder, PartnerPlatform, ALLOWED_ICON_MIME_TYPES, ALLOWED_ICON_UPLOAD_BODY_KEYS, ALLOWED_PARTNER_BODY_KEYS, ALLOWED_PARTNER_HOSTS, ALLOWED_PLATFORMS (+28 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.06
Nodes (68): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+60 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "selfHostedAuthService.ts"
Cohesion: 0.08
Nodes (28): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential (+20 more)

### Community 16 - "react"
Cohesion: 0.08
Nodes (32): lucide-react, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+24 more)

### Community 18 - "appConfigRepo.ts"
Cohesion: 0.06
Nodes (62): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+54 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.16
Nodes (5): AuthStateSnapshot, mapAuthErrorResponse(), getStorageSafe(), resolveDefaultFetch(), SelfHostedAuthService

### Community 20 - "deposits.ts"
Cohesion: 0.15
Nodes (28): ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_VALUES (+20 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.13
Nodes (32): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+24 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (39): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+31 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.16
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 27 - "WebPushClient"
Cohesion: 0.16
Nodes (7): urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.07
Nodes (43): pg@^8.23.1, pg, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), ConfigValidationError, EmailProvider (+35 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.08
Nodes (30): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig() (+22 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (47): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+39 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.05
Nodes (64): DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord (+56 more)

### Community 33 - "AdminConfig.tsx"
Cohesion: 0.12
Nodes (18): CustomerTopUp(), CustomerWithdrawal(), loadCustomerTopUp(), filterEnabledGameAccounts(), filterEnabledGames(), TelegramService, telegramService, TelegramStatus (+10 more)

### Community 34 - "app.ts"
Cohesion: 0.09
Nodes (36): express, ApiAppDependencies, createApiApp(), createEmailDeliveryAdapter(), LogLevel, checkDatabaseConnectivity(), LEVEL_PRIORITY, Logger (+28 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.09
Nodes (26): WithdrawalRouterDeps, CreateCustomerWithdrawalInput, CreateStaffWithdrawalInput, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow() (+18 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.15
Nodes (13): WebPushSendOptions, WebPushSubscriptionTarget, createTestConfig(), createTestServer(), httpJsonRequest(), InMemoryAuthLinkRow, InMemoryNotificationRow, InMemoryNotificationsDatabase (+5 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.19
Nodes (11): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+3 more)

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.22
Nodes (12): react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem (+4 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.08
Nodes (31): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, AuditLogRepo, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult (+23 more)

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
Cohesion: 0.10
Nodes (46): AdminChatTopUpModal(), TopUpModalMode, AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), chatStreamClient (+38 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.21
Nodes (18): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage() (+10 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.16
Nodes (20): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+12 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, react-dom@^19.0.0, tailwindcss@^4.0.0 (+9 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.19
Nodes (12): AdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs(), mergeAuditLogs() (+4 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (47): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+39 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.13
Nodes (26): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, isImageCached(), memoryImageCache (+18 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.10
Nodes (32): AuthRuntime, AdminDirectoryUserRecord, AdminUserSortField, AdminUserSortOrder, AppUserStatus, ResolvedAppUser, AuthContext, AdminAuthRouterDeps (+24 more)

### Community 53 - "officialPartnerRepo.ts"
Cohesion: 0.11
Nodes (20): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+12 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.10
Nodes (22): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource, createEmptyWalletSummary(), EnsureUserForSignupInput (+14 more)

### Community 55 - ".load"
Cohesion: 0.13
Nodes (13): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), parseGameAccountApiError(), toFixedMoney(), VALID_STATUSES (+5 more)

### Community 56 - "AppUserRole"
Cohesion: 0.12
Nodes (17): AppUserRole, ChatTicketStatus, EnsureConversationInput, ListConversationsOptions, SaveChatAttachmentInput, UpdateConversationStatusInput, UpdateTransactionCardStatusInput, ApproveDepositInput (+9 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.14
Nodes (23): GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse() (+15 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (18): ChatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus, AppRealtimeListener (+10 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (5): @tailwindcss/vite@^4.0.0, @tailwindcss/vite, attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured(), isSelfHostedAuthPath()

### Community 60 - "react"
Cohesion: 0.14
Nodes (23): react, LiveCashoutFeedList(), LiveCashoutFeedListProps, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps (+15 more)

### Community 61 - "ChatRepo"
Cohesion: 0.11
Nodes (32): ChatConversationPayload, ChatMessagePayload, canonicalConversationIdForCustomer(), ChatAttachmentRecord, ChatConflictError, ChatForbiddenError, ChatNotFoundError, ChatRepo (+24 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.13
Nodes (15): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryReferralDatabase, InMemoryTopupRow (+7 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "chat.ts"
Cohesion: 0.13
Nodes (28): ListMessagesOptions, SendMessageInput, ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS (+20 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (15): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+7 more)

### Community 68 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 69 - "referrals.ts"
Cohesion: 0.25
Nodes (24): HttpError, ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter() (+16 more)

### Community 70 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 71 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.17
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryOfficialPartnersDatabase (+3 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "dataService.ts"
Cohesion: 0.09
Nodes (36): PolicyAndPartnerCmsCard(), RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES (+28 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "validateRequestBody"
Cohesion: 0.23
Nodes (14): validateRequestBody(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter(), extractRequestedTargetUserId(), PRIVILEGED_FIELDS (+6 more)

### Community 79 - "mapJoinedRow"
Cohesion: 0.26
Nodes (6): AdminUserForbiddenError, AdminUserNotFoundError, isParentAdminUser(), mapJoinedRow(), normalizeRole(), normalizeStatus()

### Community 80 - "wheel.ts"
Cohesion: 0.29
Nodes (14): requireRole(), ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor(), dispatchBonusLoadTelegramAlert(), mapRepoError() (+6 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletDatabase, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+4 more)

### Community 84 - "profile.test.ts"
Cohesion: 0.09
Nodes (16): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, createCaptureEmailAdapter(), createTestConfig() (+8 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.11
Nodes (32): defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo, DepositSortField, DepositSortOrder, DepositStatusValue (+24 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.21
Nodes (11): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+3 more)

### Community 88 - "storage.test.ts"
Cohesion: 0.39
Nodes (6): createCaptureEmailAdapter(), createStorageTestServer(), signupAndLogin(), createTestConfig(), extractCookies(), httpRequest()

### Community 90 - "redactSensitive"
Cohesion: 1.00
Nodes (3): emit(), redactSensitive(), redactString()

### Community 92 - "pwaAssets.ts"
Cohesion: 0.12
Nodes (15): notificationSoundService, BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, LEGACY_BADGE_URLS (+7 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow (+4 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 96 - "supabaseAuthService.ts"
Cohesion: 0.16
Nodes (16): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+8 more)

### Community 97 - "AdminChatCashoutModal.tsx"
Cohesion: 0.50
Nodes (3): AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS

### Community 98 - "realtime.test.ts"
Cohesion: 0.06
Nodes (35): ChatEventBroker, ChatEventEnvelope, ChatStreamEvent, ChatStreamSubscriber, parseSseEventCursor(), SseEventMeta, SseReplayResult, AuditLogRealtimePayload (+27 more)

### Community 99 - "storageService.ts"
Cohesion: 0.30
Nodes (7): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP(), CompressionOptions, validateImageFile()

### Community 100 - "emailDelivery.ts"
Cohesion: 0.19
Nodes (11): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, EmailDeliveryUnavailableError (+3 more)

### Community 101 - "web-push"
Cohesion: 0.67
Nodes (3): getWebPushClient(), web-push@^3.6.7, web-push

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `dataService.ts`, `App.tsx`, `officialPartnersUtils.ts`, `.getPasswordResetTokens`, `wheelOfLuckUtils.ts`, `ChatMessage`, `selfHostedAuthService.ts`, `react`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `AdminConfig.tsx`, `.createStaffTopUpAsync`, `AdminUsers.tsx`, `AdminChat.tsx`, `toProxyStorageUrl`, `AdminAudit.tsx`, `.load`, `CustomerHome.tsx`, `react`, `dataService.ts`, `.getAppConfig`, `supabaseAuthService.ts`, `AdminChatCashoutModal.tsx`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08576576576576576 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `DatabasePool` to `InMemoryDatabasePool`, `referralRepo.ts`, `appConfigRepo.ts`, `wheelRepo.ts`, `env.ts`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `notifications.test.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `notifications.ts`, `officialPartnerRepo.ts`, `userDirectoryRepo.ts`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `chat.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `adminUsers.test.ts`, `wallet.test.ts`, `withdrawals.test.ts`, `profile.test.ts`, `depositRepo.ts`, `appConfig.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `dataService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06041986687147977 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `package.json`, `officialPartners.ts`, `appConfigRepo.ts`, `deposits.ts`, `env.ts`, `gameAccounts.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `dependencies`, `notifications.ts`, `adminAuth.ts`, `chat.ts`, `withdrawals.ts`, `referrals.ts`, `validateRequestBody`, `wheel.ts`, `wallet.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0620782726045884 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07868852459016394 - nodes in this community are weakly interconnected._