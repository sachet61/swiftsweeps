import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGameAccountsQueryUrl,
  deduplicateGameAccountsList,
  mapServerGameAccountRow,
  mergeGameAccounts,
  parseGameAccountApiError,
} from './gameAccountUtils.ts';
import type { GameAccount } from '../types/index.ts';

test('mapServerGameAccountRow maps canonical DTO and snake_case rows preserving money precision', () => {
  const dto = mapServerGameAccountRow({
    id: 'ga_1',
    customerId: 'cust_1',
    gameCatalogId: 'gc_firekirin',
    gameName: 'Fire Kirin',
    platformName: 'Sweepstakes',
    username: 'fk_alice',
    password: 'Secret#123',
    gameUrl: 'https://play.example.com/fk',
    status: 'active',
    balance: 42.349,
    freePlayBalance: 5.5,
    notes: 'VIP pin',
    assignedByAgentId: 'admin_1',
    assignedByAgentName: 'Admin',
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T01:00:00.000Z',
  });

  assert.equal(dto.id, 'ga_1');
  assert.equal(dto.customerId, 'cust_1');
  assert.equal(dto.gameCatalogId, 'gc_firekirin');
  assert.equal(dto.balance, 42.35);
  assert.equal(dto.freePlayBalance, 5.5);
  assert.equal(dto.notes, 'VIP pin');

  const legacy = mapServerGameAccountRow({
    id: 'ga_2',
    customer_id: 'cust_2',
    game_id: 'gc_juwa',
    game_title: 'Juwa',
    username: 'Pending Assignment',
    password: '',
    pin: 'Requested ID',
    status: 'pending_assignment',
    balance: '10.20',
    free_play_balance: '0.00',
    request_type: 'new_id_request',
    created_at: '2026-11-26T02:00:00.000Z',
    updated_at: '2026-11-26T02:00:00.000Z',
  });

  assert.equal(legacy.gameCatalogId, 'gc_juwa');
  assert.equal(legacy.status, 'pending_assignment');
  assert.equal(legacy.requestType, 'new_id_request');
  assert.equal(legacy.notes, 'Requested ID');
  assert.equal(legacy.balance, 10.2);
});

test('deduplicateGameAccountsList enforces 1 ID per game per customer and merges balances', () => {
  const dupes: GameAccount[] = [
    {
      id: 'ga_pending',
      customerId: 'cust_1',
      gameCatalogId: 'gc_juwa',
      gameName: 'Juwa',
      platformName: 'Sweepstakes',
      username: 'Pending Assignment',
      gameUrl: '',
      status: 'pending_assignment',
      balance: 5.0,
      freePlayBalance: 1.0,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    },
    {
      id: 'ga_active',
      customerId: 'cust_1',
      gameCatalogId: 'gc_juwa',
      gameName: 'Juwa',
      platformName: 'Sweepstakes',
      username: 'juwa_alice',
      password: 'Pass#123',
      gameUrl: 'https://juwa.example.com',
      status: 'active',
      balance: 20.5,
      freePlayBalance: 2.5,
      createdAt: '2026-11-26T01:00:00.000Z',
      updatedAt: '2026-11-26T01:00:00.000Z',
    },
  ];

  const cleaned = deduplicateGameAccountsList(dupes);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0]!.username, 'juwa_alice');
  assert.equal(cleaned[0]!.status, 'active');
  assert.equal(cleaned[0]!.balance, 25.5);
  assert.equal(cleaned[0]!.freePlayBalance, 3.5);
});

test('mergeGameAccounts supports replaceAll, incremental upsert, and removals', () => {
  const existing: GameAccount[] = [
    {
      id: 'ga_1',
      customerId: 'cust_1',
      gameCatalogId: 'gc_1',
      gameName: 'Game 1',
      platformName: 'Sweepstakes',
      username: 'u1',
      gameUrl: '',
      status: 'active',
      balance: 10,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    },
    {
      id: 'ga_2',
      customerId: 'cust_1',
      gameCatalogId: 'gc_2',
      gameName: 'Game 2',
      platformName: 'Sweepstakes',
      username: 'u2',
      gameUrl: '',
      status: 'active',
      balance: 0,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    },
  ];

  const afterRemove = mergeGameAccounts(existing, [], false, ['ga_2']);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0]!.id, 'ga_1');

  const replaced = mergeGameAccounts(
    existing,
    [
      {
        id: 'ga_3',
        customerId: 'cust_1',
        gameCatalogId: 'gc_3',
        gameName: 'Game 3',
        platformName: 'Sweepstakes',
        username: 'u3',
        status: 'active',
        balance: 0,
        createdAt: '2026-11-26T02:00:00.000Z',
        updatedAt: '2026-11-26T02:00:00.000Z',
      },
    ],
    true,
  );
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]!.id, 'ga_3');
});

test('buildGameAccountsQueryUrl and parseGameAccountApiError handle options and non-HTML errors cleanly', () => {
  assert.equal(buildGameAccountsQueryUrl(), '/api/game-accounts');
  assert.equal(
    buildGameAccountsQueryUrl({
      customerId: 'cust_1',
      status: 'pending_assignment',
      limit: 25,
      offset: 50,
    }),
    '/api/game-accounts?customerId=cust_1&status=pending_assignment&limit=25&offset=50',
  );

  assert.equal(
    parseGameAccountApiError(
      409,
      JSON.stringify({ code: 'GAME_ACCOUNT_CONFLICT', message: 'Already queued.' }),
      'Fallback',
    ),
    'Already queued.',
  );
  assert.equal(
    parseGameAccountApiError(403, '<html>forbidden</html>', 'Fallback'),
    'You do not have permission to perform this game account action.',
  );
});
