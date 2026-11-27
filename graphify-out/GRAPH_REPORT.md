# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 199 files · ~290,545 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1893 nodes · 5932 edges · 75 communities (63 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `340e15a5`
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
- .getUserById
- wheelHandlers.ts
- dataService.ts
- react
- gameCatalog.ts
- AdminDashboard.tsx
- SelfHostedAuthService
- uiCopyUtils.ts
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
- .saveToLocalStorage
- overlayHistoryUtils.ts
- isSupabaseConfigured
- walletRepo.ts
- AdminAudit.tsx
- CustomerTopUp.tsx
- TopNavbar.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- AuthTokenCoordinator
- migrations.ts
- NotificationSoundService
- dependencies
- authTokenUtils.ts
- HttpError
- scripts
- adminAuth.ts
- foundation.test.ts
- gameCatalogRepo.ts
- emailDelivery.ts
- sessionHydrationUtils.ts
- AdminGameCatalog.tsx
- wallet.ts
- vite.config.ts
- .getAppConfig
- logger.ts
- wallet.test.ts
- referralUtils.ts
- gameCatalog.test.ts
- ref_node_assert
- pushUtils.ts
- AdminConfig.tsx
- realtimeChatHub.ts
- ref_node_assert
- .getCurrentUser
- userDirectoryRepo.ts
- supabaseAuthService.ts
- dataService
- .getWallet

## God Nodes (most connected - your core abstractions)
1. `DataService` - 222 edges
2. `UserProfile` - 119 edges
3. `react` - 68 edges
4. `lucide-react` - 60 edges
5. `isSupabaseConfigured()` - 56 edges
6. `App()` - 54 edges
7. `HttpError` - 46 edges
8. `dataService` - 42 edges
9. `SelfHostedAuthService` - 40 edges
10. `handler()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `loadReferralProgramConfig()` --calls--> `normalizeReferralConfig()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `computeRefereeRealCashDeposits()` --calls--> `isRealCashTopUpRow()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralAttribute()` --calls--> `evaluateReferralFraudSignals()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralEvaluate()` --calls--> `checkReferralBudgetCaps()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralEvaluate()` --calls--> `evaluateReferralFraudSignals()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (75 total, 12 thin omitted)

### Community 1 - "UserProfile"
Cohesion: 0.09
Nodes (26): AdminOfficialPartnersTabProps, EmailOtpModalProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, CustomerMobileNavProps, StaffMobileNavProps (+18 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (42): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps (+34 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.25
Nodes (3): generateReferralCode(), UserDirectoryRepo, ProfileRouterDeps

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.06
Nodes (85): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+77 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.11
Nodes (37): describeSectorPath(), polarToCartesian(), renderSliceVectorIcon(), WheelOfLuckModal(), WheelOfLuckModalProps, WheelSpinResultModal(), WheelSpinResultModalProps, useWheelOfLuckStatus() (+29 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "wheelHandlers.ts"
Cohesion: 0.15
Nodes (23): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+15 more)

### Community 15 - "dataService.ts"
Cohesion: 0.09
Nodes (39): AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, ChatTransactionCardProps, AdminRequestsProps, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo (+31 more)

### Community 16 - "react"
Cohesion: 0.12
Nodes (25): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPromptProps (+17 more)

### Community 17 - "gameCatalog.ts"
Cohesion: 0.15
Nodes (28): GameCatalogLinkRecord, GameCatalogSortField, GameCatalogSortOrder, ALLOWED_GAME_BODY_KEYS, ALLOWED_QUERY_KEYS, ALLOWED_SORT_FIELDS, assertAllowedGameObjectKeys(), assertObjectRecord() (+20 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.09
Nodes (21): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+13 more)

### Community 20 - "uiCopyUtils.ts"
Cohesion: 0.26
Nodes (13): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml() (+5 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (32): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity() (+24 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.21
Nodes (28): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+20 more)

### Community 25 - "chatScrollUtils.ts"
Cohesion: 0.17
Nodes (17): buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction(), DEFAULT_NEAR_BOTTOM_THRESHOLD_PX (+9 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.18
Nodes (21): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+13 more)

### Community 28 - "env.ts"
Cohesion: 0.16
Nodes (18): EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes(), parseBooleanSetting() (+10 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.19
Nodes (13): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, isPlaceholder(), resolveSupabaseAnonKey(), resolveSupabaseJwksUrl(), resolveSupabaseServiceRoleKey() (+5 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (45): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+37 more)

### Community 32 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.18
Nodes (13): realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), notificationSoundService (+5 more)

### Community 33 - "storageService.ts"
Cohesion: 0.23
Nodes (11): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl() (+3 more)

### Community 34 - "app.ts"
Cohesion: 0.11
Nodes (24): ApiAppDependencies, createApiApp(), createEmailDeliveryAdapter(), ServerConfig, checkDatabaseConnectivity(), DatabasePool, resolveSslOption(), StartedApiServer (+16 more)

### Community 36 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 38 - "walletRepo.ts"
Cohesion: 0.11
Nodes (19): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+11 more)

### Community 39 - "AdminAudit.tsx"
Cohesion: 0.24
Nodes (12): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+4 more)

### Community 40 - "CustomerTopUp.tsx"
Cohesion: 0.21
Nodes (15): AdminChatTopUpModalProps, TopUpModalMode, CustomerTopUp(), storageService, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft(), getTopUpDraftStorageKey() (+7 more)

### Community 41 - "TopNavbar.tsx"
Cohesion: 0.05
Nodes (47): PWAInstallButton(), RoleSwitcher(), SessionHydrationScreenProps, SessionTimeoutWarningModalProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, AdminMobileDrawer(), AdminMobileDrawerProps (+39 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.19
Nodes (26): AdminChatCashoutModal(), AdminChatTopUpModal(), ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS (+18 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 46 - "migrations.ts"
Cohesion: 0.14
Nodes (22): PgSslMode, buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow (+14 more)

### Community 48 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+12 more)

### Community 49 - "authTokenUtils.ts"
Cohesion: 0.27
Nodes (9): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+1 more)

### Community 50 - "HttpError"
Cohesion: 0.18
Nodes (19): express, BodyParserLikeError, HttpError, notFoundHandler(), validateRequestBody(), createAuthProfileRouter(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS (+11 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.14
Nodes (22): AuthRuntime, AppUserRole, AppUserStatus, ResolvedAppUser, AuthContext, AuthSessionSummary, Express, Request (+14 more)

### Community 53 - "foundation.test.ts"
Cohesion: 0.16
Nodes (11): ConfigValidationError, loadLocalDotEnv(), resolveCandidateEnvPaths(), AuthMigrateCommand, run(), closePgPool(), createPgPool(), main() (+3 more)

### Community 54 - "gameCatalogRepo.ts"
Cohesion: 0.13
Nodes (13): escapeIlikePattern(), GameCatalogRecord, GameCatalogRepo, ListGameCatalogOptions, ListGameCatalogResult, mapGameCatalogRow(), parseLinks(), QueryResultLike (+5 more)

### Community 55 - "emailDelivery.ts"
Cohesion: 0.10
Nodes (18): better-auth, pg, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), buildOtpCopy(), buildOtpMessage() (+10 more)

### Community 56 - "sessionHydrationUtils.ts"
Cohesion: 0.33
Nodes (7): getPrefetchRouteKeysForRole(), HydrationGateInput, HydrationPhaseLabelInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

### Community 57 - "AdminGameCatalog.tsx"
Cohesion: 0.06
Nodes (59): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog() (+51 more)

### Community 58 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 62 - "wallet.test.ts"
Cohesion: 0.15
Nodes (12): SendPasswordResetEmailPayload, DatabaseClient, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow (+4 more)

### Community 63 - "referralUtils.ts"
Cohesion: 0.18
Nodes (16): ReferralLedgerEntry, ReferralPayoutTarget, ReferralProgramConfig, ReferralRewardMode, checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG (+8 more)

### Community 64 - "gameCatalog.test.ts"
Cohesion: 0.17
Nodes (11): SendOtpEmailPayload, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow (+3 more)

### Community 65 - "ref_node_assert"
Cohesion: 0.21
Nodes (6): handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), writeServerAuditLog()

### Community 66 - "pushUtils.ts"
Cohesion: 0.31
Nodes (8): deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList(), RESERVED_NON_USER_IDS

### Community 67 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (14): TelegramBotConfigCard(), WheelOfLuckAdminCard(), WheelOfLuckAdminCardProps, AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, getSupabaseConfig() (+6 more)

### Community 68 - "realtimeChatHub.ts"
Cohesion: 0.25
Nodes (6): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 69 - "ref_node_assert"
Cohesion: 0.11
Nodes (14): SendVerificationEmailPayload, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow (+6 more)

### Community 70 - ".getCurrentUser"
Cohesion: 0.14
Nodes (3): AuditLog, ChatMessage, normalizeAuditLogRow()

### Community 71 - "userDirectoryRepo.ts"
Cohesion: 0.17
Nodes (13): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, isParentAdminUser(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+5 more)

### Community 72 - "supabaseAuthService.ts"
Cohesion: 0.29
Nodes (8): TokenResolutionResult, PasswordResetResponse, SupabaseAuthResult, supabaseAuthService, supabase, coordinator, emitSessionExpiredNotice(), supabaseTokenManager

### Community 73 - "dataService"
Cohesion: 0.39
Nodes (7): LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerWithdrawal(), loadCustomerWithdrawal(), dataService, filterEnabledGameAccounts(), filterEnabledGames()

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `.getUserById`, `dataService.ts`, `react`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `GlobalChatNotificationManager.tsx`, `.saveToLocalStorage`, `isSupabaseConfigured`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `TopNavbar.tsx`, `AdminChat.tsx`, `AdminGameCatalog.tsx`, `.getAppConfig`, `AdminConfig.tsx`, `.getCurrentUser`, `supabaseAuthService.ts`, `dataService`, `.getWallet`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `dataService.ts`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `GlobalChatNotificationManager.tsx`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `TopNavbar.tsx`, `AdminChat.tsx`, `dependencies`, `AdminGameCatalog.tsx`, `AdminConfig.tsx`, `dataService`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.09462365591397849 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `react` to `GlobalChatNotificationManager.tsx`, `UserProfile`, `package.json`, `App.tsx`, `AdminConfig.tsx`, `officialPartnersUtils.ts`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `dataService`, `TopNavbar.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `dataService.ts`, `dependencies`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `AdminGameCatalog.tsx`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08865248226950355 - nodes in this community are weakly interconnected._