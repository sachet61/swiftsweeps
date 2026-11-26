# Graph Report - swiftsweeps  (2026-11-26)

## Corpus Check
- 190 files · ~268,493 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1703 nodes · 5447 edges · 59 communities (55 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `92aba797`
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
- chatPresentationUtils.ts
- react
- dataService.ts
- lucide-react
- UserRole
- AdminDashboard.tsx
- SelfHostedAuthService
- pushUtils.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- wheelHandlers.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- SupabaseAuthService
- AdminConfig.tsx
- api/index.ts
- ref_node_assert
- storageService.ts
- app.ts
- WheelOfLuckModal.tsx
- overlayHistoryUtils.ts
- auditLogs.test.ts
- AgentMobileDrawer.tsx
- uiCopyUtils.ts
- AdminGameCatalog.tsx
- AdminUsers.tsx
- compilerOptions
- chatScrollUtils.ts
- chatOrderUtils.ts
- AuthTokenCoordinator
- migrations.ts
- NotificationSoundService
- dependencies
- authTokenUtils.ts
- supabaseAuthService.ts
- scripts
- adminAuth.ts
- foundation.test.ts
- webPushNotifications.test.ts
- authInstance.ts
- sessionHydrationUtils.ts
- vite.config.ts
- logger.ts

## God Nodes (most connected - your core abstractions)
1. `DataService` - 218 edges
2. `UserProfile` - 117 edges
3. `react` - 68 edges
4. `isSupabaseConfigured()` - 62 edges
5. `lucide-react` - 60 edges
6. `App()` - 54 edges
7. `dataService` - 42 edges
8. `handler()` - 37 edges
9. `SelfHostedAuthService` - 36 edges
10. `UserWallet` - 34 edges

## Surprising Connections (you probably didn't know these)
- `loadAuthoritativeWheelConfig()` --calls--> `normalizeWheelConfig()`  [EXTRACTED]
  api/wheelHandlers.ts → src/utils/wheelOfLuckUtils.ts
- `handlePostAdminWheelConfig()` --calls--> `validateWheelConfig()`  [EXTRACTED]
  api/wheelHandlers.ts → src/utils/wheelOfLuckUtils.ts
- `handleGetOfficialPartners()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (59 total, 4 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.05
Nodes (10): DataService, findRequestById(), isSupabaseConfigured(), CashoutFeedItem, ChatMessage, GameAccount, PasswordResetToken, SupportConversation (+2 more)

### Community 1 - "UserProfile"
Cohesion: 0.08
Nodes (30): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatTopUpModalProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, PWAInstallButtonProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps (+22 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (41): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal() (+33 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.13
Nodes (15): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), isParentAdminUser(), JoinedUserRow, mapJoinedRow() (+7 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.07
Nodes (73): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+65 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.11
Nodes (18): better-auth@^1.7.28, better-auth, EmailDeliveryUnavailableError, OtpEmailPurpose, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, createMemoryBetterAuthDb() (+10 more)

### Community 10 - "CustomerTopUp.tsx"
Cohesion: 0.13
Nodes (15): CustomerTopUp(), loadCustomerTopUp(), TelegramService, telegramService, TelegramStatus, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft() (+7 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.14
Nodes (27): WheelOfLuckAdminCard(), WheelOfLuckAdminCardProps, WheelOfLuckConfig, WheelSegment, buildStickyWheelButtonState(), computeSegmentProbabilities(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS (+19 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "chatPresentationUtils.ts"
Cohesion: 0.36
Nodes (10): buildGroupedMessages(), filterVisibleMessagesForRole(), formatChatDateDivider(), formatConversationTimestamp(), getLocalDateKey(), getTicketStatusMeta(), GroupedChatMessage, isMessageInternalNote() (+2 more)

### Community 14 - "react"
Cohesion: 0.19
Nodes (16): react, BeforeInstallPromptEvent, PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, WheelGlyph(), WheelGlyphProps, WheelPopupProps (+8 more)

### Community 15 - "dataService.ts"
Cohesion: 0.08
Nodes (40): AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, WheelSpinResultModalProps, AdminRequestsProps, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo (+32 more)

### Community 16 - "lucide-react"
Cohesion: 0.14
Nodes (22): lucide-react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPromptProps, EmailVerificationBanner() (+14 more)

### Community 17 - "UserRole"
Cohesion: 0.10
Nodes (13): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, AuthSessionService, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS (+5 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (16): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+8 more)

### Community 20 - "pushUtils.ts"
Cohesion: 0.31
Nodes (8): deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList(), RESERVED_NON_USER_IDS

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.13
Nodes (34): LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerHome(), CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta (+26 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelHandlers.ts"
Cohesion: 0.16
Nodes (19): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig(), loadPlayerWalletSummary() (+11 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.18
Nodes (21): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+13 more)

### Community 27 - "WebPushClient"
Cohesion: 0.23
Nodes (3): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient

### Community 28 - "env.ts"
Cohesion: 0.14
Nodes (19): ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes() (+11 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (20): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL (+12 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (44): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), fetchSupabaseJwksKeys() (+36 more)

### Community 32 - "ref_node_assert"
Cohesion: 0.10
Nodes (18): GlobalChatNotificationManager(), realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage() (+10 more)

### Community 33 - "storageService.ts"
Cohesion: 0.25
Nodes (10): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP() (+2 more)

### Community 34 - "app.ts"
Cohesion: 0.19
Nodes (15): express, createApiApp(), BodyParserLikeError, createErrorHandler(), notFoundHandler(), createRequestContextMiddleware(), Express, Request (+7 more)

### Community 35 - "WheelOfLuckModal.tsx"
Cohesion: 0.21
Nodes (17): describeSectorPath(), polarToCartesian(), renderSliceVectorIcon(), WheelOfLuckModal(), WheelOfLuckModalProps, WheelSpinResultModal(), useWheelOfLuckStatus(), WheelEligibilityState (+9 more)

### Community 36 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 37 - "auditLogs.test.ts"
Cohesion: 0.18
Nodes (8): decodeJwtPartJson(), handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), verifyJwtWithJwkSet(), writeServerAuditLog()

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.29
Nodes (11): react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem (+3 more)

### Community 39 - "uiCopyUtils.ts"
Cohesion: 0.11
Nodes (28): PolicyAndPartnerCmsCard(), AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv() (+20 more)

### Community 40 - "AdminGameCatalog.tsx"
Cohesion: 0.05
Nodes (62): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS (+54 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "chatScrollUtils.ts"
Cohesion: 0.14
Nodes (32): AdminChatCashoutModal(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), supabaseUrl, CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), formatChatTime() (+24 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.21
Nodes (18): ChatTransactionCard(), ChatTransactionCardProps, compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage() (+10 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): PgSslMode, buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, express@^5.3.0, lucide-react@^1.16.0, react@^19.0.0, react-dom@^19.0.0, @supabase/supabase-js@^2.49.1, tailwindcss@^4.0.0, @types/express@^5.0.6 (+7 more)

### Community 49 - "authTokenUtils.ts"
Cohesion: 0.27
Nodes (9): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+1 more)

### Community 50 - "supabaseAuthService.ts"
Cohesion: 0.29
Nodes (8): TokenResolutionResult, PasswordResetResponse, SupabaseAuthResult, supabaseAuthService, supabase, coordinator, emitSessionExpiredNotice(), supabaseTokenManager

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.14
Nodes (26): AuthRuntime, AppUserRole, AppUserStatus, ResolvedAppUser, AuthContext, AuthSessionSummary, createRequireAuthMiddleware(), Express (+18 more)

### Community 53 - "foundation.test.ts"
Cohesion: 0.14
Nodes (14): createAuthInstance(), createEmailDeliveryAdapter(), loadLocalDotEnv(), resolveCandidateEnvPaths(), AuthMigrateCommand, run(), closePgPool(), createPgPool() (+6 more)

### Community 54 - "webPushNotifications.test.ts"
Cohesion: 0.29
Nodes (4): executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 55 - "authInstance.ts"
Cohesion: 0.12
Nodes (14): pg@^8.23.1, pg, ApiAppDependencies, CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), EmailDeliveryAdapter, ServerConfig (+6 more)

### Community 56 - "sessionHydrationUtils.ts"
Cohesion: 0.43
Nodes (5): getPrefetchRouteKeysForRole(), HydrationGateInput, shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

### Community 59 - "vite.config.ts"
Cohesion: 0.18
Nodes (6): @tailwindcss/vite@^4.0.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, @vitejs/plugin-react, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `react`, `dataService.ts`, `lucide-react`, `UserRole`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `ref_node_assert`, `storageService.ts`, `WheelOfLuckModal.tsx`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`, `chatOrderUtils.ts`, `supabaseAuthService.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.05484109386548411 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `dataService.ts`, `lucide-react`, `UserRole`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `ref_node_assert`, `storageService.ts`, `WheelOfLuckModal.tsx`, `AgentMobileDrawer.tsx`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`, `chatOrderUtils.ts`, `dependencies`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.08108108108108109 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `react`, `dataService.ts`, `lucide-react`, `UserRole`, `AdminDashboard.tsx`, `SelfHostedAuthService`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `WebPushClient`, `SupabaseAuthService`, `AdminConfig.tsx`, `ref_node_assert`, `storageService.ts`, `WheelOfLuckModal.tsx`, `AgentMobileDrawer.tsx`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `chatScrollUtils.ts`, `supabaseAuthService.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09065679925994449 - nodes in this community are weakly interconnected._