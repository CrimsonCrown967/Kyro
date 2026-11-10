import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Bot,
  Bold,
  Code,
  Italic,
  Mic,
  Paperclip,
  Send,
  Smile,
  StopCircle,
  Strikethrough,
  Underline,
  X,
} from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ReplyTarget } from "@/components/app/MessageList";
import { formatBytes } from "@/lib/format";
import { useUiStore } from "@/lib/store";
import {
  ACCEPTED_UPLOAD,
  MAX_ATTACHMENTS,
  useUploadFile,
  type PendingAttachment,
} from "@/lib/upload";
import { cn } from "@/lib/utils";
import { readableError } from "@/lib/errors";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/app/EmojiPicker";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { CustomEmoji } from "@/lib/emoji";
import { GifPicker } from "@/components/app/GifPicker";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { PollComposerDialog } from "@/components/app/PollComposerDialog";
import { roleMentionToken } from "@/lib/permissions";
import { BotCommandDialog, BotInteractionResponses } from "./BotCommandDialog";

export interface MentionUser {
  id: string;
  name: string;
  username: string | null;
  avatarUrl?: string | null;
  displayNameFont?: string | null;
  displayNameColorMode?: "none" | "solid" | "gradient" | null;
  displayNameColor?: string | null;
  displayNameColor2?: string | null;
}

export interface MentionRole {
  id: string;
  name: string;
  color: string | null;
  memberCount: number;
}

export function Composer({
  containerType,
  containerId,
  reply,
  onCancelReply,
  disabledReason,
  onSent,
  mentionUsers = [],
  mentionRoles = [],
  allowMassMentions = false,
}: {
  containerType: "channel" | "conversation";
  containerId: string;
  reply: ReplyTarget | null;
  onCancelReply: () => void;
  disabledReason?: string | null;
  onSent?: () => void;
  mentionUsers?: MentionUser[];
  mentionRoles?: MentionRole[];
  allowMassMentions?: boolean;
}) {
  const draftKey = `${containerType}:${containerId}`;
  const draft = useUiStore((state) => state.drafts[draftKey] ?? "");
  const setDraft = useUiStore((state) => state.setDraft);
  const sendMessage = useMutation(api.messages.send);
  const runBotCommand = useMutation(api.bots.execute);
  const externalCommands = useQuery(
    api.botCommands.forChannel,
    containerType === "channel"
      ? { channelId: containerId as Id<"channels"> }
      : "skip",
  );
  const [externalCommandId, setExternalCommandId] = useState<string | null>(
    null,
  );
  const externalCommand = externalCommands?.find(
    (command) => command.id === externalCommandId,
  );
  const setTyping = useMutation(api.messages.setTyping);
  const botCommands = useQuery(
    api.bots.listForChannel,
    containerType === "channel"
      ? { channelId: containerId as Id<"channels"> }
      : "skip",
  );
  const upload = useUploadFile();
  const convex = useConvex();
  const registerGifShare = useAction(api.gifs.registerShare);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [commandIndex, setCommandIndex] = useState(0);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

  const updateMentionState = (value: string, cursor: number | null) => {
    if (cursor === null) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (!match) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionQuery(match[1].toLowerCase());
    setMentionStart(cursor - match[1].length - 1);
    setMentionIndex(0);
  };

  const mentionOptions = [
    ...(allowMassMentions
      ? [
          {
            kind: "mass" as const,
            id: "everyone",
            name: "Everyone",
            username: "everyone",
            token: "@everyone",
          },
          {
            kind: "mass" as const,
            id: "here",
            name: "Here",
            username: "here",
            token: "@here",
          },
        ]
      : []),
    ...mentionRoles.map((role) => ({
      ...role,
      kind: "role" as const,
      username: null,
      token: roleMentionToken(role.id),
    })),
    ...mentionUsers
      .filter((user) => Boolean(user.username))
      .map((user) => ({
        ...user,
        kind: "user" as const,
        token: `@${user.username}`,
      })),
  ]
    .filter((option) => {
      const query = mentionQuery ?? "";
      return (
        option.username?.toLowerCase().includes(query) ||
        option.name.toLowerCase().includes(query)
      );
    })
    .slice(0, 8);
  const commandMatch =
    containerType === "channel" ? draft.match(/^\/([a-z0-9_:-]*)$/i) : null;
  const commandOptions = commandMatch
    ? [...(botCommands ?? []), ...(externalCommands ?? [])]
        .filter((command) =>
          command.name.toLowerCase().startsWith(commandMatch[1].toLowerCase()),
        )
        .slice(0, 8)
    : [];
  const chooseCommand = (name: string) => {
    const installed = externalCommands?.find(
      (command) => command.name === name,
    );
    if (installed) setExternalCommandId(installed.id);
    else setDraft(draftKey, `/${name} `);
    setCommandIndex(0);
  };

  const insertMention = (token: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    if (mentionStart === null) return;
    const next = `${draft.slice(0, mentionStart)}${token} ${draft.slice(cursor)}`;
    setDraft(draftKey, next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const position = mentionStart + token.length + 1;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  };

  const updateSelection = () => {
    const element = textareaRef.current;
    if (!element || element.selectionStart === element.selectionEnd) {
      setSelection(null);
      return;
    }
    setSelection({ start: element.selectionStart, end: element.selectionEnd });
  };

  const formatSelection = (before: string, after = before) => {
    if (!selection) return;
    const selected = draft.slice(selection.start, selection.end);
    const next = `${draft.slice(0, selection.start)}${before}${selected}${after}${draft.slice(selection.end)}`;
    setDraft(draftKey, next);
    const start = selection.start + before.length;
    const end = start + selected.length;
    setSelection(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, end);
    });
  };

  const loadCustomEmojis = async () => {
    try {
      const rows = await convex.query(api.emojis.available, {});
      setCustomEmojis(rows);
    } catch {
      // Compatibility with the current production backend: custom emojis
      // simply stay hidden until the new Convex module is deployed.
      setCustomEmojis([]);
    }
  };

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(
    () => () => {
      discardRecordingRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current);
      }
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
      }
    },
    [containerId, containerType],
  );

  const send = async () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;
    if (busy) return;
    setBusy(true);
    const clientId = crypto.randomUUID();
    try {
      const installedCommand = externalCommands?.find(
        (entry) =>
          content === `/${entry.name}` || content.startsWith(`/${entry.name} `),
      );
      if (installedCommand && containerType === "channel") {
        setExternalCommandId(installedCommand.id);
        return;
      }
      const command = content.match(/^\/([a-z0-9_-]+)(?:\s+[\s\S]*)?$/i);
      if (
        containerType === "channel" &&
        command &&
        attachments.length === 0 &&
        botCommands === undefined
      ) {
        toast.error("Commands are still loading. Try again in a moment.");
        return;
      }
      const knownCommand = command
        ? (botCommands ?? []).some(
            (entry) => entry.name.toLowerCase() === command[1].toLowerCase(),
          )
        : false;
      if (
        containerType === "channel" &&
        command &&
        knownCommand &&
        attachments.length === 0
      ) {
        const result = await runBotCommand({
          channelId: containerId as Id<"channels">,
          commandLine: content,
        });
        if (result.blocked) {
          toast.error(result.blocked);
          return;
        }
        setDraft(draftKey, "");
        setMentionQuery(null);
        onCancelReply();
        onSent?.();
        return;
      }
      const result = await sendMessage({
        containerType,
        containerId,
        content,
        clientId,
        replyToId: reply?.id as Id<"messages"> | undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (result.blocked) {
        toast.error(result.blocked);
        return;
      }
      setDraft(draftKey, "");
      setMentionQuery(null);
      setAttachments([]);
      onCancelReply();
      onSent?.();
      textareaRef.current?.focus();
    } catch (error) {
      toast.error(readableError(error, "Message failed to send."));
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    setUploading((count) => count + chosen.length);
    for (const file of chosen) {
      try {
        const stored = await upload(file);
        setAttachments((state) => [...state, stored]);
      } catch (error) {
        toast.error(readableError(error, "Upload failed."));
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const clearRecordingTimers = () => {
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const stopRecording = (discard = false) => {
    discardRecordingRef.current = discard;
    clearRecordingTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  };

  const startRecording = async () => {
    if (recording || uploading > 0 || busy) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error("Voice messages aren't supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = preferredTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000,
      });
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearRecordingTimers();
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        recordingStreamRef.current = null;
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (discardRecordingRef.current || chunks.length === 0) return;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        const file = new File(
          [new Blob(chunks, { type })],
          `voice-message-${Date.now()}.${extension}`,
          { type },
        );
        void addFiles([file]);
      };
      recorderRef.current = recorder;
      recordingStreamRef.current = stream;
      recorder.start(500);
      setRecordingSeconds(0);
      setRecording(true);
      recordingIntervalRef.current = window.setInterval(
        () => setRecordingSeconds((seconds) => seconds + 1),
        1000,
      );
      recordingTimeoutRef.current = window.setTimeout(
        () => stopRecording(false),
        5 * 60 * 1000,
      );
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      toast.error(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it to record a voice message."
          : readableError(error, "Could not start voice recording."),
      );
    }
  };

  const recordingTime = `${Math.floor(recordingSeconds / 60)}:${String(
    recordingSeconds % 60,
  ).padStart(2, "0")}`;

  if (disabledReason) {
    return (
      <div className="mx-4 mb-4 rounded-xl border border-border/70 bg-panel/80 px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledReason}
      </div>
    );
  }

  return (
    <div className="bg-transparent px-3 pb-4 pt-2 sm:px-5">
      {containerType === "channel" && (
        <BotInteractionResponses channelId={containerId as Id<"channels">} />
      )}
      {externalCommand && (
        <BotCommandDialog
          key={externalCommand.id}
          command={externalCommand}
          channelId={containerId as Id<"channels">}
          members={mentionUsers}
          onClose={() => setExternalCommandId(null)}
          onSent={() => {
            setDraft(draftKey, "");
            onSent?.();
          }}
        />
      )}
      {reply && (
        <div className="mb-1 flex items-center justify-between rounded-t-lg border border-b-0 border-border/70 bg-surface px-3 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            Replying to{" "}
            <span className="font-medium text-foreground">{reply.author}</span>
            {" — "}
            <span className="truncate">{reply.excerpt}</span>
          </span>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancelReply}
            className="rounded p-0.5 hover:bg-background"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-t-lg border border-b-0 border-border/70 bg-surface p-2">
          {attachments.map((attachment) => (
            <span
              key={attachment.storageId}
              className="flex items-center gap-2 rounded-md border border-border/70 bg-panel px-2 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{attachment.name}</span>
              <span className="text-muted-foreground">
                {formatBytes(attachment.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() =>
                  setAttachments((state) =>
                    state.filter(
                      (item) => item.storageId !== attachment.storageId,
                    ),
                  )
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Uploading {uploading}…
            </span>
          )}
        </div>
      )}

      {recording && (
        <div className="mb-1 flex items-center justify-between gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs">
          <span className="flex items-center gap-2 font-semibold text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            Recording · {recordingTime}
          </span>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="font-medium text-muted-foreground hover:text-destructive"
          >
            Discard
          </button>
        </div>
      )}

      <div
        className={cn(
          "relative flex items-end gap-1 rounded-2xl border border-input bg-panel/90 px-2.5 py-2 shadow-[0_8px_30px_rgba(0,0,0,.13)] backdrop-blur-xl focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-primary/25",
          (attachments.length > 0 || reply) && "rounded-t-none",
        )}
      >
        <label
          className="cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
          title="Attach files"
        >
          <Paperclip className="size-4" />
          <input
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD}
            className="hidden"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(draftKey, event.target.value);
            updateMentionState(event.target.value, event.target.selectionStart);
            const now = Date.now();
            if (now - lastTypingRef.current > 4000) {
              lastTypingRef.current = now;
              void setTyping({ containerType, containerId }).catch(
                () => undefined,
              );
            }
          }}
          onSelect={updateSelection}
          onMouseUp={updateSelection}
          onKeyUp={updateSelection}
          onKeyDown={(event) => {
            if (commandOptions.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setCommandIndex((current) =>
                  event.key === "ArrowDown"
                    ? (current + 1) % commandOptions.length
                    : (current - 1 + commandOptions.length) %
                      commandOptions.length,
                );
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                const selected =
                  commandOptions[commandIndex] ?? commandOptions[0];
                chooseCommand(selected.name);
                setCommandIndex(0);
                requestAnimationFrame(() => textareaRef.current?.focus());
                return;
              }
            }
            if (mentionQuery !== null && mentionOptions.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex((current) =>
                  event.key === "ArrowDown"
                    ? (current + 1) % mentionOptions.length
                    : (current - 1 + mentionOptions.length) %
                      mentionOptions.length,
                );
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                const selected =
                  mentionOptions[mentionIndex] ?? mentionOptions[0];
                insertMention(selected.token);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          // Paste images (screenshots, GIFs, copied files) straight from the
          // clipboard — the browser's own text paste still works untouched.
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData?.files ?? []);
            if (pasted.length > 0) {
              event.preventDefault();
              void addFiles(pasted);
            }
          }}
          placeholder="Message…"
          className="max-h-56 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground"
        />

        {selection && mentionQuery === null ? (
          <div className="absolute bottom-full left-12 z-40 mb-2 flex items-center gap-0.5 rounded-lg border border-border/70 bg-popover p-1 shadow-xl">
            {[
              { label: "Bold", icon: Bold, before: "**" },
              { label: "Italic", icon: Italic, before: "*" },
              { label: "Underline", icon: Underline, before: "__" },
              { label: "Strikethrough", icon: Strikethrough, before: "~~" },
              { label: "Inline code", icon: Code, before: "`" },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => formatSelection(action.before)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <action.icon className="size-4" />
              </button>
            ))}
          </div>
        ) : null}

        {commandOptions.length > 0 ? (
          <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
            <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Bot className="size-3" /> Commands
            </p>
            {commandOptions.map((command, index) => (
              <button
                key={command.name}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  chooseCommand(command.name);
                  setCommandIndex(0);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                  index === commandIndex ? "bg-primary/15" : "hover:bg-surface",
                )}
              >
                <span className="font-mono text-sm font-semibold text-primary">
                  /{command.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {command.description}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {mentionQuery !== null && mentionOptions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mentions
            </p>
            {mentionOptions.map((option, index) => {
              const mass = option.kind === "mass";
              const role = option.kind === "role";
              return (
                <button
                  key={`${option.kind}:${option.id}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMention(option.token)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                    index === mentionIndex
                      ? "bg-primary/15"
                      : "hover:bg-surface",
                  )}
                >
                  {mass ? (
                    <span className="flex size-7 items-center justify-center rounded-full bg-warning/15 text-sm font-bold text-warning">
                      @
                    </span>
                  ) : role ? (
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: option.color ?? "#5865F2" }}
                    >
                      @
                    </span>
                  ) : (
                    <UserAvatar user={option} size="xs" showStatus={false} />
                  )}
                  <span className="min-w-0 flex-1">
                    {mass ? (
                      <span className="block truncate text-sm font-medium">
                        @{option.username}
                      </span>
                    ) : role ? (
                      <span
                        className="block truncate text-sm font-semibold"
                        style={{ color: option.color ?? undefined }}
                      >
                        @{option.name}
                      </span>
                    ) : (
                      <StyledDisplayName
                        user={option}
                        className="block truncate text-sm"
                      />
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {mass
                        ? option.id === "everyone"
                          ? "Notify every server member"
                          : "Notify members currently online"
                        : role
                          ? `Notify ${option.memberCount} role member${option.memberCount === 1 ? "" : "s"}`
                          : `@${option.username}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <Popover
          open={emojiOpen}
          onOpenChange={(open) => {
            setEmojiOpen(open);
            if (open) void loadCustomEmojis();
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Emoji"
              className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <Smile className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <EmojiPicker
              customEmojis={customEmojis}
              onSelect={(emoji) => {
                const cursor =
                  textareaRef.current?.selectionStart ?? draft.length;
                const next = `${draft.slice(0, cursor)}${emoji}${draft.slice(cursor)}`;
                setDraft(draftKey, next);
                setEmojiOpen(false);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </PopoverContent>
        </Popover>

        <Popover open={gifOpen} onOpenChange={setGifOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="GIFs"
              className="rounded-md px-1.5 py-2 text-[10px] font-black tracking-tight text-muted-foreground hover:bg-background hover:text-foreground"
            >
              GIF
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <GifPicker
              onSelect={(gif) => {
                const separator = draft.trim() ? "\n" : "";
                setDraft(draftKey, `${draft}${separator}${gif.url}`);
                setGifOpen(false);
                void registerGifShare({ slug: gif.slug }).catch(
                  () => undefined,
                );
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label={
            recording ? "Stop and attach voice message" : "Record voice message"
          }
          title={
            recording ? "Stop and attach voice message" : "Record voice message"
          }
          onClick={() =>
            recording ? stopRecording(false) : void startRecording()
          }
          className={cn(
            "rounded-md p-2 transition-colors",
            recording
              ? "bg-destructive/15 text-destructive"
              : "text-muted-foreground hover:bg-background hover:text-foreground",
          )}
        >
          {recording ? (
            <StopCircle className="size-4" />
          ) : (
            <Mic className="size-4" />
          )}
        </button>

        <button
          type="button"
          aria-label="Create poll"
          title="Create poll"
          onClick={() => setPollOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <BarChart3 className="size-4" />
        </button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => void send()}
          disabled={
            busy ||
            recording ||
            uploading > 0 ||
            (!draft.trim() && attachments.length === 0)
          }
          aria-label="Send message"
          className="text-primary hover:bg-primary/10"
        >
          <Send className="size-4" />
        </Button>
      </div>

      <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
        <span className="rounded border border-border/70 px-1">Enter</span> to
        send ·{" "}
        <span className="rounded border border-border/70 px-1">
          Shift+Enter
        </span>{" "}
        for a new line · Markdown and code blocks supported
      </p>
      <PollComposerDialog
        open={pollOpen}
        onOpenChange={setPollOpen}
        containerType={containerType}
        containerId={containerId}
      />
    </div>
  );
}
