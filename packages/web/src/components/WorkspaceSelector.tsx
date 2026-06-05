import { useState, useEffect, useRef } from "react";
import { IconFolder, IconPlus } from "./Icons";

interface Props {
  workspaces: { uri: string; name: string }[];
  selected: string;
  onSelect: (uri: string) => void;
  onAddFolder?: () => void;
}

export function WorkspaceSelector({
  workspaces,
  selected,
  onSelect,
  onAddFolder,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel =
    workspaces.find((w) => w.uri === selected)?.name ?? "Project";

  return (
    <div className="model-selector" ref={ref}>
      <button
        className="model-selector-btn"
        onClick={() => setOpen((v) => !v)}
        title="Select workspace"
      >
        <span className="model-selector-label">
          <IconFolder size={12} /> {activeLabel}
        </span>
        <span className="model-selector-caret">▾</span>
      </button>
      {open && (
        <div
          className="model-selector-dropdown"
          style={{ bottom: "auto", top: "100%", marginTop: 4, marginBottom: 0 }}
        >
          {workspaces.map((ws) => {
            const isActive = ws.uri === selected;
            return (
              <button
                key={ws.uri}
                className={`model-option ${isActive ? "active" : ""}`}
                onClick={() => {
                  onSelect(ws.uri);
                  setOpen(false);
                }}
              >
                <span className="model-option-label">{ws.name}</span>
              </button>
            );
          })}
          {onAddFolder && (
            <>
              <div className="model-option-separator" />
              <button
                className="model-option"
                onClick={() => {
                  setOpen(false);
                  onAddFolder();
                }}
              >
                <span className="model-option-label">
                  <IconPlus size={12} /> Add folder
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
