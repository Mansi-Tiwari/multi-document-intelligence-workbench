import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabSpec<Id extends string> {
  id: Id;
  label: string;
  count: number;
}

interface ResultTabsProps<Id extends string> {
  tabs: readonly TabSpec<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  label: string;
  children: ReactNode;
}

/**
 * WAI-ARIA tabs with automatic activation: Left/Right (wrapping), Home and End move between tabs;
 * only the active tab is in the tab order.
 */
export function ResultTabs<Id extends string>({ tabs, active, onChange, label, children }: ResultTabsProps<Id>) {
  const baseId = useId();
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());
  const tabId = (id: Id) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  const focusTab = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (target === undefined) return;
    onChange(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === active);
    switch (event.key) {
      case "ArrowRight":
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        focusTab(index - 1);
        break;
      case "Home":
        focusTab(0);
        break;
      case "End":
        focusTab(tabs.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node === null) tabRefs.current.delete(tab.id);
                else tabRefs.current.set(tab.id, node);
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              className="tabs__tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(tab.id);
              }}
            >
              {tab.label}
              <span className="tabs__count" aria-hidden="true">
                {tab.count}
              </span>
              <span className="visually-hidden"> ({tab.count})</span>
            </button>
          );
        })}
      </div>
      <div className="tabs__panel" role="tabpanel" id={panelId} aria-labelledby={tabId(active)} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
