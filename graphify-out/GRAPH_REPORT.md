# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 242 files · ~398,365 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 2890 nodes · 8631 edges · 99 communities (91 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 134 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `985c8556`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- types.ts
- package.json
- App.tsx
- UserDirectoryRepo
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- officialPartners.ts
- .load
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- referralRepo.ts
- UserRole
- react
- UserRole
- appConfigRepo.ts
- SelfHostedAuthService
- depositRepo.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- wheelRepo.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- gameAccountRepo.ts
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- CustomerProfile.tsx
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- appConfig.ts
- TelegramService
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
- scripts
- adminAuth.ts
- officialPartnerRepo.ts
- userDirectoryRepo.ts
- GameAccount
- SwiftSweepsLogo
- CustomerHome.tsx
- GlobalChatNotificationManager.tsx
- vite.config.ts
- .getCurrentUser
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- gameCatalogRepo.ts
- referrals.ts
- officialPartnerHandlers.ts
- chat.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- dataService.ts
- InMemoryReferralDatabase
- deposits.test.ts
- validateRequestBody
- chatRepo.ts
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- profile.test.ts
- mapJoinedRow
- handler
- .getAppConfig
- realtimeChatHub.ts
- InMemoryAdminUsersDatabase
- logger.ts
- SupabaseAuthService
- pwaAssets.ts
- assetPreloader.ts
- appConfig.test.ts
- overlayHistoryUtils.ts
- .fetchAuditLogsFromServer
- sessionHydrationUtils.ts
- ChatEventBroker

## God Nodes (most connected - your core abstractions)
1. `DataService` - 234 edges
2. `HttpError` - 181 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 70 edges
5. `react` - 68 edges
6. `lucide-react` - 60 edges
7. `DatabasePool` - 57 edges
8. `App()` - 54 edges
9. `UserDirectoryRepo` - 51 edges
10. `AppUserRole` - 42 edges

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

## Communities (99 total, 8 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.08
Nodes (3): DataService, isSupabaseConfigured(), AppNotification

### Community 1 - "types.ts"
Cohesion: 0.07
Nodes (40): AdminOfficialPartnersTabProps, AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, AdminChatTopUpModalProps, BackgroundNotificationPromptProps, BeforeInstallPromptEvent, PWAInstallButtonProps (+32 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (41): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal() (+33 more)

### Community 4 - "UserDirectoryRepo"
Cohesion: 0.21
Nodes (3): generateReferralCode(), UserDirectoryRepo, ReferralRouterDeps

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.09
Nodes (52): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+44 more)

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

### Community 15 - "UserRole"
Cohesion: 0.07
Nodes (30): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, SessionHydrationScreenProps (+22 more)

### Community 16 - "react"
Cohesion: 0.08
Nodes (33): lucide-react, react, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps (+25 more)

### Community 18 - "appConfigRepo.ts"
Cohesion: 0.09
Nodes (28): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+20 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (19): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+11 more)

### Community 20 - "depositRepo.ts"
Cohesion: 0.06
Nodes (64): ApproveDepositInput, CreateCustomerDepositInput, defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo, DepositSortField (+56 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.13
Nodes (33): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity() (+25 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (40): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+32 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.16
Nodes (20): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+12 more)

### Community 27 - "WebPushClient"
Cohesion: 0.15
Nodes (8): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.09
Nodes (30): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+22 more)

### Community 29 - "gameAccountRepo.ts"
Cohesion: 0.09
Nodes (26): escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord, GameAccountRepo (+18 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.12
Nodes (22): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), realtimeChatHub, DEFAULT_SUPABASE_ANON_KEY (+14 more)

### Community 31 - "api/index.ts"
Cohesion: 0.07
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, fetchSupabaseJwksKeys(), getWebPushClient(), handleGetAuditLogs(), handlePostAuditLog() (+35 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.12
Nodes (33): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+25 more)

### Community 33 - "CustomerProfile.tsx"
Cohesion: 0.12
Nodes (25): AdminChatTopUpModal(), TopUpModalMode, IOSPwaInstallModal(), CustomerProfile(), CustomerTopUp(), loadCustomerProfile(), loadCustomerTopUp(), fileToBase64() (+17 more)

### Community 34 - "app.ts"
Cohesion: 0.08
Nodes (37): better-auth, express, pg, ApiAppDependencies, createApiApp(), createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS (+29 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.06
Nodes (53): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+45 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.13
Nodes (15): WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer(), httpJsonRequest(), InMemoryAuthLinkRow (+7 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.18
Nodes (11): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+3 more)

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.30
Nodes (11): AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem, canRenderAgentDrawer() (+3 more)

### Community 39 - "appConfig.ts"
Cohesion: 0.14
Nodes (34): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+26 more)

### Community 40 - "TelegramService"
Cohesion: 0.24
Nodes (3): TelegramService, telegramService, TelegramStatus

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.15
Nodes (23): PWAInstallButton(), RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem (+15 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.12
Nodes (43): AdminChatCashoutModal(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), notificationSoundService, supabaseUrl, buildGroupedMessages(), CHAT_QUICK_EMOJIS (+35 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.21
Nodes (18): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage() (+10 more)

### Community 45 - "HttpError"
Cohesion: 0.15
Nodes (28): GameCatalogLinkRecord, GameCatalogSortField, GameCatalogSortOrder, ALLOWED_GAME_BODY_KEYS, ALLOWED_QUERY_KEYS, ALLOWED_SORT_FIELDS, assertAllowedGameObjectKeys(), assertObjectRecord() (+20 more)

### Community 46 - "migrations.ts"
Cohesion: 0.12
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+10 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.21
Nodes (12): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+4 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (46): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+38 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.11
Nodes (29): AuthRuntime, AdminUserSortField, AdminUserSortOrder, AppUserStatus, AdminAuthRouterDeps, ALLOWED_CREATE_BODY_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_ROLE_BODY_KEYS (+21 more)

### Community 53 - "officialPartnerRepo.ts"
Cohesion: 0.10
Nodes (20): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+12 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (27): ADMIN_USER_SORT_MAP, AdminDirectoryUserRecord, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource, createEmptyWalletSummary() (+19 more)

### Community 55 - "GameAccount"
Cohesion: 0.32
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "SwiftSweepsLogo"
Cohesion: 0.30
Nodes (12): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, isImageCached(), normalizeAssetUrlList(), preloadAssetPool() (+4 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.14
Nodes (23): GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse() (+15 more)

### Community 58 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.14
Nodes (15): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, ChatStreamClient, chatStreamClient, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow (+7 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (6): @tailwindcss/vite@^4.0.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, @vitejs/plugin-react, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 60 - ".getCurrentUser"
Cohesion: 0.23
Nodes (3): extractServerApiCode(), extractServerApiError(), WalletTransaction

### Community 61 - "ChatRepo"
Cohesion: 0.19
Nodes (13): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+5 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.07
Nodes (38): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+30 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.14
Nodes (11): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+3 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "chat.ts"
Cohesion: 0.13
Nodes (27): ChatConflictError, ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS (+19 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (16): DatabaseClient, createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow (+8 more)

### Community 68 - "gameCatalogRepo.ts"
Cohesion: 0.13
Nodes (13): escapeIlikePattern(), GameCatalogRecord, GameCatalogRepo, ListGameCatalogOptions, ListGameCatalogResult, mapGameCatalogRow(), parseLinks(), QueryResultLike (+5 more)

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
Cohesion: 0.17
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.10
Nodes (23): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), createEmailDeliveryAdapter(), EmailDeliveryAdapterOptions (+15 more)

### Community 75 - "dataService.ts"
Cohesion: 0.10
Nodes (37): PolicyAndPartnerCmsCard(), RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts() (+29 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "validateRequestBody"
Cohesion: 0.21
Nodes (15): validateRequestBody(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter(), extractRequestedTargetUserId(), PRIVILEGED_FIELDS (+7 more)

### Community 79 - "chatRepo.ts"
Cohesion: 0.07
Nodes (40): AppUserRole, ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ChatTicketStatus, ChatAttachmentRecord, ChatSenderRole (+32 more)

### Community 80 - "wheel.ts"
Cohesion: 0.31
Nodes (13): requireRole(), ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor(), mapRepoError(), PRIVILEGED_BODY_FIELDS (+5 more)

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
Cohesion: 0.11
Nodes (15): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, createCaptureEmailAdapter(), createTestConfig() (+7 more)

### Community 85 - "mapJoinedRow"
Cohesion: 0.33
Nodes (4): AdminUserForbiddenError, AdminUserNotFoundError, isParentAdminUser(), mapJoinedRow()

### Community 86 - "handler"
Cohesion: 0.17
Nodes (18): buildProxyStorageUrl(), enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), handleGetChatMessages(), handlePostChatSend(), handler(), handleStorageFileProxy() (+10 more)

### Community 88 - "realtimeChatHub.ts"
Cohesion: 0.25
Nodes (6): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 90 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 91 - "SupabaseAuthService"
Cohesion: 0.14
Nodes (3): SupabaseAuthService, mergeVerifiedStatus(), writeVerifiedCache()

### Community 92 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 93 - "assetPreloader.ts"
Cohesion: 0.18
Nodes (15): CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, memoryImageCache, TargetAssetPlan, ALIAS_LOOKUP, DEFAULT_GAME_ICON, DEFERRED_GAME_IMAGE_PATHS (+7 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.15
Nodes (13): TelegramFetchFn, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow (+5 more)

### Community 95 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 96 - ".fetchAuditLogsFromServer"
Cohesion: 0.35
Nodes (3): AuditLog, mergeAuditLogs(), normalizeAuditLogRow()

### Community 97 - "sessionHydrationUtils.ts"
Cohesion: 0.39
Nodes (6): getPrefetchRouteKeysForRole(), HydrationGateInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

### Community 98 - "ChatEventBroker"
Cohesion: 0.33
Nodes (3): ChatEventBroker, ChatRouterDeps, WheelRouterDeps

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HttpError` connect `referrals.ts` to `gameAccounts.ts`, `app.ts`, `chat.ts`, `withdrawalRepo.ts`, `appConfig.ts`, `officialPartners.ts`, `HttpError`, `validateRequestBody`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `depositRepo.ts`, `env.ts`, `walletRepo.ts`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08295625942684766 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `package.json`, `chat.ts`, `withdrawalRepo.ts`, `referrals.ts`, `appConfig.ts`, `officialPartners.ts`, `HttpError`, `validateRequestBody`, `dependencies`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `depositRepo.ts`, `walletRepo.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06612244897959184 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `types.ts`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `UserRole`, `SelfHostedAuthService`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `CustomerProfile.tsx`, `AgentMobileDrawer.tsx`, `TelegramService`, `AdminUsers.tsx`, `AdminChat.tsx`, `toProxyStorageUrl`, `dependencies`, `AdminAudit.tsx`, `SwiftSweepsLogo`, `CustomerHome.tsx`, `GlobalChatNotificationManager.tsx`, `dataService.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08973172987974098 - nodes in this community are weakly interconnected._