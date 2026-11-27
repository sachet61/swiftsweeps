# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 222 files · ~348,313 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 2401 nodes · 7351 edges · 83 communities (72 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f99db307`
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
- AdminOfficialPartnersTab.tsx
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- HttpError
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
- isSupabaseConfigured
- officialPartnerHandlers.ts
- ChatTransactionCard.tsx
- GameAccount
- UserRole
- AdminGameCatalog.tsx
- pwaAssets.ts
- vite.config.ts
- .getCurrentUser
- TopNavbar.tsx
- tests/referrals.test.ts
- walletRepo.ts
- assetPreloader.ts
- DatabasePool
- pushUtils.ts
- tests/wheel.test.ts
- auditLogs.test.ts
- .fetchAuditLogsFromServer
- OfficialPartner
- gameAccountUtils.ts
- InMemoryGameAccountDatabase
- CustomerHome.tsx
- emailDelivery.ts
- uiCopyUtils.ts
- InMemoryReferralDatabase
- deposits.test.ts
- authValidationUtils.ts
- AppUserRole
- DatabaseClient
- InMemoryWalletDatabase
- InMemoryWithdrawalDatabase

## God Nodes (most connected - your core abstractions)
1. `DataService` - 222 edges
2. `UserProfile` - 119 edges
3. `HttpError` - 112 edges
4. `react` - 68 edges
5. `lucide-react` - 60 edges
6. `App()` - 54 edges
7. `createApiApp()` - 50 edges
8. `UserDirectoryRepo` - 44 edges
9. `dataService` - 42 edges
10. `DatabasePool` - 41 edges

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

## Communities (83 total, 11 thin omitted)

### Community 1 - "UserProfile"
Cohesion: 0.08
Nodes (29): AdminOfficialPartnersTabProps, EmailOtpModalProps, AdminChatTopUpModalProps, EmailVerificationBannerProps, GlobalChatNotificationManagerProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, CustomerMobileNavProps (+21 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.10
Nodes (47): App(), LazyEmailVerificationBanner, LazyPageFallback(), LegalContent(), LegalContentProps, SessionTimeoutWarningModal(), CustomerMobileNav(), StaffMobileNav() (+39 more)

### Community 4 - "userDirectoryRepo.ts"
Cohesion: 0.12
Nodes (16): AdminProvisionUserInput, AuditLogInput, AuthMigrationSource, EnsureUserForSignupInput, generateReferralCode(), JoinedUserRow, mapJoinedRow(), normalizeRole() (+8 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.13
Nodes (29): OfficialPartnerDrawer(), PLATFORMS, CustomerMobileDrawer(), useWheelAvailability(), PartnerPlatform, ALLOWED_PARTNER_HOSTS, ALLOWED_PARTNER_ICON_EXTENSIONS, ALLOWED_PARTNER_ICON_MIME_TYPES (+21 more)

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
Cohesion: 0.07
Nodes (64): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+56 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.06
Nodes (75): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+67 more)

### Community 15 - "dataService.ts"
Cohesion: 0.19
Nodes (17): RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS, INITIAL_GAME_CATALOG (+9 more)

### Community 16 - "react"
Cohesion: 0.08
Nodes (37): lucide-react, react, EmailOtpModal(), ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+29 more)

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.11
Nodes (15): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+7 more)

### Community 20 - "depositRepo.ts"
Cohesion: 0.11
Nodes (32): defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo, DepositSortField, DepositSortOrder, DepositStatusValue (+24 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.13
Nodes (33): CATEGORY_LABELS, CustomerWallet(), CustomerWalletProps, loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity() (+25 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (39): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+31 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.05
Nodes (39): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+31 more)

### Community 27 - "WebPushClient"
Cohesion: 0.17
Nodes (7): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.08
Nodes (38): createEmailDeliveryAdapter(), ConfigValidationError, EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), LogLevel, NodeEnv, parseAppOrigins() (+30 more)

### Community 29 - "gameAccountRepo.ts"
Cohesion: 0.09
Nodes (27): escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord, GameAccountRepo (+19 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.09
Nodes (28): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig() (+20 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), fetchSupabaseJwksKeys() (+35 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.13
Nodes (32): GameAccountSortField, GameAccountSortOrder, GameAccountStatusValue, ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS (+24 more)

### Community 33 - "storageService.ts"
Cohesion: 0.24
Nodes (11): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), toProxyStorageUrl() (+3 more)

### Community 34 - "app.ts"
Cohesion: 0.08
Nodes (36): better-auth, express, pg, ApiAppDependencies, createApiApp(), AuthRuntime, createAuthInstance(), CreateAuthInstanceDeps (+28 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.06
Nodes (53): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+45 more)

### Community 36 - "AdminOfficialPartnersTab.tsx"
Cohesion: 0.25
Nodes (20): AdminOfficialPartnersTab(), SortMode, OfficialPartnersPreviewModal(), getPlatformDisplayName(), PartnerIcon(), PlatformBadge(), PlatformGlyph(), VerifiedPartnerTick() (+12 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.16
Nodes (12): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+4 more)

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.22
Nodes (12): react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE, AgentDrawerNavItem (+4 more)

### Community 39 - "HttpError"
Cohesion: 0.07
Nodes (71): AppUserStatus, isParentAdminUser(), requireRole(), BodyParserLikeError, HttpError, notFoundHandler(), validateRequestBody(), assertRecord() (+63 more)

### Community 40 - "CustomerTopUp.tsx"
Cohesion: 0.12
Nodes (18): CustomerTopUp(), CustomerWithdrawal(), loadCustomerTopUp(), filterEnabledGameAccounts(), filterEnabledGames(), TelegramService, telegramService, TelegramStatus (+10 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.20
Nodes (18): RoleSwitcher(), AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer() (+10 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.12
Nodes (43): ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), loadAdminChat(), loadCustomerChat(), buildGroupedMessages(), CHAT_QUICK_EMOJIS (+35 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.14
Nodes (22): PgSslMode, buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow (+14 more)

### Community 48 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, react-dom@^19.0.0 (+11 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.24
Nodes (12): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell(), filterAuditLogs() (+4 more)

### Community 50 - "UserRole"
Cohesion: 0.22
Nodes (8): SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential, UserSession

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 53 - "officialPartnerHandlers.ts"
Cohesion: 0.23
Nodes (19): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+11 more)

### Community 54 - "ChatTransactionCard.tsx"
Cohesion: 0.33
Nodes (7): ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), supabaseUrl, ChatTransactionData

### Community 55 - "GameAccount"
Cohesion: 0.31
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "UserRole"
Cohesion: 0.14
Nodes (20): SessionHydrationScreen(), SessionHydrationScreenProps, StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, getPrefetchRouteKeysForRole(), HydrationGateInput (+12 more)

### Community 57 - "AdminGameCatalog.tsx"
Cohesion: 0.16
Nodes (21): GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, CustomerGameAccounts(), loadAdminGameCatalog(), loadCustomerGameAccounts(), applyGameCatalogRealtimeEvents(), applyServerGameCatalogResponse() (+13 more)

### Community 58 - "pwaAssets.ts"
Cohesion: 0.10
Nodes (23): GlobalChatNotificationManager(), filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), notificationSoundService (+15 more)

### Community 59 - "vite.config.ts"
Cohesion: 0.20
Nodes (6): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), isSelfHostedAuthPath()

### Community 60 - ".getCurrentUser"
Cohesion: 0.30
Nodes (3): extractServerApiCode(), extractServerApiError(), ReferralSummary

### Community 61 - "TopNavbar.tsx"
Cohesion: 0.17
Nodes (11): PWAInstallButton(), WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, WheelStripProps, TopNavbar(), TopNavbarProps (+3 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.07
Nodes (38): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+30 more)

### Community 64 - "assetPreloader.ts"
Cohesion: 0.16
Nodes (17): CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, isImageCached(), memoryImageCache, TargetAssetPlan, ALIAS_LOOKUP, DEFAULT_GAME_ICON (+9 more)

### Community 65 - "DatabasePool"
Cohesion: 0.10
Nodes (13): DatabasePool, WheelRouterDeps, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 66 - "pushUtils.ts"
Cohesion: 0.31
Nodes (8): deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList(), RESERVED_NON_USER_IDS

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+6 more)

### Community 68 - "auditLogs.test.ts"
Cohesion: 0.19
Nodes (8): decodeJwtPartJson(), handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), verifyJwtWithJwkSet(), writeServerAuditLog()

### Community 69 - ".fetchAuditLogsFromServer"
Cohesion: 0.26
Nodes (3): parseGameCatalogApiError(), AuditLog, normalizeAuditLogRow()

### Community 70 - "OfficialPartner"
Cohesion: 0.27
Nodes (5): OfficialPartnerDrawerProps, OfficialPartnersPreviewModalProps, OfficialPartner, OfficialPartnerInput, isHtmlFallbackResponse()

### Community 71 - "gameAccountUtils.ts"
Cohesion: 0.33
Nodes (9): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccountStatus (+1 more)

### Community 73 - "CustomerHome.tsx"
Cohesion: 0.48
Nodes (6): LiveCashoutFeedList(), GamePlatformCard(), WheelStrip(), CustomerHome(), loadCustomerHome(), toggleGameCardOverlay()

### Community 74 - "emailDelivery.ts"
Cohesion: 0.05
Nodes (53): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, EmailDeliveryUnavailableError (+45 more)

### Community 75 - "uiCopyUtils.ts"
Cohesion: 0.16
Nodes (19): PolicyAndPartnerCmsCard(), AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, PayoutMethodType, decodeBasicHtmlEntities(), escapeHtmlText() (+11 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.21
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTopUpRow, InMemoryTransactionRow, InMemoryUserRow (+3 more)

### Community 78 - "authValidationUtils.ts"
Cohesion: 0.40
Nodes (4): MIN_SIGNUP_PASSWORD_LENGTH, RegistrationValidationInput, RegistrationValidationResult, validateRegistrationForm()

### Community 79 - "AppUserRole"
Cohesion: 0.13
Nodes (15): AppUserRole, ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, RejectDepositInput, DeleteGameAccountInput, ProvisionGameAccountInput, RequestNewGameIdInput (+7 more)

### Community 80 - "DatabaseClient"
Cohesion: 0.24
Nodes (3): DatabaseClient, InMemoryDepositDatabase, InMemoryWheelDatabase

## Knowledge Gaps
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `.load`, `wheelOfLuckUtils.ts`, `ChatMessage`, `dataService.ts`, `react`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `storageService.ts`, `AdminOfficialPartnersTab.tsx`, `.createStaffTopUpAsync`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `AdminAudit.tsx`, `isSupabaseConfigured`, `ChatTransactionCard.tsx`, `GameAccount`, `UserRole`, `AdminGameCatalog.tsx`, `pwaAssets.ts`, `.getCurrentUser`, `TopNavbar.tsx`, `.fetchAuditLogsFromServer`, `OfficialPartner`, `CustomerHome.tsx`, `uiCopyUtils.ts`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.11491935483870967 - nodes in this community are weakly interconnected._
- **Why does `express` connect `app.ts` to `gameAccounts.ts`, `package.json`, `withdrawalRepo.ts`, `HttpError`, `HttpError`, `referralRepo.ts`, `dependencies`, `walletRepo.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.08021390374331551 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `wheelOfLuckUtils.ts`, `AdminDashboard.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `storageService.ts`, `AdminOfficialPartnersTab.tsx`, `AgentMobileDrawer.tsx`, `CustomerTopUp.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `dependencies`, `AdminAudit.tsx`, `UserRole`, `ChatTransactionCard.tsx`, `UserRole`, `AdminGameCatalog.tsx`, `pwaAssets.ts`, `TopNavbar.tsx`, `CustomerHome.tsx`, `uiCopyUtils.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09577677224736049 - nodes in this community are weakly interconnected._