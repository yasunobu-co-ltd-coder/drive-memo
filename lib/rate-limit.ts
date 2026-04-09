// ============================================================
// シンプルなインメモリ・レートリミッター
// Vercel Serverless ではインスタンス単位で動作（完全ではないが抑止効果あり）
// ============================================================

const store = new Map<string, { count: number; resetAt: number }>();

// 古いエントリを定期的にクリーンアップ
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key);
  }
}, 60_000);

/**
 * レートリミットをチェック
 * @returns true = リクエスト許可, false = 制限超過
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > maxRequests) return false;
  return true;
}

export function rateLimitResponse() {
  return Response.json(
    { error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。' },
    { status: 429 },
  );
}
