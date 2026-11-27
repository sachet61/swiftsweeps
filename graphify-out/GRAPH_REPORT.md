# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 232 files · ~374,190 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 2652 nodes · 7983 edges · 91 communities (83 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 116 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `127e6a89`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- UserProfile
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
- dataService.ts
- react
- UserRole
- AdminDashboard.tsx
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
- storageService.ts
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
- .createStaffTopUpAsync
- CustomerMobileDrawer.tsx
- deposits.ts
- CustomerTopUp.tsx
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
- notificationRepo.ts
- userDirectoryRepo.ts
- GameAccount
- UserRole
- AdminGameCatalog.tsx
- GlobalChatNotificationManager.tsx
- vite.config.ts
- .getCurrentUser
- withdrawals.ts
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- pushUtils.ts
- tests/wheel.test.ts
- gameCatalogRepo.ts
- referrals.ts
- wallet.ts
- gameAccountUtils.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- uiCopyUtils.ts
- InMemoryReferralDatabase
- deposits.test.ts
- validateRequestBody
- AppUserRole
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- ref_node_test
- mapJoinedRow
- chatPresentationUtils.ts
- .getAppConfig
- realtimeChatHub.ts
- InMemoryAdminUsersDatabase
- logger.ts

## God Nodes (most connected - your core abstractions)
1. `DataService` - 226 edges
2. `HttpError` - 149 edges
3. `UserProfile` - 119 edges
4. `react` - 68 edges
5. `createApiApp()` - 61 edges
6. `lucide-react` - 60 edges
7. `App()` - 54 edges
8. `UserDirectoryRepo` - 51 edges
9. `DatabasePool` - 49 edges
10. `dataService` - 42 edges

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

## Communities (91 total, 8 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.08
Nodes (3): DataService, isSupabaseConfigured(), AppNotification

### Community 1 - "UserProfile"
Cohesion: 0.07
Nodes (36): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatTopUpModalProps, BackgroundNotificationPromptProps, EmailVerificationBannerProps, LiveCashoutFeedList(), LiveCashoutFeedListProps, AuthenticatedUserMenuProps (+28 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.10
Nodes (44): App(), LazyEmailVerificationBanner, LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), CustomerMobileNav() (+36 more)

### Community 4 - "UserDirectoryRepo"
Cohesion: 0.21
Nodes (3): generateReferralCode(), UserDirectoryRepo, ReferralRouterDeps

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.07
Nodes (71): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+63 more)

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
Cohesion: 0.06
Nodes (68): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+60 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "ChatMessage"
Cohesion: 0.18
Nodes (5): mergeAuthoritativeMessages(), mergeSingleMessage(), sortAndDeduplicateMessages(), ChatMessage, SupportConversation

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "dataService.ts"
Cohesion: 0.09
Nodes (32): SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential, UserSession (+24 more)

### Community 16 - "react"
Cohesion: 0.10
Nodes (31): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+23 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.11
Nodes (20): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+12 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.11
Nodes (16): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+8 more)

### Community 20 - "depositRepo.ts"
Cohesion: 0.12
Nodes (27): defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRepo, DepositValidationError, ensureWalletLocked(), escapeIlikePattern(), insertAuditLog() (+19 more)

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
Nodes (41): WheelRouterDeps, buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig() (+33 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.09
Nodes (23): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+15 more)

### Community 27 - "WebPushClient"
Cohesion: 0.15
Nodes (8): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.16
Nodes (18): EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes(), parseBooleanSetting() (+10 more)

### Community 29 - "gameAccountRepo.ts"
Cohesion: 0.09
Nodes (27): DatabaseClient, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord (+19 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (21): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL (+13 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (44): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+36 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.12
Nodes (33): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+25 more)

### Community 33 - "storageService.ts"
Cohesion: 0.24
Nodes (10): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP() (+2 more)

### Community 34 - "app.ts"
Cohesion: 0.08
Nodes (35): better-auth, express, pg, createApiApp(), createAuthInstance(), EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), PgSslMode (+27 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.10
Nodes (23): WithdrawalRouterDeps, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow(), mapWithdrawalRow(), normalizeWithdrawalStatus() (+15 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.10
Nodes (19): ApiAppDependencies, CreateAuthInstanceDeps, EmailDeliveryAdapter, ServerConfig, WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps (+11 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.19
Nodes (11): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+3 more)

### Community 38 - "CustomerMobileDrawer.tsx"
Cohesion: 0.10
Nodes (30): react-dom, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps (+22 more)

### Community 39 - "deposits.ts"
Cohesion: 0.12
Nodes (34): DepositRecord, DepositSortField, DepositSortOrder, DepositStatusValue, ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS (+26 more)

### Community 40 - "CustomerTopUp.tsx"
Cohesion: 0.13
Nodes (15): CustomerTopUp(), loadCustomerTopUp(), TelegramService, telegramService, TelegramStatus, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft() (+7 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.14
Nodes (34): AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), realtimeChatHub, notificationSoundService, CHAT_QUICK_EMOJIS (+26 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.23
Nodes (15): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+7 more)

### Community 45 - "HttpError"
Cohesion: 0.19
Nodes (26): GameCatalogLinkRecord, HttpError, ALLOWED_GAME_BODY_KEYS, ALLOWED_QUERY_KEYS, ALLOWED_SORT_FIELDS, assertAllowedGameObjectKeys(), assertObjectRecord(), createGameCatalogRouter() (+18 more)

### Community 46 - "migrations.ts"
Cohesion: 0.09
Nodes (32): ConfigValidationError, loadLocalDotEnv(), resolveCandidateEnvPaths(), AuthMigrateCommand, run(), buildSslOption(), CliCommand, resolveDatabaseCliConfig() (+24 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+9 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.20
Nodes (10): AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), mergeAuditLogs(), normalizeAuditActorRole(), normalizeAuditLogRow() (+2 more)

### Community 50 - "notifications.ts"
Cohesion: 0.13
Nodes (32): NotificationType, ALLOWED_CREATE_NOTIFICATION_KEYS, ALLOWED_NOTIFICATION_QUERY_KEYS, ALLOWED_NOTIFICATION_TYPES, ALLOWED_NOTIFY_KEYS, ALLOWED_PUSH_ACTION_TYPES, ALLOWED_PUSH_STATUS_QUERY_KEYS, ALLOWED_SUBSCRIBE_KEYS (+24 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.11
Nodes (29): AuthRuntime, AdminUserSortField, AdminUserSortOrder, AppUserStatus, AdminAuthRouterDeps, ALLOWED_CREATE_BODY_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_ROLE_BODY_KEYS (+21 more)

### Community 53 - "notificationRepo.ts"
Cohesion: 0.11
Nodes (14): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+6 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (27): ADMIN_USER_SORT_MAP, AdminDirectoryUserRecord, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource, createEmptyWalletSummary() (+19 more)

### Community 55 - "GameAccount"
Cohesion: 0.32
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "UserRole"
Cohesion: 0.14
Nodes (19): SessionHydrationScreen(), SessionHydrationScreenProps, StartupSplash(), StartupSplashProps, getPrefetchRouteKeysForRole(), HydrationGateInput, HydrationPhaseLabelInput, resolveHydrationPhaseLabel() (+11 more)

### Community 57 - "AdminGameCatalog.tsx"
Cohesion: 0.06
Nodes (53): GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog(), loadCustomerGameAccounts(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse() (+45 more)

### Community 58 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.29
Nodes (9): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage() (+1 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.14
Nodes (10): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+2 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "pushUtils.ts"
Cohesion: 0.14
Nodes (17): getWebPushClient(), handlePushNotify(), handlePushStatus(), sendVercelPushNotification(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription (+9 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (15): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+7 more)

### Community 68 - "gameCatalogRepo.ts"
Cohesion: 0.12
Nodes (16): escapeIlikePattern(), GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult, mapGameCatalogRow() (+8 more)

### Community 69 - "referrals.ts"
Cohesion: 0.23
Nodes (23): ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter(), resolveActor() (+15 more)

### Community 70 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 71 - "gameAccountUtils.ts"
Cohesion: 0.33
Nodes (9): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccountStatus (+1 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.17
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryOfficialPartnersDatabase (+3 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.17
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.08
Nodes (27): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), createEmailDeliveryAdapter(), EmailDeliveryAdapterOptions (+19 more)

### Community 75 - "uiCopyUtils.ts"
Cohesion: 0.13
Nodes (23): PolicyAndPartnerCmsCard(), AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, AdminAudit(), AdminAuditProps, loadAdminAudit() (+15 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "validateRequestBody"
Cohesion: 0.21
Nodes (15): validateRequestBody(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter(), extractRequestedTargetUserId(), PRIVILEGED_FIELDS (+7 more)

### Community 79 - "AppUserRole"
Cohesion: 0.11
Nodes (18): AppUserRole, ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, RejectDepositInput, DeleteGameAccountInput, ProvisionGameAccountInput, RequestNewGameIdInput (+10 more)

### Community 80 - "wheel.ts"
Cohesion: 0.31
Nodes (13): requireRole(), ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor(), mapRepoError(), PRIVILEGED_BODY_FIELDS (+5 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.18
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletDatabase, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+4 more)

### Community 84 - "ref_node_test"
Cohesion: 0.22
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 85 - "mapJoinedRow"
Cohesion: 0.33
Nodes (4): AdminUserForbiddenError, AdminUserNotFoundError, isParentAdminUser(), mapJoinedRow()

### Community 86 - "chatPresentationUtils.ts"
Cohesion: 0.36
Nodes (10): buildGroupedMessages(), filterVisibleMessagesForRole(), formatChatDateDivider(), formatConversationTimestamp(), getLocalDateKey(), getTicketStatusMeta(), GroupedChatMessage, isMessageInternalNote() (+2 more)

### Community 88 - "realtimeChatHub.ts"
Cohesion: 0.25
Nodes (6): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 90 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HttpError` connect `HttpError` to `gameAccounts.ts`, `app.ts`, `referrals.ts`, `wallet.ts`, `deposits.ts`, `officialPartners.ts`, `validateRequestBody`, `migrations.ts`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `withdrawals.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.07609427609427609 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `package.json`, `referrals.ts`, `wallet.ts`, `deposits.ts`, `officialPartners.ts`, `HttpError`, `validateRequestBody`, `dependencies`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `withdrawals.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.load`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `react`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `storageService.ts`, `.createStaffTopUpAsync`, `CustomerMobileDrawer.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `toProxyStorageUrl`, `AdminAudit.tsx`, `GameAccount`, `UserRole`, `AdminGameCatalog.tsx`, `GlobalChatNotificationManager.tsx`, `.getCurrentUser`, `uiCopyUtils.ts`, `.getAppConfig`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10122448979591837 - nodes in this community are weakly interconnected._