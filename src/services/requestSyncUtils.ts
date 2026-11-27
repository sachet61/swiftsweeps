import type { TopUpRequest, WithdrawalRequest } from '../types';

function readOptionalString(source: any, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const val = source[key];
  return typeof val === 'string' && val.trim() ? val : undefined;
}

export function parseWithdrawalApiError(
  status: number,
  rawText: string,
  fallbackMessage: string
): string {
  const trimmed = rawText.trim();
  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html')
  ) {
    return status >= 500
      ? 'Withdrawal service is temporarily unavailable.'
      : fallbackMessage;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown } | unknown;
      message?: unknown;
    };
    if (
      parsed?.error &&
      typeof parsed.error === 'object' &&
      typeof (parsed.error as { message?: unknown }).message === 'string' &&
      (parsed.error as { message: string }).message.trim()
    ) {
      return (parsed.error as { message: string }).message.trim();
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Ignore non-JSON error body
  }

  return fallbackMessage;
}

export function mapDbWithdrawalRowToRequest(
  w: any,
  existing?: WithdrawalRequest
): WithdrawalRequest {
  const rawPayoutDetails =
    w.payoutDetails && typeof w.payoutDetails === 'object' && !Array.isArray(w.payoutDetails)
      ? w.payoutDetails
      : w.payout_details && typeof w.payout_details === 'object' && !Array.isArray(w.payout_details)
      ? w.payout_details
      : {};

  const existingTimeline = Array.isArray(existing?.timeline)
    ? [...existing.timeline]
    : [];
  const rowTimeline = Array.isArray(w.timeline)
    ? w.timeline
    : Array.isArray(rawPayoutDetails.timeline)
    ? rawPayoutDetails.timeline
    : null;

  const amount = Number(w.amount ?? existing?.amount ?? 0);
  const feeAmount = Number(w.feeAmount ?? w.fee ?? existing?.feeAmount ?? 0);
  const netPayout = Number(
    w.netPayout ?? w.netAmount ?? w.net_amount ?? existing?.netPayout ?? amount
  );

  return {
    id: String(w.id),
    customerId: String(w.customerId ?? w.customer_id ?? existing?.customerId ?? ''),
    customerName: String(w.customerName ?? w.customer_name ?? existing?.customerName ?? 'Customer'),
    amount,
    currency: w.currency || existing?.currency || 'USD',
    feeAmount,
    netPayout,
    reservedAmount:
      typeof w.reservedAmount === 'number'
        ? w.reservedAmount
        : typeof rawPayoutDetails.reservedAmount === 'number'
        ? rawPayoutDetails.reservedAmount
        : existing?.reservedAmount ?? amount,
    method:
      w.method ||
      w.payoutMethodId ||
      w.payout_method_id ||
      existing?.method ||
      'bank_transfer',
    methodName:
      w.methodName ||
      w.payoutMethodName ||
      w.payout_method_name ||
      existing?.methodName ||
      'Bank Transfer',
    sourceGameCatalogId:
      readOptionalString(w, 'sourceGameCatalogId') ??
      readOptionalString(rawPayoutDetails, 'sourceGameCatalogId') ??
      existing?.sourceGameCatalogId,
    sourceGameName:
      readOptionalString(w, 'sourceGameName') ??
      readOptionalString(rawPayoutDetails, 'sourceGameName') ??
      existing?.sourceGameName,
    sourceGameUsername:
      readOptionalString(w, 'sourceGameUsername') ??
      readOptionalString(rawPayoutDetails, 'sourceGameUsername') ??
      existing?.sourceGameUsername,
    playerNotes:
      readOptionalString(w, 'playerNotes') ??
      readOptionalString(rawPayoutDetails, 'playerNotes') ??
      existing?.playerNotes,
    payoutDetails:
      Object.keys(rawPayoutDetails).length > 0
        ? rawPayoutDetails
        : existing?.payoutDetails || {},
    status: w.status || existing?.status || 'submitted',
    reviewerId: w.reviewerId ?? w.reviewer_id ?? existing?.reviewerId ?? undefined,
    reviewerName: w.reviewerName ?? w.reviewer_name ?? existing?.reviewerName ?? undefined,
    reviewNotes: w.reviewNotes ?? w.review_notes ?? existing?.reviewNotes ?? undefined,
    payoutReference:
      w.payoutReference ??
      w.transactionHash ??
      w.transaction_hash ??
      existing?.payoutReference ??
      undefined,
    timeline:
      rowTimeline && rowTimeline.length > 0 ? [...rowTimeline] : existingTimeline,
    createdAt: w.createdAt || w.created_at || existing?.createdAt || new Date().toISOString(),
    updatedAt:
      w.updatedAt ||
      w.updated_at ||
      w.createdAt ||
      w.created_at ||
      existing?.updatedAt ||
      new Date().toISOString(),
  };
}

export function mergeWithdrawalRequests(
  current: WithdrawalRequest[],
  rows: any[],
  replaceAll: boolean = false
): WithdrawalRequest[] {
  const existingById = new Map<string, WithdrawalRequest>();
  for (const w of current || []) {
    if (w && w.id) existingById.set(w.id, w);
  }

  const withMap = new Map<string, WithdrawalRequest>();
  if (!replaceAll) {
    for (const w of current || []) {
      if (w && w.id) withMap.set(w.id, w);
    }
  }

  for (const row of rows || []) {
    if (!row || !row.id) continue;
    if (row.deleted_at) {
      withMap.delete(row.id);
      continue;
    }
    const existing = withMap.get(row.id) || existingById.get(row.id);
    withMap.set(row.id, mapDbWithdrawalRowToRequest(row, existing));
  }

  return Array.from(withMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function parseDepositApiError(
  status: number,
  rawText: string,
  fallbackMessage: string
): string {
  const trimmed = rawText.trim();
  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html')
  ) {
    return status >= 500
      ? 'Deposit service is temporarily unavailable.'
      : fallbackMessage;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown } | unknown;
      message?: unknown;
    };
    if (
      parsed?.error &&
      typeof parsed.error === 'object' &&
      typeof (parsed.error as { message?: unknown }).message === 'string' &&
      (parsed.error as { message: string }).message.trim()
    ) {
      return (parsed.error as { message: string }).message.trim();
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Ignore non-JSON error body
  }

  return fallbackMessage;
}

export function mapDbTopupRowToRequest(t: any, existing?: TopUpRequest): TopUpRequest {
  const amount = Number(t.amount ?? existing?.amount ?? 0);
  const bonusAmount = Number(t.bonusAmount ?? t.bonus_amount ?? existing?.bonusAmount ?? 0);
  const bonusPercentage = Number(
    t.bonusPercentage ?? t.bonus_percentage ?? existing?.bonusPercentage ?? 0
  );
  const feeAmount = Number(t.feeAmount ?? t.fee_amount ?? existing?.feeAmount ?? 0);
  const finalWalletCredit = Number(
    t.finalWalletCredit ?? t.final_wallet_credit ?? existing?.finalWalletCredit ?? amount + bonusAmount
  );

  return {
    id: String(t.id),
    customerId: String(t.customerId ?? t.customer_id ?? existing?.customerId ?? ''),
    customerName: String(t.customerName ?? t.customer_name ?? existing?.customerName ?? 'Customer'),
    amount,
    currency: t.currency || existing?.currency || 'USD',
    bonusAmount,
    bonusPercentage,
    feeAmount,
    finalWalletCredit,
    method:
      ((t.method ?? t.paymentMethodId ?? t.payment_method_id) as any) ||
      existing?.method ||
      'payment_link',
    methodName:
      t.methodName ||
      t.paymentMethodName ||
      t.payment_method_name ||
      existing?.methodName ||
      'Payment Link',
    status: t.status || existing?.status || 'submitted',
    receiptUrl: t.receiptUrl ?? t.proofUrl ?? t.proof_url ?? existing?.receiptUrl ?? undefined,
    receiptName: t.receiptName ?? t.receipt_name ?? existing?.receiptName ?? undefined,
    targetGameName: t.targetGameName ?? t.target_game_name ?? existing?.targetGameName ?? undefined,
    targetGameCatalogId:
      t.targetGameCatalogId ??
      t.target_game_account_id ??
      existing?.targetGameCatalogId ??
      undefined,
    targetGameUsername:
      t.targetGameUsername ?? t.target_game_username ?? existing?.targetGameUsername ?? undefined,
    fundingSource:
      t.fundingSource ?? t.funding_source ?? existing?.fundingSource ?? undefined,
    providerRef:
      t.providerRef ?? t.provider_ref ?? t.customer_notes ?? existing?.providerRef ?? undefined,
    cryptoNetwork: t.cryptoNetwork ?? t.crypto_network ?? existing?.cryptoNetwork ?? undefined,
    cryptoTxHash: t.cryptoTxHash ?? t.crypto_tx_hash ?? existing?.cryptoTxHash ?? undefined,
    depositAddress: t.depositAddress ?? t.deposit_address ?? existing?.depositAddress ?? undefined,
    reviewerId: t.reviewerId ?? t.reviewer_id ?? existing?.reviewerId ?? undefined,
    reviewerName: t.reviewerName ?? t.reviewer_name ?? existing?.reviewerName ?? undefined,
    reviewNotes: t.reviewNotes ?? t.review_notes ?? existing?.reviewNotes ?? undefined,
    createdAt: t.createdAt || t.created_at || existing?.createdAt || new Date().toISOString(),
    updatedAt:
      t.updatedAt ||
      t.updated_at ||
      t.createdAt ||
      t.created_at ||
      existing?.updatedAt ||
      new Date().toISOString(),
  };
}

export function mergeTopupRequests(
  current: TopUpRequest[],
  rows: any[],
  replaceAll: boolean = false
): TopUpRequest[] {
  const existingById = new Map<string, TopUpRequest>();
  for (const t of current || []) {
    if (t && t.id) existingById.set(t.id, t);
  }

  const topupMap = new Map<string, TopUpRequest>();
  if (!replaceAll) {
    for (const t of current || []) {
      if (t && t.id) topupMap.set(t.id, t);
    }
  }

  for (const row of rows || []) {
    if (!row || !row.id) continue;
    if (row.deleted_at) {
      topupMap.delete(row.id);
      continue;
    }
    const existing = topupMap.get(row.id) || existingById.get(row.id);
    topupMap.set(row.id, mapDbTopupRowToRequest(row, existing));
  }

  return Array.from(topupMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function findRequestById<T extends { id: string }>(
  items: T[],
  requestId: string
): T | undefined {
  const normalized = (requestId || '').trim();
  if (!normalized) return undefined;
  return items.find((item) => item.id === normalized);
}
