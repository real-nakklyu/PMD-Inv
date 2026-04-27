import { ChevronDown } from "lucide-react";
import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type OptionHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground hover:border-muted-foreground/45 focus:border-ring focus:bg-background focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, value, defaultValue, onChange, onBlur, name, disabled, ...props }, ref) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(String(value ?? defaultValue ?? ""));
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);

  const options = useMemo(() => {
    return Children.toArray(children).flatMap((child): OptionItem[] => {
      if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child) || child.type !== "option") return [];
      const optionValue = child.props.value === undefined ? String(child.props.children ?? "") : String(child.props.value);
      return [{
        value: optionValue,
        label: String(child.props.children ?? optionValue),
        disabled: child.props.disabled
      }];
    });
  }, [children]);

  const fallbackValue = internalValue || (options[0]?.value ?? "");
  const selectedValue = String(value ?? fallbackValue);
  const selectedOption = options.find((item) => item.value === selectedValue) ?? options[0];
  const selectedIndex = Math.max(0, options.findIndex((item) => item.value === selectedValue));

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(String(value));
      return;
    }
    const browserValue = selectRef.current?.value;
    if (browserValue) setInternalValue(browserValue);
  }, [value]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const button = rootRef.current?.querySelector("button");
      const rect = button?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
    };
  }, []);

  function assignRef(node: HTMLSelectElement | null) {
    selectRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      ref.current = node;
    }
  }

  function choose(nextValue: string) {
    if (disabled) return;
    setInternalValue(nextValue);
    setOpen(false);

    if (selectRef.current) {
      selectRef.current.value = nextValue;
    }
    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name }
    } as ChangeEvent<HTMLSelectElement>);
  }

  function moveActive(direction: 1 | -1) {
    const enabledIndexes = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
    if (!enabledIndexes.length) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition === -1
      ? 0
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  }

  function searchByText(character: string) {
    if (character.length !== 1 || character.trim() === "") return;
    typeaheadRef.current += character.toLowerCase();
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = "";
    }, 700);
    const index = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typeaheadRef.current));
    if (index >= 0) {
      setActiveIndex(index);
      if (!open) {
        choose(options[index].value);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && options[activeIndex] && !options[activeIndex].disabled) {
        choose(options[activeIndex].value);
      } else {
        setOpen(true);
      }
      return;
    }
    searchByText(event.key);
  }

  return (
    <span ref={rootRef} className={cn("group/select relative block w-full", className)}>
      <select
        ref={assignRef}
        name={name}
        value={selectedValue}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...props}
      >
        {children}
      </select>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-0 pr-1.5 text-left text-sm font-medium text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background,transform] hover:border-primary/55 hover:bg-background hover:shadow-md hover:shadow-primary/[0.06] focus-visible:border-ring focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-ring/15 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate">{selectedOption?.label ?? "Select"}</span>
        <span className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground transition-[background,color,transform] group-hover/select:bg-primary/10 group-hover/select:text-primary group-focus-within/select:bg-primary group-focus-within/select:text-primary-foreground group-active/select:translate-y-px">
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
        </span>
      </button>
      {open && typeof document !== "undefined" ? createPortal((
        <div
          ref={menuRef}
          role="listbox"
          aria-labelledby={id}
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top ?? 0,
            width: menuPosition?.width ?? 0
          }}
          className="fixed z-[100] max-h-64 overflow-y-auto rounded-md border border-border bg-card p-1.5 text-sm shadow-xl shadow-slate-950/10"
        >
          {options.map((option, index) => {
            const selected = option.value === selectedValue;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={cn(
                  "flex min-h-9 w-full items-center rounded px-2.5 text-left font-medium text-foreground transition-[background,color,transform] duration-200 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
                  selected && "bg-primary/14 text-primary",
                  active && !selected && "bg-primary/8 text-primary"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ), document.body) : null}
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground shadow-sm shadow-slate-950/[0.03] outline-none transition-[border-color,box-shadow,background] placeholder:text-muted-foreground hover:border-muted-foreground/45 focus:border-ring focus:bg-background focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Checkbox({ className, ...props }, ref) {
  return (
    <span className={cn("pmd-checkbox", className)}>
      <input ref={ref} type="checkbox" className="pmd-checkbox-input" {...props} />
      <span className="pmd-checkbox-box" aria-hidden="true">
        <svg width="12" height="10" viewBox="0 0 12 10">
          <polyline points="1.5 6 4.5 9 10.5 1" />
        </svg>
      </span>
    </span>
  );
});
