# Graph Report - swiftsweeps  (2026-11-26)

## Corpus Check
- 189 files · ~267,458 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1696 nodes · 5416 edges · 56 communities (51 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bdeebe72`
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
- AdminConfig.tsx
- wheelOfLuckUtils.ts
- compilerOptions
- AdminChat.tsx
- SelfHostedAuthService
- dataService.ts
- react
- UserRole
- AdminDashboard.tsx
- AdminAudit.tsx
- pushUtils.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- selfHostedAuthService.ts
- useVerificationResolution.ts
- WebPushClient
- pwaAssets.ts
- officialPartnerHandlers.ts
- SupabaseAuthService
- api/index.ts
- ref_node_assert
- toProxyStorageUrl
- app.ts
- webPushClient.ts
- AuthTokenCoordinator
- authTokenUtils.ts
- supabaseAuthService.ts
- uiCopyUtils.ts
- AdminGameCatalog.tsx
- AdminChatCashoutModal.tsx
- compilerOptions
- chatScrollUtils.ts
- chatOrderUtils.ts
- authValidationUtils.ts
- migrations.ts
- NotificationSoundService
- dependencies
- TopUpRequest
- scripts
- adminAuth.ts
- env.ts
- authInstance.ts
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

## Communities (56 total, 5 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.05
Nodes (12): DataService, findRequestById(), isSupabaseConfigured(), CashoutFeedItem, ChatMessage, GameAccount, PasswordResetToken, SupportConversation (+4 more)

### Community 1 - "UserProfile"
Cohesion: 0.09
Nodes (27): AdminOfficialPartnersTabProps, AdminChatTopUpModalProps, GlobalChatNotificationManagerProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, StaffMobileNavProps, TopNavbarProps, AdminChatProps (+19 more)

### Community 2 - "package.json"
Cohesion: 0.15
Nodes (17): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, name (+9 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (59): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps (+51 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.14
Nodes (14): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+6 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.05
Nodes (88): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, LiveCashoutFeedList() (+80 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "auth.test.ts"
Cohesion: 0.12
Nodes (16): EmailDeliveryUnavailableError, OtpEmailPurpose, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig() (+8 more)

### Community 10 - "AdminConfig.tsx"
Cohesion: 0.06
Nodes (45): TelegramBotConfigCard(), AdminChatTopUpModal(), TopUpModalMode, AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, CustomerTopUp() (+37 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (65): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+57 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "AdminChat.tsx"
Cohesion: 0.22
Nodes (22): AdminChat(), TICKET_STATUS_OPTIONS, buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), filterVisibleMessagesForRole(), formatChatDateDivider(), formatChatTime() (+14 more)

### Community 14 - "SelfHostedAuthService"
Cohesion: 0.21
Nodes (4): AuthStateSnapshot, deriveAuthMeTransition(), mapAuthErrorResponse(), SelfHostedAuthService

### Community 15 - "dataService.ts"
Cohesion: 0.17
Nodes (19): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+11 more)

### Community 16 - "react"
Cohesion: 0.17
Nodes (17): lucide-react, react, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps (+9 more)

### Community 17 - "UserRole"
Cohesion: 0.07
Nodes (32): RoleSwitcher(), SessionHydrationScreenProps, SessionTimeoutWarningModalProps, AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE (+24 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "AdminAudit.tsx"
Cohesion: 0.19
Nodes (15): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+7 more)

### Community 20 - "pushUtils.ts"
Cohesion: 0.24
Nodes (10): saveVercelPushSubscription(), deactivatePushSubscriptionsInList(), hashEndpointId(), isStaffRole(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord (+2 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (31): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity() (+23 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "selfHostedAuthService.ts"
Cohesion: 0.12
Nodes (16): AuthMeResponsePayload, AuthStatus, buildUserProfileFromAuthMe(), looksLikeHtmlDocument(), MappedAuthFailure, normalizeAuthRole(), parseAuthHttpPayload(), ParsedAuthHttpPayload (+8 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.18
Nodes (21): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+13 more)

### Community 28 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): notificationSoundService, BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, LEGACY_BADGE_URLS (+7 more)

### Community 29 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 31 - "api/index.ts"
Cohesion: 0.08
Nodes (49): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+41 more)

### Community 32 - "ref_node_assert"
Cohesion: 0.13
Nodes (12): realtimeChatHub, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), ChannelEntry (+4 more)

### Community 33 - "toProxyStorageUrl"
Cohesion: 0.33
Nodes (9): ChatTransactionCard(), ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), toProxyStorageUrl(), supabaseUrl (+1 more)

### Community 34 - "app.ts"
Cohesion: 0.22
Nodes (14): express, createApiApp(), BodyParserLikeError, createErrorHandler(), notFoundHandler(), createRequestContextMiddleware(), Express, Request (+6 more)

### Community 35 - "webPushClient.ts"
Cohesion: 0.18
Nodes (10): BackgroundNotificationPromptProps, BeforeInstallPromptEvent, PWAInstallButtonProps, arrayBufferToBase64(), DevicePlatform, webPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload (+2 more)

### Community 37 - "authTokenUtils.ts"
Cohesion: 0.27
Nodes (9): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError(), MinimalAuthSession (+1 more)

### Community 38 - "supabaseAuthService.ts"
Cohesion: 0.29
Nodes (8): TokenResolutionResult, PasswordResetResponse, SupabaseAuthResult, supabaseAuthService, supabase, coordinator, emitSessionExpiredNotice(), supabaseTokenManager

### Community 39 - "uiCopyUtils.ts"
Cohesion: 0.28
Nodes (12): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml(), formatTopUpApprovedChatMessage() (+4 more)

### Community 40 - "AdminGameCatalog.tsx"
Cohesion: 0.08
Nodes (46): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, CustomerWithdrawal() (+38 more)

### Community 41 - "AdminChatCashoutModal.tsx"
Cohesion: 0.28
Nodes (8): AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, StaffWithdrawalDraftResult, PayoutMethodType, WithdrawalRequest, formatCashoutChatMessage()

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "chatScrollUtils.ts"
Cohesion: 0.19
Nodes (18): CustomerChat(), buildScrollSnapshotKey(), computeDistanceFromBottom(), computePrependScrollTop(), computeRestoredScrollTop(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction() (+10 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "authValidationUtils.ts"
Cohesion: 0.40
Nodes (4): MIN_SIGNUP_PASSWORD_LENGTH, RegistrationValidationInput, RegistrationValidationResult, validateRegistrationForm()

### Community 46 - "migrations.ts"
Cohesion: 0.13
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, react@^19.0.0, react-dom@^19.0.0, @supabase/supabase-js@^2.49.1, tailwindcss@^4.0.0 (+9 more)

### Community 50 - "TopUpRequest"
Cohesion: 0.44
Nodes (7): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString(), StaffTopUpDraftResult, TopUpRequest

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.13
Nodes (28): better-auth, AuthRuntime, AppUserRole, AppUserStatus, isParentAdminUser(), ResolvedAppUser, AuthContext, AuthSessionSummary (+20 more)

### Community 53 - "env.ts"
Cohesion: 0.10
Nodes (28): createEmailDeliveryAdapter(), ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigin(), parseAuthSecret() (+20 more)

### Community 55 - "authInstance.ts"
Cohesion: 0.11
Nodes (15): pg@^8.23.1, pg, ApiAppDependencies, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), EmailDeliveryAdapter (+7 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.17
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @vitejs/plugin-react@^4.3.4, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 61 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `AdminConfig.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `dataService.ts`, `react`, `UserRole`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`, `selfHostedAuthService.ts`, `useVerificationResolution.ts`, `ref_node_assert`, `toProxyStorageUrl`, `supabaseAuthService.ts`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminChatCashoutModal.tsx`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.050333846944016436 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `AdminConfig.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `UserRole`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`, `selfHostedAuthService.ts`, `useVerificationResolution.ts`, `ref_node_assert`, `toProxyStorageUrl`, `webPushClient.ts`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminChatCashoutModal.tsx`, `dependencies`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.0907258064516129 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `react` to `ref_node_assert`, `toProxyStorageUrl`, `package.json`, `App.tsx`, `webPushClient.ts`, `UserProfile`, `officialPartnersUtils.ts`, `uiCopyUtils.ts`, `AdminGameCatalog.tsx`, `AdminChatCashoutModal.tsx`, `AdminConfig.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `dependencies`, `UserRole`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `walletActivityUtils.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06606990622335891 - nodes in this community are weakly interconnected._
- **Should `userDirectoryRepo.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._