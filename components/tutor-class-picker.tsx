"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type TutorClassOption = { id: string; name: string; weekday: number | null; start_time: string | null; end_time: string | null };

function ClassText({ item }: { item: TutorClassOption }) {
  const parts = item.name.split(/\s+[—–]\s+/);
  const name = parts.length > 1 ? parts.slice(1).join(" · ") : item.name;
  const school = parts.length > 1 ? parts[0] : null;
  const start = item.start_time?.slice(0, 5).replace(":", ".");
  const end = item.end_time?.slice(0, 5).replace(":", ".");
  return <span className="tutor-class-copy">
    <span className="tutor-class-name">{name}</span>
    {school && <span className="tutor-class-school">{school}</span>}
    <span className="tutor-class-time">{start ? start + (end ? "–" + end : "") + " WIB" : "Tanpa jadwal"}</span>
  </span>;
}

export default function TutorClassPicker({ id, labelledBy, describedBy, classes, value, disabled, onChange }: {
  id: string; labelledBy: string; describedBy?: string; classes: TutorClassOption[]; value: string; disabled: boolean; onChange: (id: string) => void;
}) {
  const popupId = useId();
  const valueId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 320 });
  const selected = classes.find((item) => item.id === value);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show(last = false) {
    if (disabled || !classes.length) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const opensAbove = below < 180 && above > below;
      setPlacement({ above: opensAbove, height: Math.min(320, Math.max(80, opensAbove ? above : below)) });
    }
    const index = classes.findIndex((item) => item.id === value);
    setActive(index >= 0 ? index : last ? classes.length - 1 : 0);
    search.current = { text: "", time: 0 };
    setOpen(true);
  }
  function select(index: number) {
    if (disabled || !classes[index]) return;
    close(true);
    onChange(classes[index].id);
  }
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(popupId + "-" + active)?.scrollIntoView({ block: "nearest" });
  }, [open, active, popupId]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!classes.length) setOpen(false);
    else setActive((current) => Math.min(current, classes.length - 1));
  }, [classes]);
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") { close(); return; }
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(active); return; }
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (keys.includes(event.key)) {
      event.preventDefault();
      setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? classes.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + classes.length) % classes.length);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = (now - search.current.time < 800 ? search.current.text : "") + event.key.toLocaleLowerCase("id");
      search.current = { text, time: now };
      const index = classes.findIndex((item) => item.name.toLocaleLowerCase("id").includes(text));
      if (index >= 0) setActive(index);
    }
  }
  return <div className="tutor-class-picker" ref={root}>
    <button id={id} ref={trigger} type="button" className="tutor-class-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={popupId} aria-labelledby={labelledBy + " " + valueId} aria-describedby={describedBy}
      onClick={() => open ? close(true) : show()} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(event.key === "ArrowUp"); }
      }}>
      <span id={valueId}>{selected ? <ClassText item={selected} /> : <span className="tutor-class-placeholder">Pilih kelas</span>}</span>
      <svg className="tutor-class-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
    </button>
    {open && <div id={popupId} ref={list} className={"tutor-class-options" + (placement.above ? " opens-above" : "")} style={{ maxHeight: placement.height }} role="listbox" aria-labelledby={labelledBy} aria-activedescendant={popupId + "-" + active} tabIndex={-1} onKeyDown={handleKey}>
      {classes.map((item, index) => <div id={popupId + "-" + index} key={item.id} role="option" aria-selected={item.id === value} className={"tutor-class-option" + (index === active ? " is-active" : "") + (item.id === value ? " is-selected" : "")} onPointerMove={(event) => { if (event.pointerType !== "touch") setActive(index); }} onMouseDown={(event) => event.preventDefault()} onClick={() => select(index)}>
        <ClassText item={item} />
        {item.id === value && <svg className="tutor-class-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
      </div>)}
    </div>}
  </div>;
}
