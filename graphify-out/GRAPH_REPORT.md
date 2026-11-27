# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 206 files · ~309,559 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 2072 nodes · 6416 edges · 84 communities (74 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d9229a06`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- UserProfile
- package.json
- App.tsx
- userDirectoryRepo.ts
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- auth.test.ts
- .save
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- webPushClient.ts
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
- chatScrollUtils.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- SupabaseAuthService
- AdminConfig.tsx
- api/index.ts
- GlobalChatNotificationManager.tsx
- storageService.ts
- app.ts
- withdrawalRepo.ts
- overlayHistoryUtils.ts
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- deposits.ts
- CustomerTopUp.tsx
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- HttpError
- migrations.ts
- NotificationSoundService
- dependencies
- AdminAudit.tsx
- UserRole
- scripts
- adminAuth.ts
- pool.ts
- ChatTransactionCard.tsx
- emailDelivery.ts
- SwiftSweepsLogo
- gameCatalogUtils.ts
- pwaAssets.ts
- vite.config.ts
- .getAppConfig
- logger.ts
- withdrawals.ts
- walletRepo.ts
- assetPreloader.ts
- DatabasePool
- pushUtils.ts
- selfHostedAuthService.ts
- realtimeChatHub.ts
- ref_node_assert
- gameCatalogRepo.ts
- wallet.ts
- profile.ts
- CustomerHome.tsx
- gameCatalog.test.ts
- UserWallet
- withdrawals.test.ts
- deposits.test.ts
- AdminMobileDrawer.tsx
- AppUserRole
- DatabaseClient
- sessionHydrationUtils.ts
- InMemoryWalletDatabase
- InMemoryWithdrawalDatabase

## God Nodes (most connected - your core abstractions)
1. `DataService` - 221 edges
2. `UserProfile` - 119 edges
3. `HttpError` - 70 edges
4. `react` - 68 edges
5. `lucide-react` - 60 edges
6. `App()` - 54 edges
7. `isSupabaseConfigured()` - 44 edges
8. `dataService` - 42 edges
9. `SelfHostedAuthService` - 40 edges
10. `createApiApp()` - 38 edges

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

## Communities (84 total, 10 thin omitted)

### Community 1 - "UserProfile"
Cohesion: 0.11
Nodes (16): AdminOfficialPartnersTabProps, EmailOtpModalProps, BackgroundNotificationPromptProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, CustomerMobileNavProps, StaffMobileNavProps, AdminChatProps (+8 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.12
Nodes (36): App(), LazyEmailVerificationBanner, LazyPageFallback(), LegalContent(), SessionTimeoutWarningModal(), WheelPopup(), CustomerMobileNav(), StaffMobileNav() (+28 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.13
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.05
Nodes (87): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+79 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 10 - ".save"
Cohesion: 0.12
Nodes (3): parseGameCatalogApiError(), formatCredentialsReadyChatMessage(), formatWheelHttpError()

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (61): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+53 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "ChatMessage"
Cohesion: 0.20
Nodes (3): isSupabaseConfigured(), ChatMessage, SupportConversation

### Community 14 - "webPushClient.ts"
Cohesion: 0.18
Nodes (10): BeforeInstallPromptEvent, PWAInstallButtonProps, supabaseTokenManager, arrayBufferToBase64(), DevicePlatform, webPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload (+2 more)

### Community 15 - "dataService.ts"
Cohesion: 0.10
Nodes (32): WheelOfLuckModalProps, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS (+24 more)

### Community 16 - "react"
Cohesion: 0.09
Nodes (28): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+20 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.22
Nodes (11): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+3 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.22
Nodes (3): AuthStateSnapshot, mapAuthErrorResponse(), SelfHostedAuthService

### Community 20 - "depositRepo.ts"
Cohesion: 0.11
Nodes (29): defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo, DepositValidationError, ensureWalletLocked(), escapeIlikePattern() (+21 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (31): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+23 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "chatScrollUtils.ts"
Cohesion: 0.18
Nodes (15): computeDistanceFromBottom(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction(), DEFAULT_NEAR_BOTTOM_THRESHOLD_PX, inMemoryScrollMap, isScrolledNearBottom() (+7 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.14
Nodes (25): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+17 more)

### Community 28 - "env.ts"
Cohesion: 0.16
Nodes (18): EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes(), parseBooleanSetting() (+10 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.07
Nodes (36): PolicyAndPartnerCmsCard(), TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY (+28 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (44): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+36 more)

### Community 32 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.22
Nodes (11): GlobalChatNotificationManager(), realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage() (+3 more)

### Community 33 - "storageService.ts"
Cohesion: 0.32
Nodes (7): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP(), CompressionOptions, validateImageFile()

### Community 34 - "app.ts"
Cohesion: 0.12
Nodes (26): express, createApiApp(), ResolvedAppUser, checkDatabaseConnectivity(), Logger, AuthContext, AuthSessionSummary, createOptionalAuthMiddleware() (+18 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.10
Nodes (23): WithdrawalRouterDeps, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow(), mapWithdrawalRow(), normalizeWithdrawalStatus() (+15 more)

### Community 36 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.19
Nodes (8): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString()

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.22
Nodes (12): react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem (+4 more)

### Community 39 - "deposits.ts"
Cohesion: 0.13
Nodes (32): DepositSortField, DepositSortOrder, DepositStatusValue, ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS (+24 more)

### Community 40 - "CustomerTopUp.tsx"
Cohesion: 0.23
Nodes (13): CustomerTopUp(), CustomerTopUpProps, loadCustomerTopUp(), PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft(), getTopUpDraftStorageKey(), ImageValidationResult (+5 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.30
Nodes (11): AuthenticatedUserMenuProps, RoleSwitcher(), AdminUsers(), AdminUsersProps, loadAdminUsers(), getAdminDisplayEmail(), getAdminDisplayName(), isProtectedSuperAdminAccount() (+3 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.16
Nodes (31): AdminChatCashoutModal(), AdminChatTopUpModal(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), storageService (+23 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "HttpError"
Cohesion: 0.19
Nodes (26): GameCatalogLinkRecord, HttpError, ALLOWED_GAME_BODY_KEYS, ALLOWED_QUERY_KEYS, ALLOWED_SORT_FIELDS, assertAllowedGameObjectKeys(), assertObjectRecord(), createGameCatalogRouter() (+18 more)

### Community 46 - "migrations.ts"
Cohesion: 0.13
Nodes (23): loadLocalDotEnv(), resolveCandidateEnvPaths(), buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES (+15 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+9 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.08
Nodes (26): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs() (+18 more)

### Community 50 - "UserRole"
Cohesion: 0.16
Nodes (10): SessionHydrationScreenProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential, UserSession (+2 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.21
Nodes (16): AuthRuntime, AppUserStatus, isParentAdminUser(), requireRole(), validateRequestBody(), AdminAuthRouterDeps, assertRecord(), createAdminAuthRouter() (+8 more)

### Community 53 - "pool.ts"
Cohesion: 0.18
Nodes (15): better-auth, pg, createAuthInstance(), EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), ConfigValidationError, PgSslMode, AuthMigrateCommand (+7 more)

### Community 54 - "ChatTransactionCard.tsx"
Cohesion: 0.38
Nodes (8): ChatTransactionCard(), ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), toProxyStorageUrl(), ChatTransactionData

### Community 55 - "emailDelivery.ts"
Cohesion: 0.17
Nodes (12): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), createEmailDeliveryAdapter(), EmailDeliveryAdapterOptions (+4 more)

### Community 56 - "SwiftSweepsLogo"
Cohesion: 0.30
Nodes (12): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, isImageCached(), normalizeAssetUrlList(), preloadAssetPool() (+4 more)

### Community 57 - "gameCatalogUtils.ts"
Cohesion: 0.29
Nodes (12): CustomerWithdrawal(), CustomerWithdrawalProps, applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), countUnsavedCatalogChanges(), filterEnabledGameAccounts(), filterEnabledGames(), mapDbRowToGameCatalogItem() (+4 more)

### Community 58 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 62 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "assetPreloader.ts"
Cohesion: 0.13
Nodes (23): GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), CORE_ASSET_URLS, CRITICAL_ASSET_URLS (+15 more)

### Community 65 - "DatabasePool"
Cohesion: 0.10
Nodes (16): ApiAppDependencies, CreateAuthInstanceDeps, EmailDeliveryAdapter, SendPasswordResetEmailPayload, ServerConfig, DatabasePool, StartedApiServer, createCaptureEmailAdapter() (+8 more)

### Community 66 - "pushUtils.ts"
Cohesion: 0.14
Nodes (17): getWebPushClient(), handlePushNotify(), handlePushStatus(), sendVercelPushNotification(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription (+9 more)

### Community 67 - "selfHostedAuthService.ts"
Cohesion: 0.12
Nodes (19): AuthMeResponsePayload, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), MappedAuthFailure, normalizeAuthRole(), parseAuthHttpPayload() (+11 more)

### Community 68 - "realtimeChatHub.ts"
Cohesion: 0.25
Nodes (6): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 69 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): createSilentLogger(), createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow (+2 more)

### Community 70 - "gameCatalogRepo.ts"
Cohesion: 0.12
Nodes (16): escapeIlikePattern(), GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult, mapGameCatalogRow() (+8 more)

### Community 71 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 72 - "profile.ts"
Cohesion: 0.18
Nodes (15): createAuthProfileRouter(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership(), createProfileRouter(), extractRequestedTargetUserId(), PRIVILEGED_FIELDS (+7 more)

### Community 73 - "CustomerHome.tsx"
Cohesion: 0.16
Nodes (13): LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerHomeProps, CustomerReferrals(), CustomerReferralsProps, getStepBadge(), loadCustomerReferrals(), GameLink (+5 more)

### Community 74 - "gameCatalog.test.ts"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 75 - "UserWallet"
Cohesion: 0.25
Nodes (10): AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, AdminChatTopUpModalProps, TopUpModalMode, StaffWithdrawalDraftResult, GameAccount, GameCatalogItem (+2 more)

### Community 76 - "withdrawals.test.ts"
Cohesion: 0.19
Nodes (12): SendOtpEmailPayload, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow (+4 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.19
Nodes (12): SendVerificationEmailPayload, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "AdminMobileDrawer.tsx"
Cohesion: 0.36
Nodes (9): AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer(), getAdminDrawerListItems() (+1 more)

### Community 79 - "AppUserRole"
Cohesion: 0.20
Nodes (10): AppUserRole, ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, RejectDepositInput, CreateAdminUserBody, UpdateRoleBody, CreateCustomerWithdrawalInput (+2 more)

### Community 81 - "sessionHydrationUtils.ts"
Cohesion: 0.39
Nodes (6): getPrefetchRouteKeysForRole(), HydrationGateInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `react`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `.createStaffTopUpAsync`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `AdminAudit.tsx`, `UserRole`, `ChatTransactionCard.tsx`, `gameCatalogUtils.ts`, `.getAppConfig`, `assetPreloader.ts`, `CustomerHome.tsx`, `UserWallet`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.07494824016563147 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `webPushClient.ts`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `AgentMobileDrawer.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `dependencies`, `AdminAudit.tsx`, `ChatTransactionCard.tsx`, `SwiftSweepsLogo`, `gameCatalogUtils.ts`, `assetPreloader.ts`, `CustomerHome.tsx`, `UserWallet`, `AdminMobileDrawer.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `package.json`, `deposits.ts`, `profile.ts`, `wallet.ts`, `HttpError`, `dependencies`, `adminAuth.ts`, `withdrawals.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12233285917496443 - nodes in this community are weakly interconnected._