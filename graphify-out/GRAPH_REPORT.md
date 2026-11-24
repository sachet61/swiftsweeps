# Graph Report - swiftsweeps  (2026-11-24)

## Corpus Check
- 178 files · ~253,264 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1534 nodes · 5003 edges · 63 communities (57 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `436714fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- UserProfile
- package.json
- App.tsx
- AuthTokenCoordinator
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- overlayHistoryUtils.ts
- CustomerTopUp.tsx
- wheelOfLuckUtils.ts
- compilerOptions
- AdminChat.tsx
- react
- dataService.ts
- dataService
- WebPushClient
- AdminDashboard.tsx
- AdminAudit.tsx
- CustomerHome.tsx
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- assetPreloader.ts
- useVerificationResolution.ts
- AuthSessionService
- UserRole
- officialPartnerHandlers.ts
- AdminConfig.tsx
- api/index.ts
- ref_node_assert
- storageService.ts
- app.ts
- authSessionService.ts
- AdminGameCatalog.tsx
- SupabaseAuthService
- handler
- uiCopyUtils.ts
- assetPreloader.ts
- AdminUsers.tsx
- compilerOptions
- chatScrollUtils.ts
- chatOrderUtils.ts
- supabaseAuthService.ts
- migrations.ts
- NotificationSoundService
- dependencies
- ChatTransactionCard.tsx
- TopUpRequest
- scripts
- foundation.test.ts
- env.ts
- AgentMobileDrawer.tsx
- server/index.ts
- OfficialPartner
- authTokenUtils.ts
- TelegramService
- vite.config.ts
- AdminConfig.tsx
- logger.ts
- LazyPageFallback.tsx

## God Nodes (most connected - your core abstractions)
1. `DataService` - 217 edges
2. `UserProfile` - 106 edges
3. `react` - 68 edges
4. `isSupabaseConfigured()` - 65 edges
5. `lucide-react` - 60 edges
6. `App()` - 53 edges
7. `dataService` - 43 edges
8. `handler()` - 37 edges
9. `UserWallet` - 34 edges
10. `AdminChat()` - 30 edges

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

## Communities (63 total, 6 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.05
Nodes (12): DataService, mapGameCatalogItemToDbRow(), findRequestById(), isSupabaseConfigured(), computeCumulativeCompletedDeposits(), CashoutFeedItem, ChatMessage, GameAccount (+4 more)

### Community 1 - "UserProfile"
Cohesion: 0.07
Nodes (43): lucide-react, AdminOfficialPartnersTabProps, EmailOtpModal(), EmailOtpModalProps, AdminChatCashoutModalProps, AdminChatTopUpModalProps, BackgroundNotificationPrompt(), BackgroundNotificationPromptProps (+35 more)

### Community 2 - "package.json"
Cohesion: 0.15
Nodes (17): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, name (+9 more)

### Community 3 - "App.tsx"
Cohesion: 0.10
Nodes (37): App(), LazyEmailVerificationBanner, LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), WheelPopup(), CustomerMobileNav(), StaffMobileNav() (+29 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.13
Nodes (41): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), PLATFORMS, OfficialPartnersPreviewModal(), getPlatformDisplayName(), PartnerIcon(), PlatformBadge() (+33 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 10 - "CustomerTopUp.tsx"
Cohesion: 0.25
Nodes (12): CustomerTopUp(), loadCustomerTopUp(), PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft(), getTopUpDraftStorageKey(), ImageValidationResult, loadTopUpDraft() (+4 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (66): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+58 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "AdminChat.tsx"
Cohesion: 0.20
Nodes (29): ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), filterVisibleMessagesForRole() (+21 more)

### Community 14 - "react"
Cohesion: 0.17
Nodes (17): react, BeforeInstallPromptEvent, PWAInstallButton(), PWAInstallButtonProps, WheelGlyph(), WheelGlyphProps, WheelPopupProps, WheelStripProps (+9 more)

### Community 15 - "dataService.ts"
Cohesion: 0.17
Nodes (19): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+11 more)

### Community 16 - "dataService"
Cohesion: 0.19
Nodes (12): ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, LiveCashoutTicker(), AuthPage(), AuthPageProps, supabaseAuthService (+4 more)

### Community 17 - "WebPushClient"
Cohesion: 0.16
Nodes (8): arrayBufferToBase64(), DevicePlatform, urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.14
Nodes (17): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+9 more)

### Community 19 - "AdminAudit.tsx"
Cohesion: 0.19
Nodes (15): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+7 more)

### Community 20 - "CustomerHome.tsx"
Cohesion: 0.33
Nodes (9): GamePlatformCard(), GamePlatformCardProps, WheelStrip(), CustomerHome(), GameCatalogItem, isSafeExternalHttpUrl(), ResolvedGameCardLinks, resolveGameCardLinks() (+1 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (30): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedWithdrawals() (+22 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "assetPreloader.ts"
Cohesion: 0.30
Nodes (12): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, isImageCached(), normalizeAssetUrlList(), preloadAssetPool() (+4 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.18
Nodes (21): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+13 more)

### Community 28 - "UserRole"
Cohesion: 0.19
Nodes (11): SessionHydrationScreenProps, prefetchPagesForSession(), UserSession, getPrefetchRouteKeysForRole(), HydrationGateInput, HydrationPhaseLabelInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh() (+3 more)

### Community 29 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.21
Nodes (12): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, isPlaceholder(), resolveSupabaseAnonKey(), resolveSupabaseJwksUrl(), resolveSupabaseServiceRoleKey() (+4 more)

### Community 31 - "api/index.ts"
Cohesion: 0.07
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, fetchSupabaseJwksKeys(), getWebPushClient(), handleGetAuditLogs(), handlePostAuditLog() (+35 more)

### Community 32 - "ref_node_assert"
Cohesion: 0.08
Nodes (30): GlobalChatNotificationManager(), GlobalChatNotificationManagerProps, realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId() (+22 more)

### Community 33 - "storageService.ts"
Cohesion: 0.25
Nodes (11): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), toProxyStorageUrl() (+3 more)

### Community 34 - "app.ts"
Cohesion: 0.15
Nodes (16): express, ApiAppDependencies, createApiApp(), ServerConfig, checkDatabaseConnectivity(), DatabasePool, StartedApiServer, Logger (+8 more)

### Community 35 - "authSessionService.ts"
Cohesion: 0.25
Nodes (7): SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential

### Community 36 - "AdminGameCatalog.tsx"
Cohesion: 0.20
Nodes (16): AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, CustomerWithdrawal(), loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), countUnsavedCatalogChanges(), filterEnabledGameAccounts() (+8 more)

### Community 38 - "handler"
Cohesion: 0.17
Nodes (18): buildProxyStorageUrl(), enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), handleGetChatMessages(), handlePostChatSend(), handler(), handleStorageFileProxy() (+10 more)

### Community 39 - "uiCopyUtils.ts"
Cohesion: 0.17
Nodes (18): PolicyAndPartnerCmsCard(), AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, PayoutMethodType, decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage() (+10 more)

### Community 40 - "assetPreloader.ts"
Cohesion: 0.18
Nodes (15): CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, memoryImageCache, TargetAssetPlan, ALIAS_LOOKUP, DEFAULT_GAME_ICON, DEFERRED_GAME_IMAGE_PATHS (+7 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "chatScrollUtils.ts"
Cohesion: 0.19
Nodes (12): ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction(), DEFAULT_NEAR_BOTTOM_THRESHOLD_PX, inMemoryScrollMap, loadConversationScrollSnapshot(), MessageSummary, readStoredSnapshotMap() (+4 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "supabaseAuthService.ts"
Cohesion: 0.36
Nodes (7): SESSION_EXPIRED_USER_MESSAGE, PasswordResetResponse, SupabaseAuthResult, supabase, coordinator, emitSessionExpiredNotice(), supabaseTokenManager

### Community 46 - "migrations.ts"
Cohesion: 0.14
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, express@^5.3.0, lucide-react@^1.16.0, react@^19.0.0, react-dom@^19.0.0, @supabase/supabase-js@^2.49.1, tailwindcss@^4.0.0, @types/express@^5.0.6 (+6 more)

### Community 49 - "ChatTransactionCard.tsx"
Cohesion: 0.33
Nodes (7): ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), supabaseUrl, ChatTransactionData

### Community 50 - "TopUpRequest"
Cohesion: 0.44
Nodes (7): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString(), StaffWithdrawalDraftResult, WithdrawalRequest

### Community 51 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, build:server, db:migrate:check, db:migrate:status, db:migrate:up, dev, dev:api (+6 more)

### Community 52 - "foundation.test.ts"
Cohesion: 0.19
Nodes (5): BodyParserLikeError, HttpError, notFoundHandler(), validateRequestBody(), createSilentLogger()

### Community 53 - "env.ts"
Cohesion: 0.20
Nodes (12): ConfigValidationError, loadServerConfig(), NodeEnv, parseAppOrigin(), parseDatabaseUrl(), parseIntegerInRange(), parseTrustProxy(), PgSslMode (+4 more)

### Community 54 - "AgentMobileDrawer.tsx"
Cohesion: 0.30
Nodes (11): AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem, canRenderAgentDrawer() (+3 more)

### Community 55 - "server/index.ts"
Cohesion: 0.27
Nodes (8): pg@^8.23.1, pg, closePgPool(), createPgPool(), resolveSslOption(), main(), startApiServer(), createLogger()

### Community 56 - "OfficialPartner"
Cohesion: 0.27
Nodes (5): OfficialPartnerDrawerProps, OfficialPartnersPreviewModalProps, OfficialPartner, OfficialPartnerInput, isHtmlFallbackResponse()

### Community 57 - "authTokenUtils.ts"
Cohesion: 0.26
Nodes (9): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+1 more)

### Community 58 - "TelegramService"
Cohesion: 0.24
Nodes (3): TelegramService, telegramService, TelegramStatus

### Community 59 - "vite.config.ts"
Cohesion: 0.22
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 60 - "AdminConfig.tsx"
Cohesion: 0.33
Nodes (8): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), getSupabaseConfig(), testSupabaseConnection()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `dataService.ts`, `dataService`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `UserRole`, `ref_node_assert`, `storageService.ts`, `AdminGameCatalog.tsx`, `uiCopyUtils.ts`, `AdminUsers.tsx`, `supabaseAuthService.ts`, `ChatTransactionCard.tsx`, `OfficialPartner`, `AdminConfig.tsx`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.052488206763670185 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `dataService`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `assetPreloader.ts`, `useVerificationResolution.ts`, `ref_node_assert`, `storageService.ts`, `authSessionService.ts`, `AdminGameCatalog.tsx`, `uiCopyUtils.ts`, `AdminUsers.tsx`, `dependencies`, `ChatTransactionCard.tsx`, `AgentMobileDrawer.tsx`, `TelegramService`, `AdminConfig.tsx`, `LazyPageFallback.tsx`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.06954997077732321 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `dataService.ts`, `dataService`, `WebPushClient`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AuthSessionService`, `UserRole`, `ref_node_assert`, `storageService.ts`, `authSessionService.ts`, `AdminGameCatalog.tsx`, `SupabaseAuthService`, `uiCopyUtils.ts`, `AdminUsers.tsx`, `supabaseAuthService.ts`, `AgentMobileDrawer.tsx`, `AdminConfig.tsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10104529616724739 - nodes in this community are weakly interconnected._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._