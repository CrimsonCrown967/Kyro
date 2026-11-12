import { getFunctionName } from "convex/server";
import { useSyncExternalStore } from "react";

const person = (id, name, presence, customStatus = null) => ({
  id,
  name,
  username: name.toLowerCase().replaceAll(" ", "_"),
  presence,
  customStatus,
  avatarUrl: null,
  badges: [],
  hasUsername: true,
  device: "desktop",
});
export const me = person(
  "me",
  "Alex Morgan",
  "online",
  "Making something good",
);
const friends = [
  person("maya", "Maya Chen", "online", "Sketching new ideas"),
  person("leo", "Leo Parker", "online", "Anyone up for a game?"),
  person("sam", "Sam Rivera", "idle", "In my own little world"),
  person("nora", "Nora Ellis", "dnd", "One more chapter"),
  person("kai", "Kai Wilson", "offline"),
];
const conversations = friends.slice(0, 3).map((friend, i) => ({
  id: `dm-${friend.id}`,
  type: "dm",
  participants: [me, friend],
  name: null,
  unread: i === 0,
  lastMessagePreview: [
    "That sounds like a plan!",
    "See you tonight?",
    "Sent you a little inspiration",
  ][i],
}));
const servers = [
  {
    id: "studio",
    name: "Creative Studio",
    iconUrl: null,
    unread: true,
    mentionCount: 3,
  },
  { id: "afterhours", name: "After Hours", iconUrl: null },
  { id: "dev", name: "Build Together", iconUrl: null },
];
const discovery = servers.map((server, index) => ({
  ...server,
  description: [
    "Make, share, and find your next idea.",
    "Games and good company after a long day.",
    "A friendly corner for curious builders.",
  ][index],
  tags: [["Art", "Design"], ["Gaming"], ["Technology"]][index],
  memberCount: [126, 82, 54][index],
  onlineCount: [18, 9, 4][index],
  createdAt: 1700000000000 + index * 100000,
  isJoined: true,
  applyToJoin: false,
}));
const channels = {
  categories: [
    { id: "text", name: "The studio" },
    { id: "voice", name: "Hang out" },
  ],
  permissions: [
    "view_channel",
    "send_messages",
    "connect_voice",
    "speak_voice",
  ],
  channels: [
    {
      id: "general",
      name: "the-lounge",
      kind: "text",
      categoryId: "text",
      topic: "A little conversation, a lot of good ideas.",
      mentionCount: 0,
    },
    {
      id: "ideas",
      name: "good-finds",
      kind: "text",
      categoryId: "text",
      mentionCount: 0,
    },
    {
      id: "room",
      name: "The couch",
      kind: "voice",
      categoryId: "voice",
      topic: "Good company, open microphones, and your favorite people.",
      mentionCount: 0,
    },
  ],
};
const messages = [
  [
    friends[0],
    "Hey! Have you had a chance to look at the ideas for this weekend?",
  ],
  [
    me,
    "Yes! I love the idea of a little creative session. We could bring everyone together.",
  ],
  [
    friends[0],
    "Exactly what I was thinking. A few good playlists, some sketches, and no pressure.",
  ],
  [me, "Sounds perfect. Let's share it with the others ✨"],
  [friends[0], "That sounds like a plan!"],
].map(([author, content], i) => ({
  id: `message-${i}`,
  author,
  authorId: author.id,
  content,
  createdAt: Date.now() - (6 - i) * 60000,
  editedAt: null,
  attachments: [],
  reactions: [],
  replyTo: null,
}));
let connected = true;
const listeners = new Set();
window.setFixtureConnection = (value) => {
  connected = value;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => connected;
export function useConvexConnectionState() {
  return { isWebSocketConnected: useSyncExternalStore(subscribe, snapshot) };
}
const empty = [];
const data = {
  "users:me": me,
  "users:currentUser": me,
  "social:list": { friends, incoming: [], outgoing: [], blocked: [] },
  "servers:listMine": servers,
  "conversations:list": conversations,
  "notifications:unreadCount": 2,
  "notifications:mentionSummary": { count: 0, latestCreationTime: null },
  "notifications:list": empty,
  "voice:incoming": empty,
  "voice:currentCall": null,
  "messages:typingList": empty,
  "messages:list": { messages, hasMore: false, nextCursor: null },
  "users:suggest": empty,
  "servers:discover": discovery,
  "servers:joinState": { exists: true, isMember: true },
  "channels:list": channels,
  "servers:members": {
    online: friends
      .slice(0, 4)
      .map((user) => ({
        user,
        nickname: null,
        isOwner: false,
        topRoleColor: null,
        topRoleName: "Member",
      })),
    offline: [],
    myPermissions: [],
  },
  "roles:list": [],
  "voice:roster": [
    {
      id: "voice-maya",
      user: friends[0],
      muted: false,
      camera: false,
      sharing: false,
    },
  ],
};
export function useQuery(reference, args) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "servers:get")
    return (
      discovery.find((server) => server.id === args.serverId) ?? discovery[0]
    );
  if (name === "servers:discover")
    return discovery.filter((server) =>
      `${server.name} ${server.description} ${server.tags.join(" ")}`
        .toLowerCase()
        .includes((args?.term ?? "").trim().toLowerCase()),
    );
  if (name === "conversations:get")
    return conversations.find((c) => c.id === args.conversationId) ?? null;
  if (name === "users:search")
    return friends.filter((p) =>
      p.name.toLowerCase().includes((args.term ?? "").toLowerCase()),
    );
  return Object.hasOwn(data, name) ? data[name] : empty;
}
const mutations = new Map();
export function useMutation(reference) {
  const name = getFunctionName(reference);
  if (!mutations.has(name))
    mutations.set(name, async (args) => {
      if (name === "conversations:createDirect") return `dm-${args.userId}`;
      return null;
    });
  return mutations.get(name);
}
export const useAction = useMutation;
const client = { query: async () => empty, mutation: async () => null };
export const useConvex = () => client;
export const useConvexAuth = () => ({
  isLoading: false,
  isAuthenticated: true,
});
