import { useState, useCallback } from "react";
import { Terminal } from "./Terminal";

interface TerminalTab {
  id: string;
  title: string;
}

let nextTabNum = 1;

function createTab(): TerminalTab {
  const num = nextTabNum++;
  return {
    id: `term-${Date.now()}-${num}`,
    title: `Terminal ${num}`,
  };
}

interface TerminalPaneProps {
  onClose?: () => void;
}

export function TerminalPane({ onClose }: TerminalPaneProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    const initial = createTab();
    return [initial];
  });
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  const handleAddTab = useCallback(() => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        // Always keep at least one tab
        const fresh = createTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
      if (id === activeTabId) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
      }
      return next;
    });
  }, [activeTabId]);

  return (
    <div className="terminal-pane">
      <div className="terminal-tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? "terminal-tab-active" : ""}`}
          >
            <button
              className="terminal-tab-label"
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.title}
            </button>
            <button
              className="terminal-tab-close"
              onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
              aria-label="Close terminal tab"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          className="terminal-tab-add"
          onClick={handleAddTab}
          title="New terminal"
          aria-label="New terminal"
        >
          +
        </button>
        <div className="terminal-tab-spacer" />
        {onClose && (
          <button
            className="terminal-tab-close-pane"
            onClick={onClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div className="terminal-content">
        {tabs.map((tab) => (
          <Terminal
            key={tab.id}
            sessionId={tab.id}
            isVisible={tab.id === activeTabId}
          />
        ))}
      </div>
    </div>
  );
}
