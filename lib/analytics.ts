import posthog from "posthog-js";

export type AnalyticsEventName =
  | "auth_enter"
  | "workspace_open"
  | "upload_video"
  | "upload_youtube"
  | "analyze_start"
  | "analyze_complete"
  | "creator_style_selected"
  | "subtitle_editor_open"
  | "subtitle_saved"
  | "export_mp4"
  | "export_zip"
  | "export_burn_subtitle";

export type AnalyticsPayload = Record<string, unknown>;

type AnalyticsEvent = {
  name: AnalyticsEventName;
  payload: AnalyticsPayload;
  timestamp: string;
};

const isBrowser = typeof window !== "undefined";
const isProduction = process.env.NODE_ENV === "production";
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

let posthogInitialized = false;

function initPostHog() {
  if (!isBrowser || posthogInitialized || !posthogKey) {
    return;
  }

  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,
  });

  posthogInitialized = true;
}

function sendToConsole(event: AnalyticsEvent) {
  console.log("[analytics]", event);
}

function sendToPostHog(event: AnalyticsEvent) {
  initPostHog();

  if (!posthogInitialized) {
    sendToConsole({
      ...event,
      payload: {
        ...event.payload,
        analyticsProvider: "console",
        reason: "posthog_not_configured",
      },
    });
    return;
  }

  posthog.capture(event.name, {
    ...event.payload,
    timestamp: event.timestamp,
  });
}

export function trackEvent(
  name: AnalyticsEventName,
  payload: AnalyticsPayload = {}
) {
  const event = {
    name,
    payload,
    timestamp: new Date().toISOString(),
  };

  if (!isProduction) {
    sendToConsole(event);
    return;
  }

  sendToPostHog(event);
}
