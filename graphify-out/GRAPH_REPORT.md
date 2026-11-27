# Graph Report - swiftsweeps  (2026-11-27)

## Corpus Check
- 263 files · ~454,129 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .service 2, .example 1, (none) 1)

## Summary
- 3235 nodes · 9669 edges · 119 communities (109 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8ed420c6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- AdminReferralGovernancePanel.tsx
- scripts
- App.tsx
- InMemoryDatabasePool
- types/index.ts
- officialPartnersUtils.ts
- audit.mjs
- steps
- officialPartners.ts
- .save
- wheelOfLuckUtils.ts
- compilerOptions
- ChatMessage
- referralRepo.ts
- UserRole
- types.ts
- UserRole
- appConfig.ts
- SelfHostedAuthService
- dataMigrationTool.ts
- vercel.json
- sw.js
- walletActivityUtils.ts
- referralHandlers.ts
- wheelRepo.ts
- useVerificationResolution.ts
- WebPushClient
- env.ts
- ref_node_assert
- AdminConfig.tsx
- api/index.ts
- gameAccounts.ts
- wheelHandlers.ts
- app.ts
- withdrawalRepo.ts
- notifications.test.ts
- .createStaffTopUpAsync
- AgentMobileDrawer.tsx
- tests/auditLogs.test.ts
- storage.ts
- AdminUsers.tsx
- compilerOptions
- AdminChat.tsx
- toProxyStorageUrl
- HttpError
- migrations.ts
- GlobalChatNotificationManager.tsx
- better-auth
- AdminAudit.tsx
- notifications.ts
- assetPreloader.ts
- adminAuth.ts
- officialPartnerRepo.ts
- userDirectoryRepo.ts
- GameAccount
- chatRepo.ts
- CustomerHome.tsx
- chatStreamClient.ts
- ref_node_http
- CustomerMobileDrawer.tsx
- ChatRepo
- tests/referrals.test.ts
- walletRepo.ts
- authTokenUtils.ts
- DatabasePool
- chat.ts
- tests/wheel.test.ts
- withdrawals.ts
- referrals.ts
- officialPartnerHandlers.ts
- chat.test.ts
- tests/officialPartners.test.ts
- ref_node_assert
- emailDelivery.ts
- dataService.ts
- UserDirectoryRepo
- deposits.test.ts
- AppConfigRepo
- AdminOfficialPartnersTab.tsx
- wheel.ts
- DatabasePool
- wallet.test.ts
- withdrawals.test.ts
- EmailDeliveryAdapter
- depositRepo.ts
- pushUtils.ts
- .getAppConfig
- profile.test.ts
- supabaseClient.ts
- uiCopyUtils.ts
- SupabaseAuthService
- pwaAssets.ts
- createLogger
- appConfig.test.ts
- wallet.ts
- validateRequestBody
- CustomerHome.tsx
- RealtimeEventBroker
- CustomerTopUp.tsx
- emailDelivery.ts
- .getCurrentUser
- dataMigration.test.ts
- devDependencies
- overlayHistoryUtils.ts
- dataMigration.ts
- extractCanonicalSourceBundle
- api/auditLogs.test.ts
- runDataMigrationImport
- AdminMobileDrawer.tsx
- realtimeChatHub.ts
- OfficialPartner
- gameAccountUtils.ts
- runExportSnapshot
- sessionHydrationUtils.ts
- security.ts
- web-push
- realtime.test.ts
- ChatConflictError

## God Nodes (most connected - your core abstractions)
1. `DataService` - 237 edges
2. `HttpError` - 194 edges
3. `UserProfile` - 119 edges
4. `createApiApp()` - 84 edges
5. `react` - 69 edges
6. `DatabasePool` - 67 edges
7. `lucide-react` - 60 edges
8. `UserDirectoryRepo` - 54 edges
9. `App()` - 54 edges
10. `createLogger()` - 52 edges

## Surprising Connections (you probably didn't know these)
- `handleCreateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleUpdateOfficialPartner()` --calls--> `validateOfficialPartnerInput()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handlePostGameCreditTransfer()` --calls--> `computeGameCreditUnloadSplit()`  [EXTRACTED]
  api/wheelHandlers.ts → src/utils/wheelOfLuckUtils.ts
- `handleGetOfficialPartners()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts
- `handleCreateOfficialPartner()` --calls--> `normalizeOfficialPartnerRow()`  [EXTRACTED]
  api/officialPartnerHandlers.ts → src/utils/officialPartnersUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (119 total, 10 thin omitted)

### Community 1 - "AdminReferralGovernancePanel.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 2 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, auth:migrate:sql, auth:migrate:status, auth:migrate:up, build, build:server, db:data:export, db:data:import (+13 more)

### Community 3 - "App.tsx"
Cohesion: 0.09
Nodes (43): App(), LazyEmailVerificationBanner, GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps, SessionTimeoutWarningModal() (+35 more)

### Community 4 - "InMemoryDatabasePool"
Cohesion: 0.15
Nodes (22): cloneRow(), cloneValue(), compareValues(), createInitialAppConfig(), createInitialFakedCashouts(), createInitialGameCatalog(), createInitialStoreState(), evalSqlExpr() (+14 more)

### Community 5 - "types/index.ts"
Cohesion: 0.05
Nodes (43): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccountStatus (+35 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.13
Nodes (25): OfficialPartnerDrawer(), PLATFORMS, PartnerPlatform, ALLOWED_PARTNER_HOSTS, ALLOWED_PARTNER_ICON_EXTENSIONS, ALLOWED_PARTNER_ICON_MIME_TYPES, cleanHandleSegment(), extractPlatformUsername() (+17 more)

### Community 7 - "audit.mjs"
Cohesion: 0.08
Nodes (41): jszip, playwright, sharp, AUDIT_CONFIG, buildComparisonReportHtml(), buildOrderedPngFilename(), classifyRouteStatus(), DEFAULT_APP_CANDIDATES (+33 more)

### Community 8 - "steps"
Cohesion: 0.08
Nodes (23): concurrency, cancel-in-progress, group, jobs, update-graph, name, on, push (+15 more)

### Community 9 - "officialPartners.ts"
Cohesion: 0.11
Nodes (36): OfficialPartnerSortField, OfficialPartnerSortOrder, PartnerPlatform, ALLOWED_ICON_MIME_TYPES, ALLOWED_ICON_UPLOAD_BODY_KEYS, ALLOWED_PARTNER_BODY_KEYS, ALLOWED_PARTNER_HOSTS, ALLOWED_PLATFORMS (+28 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.11
Nodes (38): describeSectorPath(), polarToCartesian(), renderSliceVectorIcon(), WheelOfLuckModal(), WheelOfLuckModalProps, WheelSpinResultModal(), useWheelOfLuckStatus(), WheelEligibilityState (+30 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 14 - "referralRepo.ts"
Cohesion: 0.07
Nodes (54): calculateReferralPayouts(), checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals(), FraudCheckParticipant, FraudEvaluationResult (+46 more)

### Community 15 - "UserRole"
Cohesion: 0.12
Nodes (17): SessionHydrationScreenProps, SessionTimeoutWarningModalProps, authSessionService, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS, PREDEFINED_ADMINS, SEED_CREDENTIALS, StoredCredential (+9 more)

### Community 16 - "types.ts"
Cohesion: 0.07
Nodes (48): lucide-react, react, AdminOfficialPartnersTabProps, EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword() (+40 more)

### Community 18 - "appConfig.ts"
Cohesion: 0.14
Nodes (35): ALLOWED_APP_CONFIG_UPDATE_KEYS, ALLOWED_FAKED_CASHOUT_BODY_KEYS, ALLOWED_FAKED_CASHOUT_QUERY_KEYS, ALLOWED_PAYMENT_METHOD_TYPES, ALLOWED_POLICIES_KEYS, ALLOWED_RESEED_BODY_KEYS, ALLOWED_TELEGRAM_CONFIG_KEYS, ALLOWED_TELEGRAM_NOTIFY_KEYS (+27 more)

### Community 19 - "SelfHostedAuthService"
Cohesion: 0.10
Nodes (22): AuthMeResponsePayload, AuthStateSnapshot, AuthStatus, buildUserProfileFromAuthMe(), deriveAuthMeTransition(), looksLikeHtmlDocument(), mapAuthErrorResponse(), MappedAuthFailure (+14 more)

### Community 20 - "dataMigrationTool.ts"
Cohesion: 0.08
Nodes (25): PgSslMode, CANONICAL_IMPORT_ORDER, CanonicalRowBundle, CanonicalTableName, CHECKSUM_LIMITATIONS, DataMigrationConfig, DryRunReport, EnvValidationInput (+17 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.14
Nodes (32): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+24 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.13
Nodes (44): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+36 more)

### Community 25 - "wheelRepo.ts"
Cohesion: 0.07
Nodes (40): buildGameBonusLoadStaffMessage(), computeGameCreditUnloadSplit(), DEFAULT_WHEEL_OF_LUCK_CONFIG, DEFAULT_WHEEL_SEGMENTS, evaluateWheelEligibility(), GameBonusLoadStaffMessagePayload, normalizeWheelConfig(), ROLLING_SPIN_COOLDOWN_HOURS (+32 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.16
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 27 - "WebPushClient"
Cohesion: 0.15
Nodes (8): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient, executeSendTestAlertFlow(), extractApiError(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 28 - "env.ts"
Cohesion: 0.14
Nodes (21): EmailProvider, INSECURE_AUTH_SECRET_VALUES, loadServerConfig(), NodeEnv, parseAppOrigins(), parseAuthSecret(), parseBodyLimitBytes(), parseBooleanSetting() (+13 more)

### Community 29 - "ref_node_assert"
Cohesion: 0.12
Nodes (11): QueryResult, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), signupAndSignIn(), TestAuditDatabasePool, withAuditLogServer(), MIN_SIGNUP_PASSWORD_LENGTH (+3 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.11
Nodes (21): TelegramBotConfigCard(), WheelOfLuckAdminCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, CustomerTopUp(), testSupabaseConnection() (+13 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (43): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl(), fetchSupabaseJwksKeys() (+35 more)

### Community 32 - "gameAccounts.ts"
Cohesion: 0.05
Nodes (64): DeleteGameAccountInput, escapeIlikePattern(), GameAccountCatalogNotFoundError, GameAccountConflictError, GameAccountCustomerNotFoundError, GameAccountForbiddenError, GameAccountNotFoundError, GameAccountRecord (+56 more)

### Community 33 - "wheelHandlers.ts"
Cohesion: 0.14
Nodes (23): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+15 more)

### Community 34 - "app.ts"
Cohesion: 0.10
Nodes (34): express, createApiApp(), AuditLogRepo, ResolvedAppUser, AuthContext, AuthSessionSummary, createOptionalAuthMiddleware(), createRequireAuthMiddleware() (+26 more)

### Community 35 - "withdrawalRepo.ts"
Cohesion: 0.10
Nodes (23): WithdrawalRouterDeps, CUSTOMER_CANCELLABLE_STATUSES, escapeIlikePattern(), ListWithdrawalsOptions, ListWithdrawalsResult, mapWalletRow(), mapWithdrawalRow(), normalizeWithdrawalStatus() (+15 more)

### Community 36 - "notifications.test.ts"
Cohesion: 0.13
Nodes (17): ApiAppDependencies, ServerConfig, WebPushSender, WebPushSendOptions, WebPushSubscriptionTarget, NotificationRouterDeps, createTestConfig(), createTestServer() (+9 more)

### Community 37 - ".createStaffTopUpAsync"
Cohesion: 0.14
Nodes (13): findRequestById(), mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), parseDepositApiError(), parseWithdrawalApiError(), readOptionalString() (+5 more)

### Community 38 - "AgentMobileDrawer.tsx"
Cohesion: 0.22
Nodes (15): PWAInstallButton(), SwiftSweepsLogo(), SwiftSweepsLogoProps, AgentMobileDrawer(), AgentMobileDrawerProps, AGENT_ADMIN_ONLY_TABS, AGENT_DRAWER_REMOVED_TABS, AGENT_OFFICIAL_PARTNERS_ROUTE (+7 more)

### Community 39 - "tests/auditLogs.test.ts"
Cohesion: 0.15
Nodes (12): ALLOWED_AUDIT_ENTITY_TYPES, AuditActorRole, AuditLogRecord, CreateAuditLogInput, escapeIlikePattern(), ListAuditLogsOptions, ListAuditLogsResult, mapAuditLogRow() (+4 more)

### Community 40 - "storage.ts"
Cohesion: 0.10
Nodes (37): ALLOWED_SIGNED_URL_BODY_KEYS, ALLOWED_UPLOAD_BODY_KEYS, assertAllowedKeys(), assertPlainObject(), createStorageRouter(), decodeBase64Payload(), mapStorageError(), readSingleQueryParam() (+29 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.34
Nodes (10): RoleSwitcher(), AdminUsers(), AdminUsersProps, loadAdminUsers(), getAdminDisplayEmail(), getAdminDisplayName(), isProtectedSuperAdminAccount(), SUPER_ADMIN_DISPLAY_NAME (+2 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmitOnError, noUncheckedIndexedAccess (+10 more)

### Community 43 - "AdminChat.tsx"
Cohesion: 0.11
Nodes (45): AdminChatTopUpModal(), ChatTransactionCard(), AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), chatStreamClient, toDirectSupabaseStorageUrl(), supabaseUrl (+37 more)

### Community 44 - "toProxyStorageUrl"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "HttpError"
Cohesion: 0.08
Nodes (41): escapeIlikePattern(), GameCatalogLinkRecord, GameCatalogRecord, GameCatalogRepo, GameCatalogSortField, GameCatalogSortOrder, ListGameCatalogOptions, ListGameCatalogResult (+33 more)

### Community 46 - "migrations.ts"
Cohesion: 0.15
Nodes (21): buildSslOption(), CliCommand, resolveDatabaseCliConfig(), resolveMigrationsDir(), runCli(), VALID_SSL_MODES, AppliedMigrationRow, AppliedMigrationSummary (+13 more)

### Community 47 - "GlobalChatNotificationManager.tsx"
Cohesion: 0.15
Nodes (9): GlobalChatNotificationManagerProps, filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage(), NotificationSoundService (+1 more)

### Community 48 - "better-auth"
Cohesion: 0.10
Nodes (20): dependencies, better-auth@^1.7.28, express@^5.3.0, lucide-react@^1.16.0, nodemailer@^10.6.1, react@^19.0.0, react-dom@^19.0.0, tailwindcss@^4.0.0 (+12 more)

### Community 49 - "AdminAudit.tsx"
Cohesion: 0.18
Nodes (15): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+7 more)

### Community 50 - "notifications.ts"
Cohesion: 0.06
Nodes (45): mapNotificationRow(), mapPushSubscriptionRow(), normalizeRole(), NotificationForbiddenError, NotificationNotFoundError, NotificationRecord, NotificationRepo, NotificationTargetUserNotFoundError (+37 more)

### Community 51 - "assetPreloader.ts"
Cohesion: 0.14
Nodes (23): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, CORE_ASSET_URLS, CRITICAL_ASSET_URLS, DEFERRED_ASSET_URLS, isImageCached(), memoryImageCache (+15 more)

### Community 52 - "adminAuth.ts"
Cohesion: 0.12
Nodes (30): AuthRuntime, AppUserStatus, HttpError, AdminAuthRouterDeps, ALLOWED_CREATE_BODY_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_ROLE_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS (+22 more)

### Community 53 - "officialPartnerRepo.ts"
Cohesion: 0.10
Nodes (20): CreateOfficialPartnerInput, escapeIlikePattern(), ListOfficialPartnersOptions, ListOfficialPartnersResult, mapPartnerRow(), normalizePlatform(), OfficialPartnerIconRecord, OfficialPartnerMutationActor (+12 more)

### Community 54 - "userDirectoryRepo.ts"
Cohesion: 0.09
Nodes (25): ADMIN_USER_SORT_MAP, AdminDirectoryUserRecord, AdminProvisionUserInput, AdminUserGameAccountSummary, AdminUserSortField, AdminUserSortOrder, AdminUserWalletSummary, AuditLogInput (+17 more)

### Community 55 - "GameAccount"
Cohesion: 0.29
Nodes (3): parseGameAccountApiError(), GameAccount, formatCredentialsReadyChatMessage()

### Community 56 - "chatRepo.ts"
Cohesion: 0.09
Nodes (34): AppUserRole, ChatConversationPayload, ChatMessagePayload, ChatStreamEvent, ChatStreamSubscriber, ChatTicketStatus, ChatAttachmentRecord, ChatSenderRole (+26 more)

### Community 57 - "CustomerHome.tsx"
Cohesion: 0.15
Nodes (23): LiveCashoutFeedList(), LiveCashoutFeedListProps, GamePlatformCardProps, AdminGameCatalog(), AdminGameCatalogProps, PRESET_GAME_ICONS, CustomerWithdrawal(), loadCustomerWithdrawal() (+15 more)

### Community 58 - "chatStreamClient.ts"
Cohesion: 0.08
Nodes (18): ChatStreamClient, ChatStreamConnectionStatus, ChatStreamConversationRow, ChatStreamEventPayload, ChatStreamListener, ChatStreamMessageRow, AppRealtimeConnectionStatus, AppRealtimeListener (+10 more)

### Community 59 - "ref_node_http"
Cohesion: 0.24
Nodes (3): attachSelfHostedProxyMiddleware(), hasExternalBackendConfigured(), isSelfHostedAuthPath()

### Community 60 - "CustomerMobileDrawer.tsx"
Cohesion: 0.24
Nodes (10): WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps, WheelStrip(), WheelStripProps, CustomerMobileDrawer(), getCustomerFirstName() (+2 more)

### Community 61 - "ChatRepo"
Cohesion: 0.22
Nodes (12): canonicalConversationIdForCustomer(), ChatForbiddenError, ChatNotFoundError, ChatRepo, ChatValidationError, enrichMessageRow(), extractCustomerIdFromConvId(), isStaffRole() (+4 more)

### Community 62 - "tests/referrals.test.ts"
Cohesion: 0.13
Nodes (15): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryReferralAwardRow, InMemoryReferralDatabase, InMemoryTopupRow (+7 more)

### Community 63 - "walletRepo.ts"
Cohesion: 0.11
Nodes (18): WalletRouterDeps, escapeIlikePattern(), ListWalletsOptions, ListWalletsResult, ListWalletTransactionsOptions, ListWalletTransactionsResult, mapTransactionRow(), mapWalletRow() (+10 more)

### Community 64 - "authTokenUtils.ts"
Cohesion: 0.14
Nodes (11): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+3 more)

### Community 65 - "DatabasePool"
Cohesion: 0.16
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountDatabase, InMemoryGameAccountRow, InMemoryGameCatalogRow (+3 more)

### Community 66 - "chat.ts"
Cohesion: 0.15
Nodes (26): ALLOWED_ATTACHMENT_MIME_TYPES, ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS, ALLOWED_CONVERSATIONS_QUERY_KEYS, ALLOWED_ENSURE_BODY_KEYS, ALLOWED_MESSAGES_QUERY_KEYS, ALLOWED_SEND_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_TICKET_STATUSES (+18 more)

### Community 67 - "tests/wheel.test.ts"
Cohesion: 0.14
Nodes (15): createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryGameAccountRow, InMemoryTransactionRow, InMemoryUserRow (+7 more)

### Community 68 - "withdrawals.ts"
Cohesion: 0.15
Nodes (27): ALLOWED_CUSTOMER_BODY_KEYS, ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS, ALLOWED_LIST_QUERY_KEYS, ALLOWED_PAYOUT_METHODS, ALLOWED_STAFF_BODY_KEYS, ALLOWED_STATUS_BODY_KEYS, ALLOWED_STATUS_VALUES, ALLOWED_TRANSITION_TARGET_STATUSES (+19 more)

### Community 69 - "referrals.ts"
Cohesion: 0.23
Nodes (23): ALLOWED_ADMIN_LEDGER_QUERY_KEYS, ALLOWED_ADMIN_LEDGER_STATUSES, ALLOWED_SUMMARY_QUERY_KEYS, assertAllowedKeys(), assertNoControlChars(), assertObjectBody(), createReferralRouter(), resolveActor() (+15 more)

### Community 70 - "officialPartnerHandlers.ts"
Cohesion: 0.23
Nodes (19): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+11 more)

### Community 71 - "chat.test.ts"
Cohesion: 0.12
Nodes (17): createTestConfig(), createTestServer(), httpRequest(), ilikeMatch(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryChatAttachmentRow, InMemoryChatDatabase (+9 more)

### Community 72 - "tests/officialPartners.test.ts"
Cohesion: 0.17
Nodes (11): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryOfficialPartnerIconRow, InMemoryOfficialPartnerRow, InMemoryOfficialPartnersDatabase (+3 more)

### Community 73 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryGameCatalogDatabase, InMemoryGameCatalogRow, InMemoryUserRow (+2 more)

### Community 74 - "emailDelivery.ts"
Cohesion: 0.18
Nodes (11): createMemoryBetterAuthDb(), createSilentLogger(), createTestConfig(), extractSetCookies(), InMemoryAppDatabase, InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryUserRow (+3 more)

### Community 75 - "dataService.ts"
Cohesion: 0.08
Nodes (34): WheelOfLuckAdminCardProps, AdminChatCashoutModal(), CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, ChatTransactionCardProps, WheelSpinResultModalProps, AdminRequestsProps, RealtimeSyncStatus (+26 more)

### Community 76 - "UserDirectoryRepo"
Cohesion: 0.16
Nodes (8): AdminUserForbiddenError, AdminUserNotFoundError, generateReferralCode(), isParentAdminUser(), mapJoinedRow(), normalizeRole(), normalizeStatus(), UserDirectoryRepo

### Community 77 - "deposits.test.ts"
Cohesion: 0.17
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryDepositDatabase, InMemoryTopUpRow, InMemoryTransactionRow (+4 more)

### Community 78 - "AppConfigRepo"
Cohesion: 0.09
Nodes (28): AdminAppConfigResult, AppConfigActor, AppConfigRepo, AppConfigUpdateInput, AppConfigValidationError, CmsPoliciesPayload, CreateFakedCashoutInput, FakedCashoutNotFoundError (+20 more)

### Community 79 - "AdminOfficialPartnersTab.tsx"
Cohesion: 0.25
Nodes (20): AdminOfficialPartnersTab(), SortMode, OfficialPartnersPreviewModal(), getPlatformDisplayName(), PartnerIcon(), PlatformBadge(), PlatformGlyph(), VerifiedPartnerTick() (+12 more)

### Community 80 - "wheel.ts"
Cohesion: 0.15
Nodes (17): ChatEventBroker, TelegramFetchFn, ChatRouterDeps, ALLOWED_STATUS_QUERY_KEYS, assertAllowedKeys(), assertObjectBody(), createWheelRouter(), resolveActor() (+9 more)

### Community 81 - "DatabasePool"
Cohesion: 0.09
Nodes (16): DatabasePool, createCaptureEmailAdapter(), createSilentLogger(), createTestConfig(), DbSnapshot, extractSetCookies(), InMemoryAdminUsersDatabase, InMemoryAuditRow (+8 more)

### Community 82 - "wallet.test.ts"
Cohesion: 0.19
Nodes (10): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletDatabase, InMemoryWalletRow (+2 more)

### Community 83 - "withdrawals.test.ts"
Cohesion: 0.16
Nodes (12): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryTransactionRow, InMemoryUserRow, InMemoryWalletRow (+4 more)

### Community 84 - "EmailDeliveryAdapter"
Cohesion: 0.11
Nodes (13): EmailDeliveryAdapter, SendOtpEmailPayload, SendPasswordResetEmailPayload, SendVerificationEmailPayload, RecordingEmailDelivery, RecordingEmailDelivery, RecordingEmailDelivery, createCaptureEmailAdapter() (+5 more)

### Community 85 - "depositRepo.ts"
Cohesion: 0.06
Nodes (64): ApproveDepositInput, CreateCustomerDepositInput, CreateStaffDepositInput, defaultBonusPctForMethod(), DepositConflictError, DepositNotFoundError, DepositRecord, DepositRepo (+56 more)

### Community 86 - "pushUtils.ts"
Cohesion: 0.31
Nodes (8): deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), PushSubscriptionRecord, rebindPushSubscriptionList(), RESERVED_NON_USER_IDS

### Community 88 - "profile.test.ts"
Cohesion: 0.22
Nodes (9): createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAuditRow, InMemoryAuthLinkRow, InMemoryProfileDatabase, InMemoryUserRow, signupAndSignIn() (+1 more)

### Community 89 - "supabaseClient.ts"
Cohesion: 0.18
Nodes (14): DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL, DEFAULT_SUPABASE_SERVICE_ROLE_KEY, DEFAULT_SUPABASE_URL, getSupabaseConfig(), isPlaceholder(), resolveProjectId(), resolveSupabaseAnonKey() (+6 more)

### Community 90 - "uiCopyUtils.ts"
Cohesion: 0.18
Nodes (18): PolicyAndPartnerCmsCard(), renderInlines(), SafeFormattedText(), SafeFormattedTextProps, decodeBasicHtmlEntities(), escapeHtmlText(), formatCompactDollar(), formatGameIdRequestChatMessage() (+10 more)

### Community 92 - "pwaAssets.ts"
Cohesion: 0.15
Nodes (16): BrowserNotificationEnv, BrowserNotificationResult, claimNotificationAlertId(), dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL (+8 more)

### Community 93 - "createLogger"
Cohesion: 0.09
Nodes (32): pg@^8.23.1, pg, createAuthInstance(), CreateAuthInstanceDeps, EMAIL_DELIVERY_REQUIRED_PATHS, normalizeAuthPath(), createEmailDeliveryAdapter(), EmailDeliveryUnavailableError (+24 more)

### Community 94 - "appConfig.test.ts"
Cohesion: 0.13
Nodes (13): DatabaseClient, createCaptureEmailAdapter(), createTestConfig(), extractCookies(), InMemoryAppConfigDatabase, InMemoryAppConfigRow, InMemoryAuditRow, InMemoryAuthLinkRow (+5 more)

### Community 95 - "wallet.ts"
Cohesion: 0.18
Nodes (20): ALLOWED_SINGLE_WALLET_QUERY_KEYS, ALLOWED_TX_QUERY_KEYS, ALLOWED_TX_SORT_FIELDS, ALLOWED_TX_STATUSES, ALLOWED_WALLETS_LIST_QUERY_KEYS, assertAllowedQueryKeys(), createWalletRouter(), parseBoundedInt() (+12 more)

### Community 96 - "validateRequestBody"
Cohesion: 0.23
Nodes (12): requireRole(), validateRequestBody(), ALLOWED_POST_BODY_KEYS, ALLOWED_QUERY_KEYS, assertSingleQueryString(), createAuditLogRouter(), FORBIDDEN_IMMUTABLE_FIELDS, parseBoundIsoDate() (+4 more)

### Community 97 - "CustomerHome.tsx"
Cohesion: 0.18
Nodes (14): GamePlatformCard(), DEFAULT_WHEEL_AVAILABILITY, useWheelAvailability(), WheelAvailabilityContext, WheelAvailabilityContextValue, CustomerGameAccounts(), CustomerHome(), loadCustomerGameAccounts() (+6 more)

### Community 98 - "RealtimeEventBroker"
Cohesion: 0.11
Nodes (17): ChatEventEnvelope, parseSseEventCursor(), SseEventMeta, SseReplayResult, AuditLogRealtimePayload, canUserReceiveRealtimeEvent(), RealtimeAudience, RealtimeEventBroker (+9 more)

### Community 99 - "CustomerTopUp.tsx"
Cohesion: 0.18
Nodes (14): TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), extractStorageLocation(), safeDecodeURIComponent() (+6 more)

### Community 100 - "emailDelivery.ts"
Cohesion: 0.23
Nodes (10): buildOtpCopy(), buildOtpMessage(), buildPasswordResetMessage(), buildVerificationMessage(), BuiltEmailMessage, createConfiguredAdapter(), EmailDeliveryAdapterOptions, escapeHtml() (+2 more)

### Community 102 - "dataMigration.test.ts"
Cohesion: 0.16
Nodes (7): MigrationDbClient, MigrationQueryable, PRODUCTION_SOURCE_CONFIRM_TOKEN, PRODUCTION_TARGET_CONFIRM_TOKEN, QueryResultLike, IsolatedPostgresSimulator, SimColumnDef

### Community 103 - "devDependencies"
Cohesion: 0.13
Nodes (21): devDependencies, tsx@^4.19.2, @types/node@^22.13.0, @types/react@^19.0.8, @types/react-dom@^19.0.3, @types/web-push@^3.6.4, typescript@^5.7.3, vite@^6.1.0 (+13 more)

### Community 104 - "overlayHistoryUtils.ts"
Cohesion: 0.28
Nodes (13): AppHistoryState, AppOverlayKey, buildHistoryState(), getTopActiveOverlay(), OverlayStateSnapshot, PopStateDecision, readOverlayFromHistoryState(), readTabFromHistoryState() (+5 more)

### Community 105 - "dataMigration.ts"
Cohesion: 0.23
Nodes (12): buildSslOption(), createPoolForUrl(), main(), parseCliArgs(), ParsedCliArgs, databaseIdentityKey(), DataMigrationConfigError, DataMigrationMode (+4 more)

### Community 106 - "extractCanonicalSourceBundle"
Cohesion: 0.20
Nodes (14): buildCanonicalAuditLogRow(), buildCanonicalNotificationRow(), canonicalizeJsonValue(), compareFinancialAggregates(), computeTableChecksum(), deterministicBaUserId(), extractCanonicalSourceBundle(), getTimestampBounds() (+6 more)

### Community 107 - "api/auditLogs.test.ts"
Cohesion: 0.19
Nodes (8): decodeJwtPartJson(), handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), verifyJwtWithJwkSet(), writeServerAuditLog()

### Community 108 - "runDataMigrationImport"
Cohesion: 0.27
Nodes (9): advanceTargetSequences(), deserializeBundleFromDisk(), inspectSchemaMeta(), runDataMigrationImport(), runDryRunOrValidation(), runInClientTransaction(), runInSnapshotReadOnly(), upsertBatchIntoTarget() (+1 more)

### Community 109 - "AdminMobileDrawer.tsx"
Cohesion: 0.36
Nodes (9): AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer(), getAdminDrawerListItems() (+1 more)

### Community 110 - "realtimeChatHub.ts"
Cohesion: 0.22
Nodes (7): @supabase/supabase-js@^2.49.1, @supabase/supabase-js, realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig

### Community 111 - "OfficialPartner"
Cohesion: 0.29
Nodes (4): OfficialPartnerDrawerProps, OfficialPartnersPreviewModalProps, OfficialPartner, OfficialPartnerInput

### Community 112 - "gameAccountUtils.ts"
Cohesion: 0.38
Nodes (8): buildGameAccountsQueryUrl(), deduplicateGameAccountsList(), mapServerGameAccountRow(), mergeGameAccounts(), normalizeStatus(), toFixedMoney(), VALID_STATUSES, GameAccount

### Community 113 - "runExportSnapshot"
Cohesion: 0.33
Nodes (8): computeFinancialAggregates(), DataMigrationIntegrityError, formatCents(), normalizeMoneyString(), runExportSnapshot(), serializeBundleForDisk(), toMoneyCents(), validateBundleIntegrity()

### Community 114 - "sessionHydrationUtils.ts"
Cohesion: 0.39
Nodes (6): getPrefetchRouteKeysForRole(), HydrationGateInput, resolveHydrationPhaseLabel(), shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

### Community 115 - "security.ts"
Cohesion: 0.53
Nodes (5): buildAllowedOrigins(), createSecurityMiddleware(), MUTATING_METHODS, parseOriginFromHeader(), sendOriginForbidden()

### Community 121 - "realtime.test.ts"
Cohesion: 0.13
Nodes (15): createTestConfig(), createTestServer(), httpRequest(), InMemoryAppConfigRow, InMemoryAuditLogRow, InMemoryAuthLinkRow, InMemoryRealtimeDatabase, InMemoryTopUpRow (+7 more)

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `app.ts` to `officialPartners.ts`, `appConfig.ts`, `env.ts`, `gameAccounts.ts`, `storage.ts`, `HttpError`, `better-auth`, `notifications.ts`, `adminAuth.ts`, `chat.ts`, `withdrawals.ts`, `referrals.ts`, `wheel.ts`, `depositRepo.ts`, `createLogger`, `wallet.ts`, `validateRequestBody`, `RealtimeEventBroker`, `devDependencies`, `security.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.08853410740203194 - nodes in this community are weakly interconnected._
- **Why does `DataService` connect `DataService` to `AdminReferralGovernancePanel.tsx`, `App.tsx`, `officialPartnersUtils.ts`, `.save`, `wheelOfLuckUtils.ts`, `ChatMessage`, `UserRole`, `types.ts`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `.createStaffTopUpAsync`, `AgentMobileDrawer.tsx`, `AdminUsers.tsx`, `AdminChat.tsx`, `GlobalChatNotificationManager.tsx`, `AdminAudit.tsx`, `GameAccount`, `CustomerHome.tsx`, `CustomerMobileDrawer.tsx`, `dataService.ts`, `AdminOfficialPartnersTab.tsx`, `.getAppConfig`, `uiCopyUtils.ts`, `CustomerHome.tsx`, `CustomerTopUp.tsx`, `.getCurrentUser`, `OfficialPartner`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Why does `DatabasePool` connect `DatabasePool` to `InMemoryDatabasePool`, `referralRepo.ts`, `dataMigrationTool.ts`, `wheelRepo.ts`, `gameAccounts.ts`, `app.ts`, `withdrawalRepo.ts`, `notifications.test.ts`, `tests/auditLogs.test.ts`, `storage.ts`, `HttpError`, `notifications.ts`, `officialPartnerRepo.ts`, `userDirectoryRepo.ts`, `chatRepo.ts`, `ChatRepo`, `tests/referrals.test.ts`, `walletRepo.ts`, `DatabasePool`, `tests/wheel.test.ts`, `chat.test.ts`, `tests/officialPartners.test.ts`, `ref_node_assert`, `emailDelivery.ts`, `deposits.test.ts`, `AppConfigRepo`, `wallet.test.ts`, `withdrawals.test.ts`, `depositRepo.ts`, `profile.test.ts`, `createLogger`, `appConfig.test.ts`, `realtime.test.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08503401360544217 - nodes in this community are weakly interconnected._
- **Should `InMemoryDatabasePool` be split into smaller, more focused modules?**
  _Cohesion score 0.1453529000698812 - nodes in this community are weakly interconnected._