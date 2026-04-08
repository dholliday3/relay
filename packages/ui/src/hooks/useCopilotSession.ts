import { useCallback, useEffect, useRef, useState } from "react";

export type CopilotProviderId = "claude-code" | "codex";

export type CopilotPart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; toolName?: string; toolInput?: string; content: string }
  | { type: "tool_result"; toolName?: string; content: string }
  | { type: "error"; content: string };

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  parts: CopilotPart[];
  createdAt: number;
}

export interface CopilotHealth {
  providerId: CopilotProviderId;
  status: "ready" | "not_installed" | "not_authenticated" | "error";
  cliVersion: string | null;
  error: string | null;
}

interface UseCopilotSessionState {
  sessionId: string | null;
  conversationId: string | null;
  providerConversationId: string | null;
  selectedProviderId: CopilotProviderId | null;
  providers: CopilotHealth[];
  messages: CopilotMessage[];
  isStreaming: boolean;
  isStarting: boolean;
  error: string | null;
}

export interface UseCopilotSessionApi extends UseCopilotSessionState {
  sendMessage: (text: string) => Promise<void>;
  startNew: () => void;
  switchConversation: (conversationId: string, providerId: CopilotProviderId) => void;
  setProviderId: (providerId: CopilotProviderId) => void;
}

interface StreamFrame {
  type: "copilot.stream";
  sessionId: string;
  messageId: string;
  part: CopilotPart;
}

interface DoneFrame {
  type: "copilot.done";
  sessionId: string;
  conversationId: string | null;
  providerId: CopilotProviderId | null;
}

interface ReadyFrame {
  type: "ready";
}

type CopilotWsFrame = StreamFrame | DoneFrame | ReadyFrame;

interface HistoryResponse {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    parts: CopilotPart[];
    createdAt: number;
  }>;
}

interface ProvidersResponse {
  defaultProviderId: CopilotProviderId;
  providers: CopilotHealth[];
}

interface ConversationListResponse {
  conversations: Array<{
    id: string;
    provider_id: CopilotProviderId;
  }>;
}

const LOCAL_STORAGE_KEY = "ticketbook.copilot.provider";

export function useCopilotSession(active: boolean): UseCopilotSessionApi {
  const [state, setState] = useState<UseCopilotSessionState>({
    sessionId: null,
    conversationId: null,
    providerConversationId: null,
    selectedProviderId: null,
    providers: [],
    messages: [],
    isStreaming: false,
    isStarting: false,
    error: null,
  });
  const [resumeFromConversationId, setResumeFromConversationId] = useState<string | null>(null);
  const [restartCounter, setRestartCounter] = useState(0);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [initializedFromHistory, setInitializedFromHistory] = useState(false);

  const currentAssistantIdRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const clearLiveSession = useCallback(() => {
    sessionIdRef.current = null;
    currentAssistantIdRef.current = null;
    currentMessageIdRef.current = null;
    setState((prev) => ({
      ...prev,
      sessionId: null,
      conversationId: null,
      providerConversationId: null,
      messages: [],
      isStreaming: false,
      isStarting: true,
      error: null,
    }));
  }, []);

  const appendPartToCurrentAssistant = useCallback(
    (messageId: string, part: CopilotPart) => {
      const isNewTurn = currentMessageIdRef.current !== messageId;
      let assistantId = currentAssistantIdRef.current;
      if (isNewTurn || !assistantId) {
        assistantId = `asst-${messageId}`;
        currentAssistantIdRef.current = assistantId;
        currentMessageIdRef.current = messageId;
      }
      const targetId = assistantId;

      setState((prev) => {
        const exists = prev.messages.some((m) => m.id === targetId);
        const messages = exists
          ? prev.messages
          : [
              ...prev.messages,
              {
                id: targetId,
                role: "assistant" as const,
                parts: [],
                createdAt: Date.now(),
              },
            ];

        return {
          ...prev,
          messages: messages.map((message) => {
            if (message.id !== targetId) return message;
            const last = message.parts.at(-1);
            if (
              last &&
              (last.type === "text" || last.type === "thinking") &&
              last.type === part.type
            ) {
              return {
                ...message,
                parts: [
                  ...message.parts.slice(0, -1),
                  { ...last, content: last.content + part.content },
                ],
              };
            }
            return { ...message, parts: [...message.parts, part] };
          }),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/copilot/providers")
      .then((response) => response.json())
      .then((data: ProvidersResponse) => {
        if (cancelled) return;
        const storedProvider =
          (window.localStorage.getItem(LOCAL_STORAGE_KEY) as CopilotProviderId | null) ?? null;
        const validStoredProvider = data.providers.some((provider) => provider.providerId === storedProvider)
          ? storedProvider
          : null;
        const selectedProviderId =
          validStoredProvider ??
          data.defaultProviderId ??
          data.providers[0]?.providerId ??
          null;
        setState((prev) => ({
          ...prev,
          providers: data.providers,
          selectedProviderId,
        }));
        setProvidersLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : String(err),
          }));
          setProvidersLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !providersLoaded || initializedFromHistory || !state.selectedProviderId) return;
    let cancelled = false;
    fetch("/api/copilot/conversations")
      .then((response) => (response.ok ? response.json() : { conversations: [] }))
      .then((data: ConversationListResponse) => {
        if (cancelled) return;
        if (data.conversations.length > 0) {
          const latest = data.conversations[0];
          window.localStorage.setItem(LOCAL_STORAGE_KEY, latest.provider_id);
          setResumeFromConversationId(latest.id);
          setState((prev) => ({
            ...prev,
            selectedProviderId: latest.provider_id,
          }));
        }
        setInitializedFromHistory(true);
      })
      .catch(() => {
        if (!cancelled) setInitializedFromHistory(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, providersLoaded, initializedFromHistory, state.selectedProviderId]);

  useEffect(() => {
    if (!active) return;
    if (!providersLoaded || !initializedFromHistory || !state.selectedProviderId) return;

    let cancelled = false;
    let createdSessionId: string | null = null;
    const targetConversationId = resumeFromConversationId;
    const providerId = state.selectedProviderId;

    setState((prev) => ({
      ...prev,
      isStarting: true,
      error: null,
      messages: [],
      conversationId: targetConversationId,
      providerConversationId: null,
    }));

    (async () => {
      try {
        const startRes = await fetch("/api/copilot/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            ...(targetConversationId ? { conversationId: targetConversationId } : {}),
          }),
        });
        if (!startRes.ok) {
          throw new Error(`Failed to start session: HTTP ${startRes.status}`);
        }

        const { sessionId, session } = (await startRes.json()) as {
          sessionId: string;
          session?: {
            providerId?: CopilotProviderId | null;
            providerConversationId?: string | null;
          };
        };
        if (cancelled) {
          void fetch(`/api/copilot/sessions/${sessionId}`, { method: "DELETE" });
          return;
        }
        createdSessionId = sessionId;
        sessionIdRef.current = sessionId;

        let historyMessages: CopilotMessage[] = [];
        if (targetConversationId) {
          try {
            const histRes = await fetch(`/api/copilot/conversations/${targetConversationId}/messages`);
            if (histRes.ok) {
              const data = (await histRes.json()) as HistoryResponse;
              historyMessages = data.messages.map((message) => ({
                id: message.id,
                role: message.role,
                parts: message.parts,
                createdAt: message.createdAt,
              }));
            }
          } catch {
            // ignore
          }
        }
        if (cancelled) return;

        setState((prev) => ({
          ...prev,
          sessionId,
          messages: historyMessages,
          selectedProviderId: session?.providerId ?? prev.selectedProviderId,
          providerConversationId: session?.providerConversationId ?? null,
        }));

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/copilot/${sessionId}`);
        wsRef.current = ws;

        ws.addEventListener("message", (event) => {
          let frame: CopilotWsFrame;
          try {
            frame = JSON.parse(event.data) as CopilotWsFrame;
          } catch {
            return;
          }

          if (frame.type === "ready") {
            setState((prev) => ({ ...prev, isStarting: false }));
            return;
          }

          if (frame.type === "copilot.stream") {
            appendPartToCurrentAssistant(frame.messageId, frame.part);
            return;
          }

          currentAssistantIdRef.current = null;
          currentMessageIdRef.current = null;
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            conversationId: frame.conversationId ?? prev.conversationId,
            selectedProviderId: frame.providerId ?? prev.selectedProviderId,
          }));
        });

        ws.addEventListener("error", () => {
          setState((prev) => ({ ...prev, error: "WebSocket error" }));
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isStarting: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    return () => {
      cancelled = true;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "panel closed");
      }
      wsRef.current = null;
      const idToDelete = createdSessionId ?? sessionIdRef.current;
      if (idToDelete) {
        void fetch(`/api/copilot/sessions/${idToDelete}`, { method: "DELETE" });
      }
      sessionIdRef.current = null;
      currentAssistantIdRef.current = null;
      currentMessageIdRef.current = null;
      setState((prev) => ({
        ...prev,
        sessionId: null,
        conversationId: null,
        providerConversationId: null,
        messages: [],
        isStreaming: false,
        isStarting: false,
        error: null,
      }));
    };
  }, [
    active,
    appendPartToCurrentAssistant,
    initializedFromHistory,
    providersLoaded,
    restartCounter,
    resumeFromConversationId,
    state.selectedProviderId,
  ]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = sessionIdRef.current;
    if (!id) throw new Error("Copilot session not ready");

    setState((prev) => ({
      ...prev,
      isStreaming: true,
      error: null,
      messages: [
        ...prev.messages,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "user",
          parts: [{ type: "text", content: trimmed }],
          createdAt: Date.now(),
        },
      ],
    }));

    try {
      const response = await fetch(`/api/copilot/sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const startNew = useCallback(() => {
    clearLiveSession();
    setResumeFromConversationId(null);
    setRestartCounter((count) => count + 1);
  }, [clearLiveSession]);

  const switchConversation = useCallback((conversationId: string, providerId: CopilotProviderId) => {
    clearLiveSession();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, providerId);
    setState((prev) => ({
      ...prev,
      selectedProviderId: providerId,
    }));
    setResumeFromConversationId(conversationId);
  }, [clearLiveSession]);

  const setProviderId = useCallback((providerId: CopilotProviderId) => {
    clearLiveSession();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, providerId);
    setResumeFromConversationId(null);
    setState((prev) => ({
      ...prev,
      selectedProviderId: providerId,
    }));
    setRestartCounter((count) => count + 1);
  }, [clearLiveSession]);

  return {
    ...state,
    sendMessage,
    startNew,
    switchConversation,
    setProviderId,
  };
}
