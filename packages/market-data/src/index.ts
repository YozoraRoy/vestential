export * from './types.js'
export * from './provider.js'
export { yahooFinanceProvider, fetchBatchQuotes } from './providers/yahoo-finance.js'
import { registry } from './provider.js'
import { yahooFinanceProvider } from './providers/yahoo-finance.js'

registry.register(yahooFinanceProvider)
