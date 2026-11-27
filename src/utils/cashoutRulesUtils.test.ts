import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CASHOUT_RULES_CONFIG,
  normalizeCashoutRulesConfig,
  computeCashoutRulesVersion,
  formatCashoutRulesMessage,
  deriveConversationPinStatus,
} from './cashoutRulesUtils';
import {
  DEFAULT_CASHOUT_RULES_CONFIG as SERVER_DEFAULT_CASHOUT_RULES_CONFIG,
  computeCashoutRulesVersion as serverComputeCashoutRulesVersion,
  formatCashoutRulesMessage as serverFormatCashoutRulesMessage,
} from '../../server/appConfig/cashoutRules';

test('DEFAULT_CASHOUT_RULES_CONFIG matches all 5 reference tiers and excess warning accurately', () => {
  assert.equal(DEFAULT_CASHOUT_RULES_CONFIG.enabled, true);
  assert.equal(DEFAULT_CASHOUT_RULES_CONFIG.categories.length, 5);

  const byId = new Map(
    DEFAULT_CASHOUT_RULES_CONFIG.categories.map((cat) => [cat.id, cat]),
  );

  assert.deepEqual(
    {
      category: byId.get('tier_10_or_more')?.category,
      condition: byId.get('tier_10_or_more')?.conditionLabel,
      min: byId.get('tier_10_or_more')?.minimumLabel,
      max: byId.get('tier_10_or_more')?.maximumLabel,
    },
    {
      category: '$10 or more',
      condition: 'Deposit range',
      min: '5× (load + bonus)',
      max: '15× (load + bonus)',
    },
  );

  assert.deepEqual(
    {
      category: byId.get('tier_5_to_9')?.category,
      condition: byId.get('tier_5_to_9')?.conditionLabel,
      min: byId.get('tier_5_to_9')?.minimumLabel,
      max: byId.get('tier_5_to_9')?.maximumLabel,
    },
    {
      category: '$5–$9',
      condition: 'Deposit range',
      min: '$30',
      max: '$60',
    },
  );

  assert.deepEqual(
    {
      category: byId.get('tier_below_5')?.category,
      condition: byId.get('tier_below_5')?.conditionLabel,
      min: byId.get('tier_below_5')?.minimumLabel,
      max: byId.get('tier_below_5')?.maximumLabel,
    },
    {
      category: 'Below $5',
      condition: 'Deposit range',
      min: '$30',
      max: '$30',
    },
  );

  const freeplay = byId.get('tier_freeplay');
  assert.equal(freeplay?.category, 'Freeplay');
  assert.equal(freeplay?.conditionLabel, 'Minimum qualifying amount');
  assert.equal(freeplay?.minimumLabel, '$20');
  assert.equal(freeplay?.maximumLabel, '$15 game credits OR $10 cash');
  assert.deepEqual(freeplay?.redemptionOptions, [
    { amountLabel: '$15', unitLabel: 'game credits' },
    { amountLabel: '$10', unitLabel: 'cash' },
  ]);

  const referral = byId.get('tier_referral_bonus');
  assert.equal(referral?.category, 'Referral bonus');
  assert.equal(referral?.conditionLabel, 'Minimum qualifying amount');
  assert.equal(referral?.minimumLabel, '$40');
  assert.equal(referral?.maximumLabel, '$30 game points OR $20 cash');
  assert.deepEqual(referral?.redemptionOptions, [
    { amountLabel: '$30', unitLabel: 'game points' },
    { amountLabel: '$20', unitLabel: 'cash' },
  ]);

  assert.equal(
    DEFAULT_CASHOUT_RULES_CONFIG.voidExcessWarning,
    'Any amount exceeding the applicable maximum cashout will be voided.',
  );
});

test('client and server cashout rules defaults, versioning, and formatting stay strictly synchronized', () => {
  assert.deepEqual(
    DEFAULT_CASHOUT_RULES_CONFIG,
    SERVER_DEFAULT_CASHOUT_RULES_CONFIG,
  );
  assert.equal(
    computeCashoutRulesVersion(DEFAULT_CASHOUT_RULES_CONFIG),
    serverComputeCashoutRulesVersion(SERVER_DEFAULT_CASHOUT_RULES_CONFIG),
  );
  assert.equal(
    formatCashoutRulesMessage(DEFAULT_CASHOUT_RULES_CONFIG),
    serverFormatCashoutRulesMessage(SERVER_DEFAULT_CASHOUT_RULES_CONFIG),
  );

  const withTimestamp = {
    ...DEFAULT_CASHOUT_RULES_CONFIG,
    updatedAt: '2026-11-27T10:00:00.000Z',
  };
  assert.equal(
    computeCashoutRulesVersion(withTimestamp),
    computeCashoutRulesVersion(DEFAULT_CASHOUT_RULES_CONFIG),
  );

  const edited = normalizeCashoutRulesConfig({
    ...DEFAULT_CASHOUT_RULES_CONFIG,
    categories: DEFAULT_CASHOUT_RULES_CONFIG.categories.map((c) =>
      c.id === 'tier_5_to_9' ? { ...c, maximumLabel: '$75' } : c,
    ),
  });
  assert.notEqual(
    computeCashoutRulesVersion(edited),
    computeCashoutRulesVersion(DEFAULT_CASHOUT_RULES_CONFIG),
  );
});

test('deriveConversationPinStatus classifies not_pinned, pinned, and outdated reliably', () => {
  const currentRulesVersion = computeCashoutRulesVersion(
    DEFAULT_CASHOUT_RULES_CONFIG,
  );

  assert.equal(
    deriveConversationPinStatus({
      pinnedMessageId: null,
      pinnedRulesVersion: null,
      currentRulesVersion,
    }),
    'not_pinned',
  );

  assert.equal(
    deriveConversationPinStatus({
      pinnedMessageId: 'msg_rules_1',
      pinnedRulesVersion: currentRulesVersion,
      currentRulesVersion,
    }),
    'pinned',
  );

  assert.equal(
    deriveConversationPinStatus({
      pinnedMessageId: 'msg_rules_1',
      pinnedRulesVersion: 'crv_0000000000000000',
      currentRulesVersion,
    }),
    'outdated',
  );

  assert.equal(
    deriveConversationPinStatus({
      pinnedMessageId: 'msg_rules_1',
      pinnedRulesVersion: null,
      currentRulesVersion,
    }),
    'outdated',
  );
});
