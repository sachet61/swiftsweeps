# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 248 files · ~416,005 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 3008 nodes · 9057 edges · 103 communities (92 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 141 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `27fc1f73`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- dataService.ts
- package.json
- App.tsx
- InMemoryDatabasePool
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- officialPartners.ts
- .load
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- referralRepo.ts
- UserRole
- react
- UserRole
- appConfigRepo.ts
- SelfHostedAuthService
- deposits.ts
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
- AdminConfig.tsx
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- appConfig.ts
- storage.ts
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- toProxyStorageUrl
- HttpError
- migrations.ts
- NotificationSoundService
- dependencies
- AdminAudit.tsx
- notifications.ts
- scripts
- adminAuth.ts
- officialPartnerRepo.ts
- userDirectoryRepo.ts
- GameAccount
- AppUserRole
- CustomerHome.tsx
- chatStreamClient.ts
- vite.config.ts
- .getCurrentUser
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- env.ts
- referrals.ts
- officialPartnerHandlers.ts
- chat.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- uiCopyUtils.ts
- InMemoryReferralDatabase
- deposits.test.ts
- validateRequestBody
- chatRepo.ts
- wheel.ts
- adminUsers.test.ts
- wallet.test.ts
- withdrawals.test.ts
- profile.test.ts
- depositRepo.ts
- handler
- .getAppConfig
- realtimeChatHub.ts
- InMemoryAdminUsersDatabase
- logger.ts
- SupabaseAuthService
- pwaAssets.ts
- DepositRepo
- appConfig.test.ts
- wallet.ts
- supabaseAuthService.ts
- chatScrollUtils.ts
- ChatEventBroker
- storageService.ts
- emailDelivery.ts
- toProxyStorageUrl
- gameAccountUtils.ts

## God Nodes (most connected - your core abstractions)
1. `DataService` - 234 edges
2. `HttpError` - 188 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 76 edges
5. `react` - 68 edges
6. `DatabasePool` - 62 edges
7. `lucide-react` - 60 edges
8. `UserDirectoryRepo` - 54 edges
9. `App()` - 54 edges
10. `createLogger()` - 45 edges

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

## Communities (103 total, 11 thin omitted)

### Community 1 - "dataService.ts"
Cohesion: 0.05
Nodes (72): AdminOfficialPartnersTabProps, AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, AdminChatCashoutModalProps, CashoutModalTab (+64 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, @vitejs/plugin-react@^4.3.4 (+11 more)

### Community 3 - "App.tsx"
Cohesion: 0.08
Nodes (52): App(), LazyEmailVerificationBanner, GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal() (+44 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.14
Nodes (23): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+15 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.09
Nodes (52): AdminOfficialPartnersTab(), SortMode, OfficialPartnerDrawer(), OfficialPartnerDrawerProps, PLATFORMS, OfficialPartnersPreviewModal(), OfficialPartnersPreviewModalProps, getPlatformDisplayName() (+44 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "officialPartners.ts"
Cohesion: 0.12
Nodes (37): HttpError, OfficialPartnerSortField, OfficialPartnerSortOrder, PartnerPlatform, ALLOWED_ICON_MIME_TYPES, ALLOWED_ICON_UPLOAD_BODY_KEYS, ALLOWED_PARTNER_BODY_KEYS, ALLOWED_PARTNER_HOSTS (+29 more)

### Community 10 - ".load"
Cohesion: 0.18
Nodes (3): AppNotification, PasswordResetToken, WalletTransaction

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.07
Nodes (66): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+58 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.08
Nodes (51): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+43 more)

### Community 15 - "UserRole"
Cohesion: 0.09
Nodes (29): SessionHydrationScreen(), SessionHydrationScreenProps, SessionTimeoutWarningModalProps, StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, authSessionService (+21 more)

### Community 16 - "react"
Cohesion: 0.11
Nodes (25): lucide-react, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, BackgroundNotificationPrompt() (+17 more)

### Community 18 - "appConfigRepo.ts"
Cohesion: 0.09
Nodes (28): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+20 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (22): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+14 more)

### Community 20 - "deposits.ts"
Cohesion: 0.15
Nodes (28): ALLOWED_APPROVE_BODY_KEYS, ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_DEPOSIT_METHODS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_REJECT_BODY_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_VALUES (+20 more)

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
Nodes (40): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+32 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.17
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 27 - "WebPushClient"
Cohesion: 0.16
Nodes (7): urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.11
Nodes (20): better-auth, pg, createAuthInstance(), EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), createEmailDeliveryAdapter(), EmailDeliveryUnavailableError, ConfigValidationError (+12 more)

### Community 29 - "gameAccountRepo.ts"
Cohesion: 0.15
Nodes (12): GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountNotFoundError, GameAccountRepo, GameAccountValidationError, mapGameAccountRow(), normalizeStatus(), resolveCatalogGame() (+4 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.18
Nodes (14): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, getSupabaseConfig(), isPlaceholder(), resolveProjectId(), resolveSupabaseAnonKey() (+6 more)

### Community 31 - "api/index.ts"
Cohesion: 0.07
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, fetchSupabaseJwksKeys(), getWebPushClient(), handleGetAuditLogs(), handlePostAuditLog() (+35 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.15
Nodes (28): ALLOWED_CUSTOMER_REQUEST_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_RESET_REQUEST_KEYS, ALLOWED_SORT_FIELDS, ALLOWED_STAFF_PROVISION_KEYS, ALLOWED_STAFF_UPDATE_KEYS, ALLOWED_STATUS_VALUES, assertAllowedKeys() (+20 more)

### Community 33 - "AdminConfig.tsx"
Cohesion: 0.10
Nodes (22): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, CustomerTopUp(), loadAdminConfig(), loadCustomerTopUp() (+14 more)

### Community 34 - "app.ts"
Cohesion: 0.12
Nodes (22): ApiAppDependencies, createApiApp(), CreateAuthInstanceDeps, ServerConfig, checkDatabaseConnectivity(), DatabasePool, StartedApiServer, Logger (+14 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.06
Nodes (53): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+45 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.13
Nodes (15): WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer(), httpJsonRequest(), InMemoryAuthLinkRow (+7 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.19
Nodes (11): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+3 more)

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.24
Nodes (13): react-dom@^19.0.0, react-dom, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE, AGENT_RULES_ROUTE (+5 more)

### Community 39 - "appConfig.ts"
Cohesion: 0.14
Nodes (34): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+26 more)

### Community 40 - "storage.ts"
Cohesion: 0.09
Nodes (37): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+29 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.10
Nodes (33): react, BeforeInstallPromptEvent, PWAInstallButton(), PWAInstallButtonProps, RoleSwitcher(), WheelGlyph(), WheelGlyphProps, WheelPopup() (+25 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.17
Nodes (29): AdminChatCashoutModal(), AdminChatTopUpModal(), TopUpModalMode, AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), storageService, buildGroupedMessages() (+21 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.16
Nodes (20): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+12 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, pg@^8.23.1, react@^19.0.0, tailwindcss@^4.0.0 (+8 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.18
Nodes (14): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+6 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (46): hashPushEndpointId(), mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo (+38 more)

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:migrate:check, db:migrate:status (+9 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.08
Nodes (39): AuthRuntime, AdminDirectoryUserRecord, AdminUserSortField, AdminUserSortOrder, AppUserStatus, ResolvedAppUser, AuthContext, AuthSessionSummary (+31 more)

### Community 53 - "officialPartnerRepo.ts"
Cohesion: 0.11
Nodes (20): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+12 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.08
Nodes (30): ADMIN_USER_SORT_MAP, AdminProvisionUserInput, AdminUserForbiddenError, AdminUserGameAccountSummary, AdminUserNotFoundError, AdminUserWalletSummary, AuditLogInput, AuthMigrationSource (+22 more)

### Community 55 - "GameAccount"
Cohesion: 0.35
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "AppUserRole"
Cohesion: 0.06
Nodes (38): AppUserRole, EnsureConversationInput, ListMessagesOptions, SaveChatAttachmentInput, SendMessageInput, UpdateTransactionCardStatusInput, CreateCustomerDepositInput, CreateStaffDepositInput (+30 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.09
Nodes (39): AdminChatTopUpModalProps, GamePlatformCard(), GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog(), loadCustomerGameAccounts(), applyGameCatalogRealtimeEvents() (+31 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.24
Nodes (6): ChatStreamClient, chatStreamClient, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow

### Community 59 - "vite.config.ts"
Cohesion: 0.18
Nodes (7): @tailwindcss/vite@^4.0.0, vite@^6.1.0, @tailwindcss/vite, vite, attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured(), isSelfHostedAuthPath()

### Community 61 - "ChatRepo"
Cohesion: 0.20
Nodes (13): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+5 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.17
Nodes (14): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryTopupRow, InMemoryTransactionRow (+6 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "chat.ts"
Cohesion: 0.15
Nodes (26): ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_TICKET_STATUSES (+18 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (16): DatabaseClient, createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow (+8 more)

### Community 68 - "env.ts"
Cohesion: 0.12
Nodes (24): EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes(), parseBooleanSetting() (+16 more)

### Community 69 - "referrals.ts"
Cohesion: 0.21
Nodes (24): ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter(), resolveActor() (+16 more)

### Community 70 - "officialPartnerHandlers.ts"
Cohesion: 0.20
Nodes (21): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+13 more)

### Community 71 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryOfficialPartnersDatabase (+3 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.17
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "uiCopyUtils.ts"
Cohesion: 0.24
Nodes (14): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCashoutChatMessage(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml() (+6 more)

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "validateRequestBody"
Cohesion: 0.15
Nodes (18): express, BodyParserLikeError, notFoundHandler(), createAuthProfileRouter(), ALLOWED_AVATAR_KEYS, ALLOWED_PATCH_KEYS, assertObjectBody(), assertSelfOwnership() (+10 more)

### Community 79 - "chatRepo.ts"
Cohesion: 0.11
Nodes (24): ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ChatTicketStatus, ChatAttachmentRecord, ChatConflictError, ChatSenderRole (+16 more)

### Community 80 - "wheel.ts"
Cohesion: 0.29
Nodes (14): requireRole(), validateRequestBody(), ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor(), mapRepoError() (+6 more)

### Community 81 - "adminUsers.test.ts"
Cohesion: 0.20
Nodes (13): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameAccountRow (+5 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletDatabase, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+4 more)

### Community 84 - "profile.test.ts"
Cohesion: 0.09
Nodes (21): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, createCaptureEmailAdapter(), createTestConfig() (+13 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.10
Nodes (22): ApproveDepositInput, defaultBonusPctForMethod(), DepositRecord, DepositSortField, DepositSortOrder, DepositStatusValue, DepositValidationError, escapeIlikePattern() (+14 more)

### Community 86 - "handler"
Cohesion: 0.17
Nodes (18): buildProxyStorageUrl(), enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), handleGetChatMessages(), handlePostChatSend(), handler(), handleStorageFileProxy() (+10 more)

### Community 88 - "realtimeChatHub.ts"
Cohesion: 0.20
Nodes (8): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 90 - "logger.ts"
Cohesion: 0.36
Nodes (7): LogLevel, emit(), LEVEL_PRIORITY, LoggerOptions, LogMeta, redactSensitive(), redactString()

### Community 92 - "pwaAssets.ts"
Cohesion: 0.10
Nodes (23): filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), notificationSoundService, BrowserNotificationEnv (+15 more)

### Community 93 - "DepositRepo"
Cohesion: 0.23
Nodes (12): DepositConflictError, DepositNotFoundError, DepositRepo, ensureWalletLocked(), insertAuditLog(), mapWalletRow(), recomputeCompletedRealCashTotal(), resolveConfiguredMethodRates() (+4 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryFakedCashoutRow (+4 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 96 - "supabaseAuthService.ts"
Cohesion: 0.17
Nodes (15): AuthSessionResponse, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), MinimalAuthSession, SESSION_EXPIRED_USER_MESSAGE (+7 more)

### Community 97 - "chatScrollUtils.ts"
Cohesion: 0.18
Nodes (15): buildScrollSnapshotKey(), computeDistanceFromBottom(), ConversationScrollSnapshot, countNewlyAppendedMessages(), decideMessageUpdateScrollAction(), DEFAULT_NEAR_BOTTOM_THRESHOLD_PX, inMemoryScrollMap, isScrolledNearBottom() (+7 more)

### Community 98 - "ChatEventBroker"
Cohesion: 0.33
Nodes (3): ChatEventBroker, ChatRouterDeps, WheelRouterDeps

### Community 99 - "storageService.ts"
Cohesion: 0.30
Nodes (7): fileToBase64(), StorageService, StorageUploadResult, buildProxyStorageUrl(), compressImageToWebP(), CompressionOptions, validateImageFile()

### Community 100 - "emailDelivery.ts"
Cohesion: 0.23
Nodes (10): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, escapeHtml() (+2 more)

### Community 101 - "toProxyStorageUrl"
Cohesion: 0.33
Nodes (9): ChatTransactionCard(), ChatTransactionCardProps, extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), toProxyStorageUrl(), supabaseUrl (+1 more)

### Community 102 - "gameAccountUtils.ts"
Cohesion: 0.33
Nodes (9): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccountStatus (+1 more)

## Knowledge Gaps
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HttpError` connect `officialPartners.ts` to `gameAccounts.ts`, `chat.ts`, `withdrawalRepo.ts`, `referrals.ts`, `appConfig.ts`, `storage.ts`, `HttpError`, `validateRequestBody`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `deposits.ts`, `env.ts`, `wallet.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.0966183574879227 - nodes in this community are weakly interconnected._
- **Why does `express` connect `validateRequestBody` to `gameAccounts.ts`, `package.json`, `app.ts`, `env.ts`, `chat.ts`, `referrals.ts`, `appConfig.ts`, `storage.ts`, `officialPartners.ts`, `withdrawalRepo.ts`, `HttpError`, `dependencies`, `wheel.ts`, `notifications.ts`, `adminAuth.ts`, `deposits.ts`, `wallet.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `dataService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04519350811485643 - nodes in this community are weakly interconnected._
- **Why does `DataService` connect `DataService` to `dataService.ts`, `App.tsx`, `officialPartnersUtils.ts`, `.load`, `wheelOfLuckUtils.ts`, `ChatMessage`, `UserRole`, `react`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `.createStaffTopUpAsync`, `AdminUsers.tsx`, `AdminChat.tsx`, `AdminAudit.tsx`, `GameAccount`, `CustomerHome.tsx`, `.getCurrentUser`, `uiCopyUtils.ts`, `.getAppConfig`, `pwaAssets.ts`, `supabaseAuthService.ts`, `toProxyStorageUrl`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07650273224043716 - nodes in this community are weakly interconnected._