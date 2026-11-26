# Graph Report - swiftsweeps  (2026-11-26)

## Corpus Check
- 190 files · ~269,139 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1716 nodes · 5470 edges · 64 communities (55 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0e4eae6d`
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
- handler
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
- ref_node_assert
- storageService.ts
- app.ts
- overlayHistoryUtils.ts
- .load
- AgentMobileDrawer.tsx
- AdminAudit.tsx
- AdminGameCatalog.tsx
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- chatOrderUtils.ts
- AuthTokenCoordinator
- migrations.ts
- NotificationSoundService
- dependencies
- authTokenUtils.ts
- UserRole
- scripts
- adminAuth.ts
- useVerificationResolution.ts
- ChatTransactionCard.tsx
- authInstance.ts
- SwiftSweepsLogo
- GameCatalogItem
- AdminConfig.tsx
- vite.config.ts
- .getAppConfig
- logger.ts
- TopUpRequest
- .getPasswordResetTokens

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

## Communities (64 total, 9 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.08
Nodes (3): DataService, isSupabaseConfigured(), AuditLog

### Community 1 - "UserProfile"
Cohesion: 0.07
Nodes (34): AdminOfficialPartnersTabProps, EmailOtpModalProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, CustomerMobileNavProps, TopNavbarProps (+26 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.12
Nodes (33): App(), LazyEmailVerificationBanner, LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), WheelPopup() (+25 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.14
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.05
Nodes (93): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+85 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.09
Nodes (25): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, EmailDeliveryUnavailableError (+17 more)

### Community 10 - ".save"
Cohesion: 0.21
Nodes (3): computeCumulativeCompletedDeposits(), GameAccount, formatCredentialsReadyChatMessage()

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (67): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+59 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "handler"
Cohesion: 0.16
Nodes (20): buildProxyStorageUrl(), deactivateVercelPushSubscription(), enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), handleGetChatMessages(), handlePostChatSend(), handlePushUnsubscribe() (+12 more)

### Community 15 - "dataService.ts"
Cohesion: 0.18
Nodes (18): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+10 more)

### Community 16 - "lucide-react"
Cohesion: 0.10
Nodes (30): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+22 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.12
Nodes (20): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+12 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (16): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+8 more)

### Community 20 - "uiCopyUtils.ts"
Cohesion: 0.18
Nodes (17): PolicyAndPartnerCmsCard(), AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, PayoutMethodType, decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage() (+9 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.16
Nodes (27): CustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedWithdrawals(), deriveLatestCompletedTopUp(), extractLinkedRequestId() (+19 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.14
Nodes (42): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+34 more)

### Community 25 - "chatScrollUtils.ts"
Cohesion: 0.18
Nodes (15): computeDistanceFromBottom(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction(), DEFAULT_NEAR_BOTTOM_THRESHOLD_PX, inMemoryScrollMap, isScrolledNearBottom() (+7 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.24
Nodes (11): deriveVerificationUiState(), getDefaultStorage(), mergeVerifiedStatus(), normalizeEmailKey(), parseCacheMap(), readVerifiedCache(), StorageReader, StorageWriter (+3 more)

### Community 27 - "WebPushClient"
Cohesion: 0.16
Nodes (8): arrayBufferToBase64(), DevicePlatform, urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.09
Nodes (32): pg, ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret() (+24 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.12
Nodes (19): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, DEFAULT_SUPABASE_ANON_KEY (+11 more)

### Community 31 - "api/index.ts"
Cohesion: 0.07
Nodes (39): ALLOWED_AUDIT_ENTITY_TYPES, decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, fetchSupabaseJwksKeys(), getWebPushClient(), handleGetAuditLogs(), handlePostAuditLog(), handlePushNotify() (+31 more)

### Community 32 - "ref_node_assert"
Cohesion: 0.13
Nodes (15): GlobalChatNotificationManager(), filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), notificationSoundService (+7 more)

### Community 33 - "storageService.ts"
Cohesion: 0.25
Nodes (11): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), toProxyStorageUrl() (+3 more)

### Community 34 - "app.ts"
Cohesion: 0.14
Nodes (20): express, createApiApp(), createEmailDeliveryAdapter(), checkDatabaseConnectivity(), Logger, BodyParserLikeError, createErrorHandler(), notFoundHandler() (+12 more)

### Community 36 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 37 - ".load"
Cohesion: 0.22
Nodes (3): findRequestById(), WithdrawalRequest, WithdrawalStatus

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.22
Nodes (12): react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem (+4 more)

### Community 39 - "AdminAudit.tsx"
Cohesion: 0.22
Nodes (14): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+6 more)

### Community 40 - "AdminGameCatalog.tsx"
Cohesion: 0.05
Nodes (55): AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, CustomerTopUp(), CustomerWithdrawal(), loadAdminGameCatalog(), loadCustomerTopUp(), applyGameCatalogRealtimeEvents() (+47 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.18
Nodes (19): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+11 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.18
Nodes (27): AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus() (+19 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+11 more)

### Community 49 - "authTokenUtils.ts"
Cohesion: 0.16
Nodes (17): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+9 more)

### Community 50 - "UserRole"
Cohesion: 0.15
Nodes (11): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential (+3 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.14
Nodes (27): AuthRuntime, AppUserRole, AppUserStatus, isParentAdminUser(), ResolvedAppUser, AuthContext, AuthSessionSummary, createRequireAuthMiddleware() (+19 more)

### Community 53 - "useVerificationResolution.ts"
Cohesion: 0.29
Nodes (11): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+3 more)

### Community 54 - "ChatTransactionCard.tsx"
Cohesion: 0.31
Nodes (8): ChatTransactionCard(), ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), supabaseUrl, ChatTransactionData

### Community 55 - "authInstance.ts"
Cohesion: 0.13
Nodes (10): better-auth, ApiAppDependencies, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), EmailDeliveryAdapter, ServerConfig (+2 more)

### Community 56 - "SwiftSweepsLogo"
Cohesion: 0.18
Nodes (18): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, getPrefetchRouteKeysForRole(), HydrationGateInput, resolveHydrationPhaseLabel() (+10 more)

### Community 57 - "GameCatalogItem"
Cohesion: 0.31
Nodes (4): AdminChatCashoutModalProps, AdminChatTopUpModalProps, mapGameCatalogItemToDbRow(), GameCatalogItem

### Community 58 - "AdminConfig.tsx"
Cohesion: 0.33
Nodes (8): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), getSupabaseConfig(), testSupabaseConnection()

### Community 59 - "vite.config.ts"
Cohesion: 0.18
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 62 - "TopUpRequest"
Cohesion: 0.44
Nodes (7): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString(), StaffTopUpDraftResult, TopUpRequest

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `lucide-react`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `useVerificationResolution.ts`, `ref_node_assert`, `storageService.ts`, `.saveToLocalStorage`, `.load`, `AdminAudit.tsx`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `authTokenUtils.ts`, `UserRole`, `useVerificationResolution.ts`, `ChatTransactionCard.tsx`, `GameCatalogItem`, `AdminConfig.tsx`, `.getAppConfig`, `.getPasswordResetTokens`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08299240210403273 - nodes in this community are weakly interconnected._
- **Why does `react` connect `lucide-react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `AdminDashboard.tsx`, `uiCopyUtils.ts`, `ref_node_assert`, `storageService.ts`, `AgentMobileDrawer.tsx`, `AdminAudit.tsx`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `dependencies`, `UserRole`, `useVerificationResolution.ts`, `ChatTransactionCard.tsx`, `SwiftSweepsLogo`, `AdminConfig.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.06968641114982578 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `lucide-react`, `UserRole`, `AdminDashboard.tsx`, `SelfHostedAuthService`, `uiCopyUtils.ts`, `WebPushClient`, `SupabaseAuthService`, `ref_node_assert`, `storageService.ts`, `AgentMobileDrawer.tsx`, `AdminAudit.tsx`, `AdminGameCatalog.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `authTokenUtils.ts`, `UserRole`, `useVerificationResolution.ts`, `GameCatalogItem`, `AdminConfig.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12375533428165007 - nodes in this community are weakly interconnected._