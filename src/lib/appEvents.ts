export const APP_EVENT = {
  customerSessionChanged: "customer_session_changed",
  pricingContextChanged: "pricing_context_changed",
} as const;

type AppEventName = (typeof APP_EVENT)[keyof typeof APP_EVENT];

export function emitAppEvent(eventName: AppEventName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}

export function subscribeAppEvent(eventName: AppEventName, handler: EventListener) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
