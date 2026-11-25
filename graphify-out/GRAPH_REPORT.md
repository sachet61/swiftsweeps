# Graph Report - swiftsweeps  (2026-11-25)

## Corpus Check
- 186 files · ~262,634 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1644 nodes · 5292 edges · 50 communities (47 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8860cb12`
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
- CustomerTopUp.tsx
- wheelOfLuckUtils.ts
- compilerOptions
- AdminChat.tsx
- react
- dataService.ts
- react
- CustomerProfile.tsx
- AdminDashboard.tsx
- AdminAudit.tsx
- pushUtils.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- DatabasePool
- supabaseAuthService.ts
- officialPartnerHandlers.ts
- AdminConfig.tsx
- api/index.ts
- ref_node_assert
- storageService.ts
- app.ts
- uiCopyUtils.ts
- AdminGameCatalog.tsx
- AdminUsers.tsx
- compilerOptions
- chatScrollUtils.ts
- chatOrderUtils.ts
- migrations.ts
- NotificationSoundService
- dependencies
- TopUpRequest
- scripts
- adminAuth.ts
- env.ts
- authInstance.ts
- OfficialPartner
- vite.config.ts
- logger.ts

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

## Communities (50 total, 3 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.05
Nodes (12): DataService, mapGameCatalogItemToDbRow(), findRequestById(), isSupabaseConfigured(), AuditLog, CashoutFeedItem, ChatMessage, GameAccount (+4 more)

### Community 1 - "UserProfile"
Cohesion: 0.09
Nodes (29): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatCashoutModalProps, AdminChatTopUpModalProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, BeforeInstallPromptEvent, PWAInstallButtonProps (+21 more)

### Community 2 - "package.json"
Cohesion: 0.15
Nodes (17): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, name (+9 more)

### Community 3 - "App.tsx"
Cohesion: 0.06
Nodes (67): App(), LazyEmailVerificationBanner, GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal() (+59 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.14
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.11
Nodes (47): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+39 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.12
Nodes (16): EmailDeliveryUnavailableError, OtpEmailPurpose, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig() (+8 more)

### Community 10 - "CustomerTopUp.tsx"
Cohesion: 0.13
Nodes (16): CustomerTopUp(), loadCustomerTopUp(), TelegramService, telegramService, TelegramStatus, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft() (+8 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (64): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+56 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "AdminChat.tsx"
Cohesion: 0.19
Nodes (21): AdminChatTopUpModal(), TopUpModalMode, AdminChat(), TICKET_STATUS_OPTIONS, storageService, StorageUploadResult, buildGroupedMessages(), CHAT_QUICK_EMOJIS (+13 more)

### Community 14 - "react"
Cohesion: 0.18
Nodes (18): react-dom, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps (+10 more)

### Community 15 - "dataService.ts"
Cohesion: 0.18
Nodes (18): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+10 more)

### Community 16 - "react"
Cohesion: 0.13
Nodes (22): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, EmailVerificationBanner() (+14 more)

### Community 17 - "CustomerProfile.tsx"
Cohesion: 0.06
Nodes (27): BackgroundNotificationPrompt(), BackgroundNotificationPromptProps, IOSPwaInstallModal(), IOSPwaInstallModalProps, SessionHydrationScreenProps, CustomerProfile(), loadCustomerProfile(), AuthSessionService (+19 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.09
Nodes (26): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, WheelSpinResultModalProps (+18 more)

### Community 19 - "AdminAudit.tsx"
Cohesion: 0.23
Nodes (13): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+5 more)

### Community 20 - "pushUtils.ts"
Cohesion: 0.24
Nodes (10): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord (+2 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.15
Nodes (30): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+22 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.14
Nodes (42): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+34 more)

### Community 25 - "DatabasePool"
Cohesion: 0.28
Nodes (4): checkDatabaseConnectivity(), DatabasePool, createHealthRouter(), HealthRouterDeps

### Community 26 - "supabaseAuthService.ts"
Cohesion: 0.05
Nodes (40): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+32 more)

### Community 29 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (20): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL (+12 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (49): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+41 more)

### Community 32 - "ref_node_assert"
Cohesion: 0.11
Nodes (16): realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), notificationSoundService (+8 more)

### Community 33 - "storageService.ts"
Cohesion: 0.19
Nodes (14): ChatTransactionCard(), ChatTransactionCardProps, fileToBase64(), StorageService, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation (+6 more)

### Community 34 - "app.ts"
Cohesion: 0.22
Nodes (14): express, createApiApp(), BodyParserLikeError, createErrorHandler(), notFoundHandler(), createRequestContextMiddleware(), Express, Request (+6 more)

### Community 39 - "uiCopyUtils.ts"
Cohesion: 0.17
Nodes (18): PolicyAndPartnerCmsCard(), AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, PayoutMethodType, decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage() (+10 more)

### Community 40 - "AdminGameCatalog.tsx"
Cohesion: 0.08
Nodes (44): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog() (+36 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "chatScrollUtils.ts"
Cohesion: 0.16
Nodes (23): CustomerChat(), buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction() (+15 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 46 - "migrations.ts"
Cohesion: 0.07
Nodes (37): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+29 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0, @supabase/supabase-js@^2.49.1 (+9 more)

### Community 50 - "TopUpRequest"
Cohesion: 0.35
Nodes (9): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString(), StaffTopUpDraftResult, StaffWithdrawalDraftResult, TopUpRequest (+1 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.14
Nodes (27): AuthRuntime, AppUserRole, AppUserStatus, isParentAdminUser(), ResolvedAppUser, AuthContext, AuthSessionSummary, createRequireAuthMiddleware() (+19 more)

### Community 53 - "env.ts"
Cohesion: 0.09
Nodes (29): pg, createEmailDeliveryAdapter(), ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigin() (+21 more)

### Community 55 - "authInstance.ts"
Cohesion: 0.16
Nodes (10): better-auth, ApiAppDependencies, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), EmailDeliveryAdapter, ServerConfig (+2 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.22
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `dataService.ts`, `react`, `CustomerProfile.tsx`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`, `supabaseAuthService.ts`, `AdminConfig.tsx`, `ref_node_assert`, `storageService.ts`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`, `OfficialPartner`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.05182266009852217 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `CustomerProfile.tsx`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`, `supabaseAuthService.ts`, `AdminConfig.tsx`, `ref_node_assert`, `storageService.ts`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`, `dependencies`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.09462365591397849 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `dataService.ts`, `react`, `CustomerProfile.tsx`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`, `supabaseAuthService.ts`, `AdminConfig.tsx`, `ref_node_assert`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05569620253164557 - nodes in this community are weakly interconnected._
- **Should `userDirectoryRepo.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._