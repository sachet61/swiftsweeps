import crypto from 'node:crypto';
import type { DatabaseClient, DatabasePool } from './pool.js';
import { DEFAULT_WHEEL_OF_LUCK_CONFIG } from '../wheel/wheelLogic.js';

export type Row = Record<string, unknown>;

export interface QueryResult {
  rows: Row[];
  rowCount: number;
}

const KNOWN_TABLES = new Set([
  'users',
  'auth_user_links',
  'app_config',
  'faked_cashouts',
  'game_catalog',
  'wallets',
  'transactions',
  'game_accounts',
  'topups',
  'withdrawals',
  'referral_awards',
  'wheel_spins',
  'official_partners',
  'official_partner_icons',
  'notifications',
  'push_subscriptions',
  'conversations',
  'messages',
  'chat_attachments',
  'storage_objects',
  'audit_logs',
  'ba_user',
  'ba_session',
  'ba_account',
  'ba_verification',
  'ba_rate_limit',
]);

function cloneValue<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (Buffer.isBuffer(val)) {
    return Buffer.from(val) as unknown as T;
  }
  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map((item) => cloneValue(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = cloneValue(v);
  }
  return out as T;
}

function cloneRow(row: Row): Row {
  return cloneValue(row);
}

function createInitialAppConfig(): Record<string, unknown> {
  return {
    currency: 'USD',
    paymentMethods: [
      {
        id: 'pm_payment_link',
        name: 'Payment via Link',
        type: 'payment_link',
        enabled: true,
        feePercentage: 0,
        instructions:
          'Click the secure payment link below to complete your checkout. Attach your screenshot or transaction reference for instant admin verification.',
        bonusPercentage: 20,
        forwardUrl: 'http://www.keyhubsolutions.com/c/Jhaukhel',
      },
      {
        id: 'pm_cashapp_verified',
        name: 'Verified CashApp',
        type: 'cashapp',
        enabled: true,
        feePercentage: 0,
        instructions:
          'Pay instantly via Verified CashApp. Send payment, attach your payment screenshot, and provide your $Cashtag for 30% instant bonus.',
        bonusPercentage: 30,
        forwardUrl: 'http://www.keyhubsolutions.com/l/Jhaukhel',
      },
      {
        id: 'pm_chime_direct',
        name: 'Chime Direct',
        type: 'chime',
        enabled: true,
        feePercentage: 0,
        instructions:
          'Scan platform Chime QR code or send to our official Chime handle.',
        bonusPercentage: 15,
        chimeHandle: '$SwiftSweepsVault',
        chimeQrCodeUrl:
          'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=chime://send/$SwiftSweepsVault',
      },
      {
        id: 'pm_crypto_manual',
        name: 'Crypto Payment',
        type: 'crypto',
        enabled: true,
        minAmount: 20,
        maxAmount: 50000,
        feePercentage: 0,
        instructions:
          'Send BTC, ETH, or USDT directly to our dedicated treasury vault addresses. Attach payment screenshot or TXID for 30% dynamic bonus.',
        bonusPercentage: 30,
        bonusMinDeposit: 20,
        btcAddress: 'bc1q9v04x73y2fepz5r64h42qj0z8n0n9s3t0vx6m9',
        ethAddress: '0x71C8705a2B8841738734007b8b200b39645F33C4',
        usdtAddress: 'TX7nLw6U8R91kpm2XkHqa98yY117SwiftSweeps',
      },
    ],
    withdrawalMethods: [
      {
        id: 'wm_bank_wire',
        name: 'Direct Bank Wire (ACH / FedNow)',
        type: 'bank_transfer',
        enabled: true,
        minAmount: 100,
        maxAmount: 25000,
        feeFlat: 5,
        feePercentage: 0.5,
        processingTimeHours: 2,
      },
      {
        id: 'wm_crypto_usdt',
        name: 'Crypto Vault Transfer (USDT TRC20)',
        type: 'crypto',
        enabled: true,
        minAmount: 50,
        maxAmount: 50000,
        feeFlat: 2,
        feePercentage: 0.2,
        processingTimeHours: 1,
      },
      {
        id: 'wm_ewallet',
        name: 'Digital eWallet (Skrill / Neteller / PayPal)',
        type: 'e_wallet',
        enabled: true,
        minAmount: 30,
        maxAmount: 10000,
        feeFlat: 1,
        feePercentage: 1.0,
        processingTimeHours: 3,
      },
    ],
    gatewaySimulator: {
      autoApproveInstantGateway: true,
      failureRatePercentage: 0,
      activeProviders: {
        zelleFedNow: true,
        cryptoTrc20: true,
      },
    },
    cashoutFeed: {
      enabled: true,
      minAmount: 50,
      maxAmount: 250,
      intervalSeconds: 6,
      timeWindowHours: 2,
      probableAmounts: [50, 75, 100, 120, 140, 150, 180, 200, 220, 250],
      namesPool: [
        'Marcus V.',
        'Tyler_K',
        'Elena_R',
        'DragonSlayer99',
        'Sarah_M',
        'ViperSniper',
        'Jordan_B',
        'AetherQueen',
        'CryptoWhale_88',
        'GhostRider',
        'NeoMatrix',
        'Phoenix_Fire',
        'Samantha_W',
        'CashKing_LV',
        'Chloe_B',
        'ShadowNinja',
        'BlazeMaster',
        'Lucas_T',
        'ApexTitan',
        'Valkyrie_77',
        'OrionKing',
        'SlotHunter99',
        'LuckyStrike',
      ],
      displayLocations: {
        customerHome: true,
        withdrawalPage: true,
        walletPage: true,
      },
    },
    referralProgram: {
      enabled: true,
      rewardMode: 'flat',
      referrerRewardValue: 25,
      refereeRewardValue: 10,
      rewardPerReferral: 25,
      qualificationDepositMin: 100,
      requireEmailVerified: true,
      payoutTarget: 'referral_bonus',
      maxReferralsPerUser: 50,
      dailyPayoutCap: 1000,
      blockSelfReferral: true,
      blockDuplicateContact: true,
      flagSharedNetworkOrDevice: true,
      holdFlaggedForReview: true,
    },
    wheelOfLuck: cloneValue(DEFAULT_WHEEL_OF_LUCK_CONFIG),
    platformRules: {
      depositTerms:
        'All deposits must originate from accounts registered in the customer’s legal name. Third-party deposits are strictly prohibited and subject to immediate freeze pending AML review.',
      bonusWageringTerms:
        'Deposit bonuses require 1x wagering in verified gaming matches or 48-hour vault seasoning prior to cashout qualification. Multiple accounts claiming bonuses will forfeit promotional earnings.',
      withdrawalPolicy:
        'Withdrawals are processed around the clock by certified treasury operators. Security reserves are held atomically upon request. Standard review window is between 15 minutes and 2 hours.',
      refundPolicy:
        'Unutilized deposits may be refunded back to the originating funding method within 72 hours of submission, minus applicable network and processor fees.',
      cryptoRiskWarning:
        'Cryptocurrency transfers are irreversible once finalized on-chain. Ensure destination addresses and network tags match precisely before initiating payment.',
    },
    policies: {
      cashoutPolicy:
        'Cashouts are reviewed 24/7. Most verified requests settle within 15 minutes to 2 hours.',
      termsAndPrivacy:
        'Use of SwiftSweeps is subject to identity verification and responsible sweepstakes rules.',
    },
  };
}

function createInitialGameCatalog(): Row[] {
  const games = [
    {
      id: 'gc_firekirin',
      title: 'Fire Kirin',
      category: 'Fire Kirin Online',
      game_url: 'http://start.firekirin.xyz:8580/index.html',
      download_url: 'http://start.firekirin.xyz:8580/index.html',
      links: [
        { label: 'Web Play', url: 'http://start.firekirin.xyz:8580/index.html' },
        { label: 'Download Link', url: 'http://start.firekirin.xyz:8580/index.html' },
      ],
      description:
        'High-speed multiplayer fish arcade battles, dragon quests, and mega jackpot slots.',
      image_url: '/images/games/firekirin-v2.webp',
      icon_url: '/images/games/firekirin-v2.webp',
    },
    {
      id: 'gc_milkyway',
      title: 'Milky Way',
      category: 'Milkyway Gaming',
      game_url: 'https://milkywayapp.xyz/',
      download_url: 'https://milkywayapp.xyz/',
      links: [
        { label: 'Web Play', url: 'https://milkywayapp.xyz/' },
        { label: 'Download Link', url: 'https://milkywayapp.xyz/' },
      ],
      description:
        'Galactic slot reels, constellation bonus rounds, and high-payout stellar features.',
      image_url: '/images/games/milkyway-v2.webp',
      icon_url: '/images/games/milkyway-v2.webp',
    },
    {
      id: 'gc_juwa',
      title: 'Juwa',
      category: 'Juwa777',
      game_url: 'https://dl.juwa777.com/',
      download_url: 'https://dl.juwa777.com/',
      links: [
        { label: 'Web Play', url: 'https://dl.juwa777.com/' },
        { label: 'Download Link', url: 'https://dl.juwa777.com/' },
      ],
      description:
        'Immersive fish table arenas and exciting sweepstakes spinning reels.',
      image_url: '/images/games/juwa-v2.webp',
      icon_url: '/images/games/juwa-v2.webp',
    },
    {
      id: 'gc_gamevault',
      title: 'GameVault',
      category: 'Vault Gaming',
      game_url: 'https://download.gamevault999.com/',
      download_url: 'https://download.gamevault999.com/',
      links: [
        { label: 'Web Play', url: 'https://download.gamevault999.com/' },
        { label: 'Download Link', url: 'https://download.gamevault999.com/' },
      ],
      description:
        'Premium sweepstakes casino vault with daily spins, fish hunter tables, and progressive reels.',
      image_url: '/images/games/gamevault-v2.webp',
      icon_url: '/images/games/gamevault-v2.webp',
    },
    {
      id: 'gc_orionstars',
      title: 'OrionStars',
      category: 'Orion Play Web',
      game_url: 'http://start.orionstars.vip:8580/index.html',
      download_url: 'http://start.orionstars.vip:8580/index.html',
      links: [
        { label: 'Web Play', url: 'http://start.orionstars.vip:8580/index.html' },
        { label: 'Download Link', url: 'http://start.orionstars.vip:8580/index.html' },
      ],
      description:
        'Popular fish games, sweeps slots, and interactive community jackpots with instant credit reload.',
      image_url: '/images/games/orionstars-v2.webp',
      icon_url: '/images/games/orionstars-v2.webp',
    },
    {
      id: 'gc_vegas777',
      title: 'Vegas777',
      category: 'Las Vegas Sweeps',
      game_url: 'https://m.lasvegassweeps.com/',
      download_url: 'https://m.lasvegassweeps.com/',
      links: [
        { label: 'Web Play', url: 'https://m.lasvegassweeps.com/' },
        { label: 'Download Link', url: 'https://m.lasvegassweeps.com/' },
      ],
      description:
        'Authentic Las Vegas style casino floor slots and progressive tables.',
      image_url: '/images/games/vegassweeps-v2.webp',
      icon_url: '/images/games/vegassweeps-v2.webp',
    },
    {
      id: 'gc_cashmachine',
      title: 'CashMachine',
      category: 'CashMachine777',
      game_url: 'https://www.cashmachine777.com/',
      download_url: 'https://www.cashmachine777.com/',
      links: [
        { label: 'Web Play', url: 'https://www.cashmachine777.com/' },
        { label: 'Download Link', url: 'https://www.cashmachine777.com/' },
      ],
      description: 'High payout slot reels engineered for lightning-fast earnings.',
      image_url: '/images/games/cashmachine-v2.webp',
      icon_url: '/images/games/cashmachine-v2.webp',
    },
    {
      id: 'gc_riversweeps',
      title: 'RiverSweeps',
      category: 'River777',
      game_url: 'https://river777.net',
      download_url: 'https://river777.com/',
      links: [
        { label: 'Web Play', url: 'https://river777.net' },
        { label: 'Download Link', url: 'https://river777.com/' },
      ],
      description:
        'Classic river sweepstakes slots and multiplayer fish hunting rooms.',
      image_url: '/images/games/riversweeps-v2.webp',
      icon_url: '/images/games/riversweeps-v2.webp',
    },
    {
      id: 'gc_ultrapanda',
      title: 'UltraPanda',
      category: 'Ultra Panda Mobi',
      game_url: 'https://www.ultrapanda.mobi/',
      download_url: 'https://www.ultrapanda.mobi/',
      links: [
        { label: 'Web Play', url: 'https://www.ultrapanda.mobi/' },
        { label: 'Download Link', url: 'https://www.ultrapanda.mobi/' },
      ],
      description:
        'Action-packed Panda slots, wheel bonuses, and massive multipliers.',
      image_url: '/images/games/ultrapanda-v2.webp',
      icon_url: '/images/games/ultrapanda-v2.webp',
    },
    {
      id: 'gc_pandamaster',
      title: 'PandaMaster',
      category: 'Panda Gaming',
      game_url: 'https://pandamaster.vip:8888/',
      download_url: 'https://pandamaster.vip:8888/',
      links: [
        { label: 'Web Play', url: 'https://pandamaster.vip:8888/' },
        { label: 'Download Link', url: 'https://pandamaster.vip:8888/' },
      ],
      description:
        'Vibrant bamboo forest slots and high-stakes fish arcade action with lightning spins.',
      image_url: '/images/games/pandamaster-v2.webp',
      icon_url: '/images/games/pandamaster-v2.webp',
    },
    {
      id: 'gc_vblink',
      title: 'Vblink',
      category: 'Vblink777 Club',
      game_url: 'https://www.vblink777.club/',
      download_url: 'https://www.vblink777.club/',
      links: [
        { label: 'Web Play', url: 'https://www.vblink777.club/' },
        { label: 'Download Link', url: 'https://www.vblink777.club/' },
      ],
      description:
        'Next-generation social casino experience with rich fish games and reel tournaments.',
      image_url: '/images/games/vblink-v2.webp',
      icon_url: '/images/games/vblink-v2.webp',
    },
    {
      id: 'gc_gameroom',
      title: 'Gameroom',
      category: 'Gameroom777',
      game_url: 'https://www.gameroom777.com//',
      download_url: 'https://www.gameroom777.com//',
      links: [
        { label: 'Web Play', url: 'https://www.gameroom777.com//' },
        { label: 'Download Link', url: 'https://www.gameroom777.com//' },
      ],
      description:
        'All-in-one arcade and casino game vault with seamless wallet integration.',
      image_url: '/images/games/gameroom-v2.webp',
      icon_url: '/images/games/gameroom-v2.webp',
    },
    {
      id: 'gc_winstar',
      title: 'Winstar',
      category: 'Winstar99999',
      game_url: 'http://www.winstar99999.com/',
      download_url: 'http://www.winstar99999.com/',
      links: [
        { label: 'Web Play', url: 'http://www.winstar99999.com/' },
        { label: 'Download Link', url: 'http://www.winstar99999.com/' },
      ],
      description:
        'High-roller casino action with stellar bonuses and instant cashouts.',
      image_url: '/images/games/winstar-v2.webp',
      icon_url: '/images/games/winstar-v2.webp',
    },
    {
      id: 'gc_casinoroyal',
      title: 'Casino Royal',
      category: 'Casino Royale 07',
      game_url: 'http://m.casinoroyale07.com/',
      download_url: 'http://m.casinoroyale07.com/',
      links: [
        { label: 'Web Play', url: 'http://m.casinoroyale07.com/' },
        { label: 'Download Link', url: 'http://m.casinoroyale07.com/' },
      ],
      description: 'Elite royal tables, poker rooms, and luxury slot machines.',
      image_url: '/images/games/casinoroyale-v2.webp',
      icon_url: '/images/games/casinoroyale-v2.webp',
    },
    {
      id: 'gc_mafia',
      title: 'Mafia',
      category: 'Mafia77777',
      game_url: 'https://www.mafia77777.com/',
      download_url: 'https://www.mafia77777.com/',
      links: [
        { label: 'Web Play', url: 'https://www.mafia77777.com/' },
        { label: 'Download Link', url: 'https://www.mafia77777.com/' },
      ],
      description: 'Underworld themed slots and high-stakes syndicate table games.',
      image_url: '/images/games/mafia-v2.webp',
      icon_url: '/images/games/mafia-v2.webp',
    },
    {
      id: 'gc_egame',
      title: 'E-Game',
      category: 'E-Game 99 Club',
      game_url: 'https://www.egame99.club/',
      download_url: 'https://www.egame99.club/',
      links: [
        { label: 'Web Play', url: 'https://www.egame99.club/' },
        { label: 'Download Link', url: 'https://www.egame99.club/' },
      ],
      description:
        'Electronic arcade gaming and sweepstakes reels for competitive players.',
      image_url: '/images/games/egame-v2.webp',
      icon_url: '/images/games/egame-v2.webp',
    },
    {
      id: 'gc_yolo',
      title: 'YOLO',
      category: 'Yolo777 Game',
      game_url: 'https://yolo777.game/',
      download_url: 'https://yolo777.game/',
      links: [
        { label: 'Web Play', url: 'https://yolo777.game/' },
        { label: 'Download Link', url: 'https://yolo777.game/' },
      ],
      description:
        'Fast-paced thrilling casino games and adrenaline-fueled jackpot events.',
      image_url: '/images/games/yolo-v2.webp',
      icon_url: '/images/games/yolo-v2.webp',
    },
    {
      id: 'gc_casinoignite',
      title: 'Casino Ignite',
      category: 'Casino Ignite VIP',
      game_url: 'https://h5.casinoignitee.vip/',
      download_url: 'https://download.casinoignitee.vip/',
      links: [
        { label: 'Web Play', url: 'https://h5.casinoignitee.vip/' },
        { label: 'Download Link', url: 'https://download.casinoignitee.vip/' },
      ],
      description:
        'Blazing hot slots and intense casino tournaments with instant credit loading.',
      image_url: '/images/games/casinoignite-v2.webp',
      icon_url: '/images/games/casinoignite-v2.webp',
    },
    {
      id: 'gc_vegasx',
      title: 'VegasX',
      category: 'Vegas X Org',
      game_url: 'https://www.vegas-x.org/',
      download_url: 'https://www.vegas-x.org/',
      links: [
        { label: 'Web Play', url: 'https://www.vegas-x.org/' },
        { label: 'Download Link', url: 'https://www.vegas-x.org/' },
      ],
      description:
        'Cutting edge sweepstakes software with premier Vegas grade slot machines.',
      image_url: '/images/games/vegasx-v2.webp',
      icon_url: '/images/games/vegasx-v2.webp',
    },
    {
      id: 'gc_gamblinggalaxy',
      title: 'Gambling Galaxy',
      category: 'Gambling Galaxy XYZ',
      game_url: 'https://gambling-galaxy.xyz',
      download_url: 'https://gambling-galaxy.xyz',
      links: [
        { label: 'Web Play', url: 'https://gambling-galaxy.xyz' },
        { label: 'Download Link', url: 'https://gambling-galaxy.xyz' },
      ],
      description:
        'Intergalactic multi-platform sweepstakes hub with diverse gaming tables.',
      image_url: '/images/games/gamblinggalaxy-v2.webp',
      icon_url: '/images/games/gamblinggalaxy-v2.webp',
    },
  ];

  const baseTs = Date.parse('2026-01-01T00:00:00.000Z');
  return games.map((g, index) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    description: g.description,
    min_load: '5.00',
    bonus_pct: '0.00',
    is_active: true,
    icon_url: g.icon_url,
    image_url: g.image_url,
    game_url: g.game_url,
    download_url: g.download_url,
    links: g.links,
    created_at: new Date(baseTs + index * 1000).toISOString(),
    updated_at: '2026-10-01T00:00:00.000Z',
  }));
}

function createInitialFakedCashouts(): Row[] {
  const names = [
    'Marcus V.',
    'Tyler_K',
    'Elena_R',
    'DragonSlayer99',
    'Sarah_M',
    'ViperSniper',
    'Jordan_B',
    'AetherQueen',
    'CryptoWhale_88',
    'GhostRider',
    'NeoMatrix',
    'Phoenix_Fire',
  ];
  const amounts = [150, 75, 220, 100, 180, 120, 250, 140, 200, 50, 150, 180];
  const methods = [
    'CashApp Instant',
    'USDT TRC20',
    'Direct Bank Wire',
    'Chime Instant',
  ];
  const games = [
    'Fire Kirin',
    'Milky Way',
    'Juwa',
    'OrionStars',
    'GameVault',
    'UltraPanda',
  ];
  const now = Date.now();
  return names.map((customer_name, idx) => ({
    id: `fake_seed_${idx + 1}`,
    customer_name,
    amount: (amounts[idx] ?? 100).toFixed(2),
    currency: 'USD',
    method_name: methods[idx % methods.length]!,
    game_name: games[idx % games.length]!,
    is_fake: true,
    timestamp: new Date(now - (idx + 1) * 9 * 60 * 1000).toISOString(),
  }));
}

interface StoreState {
  users: Map<string, Row>;
  auth_user_links: Map<string, Row>;
  app_config: Map<string, Row>;
  faked_cashouts: Map<string, Row>;
  game_catalog: Map<string, Row>;
  wallets: Map<string, Row>;
  transactions: Map<string, Row>;
  game_accounts: Map<string, Row>;
  topups: Map<string, Row>;
  withdrawals: Map<string, Row>;
  referral_awards: Map<string, Row>;
  wheel_spins: Map<string, Row>;
  official_partners: Map<string, Row>;
  official_partner_icons: Map<string, Row>;
  notifications: Map<string, Row>;
  push_subscriptions: Map<string, Row>;
  conversations: Map<string, Row>;
  messages: Map<string, Row>;
  chat_attachments: Map<string, Row>;
  storage_objects: Map<string, Row>;
  audit_logs: Map<string, Row>;
}

function createInitialStoreState(): StoreState {
  const app_config = new Map<string, Row>();
  app_config.set('main', {
    id: 'main',
    data: createInitialAppConfig(),
    updated_at: new Date().toISOString(),
  });

  const game_catalog = new Map<string, Row>();
  for (const row of createInitialGameCatalog()) {
    game_catalog.set(String(row.id), row);
  }

  const faked_cashouts = new Map<string, Row>();
  for (const row of createInitialFakedCashouts()) {
    faked_cashouts.set(String(row.id), row);
  }

  return {
    users: new Map(),
    auth_user_links: new Map(),
    app_config,
    faked_cashouts,
    game_catalog,
    wallets: new Map(),
    transactions: new Map(),
    game_accounts: new Map(),
    topups: new Map(),
    withdrawals: new Map(),
    referral_awards: new Map(),
    wheel_spins: new Map(),
    official_partners: new Map(),
    official_partner_icons: new Map(),
    notifications: new Map(),
    push_subscriptions: new Map(),
    conversations: new Map(),
    messages: new Map(),
    chat_attachments: new Map(),
    storage_objects: new Map(),
    audit_logs: new Map(),
  };
}

function snapshotState(state: StoreState): StoreState {
  const copyMap = (m: Map<string, Row>): Map<string, Row> => {
    const out = new Map<string, Row>();
    for (const [k, v] of m.entries()) {
      out.set(k, cloneRow(v));
    }
    return out;
  };
  return {
    users: copyMap(state.users),
    auth_user_links: copyMap(state.auth_user_links),
    app_config: copyMap(state.app_config),
    faked_cashouts: copyMap(state.faked_cashouts),
    game_catalog: copyMap(state.game_catalog),
    wallets: copyMap(state.wallets),
    transactions: copyMap(state.transactions),
    game_accounts: copyMap(state.game_accounts),
    topups: copyMap(state.topups),
    withdrawals: copyMap(state.withdrawals),
    referral_awards: copyMap(state.referral_awards),
    wheel_spins: copyMap(state.wheel_spins),
    official_partners: copyMap(state.official_partners),
    official_partner_icons: copyMap(state.official_partner_icons),
    notifications: copyMap(state.notifications),
    push_subscriptions: copyMap(state.push_subscriptions),
    conversations: copyMap(state.conversations),
    messages: copyMap(state.messages),
    chat_attachments: copyMap(state.chat_attachments),
    storage_objects: copyMap(state.storage_objects),
    audit_logs: copyMap(state.audit_logs),
  };
}

function parseJsonValue(val: unknown): unknown {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return cloneValue(val);
}

function toIso(val: unknown, fallback?: string): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return fallback ?? new Date().toISOString();
}

function toTimestampMs(val: unknown): number {
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function matchIlike(value: unknown, pattern: unknown): boolean {
  const hay = value === null || value === undefined ? '' : String(value);
  const pat = pattern === null || pattern === undefined ? '' : String(pattern);
  // Convert SQL ILIKE pattern with ESCAPE '\' into RegExp
  let regexStr = '^';
  for (let i = 0; i < pat.length; i += 1) {
    const ch = pat[i]!;
    if (ch === '\\' && i + 1 < pat.length) {
      regexStr += pat[i + 1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    } else if (ch === '%') {
      regexStr += '.*';
    } else if (ch === '_') {
      regexStr += '.';
    } else {
      regexStr += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  regexStr += '$';
  return new RegExp(regexStr, 'is').test(hay);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  if (
    sa.includes('T') &&
    sb.includes('T') &&
    Number.isFinite(ta) &&
    Number.isFinite(tb)
  ) {
    return ta - tb;
  }
  const na = Number(sa);
  const nb = Number(sb);
  if (sa.trim() !== '' && sb.trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) {
    return na - nb;
  }
  return sa.localeCompare(sb);
}

function parseParamIndex(token: string): number | null {
  const m = /^\$(\d+)(?:::[a-z0-9_[\]]+)?$/i.exec(token.trim());
  return m ? Number.parseInt(m[1]!, 10) - 1 : null;
}

function extractLimitOffset(
  sql: string,
  values: unknown[],
): { limit: number; offset: number } {
  let limit = Number.POSITIVE_INFINITY;
  let offset = 0;
  const limitMatch = /\bLIMIT\s+(\$\d+|\d+)/i.exec(sql);
  if (limitMatch) {
    const raw = limitMatch[1]!;
    if (raw.startsWith('$')) {
      limit = Number(values[Number.parseInt(raw.slice(1), 10) - 1] ?? limit);
    } else {
      limit = Number.parseInt(raw, 10);
    }
  }
  const offsetMatch = /\bOFFSET\s+(\$\d+|\d+)/i.exec(sql);
  if (offsetMatch) {
    const raw = offsetMatch[1]!;
    if (raw.startsWith('$')) {
      offset = Number(values[Number.parseInt(raw.slice(1), 10) - 1] ?? 0);
    } else {
      offset = Number.parseInt(raw, 10);
    }
  }
  return {
    limit: Number.isFinite(limit) && limit >= 0 ? limit : Number.POSITIVE_INFINITY,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
}

function parseSqlArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v));
  return [];
}

function parseInsertColumns(sql: string): string[] {
  const match = /\(([^)]+)\)\s+VALUES\s*\(/i.exec(sql);
  if (!match) return [];
  return match[1]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "'" && text[i - 1] !== '\\') {
      inSingle = !inSingle;
      current += ch;
    } else if (!inSingle && ch === '(') {
      depth += 1;
      current += ch;
    } else if (!inSingle && ch === ')') {
      depth -= 1;
      current += ch;
    } else if (!inSingle && depth === 0 && ch === ',') {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function evalSqlExpr(
  expr: string,
  values: unknown[],
  nowIso: string,
  existingRow?: Row,
): unknown {
  const trimmed = expr.trim();
  const paramIdx = parseParamIndex(trimmed);
  if (paramIdx !== null) {
    const v = values[paramIdx];
    if (trimmed.toLowerCase().endsWith('::jsonb')) {
      return parseJsonValue(v);
    }
    if (trimmed.toLowerCase().endsWith('::timestamptz')) {
      return v === null || v === undefined ? null : toIso(v, nowIso);
    }
    return v === undefined ? null : v;
  }
  if (/^NULL$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^timezone\('utc'::text,\s*now\(\)\)$/i.test(trimmed)) return nowIso;
  if (/^'\{\}'::jsonb$/i.test(trimmed)) return {};
  if (/^'\[\]'::jsonb$/i.test(trimmed)) return [];
  const strMatch = /^'((?:[^']|'')*)'(?:::[a-z0-9_() ,]+)?$/i.exec(trimmed);
  if (strMatch) {
    const s = strMatch[1]!.replace(/''/g, "'");
    if (trimmed.toLowerCase().includes('::jsonb')) {
      return parseJsonValue(s);
    }
    return s;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed.includes('.') ? trimmed : Number.parseInt(trimmed, 10);
  }
  const coalesceMatch = /^COALESCE\((.+)\)$/i.exec(trimmed);
  if (coalesceMatch) {
    const args = splitTopLevelCommas(coalesceMatch[1]!);
    for (const arg of args) {
      const val = evalSqlExpr(arg, values, nowIso, existingRow);
      if (val !== null && val !== undefined) return val;
    }
    return null;
  }
  const addMatch = /^([a-z_]+)\s*\+\s*(\$\d+)$/i.exec(trimmed);
  if (addMatch && existingRow) {
    const col = addMatch[1]!;
    const idx = parseParamIndex(addMatch[2]!) ?? 0;
    const base = Number(existingRow[col] ?? 0);
    const delta = Number(values[idx] ?? 0);
    return (base + delta).toFixed(2);
  }
  return trimmed;
}

export class InMemoryDatabasePool implements DatabasePool {
  private state: StoreState;
  private txSnapshot: StoreState | null = null;
  private lockQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.state = createInitialStoreState();
  }

  public reset(): void {
    this.state = createInitialStoreState();
    this.txSnapshot = null;
  }

  public async end(): Promise<void> {
    this.txSnapshot = null;
  }

  public async connect(): Promise<DatabaseClient> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prevLock = this.lockQueue;
    this.lockQueue = prevLock.then(() => nextLock);
    await prevLock;

    let released = false;
    return {
      query: (text: string, values?: unknown[]) => this.executeQuery(text, values),
      release: () => {
        if (!released) {
          released = true;
          releaseLock();
        }
      },
    };
  }

  public async query(text: string, values?: unknown[]): Promise<QueryResult> {
    return this.executeQuery(text, values ?? []);
  }

  private async executeQuery(
    rawSql: string,
    values: unknown[] = [],
  ): Promise<QueryResult> {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    const upper = sql.toUpperCase();
    const nowIso = new Date().toISOString();

    if (upper === 'BEGIN') {
      this.txSnapshot = snapshotState(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (upper === 'COMMIT') {
      this.txSnapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (upper === 'ROLLBACK') {
      if (this.txSnapshot) {
        this.state = this.txSnapshot;
        this.txSnapshot = null;
      }
      return { rows: [], rowCount: 0 };
    }

    if (/^SELECT 1(\s+AS\s+OK)?$/i.test(sql)) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    if (/to_regclass\(/i.test(sql)) {
      const row: Row = {};
      const regRe = /to_regclass\('([^']+)'\)\s+AS\s+([a-z_][a-z0-9_]*)/gi;
      let match: RegExpExecArray | null;
      while ((match = regRe.exec(sql)) !== null) {
        const tableFull = match[1]!;
        const alias = match[2]!;
        const tableName = tableFull.replace(/^public\./i, '');
        row[alias] = KNOWN_TABLES.has(tableName) ? `public.${tableName}` : null;
      }
      return { rows: [row], rowCount: 1 };
    }

    if (/SELECT EXISTS\s*\(\s*SELECT 1 FROM public\.game_catalog\s*\)\s+AS\s+populated/i.test(sql)) {
      return {
        rows: [{ populated: this.state.game_catalog.size > 0 }],
        rowCount: 1,
      };
    }

    if (upper.startsWith('DELETE FROM BA_SESSION')) {
      return { rows: [], rowCount: 0 };
    }

    // Route by primary target table
    if (this.isTableTarget(sql, 'users')) {
      return this.handleUsersQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'auth_user_links')) {
      return this.handleAuthUserLinksQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'app_config')) {
      return this.handleAppConfigQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'faked_cashouts')) {
      return this.handleFakedCashoutsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'game_catalog')) {
      return this.handleGameCatalogQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'wallets')) {
      return this.handleWalletsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'transactions')) {
      return this.handleTransactionsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'game_accounts')) {
      return this.handleGameAccountsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'topups')) {
      return this.handleTopupsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'withdrawals')) {
      return this.handleWithdrawalsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'referral_awards')) {
      return this.handleReferralAwardsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'wheel_spins')) {
      return this.handleWheelSpinsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'official_partners')) {
      return this.handleOfficialPartnersQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'official_partner_icons')) {
      return this.handleOfficialPartnerIconsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'notifications')) {
      return this.handleNotificationsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'push_subscriptions')) {
      return this.handlePushSubscriptionsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'conversations')) {
      return this.handleConversationsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'messages')) {
      return this.handleMessagesQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'chat_attachments')) {
      return this.handleChatAttachmentsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'storage_objects')) {
      return this.handleStorageObjectsQuery(sql, values, nowIso);
    }
    if (this.isTableTarget(sql, 'audit_logs')) {
      return this.handleAuditLogsQuery(sql, values, nowIso);
    }

    throw new Error(`[InMemoryDatabasePool] Unhandled SQL query: ${sql.slice(0, 160)}`);
  }

  private isTableTarget(sql: string, tableName: string): boolean {
    const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selectRe = new RegExp(`^SELECT\\b.*?\\bFROM\\s+(?:public\\.)?${escaped}\\b`, 'i');
    const insertRe = new RegExp(`^INSERT\\s+INTO\\s+(?:public\\.)?${escaped}\\b`, 'i');
    const updateRe = new RegExp(`^UPDATE\\s+(?:public\\.)?${escaped}\\b`, 'i');
    const deleteRe = new RegExp(`^DELETE\\s+FROM\\s+(?:public\\.)?${escaped}\\b`, 'i');
    return (
      selectRe.test(sql) ||
      insertRe.test(sql) ||
      updateRe.test(sql) ||
      deleteRe.test(sql)
    );
  }

  private joinedUserRow(user: Row): Row {
    const link = this.state.auth_user_links.get(String(user.id));
    return {
      app_user_id: user.id,
      auth_user_id: link?.auth_user_id ?? null,
      email: user.email,
      display_name: user.display_name,
      phone: user.phone ?? null,
      avatar_url: user.avatar_url ?? null,
      role: user.role,
      status: user.status,
      email_verified: Boolean(user.email_verified),
      referral_code: user.referral_code ?? null,
      referred_by: user.referred_by ?? null,
      password_reset_required: Boolean(link?.password_reset_required ?? false),
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  private handleUsersQuery(sql: string, values: unknown[], nowIso: string): QueryResult {
    if (/^INSERT INTO public\.users\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        phone: null,
        avatar_url: null,
        referral_code: null,
        referred_by: null,
        signup_ip: null,
        device_fingerprint: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const id = String(row.id);
      if (this.state.users.has(id) && /ON CONFLICT \(id\) DO NOTHING/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      this.state.users.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.users\b/i.test(sql)) {
      if (/WHERE upper\(referred_by\) = upper\(\$1\)/i.test(sql)) {
        const oldCode = String(values[0] ?? '').toUpperCase();
        const newCode = values[1] ? String(values[1]) : null;
        let count = 0;
        for (const u of this.state.users.values()) {
          if (String(u.referred_by ?? '').toUpperCase() === oldCode) {
            u.referred_by = newCode;
            u.updated_at = nowIso;
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }

      const id = String(values[0] ?? '');
      const user = this.state.users.get(id);
      if (!user) return { rows: [], rowCount: 0 };

      if (/SET display_name = \$2, phone = \$3/i.test(sql)) {
        user.display_name = values[1];
        user.phone = values[2];
      } else if (/SET display_name = \$2/i.test(sql)) {
        user.display_name = values[1];
      } else if (/SET phone = \$2/i.test(sql)) {
        user.phone = values[1];
      } else if (/SET avatar_url = \$2/i.test(sql)) {
        user.avatar_url = values[1];
      } else if (/SET email_verified = true/i.test(sql)) {
        user.email_verified = true;
      } else if (/SET role = \$2/i.test(sql)) {
        user.role = values[1];
      } else if (/SET status = \$2/i.test(sql)) {
        user.status = values[1];
      } else if (/SET referral_code = \$2/i.test(sql)) {
        user.referral_code = values[1];
      } else if (/SET referred_by = \$2/i.test(sql)) {
        user.referred_by = values[1];
      } else if (/SET signup_ip = COALESCE/i.test(sql)) {
        if (values[1] !== null && values[1] !== undefined) user.signup_ip = values[1];
        if (values[2] !== null && values[2] !== undefined) user.device_fingerprint = values[2];
      }
      user.updated_at = nowIso;
      return {
        rows: /\bRETURNING\b/i.test(sql) ? [cloneRow(user)] : [],
        rowCount: 1,
      };
    }

    if (/^DELETE FROM public\.users WHERE id = \$1/i.test(sql)) {
      const id = String(values[0] ?? '');
      const existed = this.state.users.delete(id);
      this.state.auth_user_links.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    // SELECT queries on users
    if (/WHERE l\.auth_user_id = \$1/i.test(sql)) {
      const authUserId = String(values[0] ?? '');
      for (const link of this.state.auth_user_links.values()) {
        if (link.auth_user_id === authUserId) {
          const user = this.state.users.get(String(link.app_user_id));
          if (user) return { rows: [this.joinedUserRow(user)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/FROM public\.users u LEFT JOIN public\.auth_user_links l/i.test(sql)) {
      if (/WHERE u\.id = \$1/i.test(sql)) {
        const u = this.state.users.get(String(values[0] ?? ''));
        return { rows: u ? [this.joinedUserRow(u)] : [], rowCount: u ? 1 : 0 };
      }
      if (/WHERE lower\(u\.email\) = \$1/i.test(sql)) {
        const email = String(values[0] ?? '').toLowerCase();
        for (const u of this.state.users.values()) {
          if (String(u.email ?? '').toLowerCase() === email) {
            return { rows: [this.joinedUserRow(u)], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
    }

    // Admin directory list / count with dynamic WHERE u.role / u.status / ILIKE
    if (
      /FROM public\.users u/i.test(sql) &&
      (/SELECT COUNT\(\*\)::int AS total/i.test(sql) || /LEFT JOIN public\.auth_user_links l/i.test(sql))
    ) {
      let rows = Array.from(this.state.users.values()).map((u) => this.joinedUserRow(u));
      const roleMatch = /u\.role = \$(\d+)/i.exec(sql);
      if (roleMatch) {
        const roleVal = String(values[Number.parseInt(roleMatch[1]!, 10) - 1] ?? '');
        rows = rows.filter((r) => r.role === roleVal);
      }
      const statusMatch = /u\.status = \$(\d+)/i.exec(sql);
      if (statusMatch) {
        const statusVal = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
        rows = rows.filter((r) => r.status === statusVal);
      }
      const searchMatch = /u\.display_name ILIKE \$(\d+)/i.exec(sql);
      if (searchMatch) {
        const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
        rows = rows.filter(
          (r) =>
            matchIlike(r.display_name, pat) ||
            matchIlike(r.email, pat) ||
            matchIlike(r.app_user_id, pat) ||
            matchIlike(r.referral_code, pat) ||
            matchIlike(r.phone, pat),
        );
      }
      if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
        return { rows: [{ total: rows.length }], rowCount: 1 };
      }

      const sortDesc = /ORDER BY .* DESC/i.test(sql);
      let sortField = 'created_at';
      if (/ORDER BY u\.display_name/i.test(sql)) sortField = 'display_name';
      else if (/ORDER BY u\.email/i.test(sql)) sortField = 'email';
      else if (/ORDER BY u\.role/i.test(sql)) sortField = 'role';
      else if (/ORDER BY u\.status/i.test(sql)) sortField = 'status';

      rows.sort((a, b) => {
        const cmp = compareValues(a[sortField], b[sortField]);
        if (cmp !== 0) return sortDesc ? -cmp : cmp;
        return String(a.app_user_id).localeCompare(String(b.app_user_id));
      });

      const { limit, offset } = extractLimitOffset(sql, values);
      const sliced = rows.slice(offset, offset + limit);
      return { rows: sliced, rowCount: sliced.length };
    }

    // Simple single-table SELECTs on public.users
    if (/WHERE id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.users.values())
        .filter((u) => ids.has(String(u.id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE id = \$1 OR upper\(referral_code\) = upper\(\$1\) OR lower\(email\) = lower\(\$1\)/i.test(sql)) {
      const target = String(values[0] ?? '').trim();
      for (const u of this.state.users.values()) {
        if (
          u.id === target ||
          String(u.referral_code ?? '').toUpperCase() === target.toUpperCase() ||
          String(u.email ?? '').toLowerCase() === target.toLowerCase()
        ) {
          return { rows: [cloneRow(u)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/WHERE upper\(referral_code\) = upper\(\$1\) AND id <> \$2/i.test(sql)) {
      const code = String(values[0] ?? '').toUpperCase();
      const excludeId = String(values[1] ?? '');
      for (const u of this.state.users.values()) {
        if (String(u.referral_code ?? '').toUpperCase() === code && u.id !== excludeId) {
          return { rows: [cloneRow(u)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/WHERE upper\(referral_code\) = upper\(\$1\)/i.test(sql)) {
      const code = String(values[0] ?? '').toUpperCase();
      for (const u of this.state.users.values()) {
        if (String(u.referral_code ?? '').toUpperCase() === code) {
          return { rows: [cloneRow(u)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/WHERE lower\(email\) = \$1/i.test(sql)) {
      const email = String(values[0] ?? '').toLowerCase();
      for (const u of this.state.users.values()) {
        if (String(u.email ?? '').toLowerCase() === email) {
          return { rows: [cloneRow(u)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const u = this.state.users.get(String(values[0] ?? ''));
      return { rows: u ? [cloneRow(u)] : [], rowCount: u ? 1 : 0 };
    }

    const { limit, offset } = extractLimitOffset(sql, values);
    const all = Array.from(this.state.users.values()).map(cloneRow).slice(offset, offset + limit);
    return { rows: all, rowCount: all.length };
  }

  private handleAuthUserLinksQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.auth_user_links\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        legacy_supabase_uid: null,
        password_reset_required: false,
        linked_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const appUserId = String(row.app_user_id);
      const existing = this.state.auth_user_links.get(appUserId);
      if (existing) {
        existing.auth_user_id = /COALESCE\(public\.auth_user_links\.auth_user_id/i.test(sql)
          ? existing.auth_user_id ?? row.auth_user_id
          : row.auth_user_id;
        existing.email_normalized = row.email_normalized;
        existing.linked_at = existing.linked_at ?? row.linked_at;
        existing.updated_at = nowIso;
        return { rows: [cloneRow(existing)], rowCount: 1 };
      }
      this.state.auth_user_links.set(appUserId, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.auth_user_links\b/i.test(sql)) {
      const authUserId = String(values[0] ?? '');
      let count = 0;
      for (const link of this.state.auth_user_links.values()) {
        if (link.auth_user_id === authUserId) {
          link.password_reset_required = false;
          link.updated_at = nowIso;
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (/^SELECT\b/i.test(sql) && /WHERE l\.auth_user_id = \$1/i.test(sql)) {
      const authUserId = String(values[0] ?? '');
      for (const link of this.state.auth_user_links.values()) {
        if (link.auth_user_id === authUserId) {
          const user = this.state.users.get(String(link.app_user_id));
          if (user) {
            return { rows: [this.joinedUserRow(user)], rowCount: 1 };
          }
        }
      }
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  }

  private handleAppConfigQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^SELECT\b/i.test(sql)) {
      const row = this.state.app_config.get('main');
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (/^INSERT INTO public\.app_config\b/i.test(sql)) {
      const data = parseJsonValue(values[0]);
      const updatedAt = values[1] ? toIso(values[1], nowIso) : nowIso;
      const row: Row = { id: 'main', data, updated_at: updatedAt };
      this.state.app_config.set('main', row);
      return {
        rows: /\bRETURNING\b/i.test(sql) ? [cloneRow(row)] : [],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  private handleFakedCashoutsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: this.state.faked_cashouts.size }], rowCount: 1 };
    }
    if (/^SELECT\b/i.test(sql)) {
      const rows = Array.from(this.state.faked_cashouts.values())
        .map(cloneRow)
        .sort((a, b) => {
          const cmp = toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
          return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
        });
      const { limit, offset } = extractLimitOffset(sql, values);
      const sliced = rows.slice(offset, offset + limit);
      return { rows: sliced, rowCount: sliced.length };
    }
    if (/^INSERT INTO public\.faked_cashouts\b/i.test(sql)) {
      const row: Row = {
        id: String(values[0]),
        customer_name: String(values[1]),
        amount: String(values[2]),
        currency: String(values[3]),
        method_name: String(values[4]),
        game_name: String(values[5]),
        is_fake: Boolean(values[6]),
        timestamp: toIso(values[7], nowIso),
      };
      this.state.faked_cashouts.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }
    if (/^DELETE FROM public\.faked_cashouts WHERE id = \$1/i.test(sql)) {
      const id = String(values[0] ?? '');
      const existing = this.state.faked_cashouts.get(id);
      if (!existing) return { rows: [], rowCount: 0 };
      this.state.faked_cashouts.delete(id);
      return { rows: [cloneRow(existing)], rowCount: 1 };
    }
    if (/^DELETE FROM public\.faked_cashouts$/i.test(sql)) {
      const count = this.state.faked_cashouts.size;
      this.state.faked_cashouts.clear();
      return { rows: [], rowCount: count };
    }
    return { rows: [], rowCount: 0 };
  }

  private handleGameCatalogQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.game_catalog\b/i.test(sql)) {
      // Multi-row or single-row insert: 13 params per row
      const hasTimestampParam = /COALESCE\(\$13/i.test(sql);
      const stride = hasTimestampParam ? 13 : 12;
      const insertedRows: Row[] = [];
      for (let base = 0; base < values.length; base += stride) {
        const id = String(values[base] ?? '');
        if (!id) continue;
        const existed = this.state.game_catalog.has(id);
        const prev = this.state.game_catalog.get(id);
        const row: Row = {
          id,
          title: values[base + 1],
          category: values[base + 2],
          description: values[base + 3],
          min_load: values[base + 4],
          bonus_pct: values[base + 5],
          is_active: Boolean(values[base + 6]),
          icon_url: values[base + 7],
          image_url: values[base + 8],
          game_url: values[base + 9],
          download_url: values[base + 10],
          links: parseJsonValue(values[base + 11]),
          created_at:
            existed && prev
              ? prev.created_at
              : hasTimestampParam && values[base + 12]
                ? toIso(values[base + 12], nowIso)
                : nowIso,
          updated_at: nowIso,
        };
        this.state.game_catalog.set(id, row);
        const ret = cloneRow(row);
        if (/AS was_inserted/i.test(sql)) {
          ret.was_inserted = !existed;
        }
        insertedRows.push(ret);
      }
      return { rows: insertedRows, rowCount: insertedRows.length };
    }

    if (/^DELETE FROM public\.game_catalog WHERE id = \$1/i.test(sql)) {
      const id = String(values[0] ?? '');
      const existing = this.state.game_catalog.get(id);
      if (!existing) return { rows: [], rowCount: 0 };
      this.state.game_catalog.delete(id);
      return { rows: [cloneRow(existing)], rowCount: 1 };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.game_catalog.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.game_catalog.values()).map(cloneRow);
    if (/\bis_active = true\b/i.test(sql)) {
      rows = rows.filter((r) => Boolean(r.is_active));
    } else {
      const activeMatch = /\bis_active = \$(\d+)/i.exec(sql);
      if (activeMatch) {
        const activeVal = Boolean(values[Number.parseInt(activeMatch[1]!, 10) - 1]);
        rows = rows.filter((r) => Boolean(r.is_active) === activeVal);
      }
    }
    const catMatch = /\blower\(category\) = lower\(\$(\d+)\)/i.exec(sql);
    if (catMatch) {
      const catVal = String(values[Number.parseInt(catMatch[1]!, 10) - 1] ?? '').toLowerCase();
      rows = rows.filter((r) => String(r.category ?? '').toLowerCase() === catVal);
    }
    const searchMatch = /\btitle ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.title, pat) ||
          matchIlike(r.category, pat) ||
          matchIlike(r.description, pat) ||
          matchIlike(r.id, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    const sortDesc = /ORDER BY .* DESC/i.test(sql);
    let sortField = 'created_at';
    if (/ORDER BY title/i.test(sql)) sortField = 'title';
    else if (/ORDER BY category/i.test(sql)) sortField = 'category';
    else if (/ORDER BY updated_at/i.test(sql)) sortField = 'updated_at';
    else if (/ORDER BY min_load/i.test(sql)) sortField = 'min_load';
    else if (/ORDER BY bonus_pct/i.test(sql)) sortField = 'bonus_pct';

    rows.sort((a, b) => {
      const cmp = compareValues(a[sortField], b[sortField]);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return String(a.id).localeCompare(String(b.id));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private ensureWalletRow(customerId: string, nowIso: string): Row {
    const existing = this.state.wallets.get(customerId);
    if (existing) return existing;
    const row: Row = {
      customer_id: customerId,
      balance: '0.00',
      referral_bonus_balance: '0.00',
      free_play_balance: '0.00',
      pending_withdrawal: '0.00',
      pending_deposit: '0.00',
      total_deposited: '0.00',
      total_withdrawn: '0.00',
      currency: 'USD',
      updated_at: nowIso,
    };
    this.state.wallets.set(customerId, row);
    return row;
  }

  private handleWalletsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.wallets\b/i.test(sql)) {
      const customerId = String(values[0] ?? '');
      if (this.state.wallets.has(customerId)) {
        return { rows: [], rowCount: 0 };
      }
      const row = this.ensureWalletRow(customerId, nowIso);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.wallets\b/i.test(sql)) {
      const customerId = String(values[0] ?? '');
      const wallet = this.ensureWalletRow(customerId, nowIso);
      const setMatch = /\bSET\s+(.+?)\s+WHERE\b/i.exec(sql);
      if (setMatch) {
        const assignments = splitTopLevelCommas(setMatch[1]!);
        for (const assign of assignments) {
          const eqIdx = assign.indexOf('=');
          if (eqIdx === -1) continue;
          const col = assign.slice(0, eqIdx).trim();
          const expr = assign.slice(eqIdx + 1).trim();
          wallet[col] = evalSqlExpr(expr, values, nowIso, wallet);
        }
      }
      wallet.updated_at = wallet.updated_at || nowIso;
      return {
        rows: /\bRETURNING\b/i.test(sql) ? [cloneRow(wallet)] : [],
        rowCount: 1,
      };
    }

    if (/WHERE customer_id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.wallets.values())
        .filter((w) => ids.has(String(w.customer_id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE customer_id = \$1/i.test(sql)) {
      const row = this.state.wallets.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.wallets.values()).map(cloneRow);
    const cidMatch = /customer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }
    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }
    rows.sort((a, b) => {
      const cmp = toTimestampMs(b.updated_at) - toTimestampMs(a.updated_at);
      return cmp !== 0 ? cmp : String(a.customer_id).localeCompare(String(b.customer_id));
    });
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleTransactionsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.transactions\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        reference_id: null,
        game_name: null,
        created_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const id = String(row.id);
      if (this.state.transactions.has(id) && /ON CONFLICT \(id\) DO NOTHING/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      this.state.transactions.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    let rows = Array.from(this.state.transactions.values()).map(cloneRow);

    if (/\(reference_id = \$1 AND type = 'referral_reward'\) OR id IN \(\$2, \$3\)/i.test(sql)) {
      const refId = String(values[0] ?? '');
      const id1 = String(values[1] ?? '');
      const id2 = String(values[2] ?? '');
      rows = rows.filter(
        (r) =>
          (r.reference_id === refId && r.type === 'referral_reward') ||
          r.id === id1 ||
          r.id === id2,
      );
      return { rows, rowCount: rows.length };
    }

    const cidMatch = /\bcustomer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }

    if (/type = 'referral_reward'/i.test(sql)) {
      rows = rows.filter((r) => r.type === 'referral_reward');
    } else if (/type IN \('bonus', 'game_load'\)/i.test(sql)) {
      rows = rows.filter((r) => r.type === 'bonus' || r.type === 'game_load');
    } else {
      const typeMatch = /\btype = \$(\d+)/i.exec(sql);
      if (typeMatch) {
        const t = String(values[Number.parseInt(typeMatch[1]!, 10) - 1] ?? '');
        rows = rows.filter((r) => r.type === t);
      }
    }

    const statusMatch = /\bstatus = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const s = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === s);
    }

    const searchMatch = /\bdescription ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.description, pat) ||
          matchIlike(r.reference_id, pat) ||
          matchIlike(r.game_name, pat) ||
          matchIlike(r.id, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    const sortDesc = !/ORDER BY .* ASC/i.test(sql) || /ORDER BY .* DESC/i.test(sql);
    let sortField = 'created_at';
    if (/ORDER BY amount/i.test(sql)) sortField = 'amount';
    rows.sort((a, b) => {
      const cmp = compareValues(a[sortField], b[sortField]);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return String(a.id).localeCompare(String(b.id));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private enrichGameAccountRow(row: Row): Row {
    const cat = row.game_id ? this.state.game_catalog.get(String(row.game_id)) : undefined;
    return {
      ...cloneRow(row),
      catalog_game_url: cat?.game_url ?? null,
      catalog_download_url: cat?.download_url ?? null,
      catalog_links: cat?.links ?? null,
      catalog_icon_url: cat?.icon_url ?? null,
      catalog_image_url: cat?.image_url ?? null,
    };
  }

  private handleGameAccountsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.game_accounts\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        balance: '0.00',
        free_play_balance: '0.00',
        request_type: null,
        assigned_by_agent_id: null,
        assigned_by_agent_name: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      this.state.game_accounts.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.game_accounts\b/i.test(sql)) {
      const id = String(values[0] ?? '');
      const row = this.state.game_accounts.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      const setMatch = /\bSET\s+(.+?)\s+WHERE\b/i.exec(sql);
      if (setMatch) {
        const assignments = splitTopLevelCommas(setMatch[1]!);
        for (const assign of assignments) {
          const eqIdx = assign.indexOf('=');
          if (eqIdx === -1) continue;
          const col = assign.slice(0, eqIdx).trim();
          const expr = assign.slice(eqIdx + 1).trim();
          row[col] = evalSqlExpr(expr, values, nowIso, row);
        }
      }
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^DELETE FROM public\.game_accounts WHERE id = \$1/i.test(sql)) {
      const existed = this.state.game_accounts.delete(String(values[0] ?? ''));
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (/WHERE customer_id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.game_accounts.values())
        .filter((r) => ids.has(String(r.customer_id)))
        .map(cloneRow)
        .sort((a, b) => {
          const cmp = toTimestampMs(b.updated_at) - toTimestampMs(a.updated_at);
          return cmp !== 0 ? cmp : String(a.id).localeCompare(String(b.id));
        });
      return { rows, rowCount: rows.length };
    }

    if (/WHERE customer_id = \$1 AND \(game_id = \$2 OR lower\(btrim\(game_title\)\) = lower\(btrim\(\$3\)\)\)/i.test(sql)) {
      const cid = String(values[0] ?? '');
      const gid = String(values[1] ?? '');
      const title = String(values[2] ?? '').trim().toLowerCase();
      const rows = Array.from(this.state.game_accounts.values())
        .filter(
          (r) =>
            r.customer_id === cid &&
            (r.game_id === gid || String(r.game_title ?? '').trim().toLowerCase() === title),
        )
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE customer_id = \$1 AND game_id = \$2/i.test(sql)) {
      const cid = String(values[0] ?? '');
      const gid = String(values[1] ?? '');
      const rows = Array.from(this.state.game_accounts.values())
        .filter((r) => r.customer_id === cid && r.game_id === gid)
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE (?:ga\.)?id = \$1/i.test(sql)) {
      const row = this.state.game_accounts.get(String(values[0] ?? ''));
      if (!row) return { rows: [], rowCount: 0 };
      const out = /JOIN public\.game_catalog/i.test(sql)
        ? this.enrichGameAccountRow(row)
        : cloneRow(row);
      return { rows: [out], rowCount: 1 };
    }

    let rows = Array.from(this.state.game_accounts.values()).map((r) =>
      this.enrichGameAccountRow(r),
    );
    const cidMatch = /\bga\.customer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }
    const gidMatch = /\bga\.game_id = \$(\d+)/i.exec(sql);
    if (gidMatch) {
      const gid = String(values[Number.parseInt(gidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.game_id === gid);
    }
    const statusMatch = /\bga\.status = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const st = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }
    const reqTypeMatch = /\bga\.request_type = \$(\d+)/i.exec(sql);
    if (reqTypeMatch) {
      const rt = String(values[Number.parseInt(reqTypeMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.request_type === rt);
    }
    const searchMatch = /\bga\.game_title ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.game_title, pat) ||
          matchIlike(r.platform_name, pat) ||
          matchIlike(r.username, pat) ||
          matchIlike(r.customer_id, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    const sortDesc = /ORDER BY .* DESC/i.test(sql);
    let sortField = 'updated_at';
    if (/ORDER BY ga\.created_at/i.test(sql)) sortField = 'created_at';
    else if (/ORDER BY ga\.game_title/i.test(sql)) sortField = 'game_title';
    else if (/ORDER BY ga\.status/i.test(sql)) sortField = 'status';

    rows.sort((a, b) => {
      const cmp = compareValues(a[sortField], b[sortField]);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return String(a.id).localeCompare(String(b.id));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleTopupsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.topups\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        metadata: {},
        reviewer_id: null,
        reviewer_name: null,
        review_notes: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      this.state.topups.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.topups\b/i.test(sql)) {
      const id = String(values[0] ?? '');
      const row = this.state.topups.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      const setMatch = /\bSET\s+(.+?)\s+WHERE\b/i.exec(sql);
      if (setMatch) {
        const assignments = splitTopLevelCommas(setMatch[1]!);
        for (const assign of assignments) {
          const eqIdx = assign.indexOf('=');
          if (eqIdx === -1) continue;
          const col = assign.slice(0, eqIdx).trim();
          const expr = assign.slice(eqIdx + 1).trim();
          row[col] = evalSqlExpr(expr, values, nowIso, row);
        }
      }
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/SELECT COALESCE\(SUM\(amount\), 0\) AS total_completed FROM public\.topups/i.test(sql)) {
      const cid = String(values[0] ?? '');
      let sum = 0;
      for (const r of this.state.topups.values()) {
        if (
          r.customer_id === cid &&
          (r.status === 'completed' || r.status === 'approved') &&
          r.payment_method_id !== 'referral_bonus'
        ) {
          sum += Number(r.amount ?? 0);
        }
      }
      return { rows: [{ total_completed: sum.toFixed(2) }], rowCount: 1 };
    }

    if (/WHERE id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.topups.values())
        .filter((r) => ids.has(String(r.id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE customer_id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.topups.values())
        .filter((r) => ids.has(String(r.customer_id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.topups.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.topups.values()).map(cloneRow);
    const cidMatch = /\bcustomer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }
    if (/payment_method_id = 'referral_bonus'/i.test(sql)) {
      rows = rows.filter((r) => r.payment_method_id === 'referral_bonus');
    } else {
      const pmMatch = /\bpayment_method_id = \$(\d+)/i.exec(sql);
      if (pmMatch) {
        const pm = String(values[Number.parseInt(pmMatch[1]!, 10) - 1] ?? '');
        rows = rows.filter((r) => r.payment_method_id === pm);
      }
    }
    const statusMatch = /\bstatus = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const st = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }
    const searchMatch = /\bcustomer_name ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.customer_name, pat) ||
          matchIlike(r.id, pat) ||
          matchIlike(r.payment_method_name, pat) ||
          matchIlike(r.target_game_name, pat) ||
          matchIlike(r.provider_ref, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    const sortDesc = !/ORDER BY .* ASC/i.test(sql) || /ORDER BY .* DESC/i.test(sql);
    let sortField = 'created_at';
    if (/ORDER BY amount/i.test(sql)) sortField = 'amount';
    else if (/ORDER BY updated_at/i.test(sql)) sortField = 'updated_at';
    else if (/ORDER BY status/i.test(sql)) sortField = 'status';

    rows.sort((a, b) => {
      const cmp = compareValues(a[sortField], b[sortField]);
      if (cmp !== 0) return sortDesc ? -cmp : cmp;
      return String(b.id).localeCompare(String(a.id));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleWithdrawalsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.withdrawals\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        fee: '0.00',
        payout_details: {},
        reviewer_id: null,
        reviewer_name: null,
        review_notes: null,
        transaction_hash: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      this.state.withdrawals.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.withdrawals\b/i.test(sql)) {
      const id = String(values[0] ?? '');
      const row = this.state.withdrawals.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      const setMatch = /\bSET\s+(.+?)\s+WHERE\b/i.exec(sql);
      if (setMatch) {
        const assignments = splitTopLevelCommas(setMatch[1]!);
        for (const assign of assignments) {
          const eqIdx = assign.indexOf('=');
          if (eqIdx === -1) continue;
          const col = assign.slice(0, eqIdx).trim();
          const expr = assign.slice(eqIdx + 1).trim();
          row[col] = evalSqlExpr(expr, values, nowIso, row);
        }
      }
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/SELECT COALESCE\(SUM\(amount\), 0\) AS total_completed FROM public\.withdrawals/i.test(sql)) {
      const cid = String(values[0] ?? '');
      let sum = 0;
      for (const r of this.state.withdrawals.values()) {
        if (r.customer_id === cid && r.status === 'completed') {
          sum += Number(r.amount ?? 0);
        }
      }
      return { rows: [{ total_completed: sum.toFixed(2) }], rowCount: 1 };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.withdrawals.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.withdrawals.values()).map(cloneRow);
    const cidMatch = /\bcustomer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }
    const statusMatch = /\bstatus = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const st = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }
    const searchMatch = /\bcustomer_name ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.customer_name, pat) ||
          matchIlike(r.id, pat) ||
          matchIlike(r.payout_method_name, pat) ||
          matchIlike(r.transaction_hash, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    rows.sort((a, b) => {
      const cmp = toTimestampMs(b.created_at) - toTimestampMs(a.created_at);
      return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
    });
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleReferralAwardsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.referral_awards\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        qualifying_deposit_id: null,
        qualifying_deposit_amount: '0.00',
        fraud_flags: [],
        staff_reason: null,
        assigned_by: null,
        assigned_by_name: null,
        reviewed_by: null,
        reviewed_by_name: null,
        review_notes: null,
        rewarded_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const id = String(row.id);
      const existing = this.state.referral_awards.get(id);
      if (existing && /ON CONFLICT \(id\) DO UPDATE/i.test(sql)) {
        const merged: Row = { ...existing, ...row };
        merged.created_at = existing.created_at;
        merged.qualifying_deposit_amount = Math.max(
          Number(existing.qualifying_deposit_amount ?? 0),
          Number(row.qualifying_deposit_amount ?? 0),
        );
        merged.rewarded_at = existing.rewarded_at ?? row.rewarded_at;
        merged.updated_at = nowIso;
        this.state.referral_awards.set(id, merged);
        return { rows: [cloneRow(merged)], rowCount: 1 };
      }
      this.state.referral_awards.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.referral_awards\b/i.test(sql)) {
      const id = String(values[0] ?? '');
      const row = this.state.referral_awards.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      if (/SET status = 'rewarded', rewarded_at/i.test(sql)) {
        row.status = 'rewarded';
        row.rewarded_at = row.rewarded_at ?? nowIso;
      } else if (/SET status = 'rewarded', payout_target/i.test(sql)) {
        row.status = 'rewarded';
        row.payout_target = values[1];
        row.referrer_reward_amount = values[2];
        row.referee_reward_amount = values[3];
        if (values[4] !== null && values[4] !== undefined) {
          row.qualifying_deposit_id = values[4];
        }
        row.qualifying_deposit_amount = Math.max(
          Number(row.qualifying_deposit_amount ?? 0),
          Number(values[5] ?? 0),
        );
        row.rewarded_at = row.rewarded_at ?? nowIso;
      } else if (/SET status = 'rejected'/i.test(sql)) {
        row.status = 'rejected';
        row.reviewed_by = values[1];
        row.reviewed_by_name = values[2];
        row.review_notes = values[3];
      } else if (/SET qualifying_deposit_amount = \$2/i.test(sql)) {
        row.qualifying_deposit_amount = values[1];
        row.qualifying_deposit_id = values[2];
      }
      row.updated_at = nowIso;
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/WHERE referrer_id = ANY\(\$1::text\[\]\) OR referee_id = ANY\(\$1::text\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.referral_awards.values())
        .filter((r) => ids.has(String(r.referrer_id)) || ids.has(String(r.referee_id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.referral_awards.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (/WHERE referee_id = \$1/i.test(sql)) {
      const rid = String(values[0] ?? '');
      const rows = Array.from(this.state.referral_awards.values())
        .filter((r) => r.referee_id === rid)
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    let rows = Array.from(this.state.referral_awards.values()).map(cloneRow);
    const referrerMatch = /\breferrer_id = \$(\d+)/i.exec(sql);
    if (referrerMatch) {
      const val = String(values[Number.parseInt(referrerMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.referrer_id === val);
    }
    const statusMatch = /\bstatus = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const st = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }

    rows.sort((a, b) => toTimestampMs(b.created_at) - toTimestampMs(a.created_at));
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleWheelSpinsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.wheel_spins\b/i.test(sql)) {
      const row: Row = {
        id: values[0],
        customer_id: values[1],
        segment_id: values[2],
        segment_label: values[3],
        reward_amount: values[4],
        simulated_win_amount: values[5],
        probability_weight: values[6],
        idempotency_key: values[7] ?? null,
        tx_id: values[8] ?? null,
        status: 'completed',
        created_at: values[9] ? toIso(values[9], nowIso) : nowIso,
      };
      this.state.wheel_spins.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    const cid = String(values[0] ?? '');
    if (/AND idempotency_key = \$2/i.test(sql)) {
      const key = String(values[1] ?? '');
      for (const r of this.state.wheel_spins.values()) {
        if (r.customer_id === cid && r.idempotency_key === key) {
          return { rows: [cloneRow(r)], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    let rows = Array.from(this.state.wheel_spins.values())
      .filter((r) => r.customer_id === cid)
      .map(cloneRow);
    if (/AND status = 'completed'/i.test(sql)) {
      rows = rows.filter((r) => r.status === 'completed');
    }
    rows.sort((a, b) => toTimestampMs(b.created_at) - toTimestampMs(a.created_at));
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleOfficialPartnersQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/SELECT COALESCE\(MAX\(sort_order\), -1\) AS max_sort_order/i.test(sql)) {
      let maxOrder = -1;
      for (const r of this.state.official_partners.values()) {
        maxOrder = Math.max(maxOrder, Number(r.sort_order ?? 0));
      }
      return { rows: [{ max_sort_order: maxOrder }], rowCount: 1 };
    }

    if (/^INSERT INTO public\.official_partners\b/i.test(sql)) {
      const row: Row = {
        id: String(values[0] || crypto.randomUUID()),
        name: values[1],
        icon_url: values[2] ?? null,
        platform: values[3],
        page_url: values[4],
        message_link: values[5] ?? null,
        game_id: values[6] ?? null,
        note: values[7] ?? null,
        is_visible: Boolean(values[8]),
        sort_order: Number(values[9] ?? 0),
        updated_by: values[10] ?? null,
        updated_at: values[11] ? toIso(values[11], nowIso) : nowIso,
      };
      this.state.official_partners.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.official_partners\b/i.test(sql)) {
      const id = String(values[0] ?? '');
      const row = this.state.official_partners.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      if (/SET sort_order = \$2/i.test(sql)) {
        row.sort_order = Number(values[1]);
        row.updated_by = values[2];
        row.updated_at = toIso(values[3], nowIso);
        return { rows: [], rowCount: 1 };
      }
      row.name = values[1];
      row.icon_url = values[2] ?? null;
      row.platform = values[3];
      row.page_url = values[4];
      row.message_link = values[5] ?? null;
      row.game_id = values[6] ?? null;
      row.note = values[7] ?? null;
      row.is_visible = Boolean(values[8]);
      row.updated_by = values[9];
      row.updated_at = toIso(values[10], nowIso);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^DELETE FROM public\.official_partners WHERE id = \$1/i.test(sql)) {
      const existed = this.state.official_partners.delete(String(values[0] ?? ''));
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (/WHERE id = ANY\(\$1::uuid\[\]\)/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const rows = Array.from(this.state.official_partners.values())
        .filter((r) => ids.has(String(r.id)))
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.official_partners.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.official_partners.values()).map(cloneRow);
    if (/\bis_visible = true\b/i.test(sql)) {
      rows = rows.filter((r) => Boolean(r.is_visible));
    }
    const platMatch = /\bplatform = \$(\d+)/i.exec(sql);
    if (platMatch) {
      const p = String(values[Number.parseInt(platMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.platform === p);
    }
    const gidMatch = /\bgame_id = \$(\d+)/i.exec(sql);
    if (gidMatch) {
      const gid = String(values[Number.parseInt(gidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.game_id === gid);
    }
    const searchMatch = /\bname ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.name, pat) ||
          matchIlike(r.note, pat) ||
          matchIlike(r.platform, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    rows.sort((a, b) => {
      const ord = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      if (ord !== 0) return ord;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleOfficialPartnerIconsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.official_partner_icons\b/i.test(sql)) {
      const row: Row = {
        id: values[0],
        content_type: values[1],
        image_data: values[2],
        size_bytes: Number(values[3] ?? 0),
        created_by: values[4] ?? null,
        created_at: values[5] ? toIso(values[5], nowIso) : nowIso,
      };
      this.state.official_partner_icons.set(String(row.id), row);
      return { rows: [], rowCount: 1 };
    }
    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.official_partner_icons.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  private handleNotificationsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.notifications\b/i.test(sql)) {
      const id = String(values[0]);
      if (this.state.notifications.has(id) && /ON CONFLICT \(id\) DO NOTHING/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      const row: Row = {
        id,
        user_id: values[1],
        title: values[2],
        message: values[3],
        type: values[4],
        is_read: false,
        link_tab: values[5] ?? null,
        link_request_id: values[6] ?? null,
        created_at: nowIso,
      };
      this.state.notifications.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.notifications\b/i.test(sql)) {
      if (/WHERE id = \$1 AND user_id = \$2/i.test(sql)) {
        const row = this.state.notifications.get(String(values[0] ?? ''));
        if (!row || row.user_id !== values[1]) return { rows: [], rowCount: 0 };
        row.is_read = true;
        return { rows: [cloneRow(row)], rowCount: 1 };
      }
      const uid = String(values[0] ?? '');
      let count = 0;
      for (const r of this.state.notifications.values()) {
        if (r.user_id === uid && !r.is_read) {
          r.is_read = true;
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (/SELECT COUNT\(\*\)::int AS unread_count/i.test(sql)) {
      const uid = String(values[0] ?? '');
      let unread = 0;
      for (const r of this.state.notifications.values()) {
        if (r.user_id === uid && !r.is_read) unread += 1;
      }
      return { rows: [{ unread_count: unread }], rowCount: 1 };
    }

    if (/WHERE id = \$1 LIMIT 1/i.test(sql)) {
      const row = this.state.notifications.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.notifications.values()).map(cloneRow);
    const uidMatch = /\buser_id = \$(\d+)/i.exec(sql);
    if (uidMatch) {
      const uid = String(values[Number.parseInt(uidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.user_id === uid);
    }
    if (/\bis_read = false\b/i.test(sql)) {
      rows = rows.filter((r) => !r.is_read);
    }
    if (/type = \$2 AND title = \$3 AND link_request_id = \$4/i.test(sql)) {
      rows = rows.filter(
        (r) =>
          r.type === values[1] &&
          r.title === values[2] &&
          r.link_request_id === values[3],
      );
    } else if (/type = \$2 AND title = \$3 AND message = \$4/i.test(sql)) {
      const cutoff = Date.now() - 15_000;
      rows = rows.filter(
        (r) =>
          r.type === values[1] &&
          r.title === values[2] &&
          r.message === values[3] &&
          toTimestampMs(r.created_at) >= cutoff,
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    rows.sort((a, b) => toTimestampMs(b.created_at) - toTimestampMs(a.created_at));
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handlePushSubscriptionsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.push_subscriptions\b/i.test(sql)) {
      const endpoint = String(values[1] ?? '');
      let existing: Row | undefined;
      for (const r of this.state.push_subscriptions.values()) {
        if (r.endpoint === endpoint) {
          existing = r;
          break;
        }
      }
      const row: Row = {
        id: values[0],
        endpoint,
        user_id: values[2],
        user_email: values[3],
        user_role: values[4],
        p256dh: values[5],
        auth: values[6],
        expiration_time: values[7] ?? null,
        platform: values[8] ?? null,
        browser: values[9] ?? null,
        active: true,
        created_at:
          existing && existing.user_id === values[2] ? existing.created_at : nowIso,
        updated_at: nowIso,
      };
      if (existing) {
        this.state.push_subscriptions.delete(String(existing.endpoint));
      }
      this.state.push_subscriptions.set(endpoint, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^DELETE FROM public\.push_subscriptions\b/i.test(sql)) {
      if (/WHERE endpoint = \$1 AND user_id = \$2/i.test(sql)) {
        const endpoint = String(values[0] ?? '');
        const existing = this.state.push_subscriptions.get(endpoint);
        if (existing && existing.user_id === values[1]) {
          this.state.push_subscriptions.delete(endpoint);
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (/WHERE user_id = \$1/i.test(sql)) {
        const uid = String(values[0] ?? '');
        let count = 0;
        for (const [k, r] of this.state.push_subscriptions.entries()) {
          if (r.user_id === uid) {
            this.state.push_subscriptions.delete(k);
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }
      if (/WHERE endpoint = ANY\(\$1::text\[\]\)/i.test(sql)) {
        const endpoints = new Set(parseSqlArray(values[0]));
        let count = 0;
        for (const ep of endpoints) {
          if (this.state.push_subscriptions.delete(ep)) count += 1;
        }
        return { rows: [], rowCount: count };
      }
    }

    let rows = Array.from(this.state.push_subscriptions.values()).map(cloneRow);
    if (/active = true/i.test(sql)) {
      rows = rows.filter((r) => Boolean(r.active));
    }
    if (/user_role IN \('agent', 'admin'\)/i.test(sql)) {
      const excl = values[0] ? String(values[0]) : null;
      rows = rows.filter(
        (r) =>
          (r.user_role === 'agent' || r.user_role === 'admin') &&
          (!excl || r.user_id !== excl),
      );
    } else if (/WHERE active = true AND user_id = \$1 AND \(\$2::text IS NULL OR user_id <> \$2\)/i.test(sql)) {
      const uid = String(values[0] ?? '');
      const excl = values[1] ? String(values[1]) : null;
      rows = rows.filter((r) => r.user_id === uid && (!excl || r.user_id !== excl));
    } else if (/WHERE user_id = \$1/i.test(sql)) {
      const uid = String(values[0] ?? '');
      rows = rows.filter((r) => r.user_id === uid);
    }

    rows.sort((a, b) => toTimestampMs(b.updated_at) - toTimestampMs(a.updated_at));
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleConversationsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.conversations\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        agent_id: null,
        agent_name: null,
        status: 'open',
        last_message: '',
        last_message_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const id = String(row.id);
      const existing = this.state.conversations.get(id);
      if (existing && /ON CONFLICT \(id\) DO UPDATE/i.test(sql)) {
        if (row.customer_name) existing.customer_name = row.customer_name;
        const preserveLastMessage =
          cols.length >= 8 && Boolean(values[8]);
        if (!preserveLastMessage && row.last_message !== undefined) {
          existing.last_message = row.last_message;
          existing.last_message_at = row.last_message_at;
        }
        if (/status = 'open'/i.test(sql)) {
          existing.status = 'open';
        }
        existing.updated_at = nowIso;
        return { rows: [cloneRow(existing)], rowCount: 1 };
      }
      this.state.conversations.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.conversations\b/i.test(sql)) {
      const ids = new Set(parseSqlArray(values[0]));
      const status = values[1];
      const updated: Row[] = [];
      for (const r of this.state.conversations.values()) {
        if (ids.has(String(r.id))) {
          r.status = status;
          r.updated_at = nowIso;
          updated.push(cloneRow(r));
        }
      }
      return { rows: updated, rowCount: updated.length };
    }

    if (/WHERE customer_id = \$1 OR id = \$2/i.test(sql)) {
      const cid = String(values[0] ?? '');
      const id = String(values[1] ?? '');
      const rows = Array.from(this.state.conversations.values())
        .filter((r) => r.customer_id === cid || r.id === id)
        .map(cloneRow);
      return { rows, rowCount: rows.length };
    }

    if (/WHERE (?:c\.)?id = \$1/i.test(sql)) {
      const row = this.state.conversations.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows: Row[] = Array.from(this.state.conversations.values()).map((c): Row => {
      const u = this.state.users.get(String(c.customer_id));
      return {
        ...cloneRow(c),
        customer_name:
          u && String(u.display_name ?? '').trim()
            ? String(u.display_name).trim()
            : c.customer_name,
        customer_email: u?.email ?? null,
        customer_role: u?.role ?? 'customer',
      };
    });

    if (/COALESCE\(u\.role, 'customer'\) = 'customer'/i.test(sql)) {
      rows = rows.filter((r) => r.customer_role === 'customer');
    }
    const cidMatch = /\bc\.customer_id = \$(\d+)/i.exec(sql);
    if (cidMatch) {
      const cid = String(values[Number.parseInt(cidMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }
    const statusMatch = /\bc\.status = \$(\d+)/i.exec(sql);
    if (statusMatch) {
      const st = String(values[Number.parseInt(statusMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }
    const searchMatch = /\bc\.customer_name ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.customer_name, pat) ||
          matchIlike(r.customer_email, pat) ||
          matchIlike(r.last_message, pat),
      );
    }

    if (/SELECT COUNT\(\*\)::int AS total/i.test(sql)) {
      return { rows: [{ total: rows.length }], rowCount: 1 };
    }

    rows.sort((a, b) => {
      const cmp = toTimestampMs(b.last_message_at) - toTimestampMs(a.last_message_at);
      return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
    });
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleMessagesQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.messages\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        attachment_url: null,
        attachment_name: null,
        transaction_data: null,
        is_internal_note: false,
        created_at: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      const id = String(row.id);
      if (this.state.messages.has(id) && /ON CONFLICT \(id\) DO NOTHING/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      this.state.messages.set(id, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/^UPDATE public\.messages SET transaction_data = \$2::jsonb WHERE id = \$1/i.test(sql)) {
      const row = this.state.messages.get(String(values[0] ?? ''));
      if (!row) return { rows: [], rowCount: 0 };
      row.transaction_data = parseJsonValue(values[1]);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/WHERE id = \$1 LIMIT 1/i.test(sql)) {
      const row = this.state.messages.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    let rows = Array.from(this.state.messages.values()).map(cloneRow);

    if (/transaction_data IS NOT NULL AND transaction_data->>'requestId' = \$1/i.test(sql)) {
      const reqId = String(values[0] ?? '');
      rows = rows.filter((r) => {
        const td = r.transaction_data as Record<string, unknown> | null;
        return td && typeof td === 'object' && String(td.requestId ?? '') === reqId;
      });
      if (/conversation_id = ANY\(\$2::text\[\]\)/i.test(sql)) {
        const convIds = new Set(parseSqlArray(values[1]));
        rows = rows.filter((r) => convIds.has(String(r.conversation_id)));
      }
      rows.sort((a, b) => toTimestampMs(b.created_at) - toTimestampMs(a.created_at));
      const { limit } = extractLimitOffset(sql, values);
      return { rows: rows.slice(0, limit), rowCount: Math.min(rows.length, limit) };
    }

    const anyConvMatch = /\bconversation_id = ANY\(\$(\d+)::text\[\]\)/i.exec(sql);
    if (anyConvMatch) {
      const convIds = new Set(parseSqlArray(values[Number.parseInt(anyConvMatch[1]!, 10) - 1]));
      rows = rows.filter((r) => convIds.has(String(r.conversation_id)));
    } else {
      const convMatch = /\bconversation_id = \$(\d+)/i.exec(sql);
      if (convMatch) {
        const cid = String(values[Number.parseInt(convMatch[1]!, 10) - 1] ?? '');
        rows = rows.filter((r) => r.conversation_id === cid);
      }
    }

    if (/is_internal_note = false/i.test(sql)) {
      rows = rows.filter((r) => !r.is_internal_note);
    }

    const afterMatch = /\bcreated_at > \$(\d+)/i.exec(sql);
    if (afterMatch) {
      const ts = toTimestampMs(values[Number.parseInt(afterMatch[1]!, 10) - 1]);
      rows = rows.filter((r) => toTimestampMs(r.created_at) > ts);
    }
    const beforeMatch = /\bcreated_at < \$(\d+)/i.exec(sql);
    if (beforeMatch) {
      const ts = toTimestampMs(values[Number.parseInt(beforeMatch[1]!, 10) - 1]);
      rows = rows.filter((r) => toTimestampMs(r.created_at) < ts);
    }

    const asc = /ORDER BY created_at ASC/i.test(sql);
    rows.sort((a, b) => {
      const cmp = toTimestampMs(a.created_at) - toTimestampMs(b.created_at);
      if (cmp !== 0) return asc ? cmp : -cmp;
      return asc
        ? String(a.id).localeCompare(String(b.id))
        : String(b.id).localeCompare(String(a.id));
    });

    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }

  private handleChatAttachmentsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.chat_attachments\b/i.test(sql)) {
      const row: Row = {
        id: values[0],
        conversation_id: values[1],
        customer_id: values[2],
        uploaded_by: values[3],
        content_type: values[4],
        original_name: values[5],
        image_data: values[6],
        size_bytes: Number(values[7] ?? 0),
        created_at: nowIso,
      };
      this.state.chat_attachments.set(String(row.id), row);
      return { rows: [], rowCount: 1 };
    }
    if (/WHERE id = \$1/i.test(sql)) {
      const row = this.state.chat_attachments.get(String(values[0] ?? ''));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  private handleStorageObjectsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    const keyFor = (bucket: unknown, objectPath: unknown): string =>
      `${String(bucket ?? '')}::${String(objectPath ?? '')}`;

    if (/^INSERT INTO public\.storage_objects\b/i.test(sql)) {
      const key = keyFor(values[0], values[1]);
      const existing = this.state.storage_objects.get(key);
      const row: Row = {
        bucket: values[0],
        object_path: values[1],
        owner_user_id: values[2] ?? null,
        uploaded_by: values[3],
        is_public: Boolean(values[4]),
        content_type: values[5],
        image_data: values[6],
        size_bytes: Number(values[7] ?? 0),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      };
      this.state.storage_objects.set(key, row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    if (/WHERE bucket = \$1 AND object_path = \$2/i.test(sql)) {
      const row = this.state.storage_objects.get(keyFor(values[0], values[1]));
      return { rows: row ? [cloneRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  }

  private handleAuditLogsQuery(
    sql: string,
    values: unknown[],
    nowIso: string,
  ): QueryResult {
    if (/^INSERT INTO public\.audit_logs\b/i.test(sql)) {
      const cols = parseInsertColumns(sql);
      const valSection = /\bVALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i.exec(sql);
      const exprs = valSection ? splitTopLevelCommas(valSection[1]!) : [];
      const row: Row = {
        timestamp: nowIso,
      };
      cols.forEach((col, idx) => {
        if (idx < exprs.length) {
          row[col] = evalSqlExpr(exprs[idx]!, values, nowIso);
        }
      });
      this.state.audit_logs.set(String(row.id), row);
      return { rows: [cloneRow(row)], rowCount: 1 };
    }

    let rows = Array.from(this.state.audit_logs.values()).map(cloneRow);
    const entMatch = /\bentity_type = \$(\d+)/i.exec(sql);
    if (entMatch) {
      const et = String(values[Number.parseInt(entMatch[1]!, 10) - 1] ?? '');
      rows = rows.filter((r) => r.entity_type === et);
    }
    const beforeMatch = /\btimestamp < \$(\d+)/i.exec(sql);
    if (beforeMatch) {
      const ts = toTimestampMs(values[Number.parseInt(beforeMatch[1]!, 10) - 1]);
      rows = rows.filter((r) => toTimestampMs(r.timestamp) < ts);
    }
    const fromMatch = /\btimestamp >= \$(\d+)/i.exec(sql);
    if (fromMatch) {
      const ts = toTimestampMs(values[Number.parseInt(fromMatch[1]!, 10) - 1]);
      rows = rows.filter((r) => toTimestampMs(r.timestamp) >= ts);
    }
    const toMatch = /\btimestamp <= \$(\d+)/i.exec(sql);
    if (toMatch) {
      const ts = toTimestampMs(values[Number.parseInt(toMatch[1]!, 10) - 1]);
      rows = rows.filter((r) => toTimestampMs(r.timestamp) <= ts);
    }
    const searchMatch = /\baction ILIKE \$(\d+)/i.exec(sql);
    if (searchMatch) {
      const pat = values[Number.parseInt(searchMatch[1]!, 10) - 1];
      rows = rows.filter(
        (r) =>
          matchIlike(r.action, pat) ||
          matchIlike(r.actor_name, pat) ||
          matchIlike(r.entity_id, pat) ||
          matchIlike(r.details, pat),
      );
    }

    rows.sort((a, b) => {
      const cmp = toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
      return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
    });
    const { limit, offset } = extractLimitOffset(sql, values);
    const sliced = rows.slice(offset, offset + limit);
    return { rows: sliced, rowCount: sliced.length };
  }
}
