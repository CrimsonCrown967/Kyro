import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function liveKitConfig() {
  const url = required("LIVEKIT_URL");
  const parsed = new URL(url);
  if (parsed.protocol !== "wss:") {
    throw new Error("LIVEKIT_URL must use wss://.");
  }
  return {
    url,
    apiKey: required("LIVEKIT_API_KEY"),
    apiSecret: required("LIVEKIT_API_SECRET"),
  };
}

export function liveKitApiUrl(url: string): string {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : parsed.protocol;
  return parsed.toString().replace(/\/$/, "");
}

const SOURCE_MAP = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
} as const;

export async function createParticipantToken(args: {
  roomName: string;
  identity: string;
  displayName: string;
  metadata: string;
  canPublishSources: Array<keyof typeof SOURCE_MAP>;
}) {
  const config = liveKitConfig();
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: args.identity,
    name: args.displayName,
    metadata: args.metadata,
    ttl: "10m",
  });
  token.addGrant({
    roomJoin: true,
    room: args.roomName,
    canSubscribe: true,
    canPublish: args.canPublishSources.length > 0,
    canPublishSources: args.canPublishSources.map(
      (source) => SOURCE_MAP[source],
    ),
    canPublishData: false,
  });
  return { url: config.url, token: await token.toJwt() };
}

export function roomServiceClient() {
  const config = liveKitConfig();
  return new RoomServiceClient(
    liveKitApiUrl(config.url),
    config.apiKey,
    config.apiSecret,
  );
}
