/**
 * Real-time event channels supported by Centrifugo
 */
export type CentrifugoChannel =
  | `conversations#${string}` // Live chat messages for a specific conversation thread
  | `advisors#${string}`      // Private alert notifications for a specific advisor
  | 'admin:dashboard'         // Global CRM metrics and unassigned lead updates

/**
 * Event types emitted across real-time channels
 */
export type CentrifugoEventType =
  | 'message.created'
  | 'conversation.mode_changed'
  | 'conversation.status_changed'
  | 'advisor.assigned'
  | 'advisor.notification'
  | 'dashboard.metrics_updated'

/**
 * Standard envelope structure for all published event payloads
 */
export interface CentrifugoEventPayload<T = unknown> {
  event: CentrifugoEventType
  data: T
  timestamp: string
}
