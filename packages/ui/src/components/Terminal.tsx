import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  isVisible: boolean;
}

export function Terminal({ sessionId, isVisible }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const visibleRef = useRef(isVisible);
  const initialResizeSentRef = useRef(false);

  // Keep visibility ref in sync
  visibleRef.current = isVisible;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        selectionBackground: "#3a3a5c",
        black: "#1a1a2e",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e0e0e0",
        brightBlack: "#6b7280",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    xtermRef.current = term;
    fitRef.current = fit;
    initialResizeSentRef.current = false;

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal/${encodeURIComponent(sessionId)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output" || msg.type === "replay") {
          term.write(msg.data);
        }
      } catch {
        // ignore
      }
    };

    ws.onopen = () => {
      // Only send initial resize if visible — hidden containers have
      // zero/wrong dimensions which would corrupt the PTY's column count
      if (!visibleRef.current) return;

      let attempts = 0;
      const sendInitialSize = () => {
        try {
          fit.fit();
          if (term.cols >= 20 || attempts >= 10) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            initialResizeSentRef.current = true;
          } else {
            attempts++;
            requestAnimationFrame(sendInitialSize);
          }
        } catch { /* ignore */ }
      };
      requestAnimationFrame(sendInitialSize);
    };

    // Forward user input to server
    const inputDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN && visibleRef.current) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      inputDisposable.dispose();
      resizeDisposable.dispose();
      ws.close();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [sessionId]);

  // When becoming visible: fit and send resize (may be the first resize for this session)
  useEffect(() => {
    if (!isVisible) return;
    const fit = fitRef.current;
    const term = xtermRef.current;
    const ws = wsRef.current;
    if (!fit || !term) return;

    let attempts = 0;
    const fitAndResize = () => {
      try {
        fit.fit();
        if (ws && ws.readyState === WebSocket.OPEN && (term.cols >= 20 || attempts >= 10)) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          initialResizeSentRef.current = true;
        } else if (term.cols < 20 && attempts < 10) {
          attempts++;
          requestAnimationFrame(fitAndResize);
        }
      } catch { /* ignore */ }
    };
    requestAnimationFrame(fitAndResize);
  }, [isVisible]);

  // Re-fit on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const fit = fitRef.current;
      const term = xtermRef.current;
      const ws = wsRef.current;
      if (!fit || !term || !visibleRef.current) return;
      try {
        fit.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch { /* ignore */ }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: isVisible ? "block" : "none" }}
    />
  );
}
