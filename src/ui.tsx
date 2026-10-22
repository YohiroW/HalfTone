import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { ChevronDown, FilePlus2, FolderOpen, Save } from "lucide-react";

export function Modal({
  children,
  label,
  busy,
  onClose,
}: {
  children: ReactNode;
  label: string;
  busy: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog-shell"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="disclosure"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {title}
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}

export function FileMenu({
  onNew,
  onOpen,
  onSave,
}: {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && ref.current)
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const close = () => {
    ref.current!.open = false;
    ref.current!.querySelector("summary")?.focus();
  };
  return (
    <details
      ref={ref}
      className="file-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          e.currentTarget.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
        if (["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          ref.current!.open = true;
          const buttons = [...ref.current!.querySelectorAll("button")];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            index < 0
              ? e.key === "ArrowDown"
                ? 0
                : buttons.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <summary>
        File
        <ChevronDown size={13} aria-hidden="true" />
      </summary>
      <div className="file-popover">
        <button
          onClick={() => {
            close();
            onNew();
          }}
        >
          <FilePlus2 size={16} />
          New project
        </button>
        <button
          onClick={() => {
            close();
            onOpen();
          }}
        >
          <FolderOpen size={16} />
          Open project
        </button>
        <button
          onClick={() => {
            close();
            onSave();
          }}
        >
          <Save size={16} />
          Save project
        </button>
        <p>Save a portable copy to your device.</p>
      </div>
    </details>
  );
}

// Each row has a selection button and separate action buttons, never nested buttons.
export function navigateList(e: KeyboardEvent<HTMLElement>) {
  if (!(e.target instanceof HTMLElement) || !e.target.matches(".row-select"))
    return;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const items = [
    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(".row-select"),
  ];
  const current = items.indexOf(e.target as HTMLButtonElement);
  const index =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? items.length - 1
        : Math.max(
            0,
            Math.min(
              items.length - 1,
              current + (e.key === "ArrowDown" ? 1 : -1),
            ),
          );
  items[index]?.focus();
  items[index]?.click();
}

export function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width: 1100px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width: 1100px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}
