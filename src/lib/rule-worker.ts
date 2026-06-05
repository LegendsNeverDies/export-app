// Web Worker for executing the rule engine off the main thread
import { applyRule, validateOrderItems } from './rule-engine'
import { ParseRule } from './types'

export interface WorkerInput {
  rows: Record<string, unknown>[]
  headers: string[]
  rule: ParseRule
  existingCodes?: string[]
}

export interface WorkerOutput {
  type: 'progress' | 'result' | 'error'
  progress?: number
  orders?: ReturnType<typeof applyRule>['orders']
  items?: ReturnType<typeof applyRule>['items']
  validatedItems?: ReturnType<typeof validateOrderItems>
  error?: string
}

// Self-contained worker function (runs in worker scope)
function process(input: WorkerInput): WorkerOutput {
  try {
    // yield control periodically for large datasets
    const result = applyRule(input.rows, input.headers, input.rule)
    const validated = validateOrderItems(
      result.items,
      input.existingCodes ? new Set(input.existingCodes) : new Set()
    )
    return {
      type: 'result',
      orders: result.orders,
      items: result.items,
      validatedItems: validated,
    }
  } catch (e: any) {
    return { type: 'error', error: e.message || '处理失败' }
  }
}

// Export for direct use (no worker thread)
export function runRuleInline(input: WorkerInput): WorkerOutput {
  return process(input)
}

// Export for web worker messaging
if (typeof self !== 'undefined') {
  self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const result = process(e.data)
    self.postMessage(result)
  }
}
