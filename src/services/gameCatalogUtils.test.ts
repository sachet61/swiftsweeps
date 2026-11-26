import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameAccount, GameCatalogItem } from '../types';
import {
  applyGameCatalogRealtimeEvents,
  applyServerGameCatalogResponse,
  countUnsavedCatalogChanges,
  filterEnabledGameAccounts,
  filterEnabledGames,
  mapDbRowToGameCatalogItem,
  mapGameCatalogItemToDbRow,
  mergeCatalogFromServerRows,
  parseGameCatalogApiError,
} from './gameCatalogUtils.ts';

const SAMPLE_SEED: GameCatalogItem[] = [
  {
    id: 'gc_firekirin',
    title: 'Fire Kirin',
    platform: 'Fire Kirin Online',
    gameUrl: 'http://start.firekirin.xyz:8580/index.html',
    downloadUrl: 'http://start.firekirin.xyz:8580/index.html',
    links: [
      { label: 'Web Play', url: 'http://start.firekirin.xyz:8580/index.html' },
      { label: 'Download Link', url: 'http://start.firekirin.xyz:8580/index.html' },
    ],
    description: 'Fish arcade battles',
    imageUrl: '/images/games/firekirin-v2.webp',
    iconUrl: '/images/games/firekirin-v2.webp',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'gc_juwa',
    title: 'Juwa',
    platform: 'Juwa777',
    gameUrl: 'https://dl.juwa777.com/',
    downloadUrl: 'https://dl.juwa777.com/',
    links: [{ label: 'Web Play', url: 'https://dl.juwa777.com/' }],
    description: 'Fish table arenas',
    imageUrl: '/images/games/juwa-v2.webp',
    iconUrl: '/images/games/juwa-v2.webp',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
];

test('mapGameCatalogItemToDbRow emits verified Supabase columns and omits invalid keys', () => {
  const row = mapGameCatalogItemToDbRow({
    ...SAMPLE_SEED[1],
    enabled: false,
  });

  assert.equal(row.id, 'gc_juwa');
  assert.equal(row.category, 'Juwa777');
  assert.equal(row.is_active, false);
  assert.equal('platform' in row, false);
  assert.equal('enabled' in row, false);
});

test('mapDbRowToGameCatalogItem maps is_active=false to enabled=false and preserves seed or API links', () => {
  const mapped = mapDbRowToGameCatalogItem(
    {
      id: 'gc_juwa',
      title: 'Juwa',
      category: 'Juwa777',
      description: 'Updated description',
      is_active: false,
      icon_url: '/images/games/juwa-v2.webp',
      image_url: '/images/games/juwa-v2.webp',
      created_at: '2026-01-01T00:00:00Z',
    },
    SAMPLE_SEED
  );

  assert.equal(mapped.enabled, false);
  assert.equal(mapped.platform, 'Juwa777');
  assert.equal(mapped.gameUrl, 'https://dl.juwa777.com/');
  assert.equal(mapped.links?.length, 1);

  const apiMapped = mapDbRowToGameCatalogItem(
    {
      id: 'gc_custom',
      title: 'Custom Sweeps',
      platform: 'Custom',
      enabled: true,
      iconUrl: '/images/games/juwa-v2.webp',
      gameUrl: 'https://custom.example.com/play',
      downloadUrl: 'https://custom.example.com/download',
      links: [
        { label: 'Web Play', url: 'https://custom.example.com/play' },
        { label: 'Android APK', url: 'https://custom.example.com/download' },
      ],
    },
    SAMPLE_SEED
  );

  assert.equal(apiMapped.gameUrl, 'https://custom.example.com/play');
  assert.equal(apiMapped.downloadUrl, 'https://custom.example.com/download');
  assert.equal(apiMapped.links?.length, 2);
});

test('mergeCatalogFromServerRows and applyGameCatalogRealtimeEvents sync disabled state across sessions', () => {
  const merged = mergeCatalogFromServerRows(
    [
      { id: 'gc_firekirin', title: 'Fire Kirin', category: 'Fire Kirin Online', is_active: true },
      { id: 'gc_juwa', title: 'Juwa', category: 'Juwa777', is_active: false },
    ],
    SAMPLE_SEED
  );
  assert.equal(merged[0].enabled, true);
  assert.equal(merged[1].enabled, false);

  const afterRealtime = applyGameCatalogRealtimeEvents(
    merged,
    [
      {
        eventType: 'UPDATE',
        newRow: { id: 'gc_firekirin', title: 'Fire Kirin', category: 'Fire Kirin Online', is_active: false },
      },
      { eventType: 'DELETE', oldRow: { id: 'gc_juwa' } },
    ],
    SAMPLE_SEED
  );
  assert.equal(afterRealtime.length, 1);
  assert.equal(afterRealtime[0].id, 'gc_firekirin');
  assert.equal(afterRealtime[0].enabled, false);
});

test('applyServerGameCatalogResponse clears catalog when populated DB has 0 active games and keeps fallback when unpopulated', () => {
  const cleared = applyServerGameCatalogResponse({
    games: [],
    catalogPopulated: true,
    fallbackSeedCatalog: SAMPLE_SEED,
    existingCatalog: SAMPLE_SEED,
  });
  assert.deepEqual(cleared, []);

  const kept = applyServerGameCatalogResponse({
    games: [],
    catalogPopulated: false,
    fallbackSeedCatalog: SAMPLE_SEED,
    existingCatalog: SAMPLE_SEED,
  });
  assert.equal(kept.length, 2);
});

test('parseGameCatalogApiError extracts JSON messages and hides HTML error pages', () => {
  assert.equal(
    parseGameCatalogApiError(403, JSON.stringify({ message: 'Forbidden action' }), 'Fallback'),
    'Forbidden action'
  );
  assert.equal(
    parseGameCatalogApiError(503, '<!DOCTYPE html><html><body>Bad Gateway</body></html>', 'Fallback'),
    'Game catalog API is temporarily unavailable.'
  );
});

test('filterEnabledGames and filterEnabledGameAccounts exclude disabled games cleanly', () => {
  const catalog: GameCatalogItem[] = [
    { ...SAMPLE_SEED[0], enabled: true },
    { ...SAMPLE_SEED[1], enabled: false },
  ];
  const visible = filterEnabledGames(catalog);
  assert.deepEqual(
    visible.map((g) => g.id),
    ['gc_firekirin']
  );

  const accounts: GameAccount[] = [
    {
      id: 'ga_1',
      customerId: 'u1',
      gameCatalogId: 'gc_firekirin',
      gameName: 'Fire Kirin',
      username: 'user1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ga_2',
      customerId: 'u1',
      gameCatalogId: 'gc_juwa',
      gameName: 'Juwa',
      username: 'user2',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];
  const filteredAccounts = filterEnabledGameAccounts(accounts, catalog);
  assert.deepEqual(
    filteredAccounts.map((a) => a.id),
    ['ga_1']
  );
});

test('countUnsavedCatalogChanges detects enabled/disabled toggles', () => {
  const persisted = SAMPLE_SEED;
  const draft = [{ ...SAMPLE_SEED[0], enabled: false }, SAMPLE_SEED[1]];
  assert.equal(countUnsavedCatalogChanges(persisted, persisted), 0);
  assert.equal(countUnsavedCatalogChanges(draft, persisted), 1);
});
