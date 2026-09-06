export {
  getDb, hasDb, migrate, closeDb,
  dbQueryAll, dbQueryFirst, dbExecute, dbExecRaw,
  saveAnalysisRecord, getAnalysisRecords, getAnalysisRecordById,
  savePortfolioRecord, getPortfolioRecords,
  getHistoricalGifts, ensureSeedData,
  logPlacementEvent, getPlacementEventStats,
  getUserById, getUserIdentities, findOrCreateUser, getUsageCount, consumeAnalysisQuota,
  getRecognitionUsage, consumeRecognitionQuota, refundRecognitionQuota,
  searchStocksByName, fuzzySearchStocksByName, damerauLevenshtein,
  deleteAnalysisRecord,
  saveMarketFocus, getMarketFocus, saveMarketFocusMeta, getMarketFocusMeta,
} from './db.js'
export type { AnalysisRecord, PortfolioRecord, PortfolioRecordInput, HistoricalGift, UserRow, UserIdentityRow, AuthProvider, IdentityInput, QuotaResult, MarketFocusItem, MarketFocusMeta } from './db.js'
export { exportSyncData, mergeExports, applySyncMerge, applySyncImport, SYNC_TABLES } from './sync.js'
export type { SyncExport, SyncRow, MergedExport, SyncTableName, TaggedRow, RowSource } from './sync.js'
export type { Database } from 'better-sqlite3'
export { fetchTwseOddLots } from './fetchers/twse-odd-lot.js'
export { fetchStockGift, fetchStockGiftRows } from './fetchers/stock-gift.js'
export type { GiftRow } from './fetchers/stock-gift.js'
export {
  fetchMopsMeetings,
  fetchMopsAnnouncementText,
  classifyClaimRule,
  rocToMonthDay,
  extractGiftEvidence,
} from './fetchers/mops.js'
export type { MopsMeeting, ClaimRule, ClaimResult } from './fetchers/mops.js'
export { fetchTwseMeetings } from './fetchers/twse-meetings.js'
export type { TwseMeeting } from './fetchers/twse-meetings.js'

