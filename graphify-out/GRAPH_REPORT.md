# Graph Report - swiftsweeps  (2026-11-26)

## Corpus Check
- 192 files · ~274,703 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1753 nodes · 5579 edges · 71 communities (62 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1f7248c3`
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
- react
- dataService.ts
- lucide-react
- UserRole
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
- overlayHistoryUtils.ts
- isSupabaseConfigured
- AgentMobileDrawer.tsx
- AdminAudit.tsx
- CustomerTopUp.tsx
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- AuthTokenCoordinator
- migrations.ts
- NotificationSoundService
- dependencies
- authTokenUtils.ts
- authSessionService.ts
- scripts
- adminAuth.ts
- foundation.test.ts
- ChatTransactionCard.tsx
- emailDelivery.ts
- SwiftSweepsLogo
- AdminGameCatalog.tsx
- pwaAssets.ts
- vite.config.ts
- .getAppConfig
- logger.ts
- TopUpRequest
- .getPasswordResetTokens
- assetPreloader.ts
- ref_node_assert
- pushUtils.ts
- TelegramService
- realtimeChatHub.ts
- webPushNotifications.test.ts
- mergeAuditLogs

## God Nodes (most connected - your core abstractions)
1. `DataService` - 219 edges
2. `UserProfile` - 119 edges
3. `react` - 68 edges
4. `isSupabaseConfigured()` - 61 edges
5. `lucide-react` - 60 edges
6. `App()` - 54 edges
7. `dataService` - 42 edges
8. `SelfHostedAuthService` - 40 edges
9. `handler()` - 37 edges
10. `UserWallet` - 34 edges

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

## Communities (71 total, 9 thin omitted)

### Community 1 - "UserProfile"
Cohesion: 0.08
Nodes (30): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatTopUpModalProps, EmailVerificationBannerProps, PWAInstallButtonProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, CustomerMobileNavProps (+22 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (41): App(), LazyEmailVerificationBanner, LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), SessionTimeoutWarningModalProps (+33 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.12
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.06
Nodes (83): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+75 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.09
Nodes (23): SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase (+15 more)

### Community 10 - ".save"
Cohesion: 0.22
Nodes (3): GameAccount, PaymentMethodType, formatCredentialsReadyChatMessage()

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (64): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+56 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "ChatMessage"
Cohesion: 0.17
Nodes (4): ChatMessage, ReferralSummary, SupportConversation, filterVisibleMessagesForRole()

### Community 14 - "react"
Cohesion: 0.15
Nodes (16): react, BackgroundNotificationPrompt(), BackgroundNotificationPromptProps, IOSPwaInstallModal(), IOSPwaInstallModalProps, BeforeInstallPromptEvent, PWAInstallButton(), WheelGlyph() (+8 more)

### Community 15 - "dataService.ts"
Cohesion: 0.15
Nodes (20): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+12 more)

### Community 16 - "lucide-react"
Cohesion: 0.13
Nodes (22): lucide-react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, EmailVerificationBanner(), LiveCashoutFeedListProps (+14 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.14
Nodes (17): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+9 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.08
Nodes (20): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+12 more)

### Community 20 - "uiCopyUtils.ts"
Cohesion: 0.26
Nodes (13): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml() (+5 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.13
Nodes (32): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity() (+24 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "chatScrollUtils.ts"
Cohesion: 0.21
Nodes (18): CustomerChat(), buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction() (+10 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.17
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 27 - "WebPushClient"
Cohesion: 0.23
Nodes (3): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient

### Community 28 - "env.ts"
Cohesion: 0.14
Nodes (19): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+11 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (21): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL (+13 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (44): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+36 more)

### Community 32 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.22
Nodes (11): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId() (+3 more)

### Community 33 - "storageService.ts"
Cohesion: 0.24
Nodes (11): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), toProxyStorageUrl() (+3 more)

### Community 34 - "app.ts"
Cohesion: 0.11
Nodes (25): express, ApiAppDependencies, createApiApp(), CreateAuthInstanceDeps, ServerConfig, checkDatabaseConnectivity(), closePgPool(), DatabasePool (+17 more)

### Community 36 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 37 - "isSupabaseConfigured"
Cohesion: 0.20
Nodes (7): AdminChatCashoutModalProps, findRequestById(), isSupabaseConfigured(), computeCumulativeCompletedDeposits(), TopUpRequest, WithdrawalRequest, WithdrawalStatus

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.24
Nodes (13): react-dom@^19.0.0, react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE (+5 more)

### Community 39 - "AdminAudit.tsx"
Cohesion: 0.22
Nodes (11): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+3 more)

### Community 40 - "CustomerTopUp.tsx"
Cohesion: 0.19
Nodes (16): LiveCashoutFeedList(), CustomerTopUp(), CustomerWithdrawal(), loadCustomerTopUp(), loadCustomerWithdrawal(), filterEnabledGameAccounts(), filterEnabledGames(), ALLOWED_IMAGE_EXTENSIONS (+8 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.20
Nodes (18): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+10 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.17
Nodes (24): AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, AdminChat(), TICKET_STATUS_OPTIONS, buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus() (+16 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): PgSslMode, buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, tailwindcss@^4.0.0, @types/express@^5.0.6 (+7 more)

### Community 49 - "authTokenUtils.ts"
Cohesion: 0.16
Nodes (16): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+8 more)

### Community 50 - "authSessionService.ts"
Cohesion: 0.29
Nodes (6): authSessionService, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential, UserSession

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.09
Nodes (41): AuthRuntime, AppUserRole, AppUserStatus, isParentAdminUser(), ResolvedAppUser, AuthContext, AuthSessionSummary, createRequireAuthMiddleware() (+33 more)

### Community 53 - "foundation.test.ts"
Cohesion: 0.16
Nodes (10): loadLocalDotEnv(), resolveCandidateEnvPaths(), run(), createPgPool(), resolveSslOption(), main(), startApiServer(), createLogger() (+2 more)

### Community 54 - "ChatTransactionCard.tsx"
Cohesion: 0.31
Nodes (8): ChatTransactionCard(), ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), supabaseUrl, ChatTransactionData

### Community 55 - "emailDelivery.ts"
Cohesion: 0.10
Nodes (20): pg@^8.23.1, better-auth, pg, createAuthInstance(), EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), buildOtpCopy(), buildOtpMessage() (+12 more)

### Community 56 - "SwiftSweepsLogo"
Cohesion: 0.15
Nodes (17): SessionHydrationScreen(), SessionHydrationScreenProps, StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, getPrefetchRouteKeysForRole(), HydrationGateInput (+9 more)

### Community 57 - "AdminGameCatalog.tsx"
Cohesion: 0.18
Nodes (16): GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), countUnsavedCatalogChanges(), mapDbRowToGameCatalogItem() (+8 more)

### Community 58 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.18
Nodes (6): @tailwindcss/vite@^4.0.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, @vitejs/plugin-react, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 62 - "TopUpRequest"
Cohesion: 0.62
Nodes (5): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString()

### Community 64 - "assetPreloader.ts"
Cohesion: 0.17
Nodes (16): CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, isImageCached(), memoryImageCache, normalizeAssetUrlList(), preloadSingleImage(), scheduleDeferredAssetPreload() (+8 more)

### Community 65 - "ref_node_assert"
Cohesion: 0.21
Nodes (6): handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), writeServerAuditLog()

### Community 66 - "pushUtils.ts"
Cohesion: 0.20
Nodes (11): getWebPushClient(), deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList() (+3 more)

### Community 67 - "TelegramService"
Cohesion: 0.24
Nodes (3): TelegramService, telegramService, TelegramStatus

### Community 68 - "realtimeChatHub.ts"
Cohesion: 0.25
Nodes (6): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 69 - "webPushNotifications.test.ts"
Cohesion: 0.29
Nodes (4): executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 70 - "mergeAuditLogs"
Cohesion: 0.57
Nodes (3): AuditLog, mergeAuditLogs(), normalizeAuditLogRow()

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `react`, `dataService.ts`, `lucide-react`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `chatScrollUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `storageService.ts`, `.saveToLocalStorage`, `isSupabaseConfigured`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `authTokenUtils.ts`, `ChatTransactionCard.tsx`, `SwiftSweepsLogo`, `AdminGameCatalog.tsx`, `.getAppConfig`, `.getPasswordResetTokens`, `mergeAuditLogs`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08116883116883117 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `lucide-react`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `chatScrollUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `storageService.ts`, `AgentMobileDrawer.tsx`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `dependencies`, `ChatTransactionCard.tsx`, `SwiftSweepsLogo`, `AdminGameCatalog.tsx`, `TelegramService`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.07807807807807808 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `lucide-react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `react`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `walletActivityUtils.ts`, `chatScrollUtils.ts`, `AdminConfig.tsx`, `GlobalChatNotificationManager.tsx`, `storageService.ts`, `AgentMobileDrawer.tsx`, `AdminAudit.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `dependencies`, `ChatTransactionCard.tsx`, `SwiftSweepsLogo`, `AdminGameCatalog.tsx`, `TelegramService`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08776595744680851 - nodes in this community are weakly interconnected._