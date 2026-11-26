# Graph Report - swiftsweeps  (2026-11-26)

## Corpus Check
- 196 files · ~283,775 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1821 nodes · 5757 edges · 62 communities (52 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de8d7ff5`
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
- gameCatalogRepo.ts
- dataService.ts
- lucide-react
- types.ts
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
- officialPartnerHandlers.ts
- isSupabaseConfigured
- .getCurrentUser
- AdminAudit.tsx
- AdminConfig.tsx
- UserRole
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- AuthTokenCoordinator
- migrations.ts
- NotificationSoundService
- dependencies
- authTokenUtils.ts
- auth.ts
- scripts
- adminAuth.ts
- useVerificationResolution.ts
- @types/pg@^8.23.1
- gameCatalog.test.ts
- dataService
- pwaAssets.ts
- assetPreloader.ts
- ref_node_assert
- pushUtils.ts
- .fetchAuditLogsFromServer

## God Nodes (most connected - your core abstractions)
1. `DataService` - 219 edges
2. `UserProfile` - 119 edges
3. `react` - 68 edges
4. `lucide-react` - 60 edges
5. `isSupabaseConfigured()` - 56 edges
6. `App()` - 54 edges
7. `dataService` - 42 edges
8. `SelfHostedAuthService` - 40 edges
9. `HttpError` - 39 edges
10. `handler()` - 37 edges

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

## Communities (62 total, 10 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.07
Nodes (3): DataService, CashoutFeedItem, PasswordResetToken

### Community 1 - "UserProfile"
Cohesion: 0.09
Nodes (31): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatCashoutModalProps, AdminChatTopUpModalProps, BackgroundNotificationPromptProps, EmailVerificationBannerProps, BeforeInstallPromptEvent, PWAInstallButton() (+23 more)

### Community 2 - "package.json"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.05
Nodes (78): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), LazyPageFallback(), LegalContent(), SessionHydrationScreen(), SessionTimeoutWarningModal(), StartupSplash() (+70 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.13
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.08
Nodes (62): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+54 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.11
Nodes (13): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+5 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (65): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+57 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "gameCatalogRepo.ts"
Cohesion: 0.09
Nodes (17): escapeIlikePattern(), GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult, mapGameCatalogRow() (+9 more)

### Community 15 - "dataService.ts"
Cohesion: 0.13
Nodes (21): AdminRequestsProps, loadAdminRequests(), RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS (+13 more)

### Community 16 - "lucide-react"
Cohesion: 0.13
Nodes (22): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, EmailVerificationBanner() (+14 more)

### Community 17 - "types.ts"
Cohesion: 0.11
Nodes (21): CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, GamePlatformCard(), GamePlatformCardProps, AdminGameCredentialsProps, loadAdminGameCredentials(), loadCustomerGameAccounts(), GameAccountStatus (+13 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.09
Nodes (22): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+14 more)

### Community 20 - "uiCopyUtils.ts"
Cohesion: 0.24
Nodes (14): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml() (+6 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.11
Nodes (38): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString() (+30 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.14
Nodes (42): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+34 more)

### Community 25 - "chatScrollUtils.ts"
Cohesion: 0.19
Nodes (18): CustomerChat(), buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction() (+10 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.24
Nodes (11): deriveVerificationUiState(), getDefaultStorage(), mergeVerifiedStatus(), normalizeEmailKey(), parseCacheMap(), readVerifiedCache(), StorageReader, StorageWriter (+3 more)

### Community 27 - "WebPushClient"
Cohesion: 0.16
Nodes (8): arrayBufferToBase64(), DevicePlatform, urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.09
Nodes (33): createEmailDeliveryAdapter(), ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret() (+25 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.16
Nodes (15): ChatTransactionCardProps, DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, isPlaceholder(), resolveSupabaseAnonKey(), resolveSupabaseJwksUrl() (+7 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (47): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), fetchSupabaseJwksKeys() (+39 more)

### Community 32 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.12
Nodes (17): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote() (+9 more)

### Community 33 - "storageService.ts"
Cohesion: 0.24
Nodes (10): fileToBase64(), StorageService, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), toProxyStorageUrl() (+2 more)

### Community 34 - "app.ts"
Cohesion: 0.10
Nodes (31): express, ApiAppDependencies, createApiApp(), LogLevel, checkDatabaseConnectivity(), emit(), LEVEL_PRIORITY, Logger (+23 more)

### Community 36 - "officialPartnerHandlers.ts"
Cohesion: 0.23
Nodes (19): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+11 more)

### Community 37 - "isSupabaseConfigured"
Cohesion: 0.21
Nodes (4): findRequestById(), isSupabaseConfigured(), ChatMessage, WithdrawalStatus

### Community 39 - "AdminAudit.tsx"
Cohesion: 0.22
Nodes (11): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+3 more)

### Community 40 - "AdminConfig.tsx"
Cohesion: 0.09
Nodes (28): TelegramBotConfigCard(), AdminChatTopUpModal(), TopUpModalMode, AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, CustomerTopUp() (+20 more)

### Community 41 - "UserRole"
Cohesion: 0.07
Nodes (32): RoleSwitcher(), SessionHydrationScreenProps, SessionTimeoutWarningModalProps, AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE (+24 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.20
Nodes (24): AdminChatCashoutModal(), ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), filterVisibleMessagesForRole() (+16 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 46 - "migrations.ts"
Cohesion: 0.14
Nodes (22): loadLocalDotEnv(), resolveCandidateEnvPaths(), buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES (+14 more)

### Community 48 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, react-dom@^19.0.0, tailwindcss@^4.0.0 (+11 more)

### Community 49 - "authTokenUtils.ts"
Cohesion: 0.16
Nodes (17): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+9 more)

### Community 50 - "auth.ts"
Cohesion: 0.12
Nodes (15): pg@^8.23.1, better-auth, pg, AuthRuntime, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath() (+7 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.08
Nodes (56): AppUserRole, AppUserStatus, isParentAdminUser(), GameCatalogLinkRecord, requireRole(), HttpError, validateRequestBody(), assertRecord() (+48 more)

### Community 53 - "useVerificationResolution.ts"
Cohesion: 0.29
Nodes (11): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+3 more)

### Community 55 - "gameCatalog.test.ts"
Cohesion: 0.07
Nodes (33): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, EmailDeliveryUnavailableError (+25 more)

### Community 57 - "dataService"
Cohesion: 0.23
Nodes (14): LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerWithdrawal(), loadCustomerWithdrawal(), dataService, applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse(), filterEnabledGameAccounts() (+6 more)

### Community 58 - "pwaAssets.ts"
Cohesion: 0.14
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 64 - "assetPreloader.ts"
Cohesion: 0.14
Nodes (22): AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), countUnsavedCatalogChanges(), CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS (+14 more)

### Community 66 - "pushUtils.ts"
Cohesion: 0.24
Nodes (10): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord (+2 more)

### Community 70 - ".fetchAuditLogsFromServer"
Cohesion: 0.26
Nodes (4): parseGameCatalogApiError(), AuditLog, mergeAuditLogs(), normalizeAuditLogRow()

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `lucide-react`, `types.ts`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `.saveToLocalStorage`, `isSupabaseConfigured`, `.getCurrentUser`, `AdminAudit.tsx`, `AdminConfig.tsx`, `UserRole`, `AdminChat.tsx`, `authTokenUtils.ts`, `useVerificationResolution.ts`, `dataService`, `assetPreloader.ts`, `.fetchAuditLogsFromServer`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.07346938775510205 - nodes in this community are weakly interconnected._
- **Why does `react` connect `lucide-react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `dataService.ts`, `types.ts`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `AdminAudit.tsx`, `AdminConfig.tsx`, `UserRole`, `AdminChat.tsx`, `dependencies`, `useVerificationResolution.ts`, `dataService`, `assetPreloader.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.09047619047619047 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `lucide-react`, `types.ts`, `AdminDashboard.tsx`, `SelfHostedAuthService`, `walletActivityUtils.ts`, `WebPushClient`, `SupabaseAuthService`, `GlobalChatNotificationManager.tsx`, `.getCurrentUser`, `AdminAudit.tsx`, `AdminConfig.tsx`, `UserRole`, `AdminChat.tsx`, `authTokenUtils.ts`, `useVerificationResolution.ts`, `dataService`, `assetPreloader.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.053750597228858096 - nodes in this community are weakly interconnected._