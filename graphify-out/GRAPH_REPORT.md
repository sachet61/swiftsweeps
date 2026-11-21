# Graph Report - Aetherpay  (2026-11-21)

## Corpus Check
- 162 files · ~245,967 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .example 1, (none) 1, .lock 1)

## Summary
- 1401 nodes · 4720 edges · 54 communities (50 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05659bf8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DataService
- UserProfile
- package.json
- App.tsx
- AdminReferralGovernancePanel.tsx
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
- wheelHandlers.ts
- AdminConfig.tsx
- api/index.ts
- pwaAssets.ts
- storageService.ts
- WheelOfLuckModal.tsx
- lucide-react
- AdminGameCatalog.tsx
- SupabaseAuthService
- referralUtils.ts
- uiCopyUtils.ts
- pushUtils.ts
- AdminUsers.tsx
- auditLogs.test.ts
- AdminMobileDrawer.tsx
- chatOrderUtils.ts
- ref_node_assert
- webPushNotifications.test.ts
- NotificationSoundService
- AdminChatCashoutModal.tsx
- ChatTransactionCard.tsx
- TopUpRequest
- CustomerWithdrawal.tsx
- notificationScoping.ts
- UserRole

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
- `loadReferralProgramConfig()` --calls--> `normalizeReferralConfig()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `computeRefereeRealCashDeposits()` --calls--> `isRealCashTopUpRow()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralAttribute()` --calls--> `evaluateReferralFraudSignals()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralEvaluate()` --calls--> `checkReferralBudgetCaps()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts
- `handlePostReferralEvaluate()` --calls--> `evaluateReferralFraudSignals()`  [EXTRACTED]
  api/referralHandlers.ts → src/utils/referralUtils.ts

## Import Cycles
- 2-file cycle: `src/services/dataService.ts -> src/services/supabaseAuthService.ts -> src/services/dataService.ts`

## Communities (54 total, 4 thin omitted)

### Community 0 - "DataService"
Cohesion: 0.05
Nodes (11): DataService, mapGameCatalogItemToDbRow(), findRequestById(), isSupabaseConfigured(), CashoutFeedItem, ChatMessage, GameAccount, PasswordResetToken (+3 more)

### Community 1 - "UserProfile"
Cohesion: 0.09
Nodes (28): AdminOfficialPartnersTabProps, AdminChatTopUpModalProps, AuthenticatedUserMenuProps, CustomerMobileDrawerProps, CustomerMobileNavProps, StaffMobileNavProps, TopNavbarProps, AdminChatProps (+20 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (49): dependencies, lucide-react@^1.16.0, react@^19.0.0, react-dom@^19.0.0, @supabase/supabase-js@^2.49.1, tailwindcss@^4.0.0, @tailwindcss/vite@^4.0.0, devDependencies (+41 more)

### Community 3 - "App.tsx"
Cohesion: 0.10
Nodes (39): App(), LazyEmailVerificationBanner, BackgroundNotificationPrompt(), GlobalChatNotificationManager(), LazyPageFallback(), LazyPageFallbackProps, LegalContent(), LegalContentProps (+31 more)

### Community 4 - "AdminReferralGovernancePanel.tsx"
Cohesion: 0.13
Nodes (13): AuthSessionResponse, AuthTokenCoordinator, AuthTokenCoordinatorDeps, decodeBase64UrlToUtf8(), decodeJwtExpMs(), decodeJwtPayload(), isJwtExpiredOrExpiring(), isPermanentAuthRefreshError() (+5 more)

### Community 5 - "types/index.ts"
Cohesion: 0.04
Nodes (44): AppConfig, AppNotification, AuditLog, CashoutFeedConfig, ChatMessage, ChatTransactionData, ConversationStatus, GameAccount (+36 more)

### Community 6 - "officialPartnersUtils.ts"
Cohesion: 0.07
Nodes (70): ensurePartnerIconsBucket(), handleCreateOfficialPartner(), handleDeleteOfficialPartner(), handleGetOfficialPartners(), handleReorderOfficialPartners(), handleUpdateOfficialPartner(), handleUploadOfficialPartnerIcon(), hasValidImageMagicBytes() (+62 more)

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
Cohesion: 0.13
Nodes (15): CustomerTopUp(), loadCustomerTopUp(), TelegramService, telegramService, TelegramStatus, PaymentMethodType, ALLOWED_IMAGE_EXTENSIONS, clearTopUpDraft() (+7 more)

### Community 11 - "wheelOfLuckUtils.ts"
Cohesion: 0.14
Nodes (27): WheelOfLuckAdminCard(), WheelOfLuckAdminCardProps, WheelEligibilityState, WheelOfLuckConfig, WheelSegment, buildStickyWheelButtonState(), computeSegmentProbabilities(), DEFAULT_WHEEL_OF_LUCK_CONFIG (+19 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 13 - "AdminChat.tsx"
Cohesion: 0.13
Nodes (41): AdminChat(), TICKET_STATUS_OPTIONS, CustomerChat(), notificationSoundService, buildGroupedMessages(), CHAT_QUICK_EMOJIS, deriveTruthfulConnectionStatus(), filterVisibleMessagesForRole() (+33 more)

### Community 14 - "react"
Cohesion: 0.17
Nodes (15): react, BeforeInstallPromptEvent, PWAInstallButton(), PWAInstallButtonProps, WheelGlyph(), WheelGlyphProps, WheelPopup(), WheelPopupProps (+7 more)

### Community 15 - "dataService.ts"
Cohesion: 0.11
Nodes (27): ChatTransactionCardProps, RealtimeSyncStatus, STORAGE_KEYS, SyncHealthInfo, INITIAL_AUDIT_LOGS, INITIAL_CONFIG, INITIAL_CONVERSATIONS, INITIAL_GAME_ACCOUNTS (+19 more)

### Community 16 - "dataService"
Cohesion: 0.13
Nodes (20): EmailOtpModal(), EmailOtpModalProps, ForgotPassword(), ForgotPasswordProps, ResetPassword(), ResetPasswordProps, EmailVerificationBanner(), EmailVerificationBannerProps (+12 more)

### Community 17 - "WebPushClient"
Cohesion: 0.23
Nodes (3): arrayBufferToBase64(), urlBase64ToUint8Array(), WebPushClient

### Community 18 - "AdminDashboard.tsx"
Cohesion: 0.18
Nodes (13): AdminReferralGovernancePanel(), AdminReferralGovernancePanelProps, FLAG_LABELS, STATUS_DISPLAY, STATUS_TABS, RealtimeSyncBadge(), RealtimeSyncBadgeProps, AdminDashboard() (+5 more)

### Community 19 - "AdminAudit.tsx"
Cohesion: 0.20
Nodes (14): AdminAudit(), AdminAuditProps, loadAdminAudit(), AuditLog, AuditEntityFilter, AuditFilterOptions, buildAuditCsv(), escapeCsvCell() (+6 more)

### Community 20 - "CustomerHome.tsx"
Cohesion: 0.19
Nodes (18): PlatformGlyph(), GamePlatformCard(), CustomerGameAccounts(), CustomerHome(), loadCustomerGameAccounts(), loadCustomerHome(), isSafeExternalHttpUrl(), ResolvedGameCardLinks (+10 more)

### Community 21 - "vercel.json"
Cohesion: 0.40
Nodes (4): framework, headers, rewrites, version

### Community 23 - "walletActivityUtils.ts"
Cohesion: 0.15
Nodes (30): CATEGORY_LABELS, CustomerWallet(), loadCustomerWallet(), ActivityStatusMeta, buildStaffTopUpDraft(), buildStaffWithdrawalDraft(), buildUnifiedWalletActivity(), computeCumulativeCompletedDeposits() (+22 more)

### Community 24 - "referralHandlers.ts"
Cohesion: 0.22
Nodes (27): awardReferralAtomically(), computeBudgetUsage(), computeRefereeRealCashDeposits(), creditPlayerWallet(), extractClientIp(), getAwardCreditedStatus(), handleGetAdminReferralLedger(), handleGetReferralSummary() (+19 more)

### Community 25 - "assetPreloader.ts"
Cohesion: 0.17
Nodes (20): SessionHydrationScreen(), StartupSplash(), StartupSplashProps, SwiftSweepsLogo(), SwiftSweepsLogoProps, resolveHydrationPhaseLabel(), CORE_ASSET_URLS, CRITICAL_ASSET_URLS (+12 more)

### Community 26 - "useVerificationResolution.ts"
Cohesion: 0.15
Nodes (22): clearCoordinatorTimers(), coordinator, CoordinatorState, listeners, notifyListeners(), resetVerificationCoordinator(), startResolutionForUser(), useVerificationResolution() (+14 more)

### Community 28 - "UserRole"
Cohesion: 0.43
Nodes (5): getPrefetchRouteKeysForRole(), HydrationGateInput, shouldRunSilentBackgroundRefresh(), shouldShowSessionHydrationGate(), SilentRefreshInput

### Community 29 - "wheelHandlers.ts"
Cohesion: 0.16
Nodes (20): dispatchBonusLoadStaffNotification(), handleGetWheelStatus(), handlePostAdminWheelConfig(), handlePostGameCreditTransfer(), handlePostWheelSpin(), isMissingFunctionError(), isMissingTableOrColumnError(), loadAuthoritativeWheelConfig() (+12 more)

### Community 30 - "AdminConfig.tsx"
Cohesion: 0.13
Nodes (20): TelegramBotConfigCard(), AdminConfig(), AdminConfigProps, QrCodeUploadBox(), QrCodeUploadBoxProps, loadAdminConfig(), DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_JWKS_URL (+12 more)

### Community 31 - "api/index.ts"
Cohesion: 0.09
Nodes (42): ALLOWED_AUDIT_ENTITY_TYPES, buildProxyStorageUrl(), deactivateVercelPushSubscription(), decodeJwtPartJson(), DEFAULT_SUPABASE_SERVICE_ROLE_KEY, enrichMessageRowForClient(), ensureStorageBuckets(), extractStorageLocationFromUrl() (+34 more)

### Community 32 - "pwaAssets.ts"
Cohesion: 0.17
Nodes (15): BrowserNotificationEnv, BrowserNotificationResult, dispatchBrowserNotification(), resolveSwRegistration(), APPLE_TOUCH_ICON_URL, DEFAULT_NOTIFICATION_ICON_URL, FAVICON_PNG_URL, LEGACY_BADGE_URLS (+7 more)

### Community 33 - "storageService.ts"
Cohesion: 0.25
Nodes (11): AdminChatTopUpModal(), TopUpModalMode, fileToBase64(), StorageService, storageService, StorageUploadResult, buildProxyStorageUrl(), toProxyStorageUrl() (+3 more)

### Community 34 - "WheelOfLuckModal.tsx"
Cohesion: 0.20
Nodes (18): describeSectorPath(), polarToCartesian(), renderSliceVectorIcon(), WheelOfLuckModal(), WheelOfLuckModalProps, WheelSpinResultModal(), WheelSpinResultModalProps, useWheelOfLuckStatus() (+10 more)

### Community 35 - "lucide-react"
Cohesion: 0.16
Nodes (15): lucide-react, BackgroundNotificationPromptProps, GlobalChatNotificationManagerProps, IOSPwaInstallModal(), IOSPwaInstallModalProps, SessionTimeoutWarningModalProps, CustomerProfile(), authSessionService (+7 more)

### Community 36 - "AdminGameCatalog.tsx"
Cohesion: 0.20
Nodes (14): GamePlatformCardProps, AdminGameCatalog(), PRESET_GAME_ICONS, loadAdminGameCatalog(), applyGameCatalogRealtimeEvents(), countUnsavedCatalogChanges(), mapDbRowToGameCatalogItem(), mergeCatalogFromServerRows() (+6 more)

### Community 38 - "referralUtils.ts"
Cohesion: 0.20
Nodes (15): ReferralLedgerEntry, ReferralPayoutTarget, ReferralProgramConfig, checkReferralBudgetCaps(), clampNonNegativeNumber(), computeTopReferrers(), DEFAULT_REFERRAL_CONFIG, evaluateReferralFraudSignals() (+7 more)

### Community 39 - "uiCopyUtils.ts"
Cohesion: 0.26
Nodes (13): PolicyAndPartnerCmsCard(), decodeBasicHtmlEntities(), escapeHtmlText(), formatCompactDollar(), formatGameIdRequestChatMessage(), formatGamePasswordResetChatMessage(), formatInlineMarkdownToHtml(), formatShortUuid() (+5 more)

### Community 40 - "pushUtils.ts"
Cohesion: 0.18
Nodes (13): getWebPushClient(), sendVercelPushNotification(), deactivatePushSubscriptionsInList(), hashEndpointId(), NormalizedPushSubscription, normalizePushSubscriptionPayload(), normalizePushUserRole(), pruneExpiredPushSubscriptions() (+5 more)

### Community 41 - "AdminUsers.tsx"
Cohesion: 0.34
Nodes (10): RoleSwitcher(), AdminUsers(), AdminUsersProps, loadAdminUsers(), getAdminDisplayEmail(), getAdminDisplayName(), isProtectedSuperAdminAccount(), SUPER_ADMIN_DISPLAY_NAME (+2 more)

### Community 42 - "auditLogs.test.ts"
Cohesion: 0.21
Nodes (6): handleGetAuditLogs(), handlePostAuditLog(), isMissingColumnError(), normalizeServerAuditRow(), sanitizePostgrestLikeTerm(), writeServerAuditLog()

### Community 43 - "AdminMobileDrawer.tsx"
Cohesion: 0.36
Nodes (9): AdminMobileDrawer(), AdminMobileDrawerProps, ADMIN_DRAWER_FEATURED_ITEM, ADMIN_DRAWER_REMOVED_TABS, ADMIN_OFFICIAL_PARTNERS_ROUTE, AdminDrawerNavItem, canRenderAdminDrawer(), getAdminDrawerListItems() (+1 more)

### Community 44 - "chatOrderUtils.ts"
Cohesion: 0.41
Nodes (10): compareMessagesChronologically(), extractAttachmentMetadata(), isBotGreetingMessage(), mapDbMessageRowToChatMessage(), mergeAuthoritativeMessages(), mergeSingleMessage(), normalizeTransactionDataUrls(), resolveCanonicalConversationId() (+2 more)

### Community 45 - "ref_node_assert"
Cohesion: 0.22
Nodes (6): realtimeChatHub, ChannelEntry, ChatRoomListener, createRealtimeChatHub(), PostgresFilterConfig, supabase

### Community 46 - "webPushNotifications.test.ts"
Cohesion: 0.20
Nodes (5): claimNotificationAlertId(), executeSendTestAlertFlow(), NormalizedPushSubPayload, SendTestAlertEnv, SendTestAlertResult

### Community 48 - "AdminChatCashoutModal.tsx"
Cohesion: 0.28
Nodes (8): AdminChatCashoutModal(), AdminChatCashoutModalProps, CashoutModalTab, PAYOUT_CHANNEL_OPTIONS, StaffWithdrawalDraftResult, PayoutMethodType, WithdrawalRequest, formatCashoutChatMessage()

### Community 49 - "ChatTransactionCard.tsx"
Cohesion: 0.39
Nodes (6): ChatTransactionCard(), extractStorageLocation(), safeDecodeURIComponent(), StorageLocation, toDirectSupabaseStorageUrl(), supabaseUrl

### Community 50 - "TopUpRequest"
Cohesion: 0.44
Nodes (7): mapDbTopupRowToRequest(), mapDbWithdrawalRowToRequest(), mergeTopupRequests(), mergeWithdrawalRequests(), readOptionalString(), StaffTopUpDraftResult, TopUpRequest

### Community 51 - "CustomerWithdrawal.tsx"
Cohesion: 0.43
Nodes (6): LiveCashoutFeedList(), LiveCashoutFeedListProps, CustomerWithdrawal(), loadCustomerWithdrawal(), filterEnabledGameAccounts(), filterEnabledGames()

### Community 52 - "notificationScoping.ts"
Cohesion: 0.39
Nodes (6): filterRealtimeRowsForUser(), globalNotificationAlertIds, isRowInternalNote(), PUBLIC_REALTIME_TABLES, resolveCanonicalConversationId(), shouldAcceptIncomingChatMessage()

### Community 53 - "UserRole"
Cohesion: 0.40
Nodes (4): SessionHydrationScreenProps, UserSession, HydrationPhaseLabelInput, UserRole

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DataService` connect `DataService` to `UserProfile`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `react`, `dataService.ts`, `dataService`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `storageService.ts`, `WheelOfLuckModal.tsx`, `lucide-react`, `AdminGameCatalog.tsx`, `uiCopyUtils.ts`, `AdminUsers.tsx`, `AdminChatCashoutModal.tsx`, `ChatTransactionCard.tsx`, `CustomerWithdrawal.tsx`, `UserRole`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Should `DataService` be split into smaller, more focused modules?**
  _Cohesion score 0.05325077399380805 - nodes in this community are weakly interconnected._
- **Why does `UserProfile` connect `UserProfile` to `DataService`, `package.json`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `AdminChat.tsx`, `react`, `dataService.ts`, `dataService`, `WebPushClient`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `useVerificationResolution.ts`, `AuthSessionService`, `AdminConfig.tsx`, `storageService.ts`, `WheelOfLuckModal.tsx`, `lucide-react`, `AdminGameCatalog.tsx`, `SupabaseAuthService`, `AdminUsers.tsx`, `AdminMobileDrawer.tsx`, `AdminChatCashoutModal.tsx`, `CustomerWithdrawal.tsx`, `notificationScoping.ts`, `UserRole`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Should `UserProfile` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `UserProfile`, `package.json`, `App.tsx`, `officialPartnersUtils.ts`, `CustomerTopUp.tsx`, `wheelOfLuckUtils.ts`, `AdminChat.tsx`, `dataService.ts`, `dataService`, `AdminDashboard.tsx`, `AdminAudit.tsx`, `CustomerHome.tsx`, `walletActivityUtils.ts`, `assetPreloader.ts`, `useVerificationResolution.ts`, `AdminConfig.tsx`, `storageService.ts`, `WheelOfLuckModal.tsx`, `lucide-react`, `AdminGameCatalog.tsx`, `uiCopyUtils.ts`, `AdminUsers.tsx`, `AdminMobileDrawer.tsx`, `AdminChatCashoutModal.tsx`, `ChatTransactionCard.tsx`, `CustomerWithdrawal.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05389610389610389 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09696969696969697 - nodes in this community are weakly interconnected._