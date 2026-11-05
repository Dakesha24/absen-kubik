"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from "react";
import { NavIcon } from "@/components/nav-icon";

type SchoolClass = { id: string; name: string; location_name: string | null; description?: string | null; latitude?: number | null; longitude?: number | null; radius_m?: number | null; active: boolean; student_count: number; weekday: number | null; start_time: string | null; end_time: string | null };
type Panel = { kind: "schedule" | "students" | "deleteClass"; classId: string };
type RosterStudent = { id: string; name: string; phone: string | null };
type Roster = { members: RosterStudent[] };
type StudentDraft = { name: string; phone: string };
const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const emptySchoolForm = { schoolName: "", className: "", address: "", latitude: "", longitude: "", radiusM: "", notes: "" };

async function api(path: string, body?: unknown, method = body ? "POST" : "GET") {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Permintaan gagal. Coba lagi.");
  return result;
}
function identity(item: SchoolClass) {
  const parts = item.name.split(/\s+[—–]\s+/);
  return { school: parts.length > 1 ? parts[0] : "Sekolah lainnya", name: parts.length > 1 ? parts.slice(1).join(" · ") : item.name };
}
function scheduleLabel(item: SchoolClass) {
  if (item.weekday === null || item.weekday === undefined) return "Hari dan jam belum diatur";
  return "Setiap " + days[item.weekday] + " · " + item.start_time?.slice(0, 5) + (item.end_time ? "–" + item.end_time.slice(0, 5) : "") + " WIB";
}
function SchoolDialog({ title, children, busy, onClose }: { title: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (ref.current?.querySelector<HTMLElement>("input, select") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !latest.current.busy) latest.current.onClose();
      if (event.key !== "Tab") return;
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)") || []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={ref} className="modal school-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="modal-head"><h2 id={id}>{title}</h2><button className="close-btn" onClick={onClose} disabled={busy} aria-label="Tutup">×</button></div>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export default function AdminSchoolDashboard({ classes, onReload }: {
  classes: SchoolClass[]; onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [classId, setClassId] = useState("");
  const [schoolForm, setSchoolForm] = useState(emptySchoolForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [roster, setRoster] = useState<Roster>({ members: [] });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [studentCount, setStudentCount] = useState("1");
  const [studentDrafts, setStudentDrafts] = useState<StudentDraft[]>([{ name: "", phone: "" }]);
  const [studentNotice, setStudentNotice] = useState("");
  const [studentAction, setStudentAction] = useState<{ kind: "edit" | "delete"; student: RosterStudent } | null>(null);
  const [studentEditDraft, setStudentEditDraft] = useState<StudentDraft>({ name: "", phone: "" });
  const [deleteClassConfirmation, setDeleteClassConfirmation] = useState("");
  const activeClasses = classes.filter((item) => item.active);
  const schools = new Map<string, SchoolClass>();
  for (const item of classes) {
    const parts = item.name.split(/\s+[—–]\s+/);
    if (parts.length > 1 && !schools.has(parts[0])) schools.set(parts[0], item);
  }
  const selectedClass = classes.find((item) => item.id === (panel?.kind === "schedule" ? classId : panel?.classId));
  const rosterId = panel?.kind === "students" ? panel.classId : null;
  const studentTotal = Number(studentCount);
  const studentCountValid = Number.isInteger(studentTotal) && studentTotal >= 1 && studentTotal <= 100;
  useEffect(() => {
    if (!rosterId) return;
    let active = true;
    setRosterLoading(true); setRoster({ members: [] });
    api("/api/admin/school-schedules/students?classId=" + rosterId)
      .then((result) => { if (active) setRoster(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Gagal memuat siswa."); })
      .finally(() => { if (active) setRosterLoading(false); });
    return () => { active = false; };
  }, [rosterId]);
  function open(kind: Panel["kind"], id = "") {
    if (busy) return;
    const item = classes.find((candidate) => candidate.id === id);
    const parts = item?.name.split(/\s+[—–]\s+/) || [];
    setSchoolForm(item ? {
      schoolName: parts.length > 1 ? parts[0] : "",
      className: parts.length > 1 ? parts.slice(1).join(" — ") : item.name,
      address: item.location_name || "", latitude: item.latitude?.toString() || "",
      longitude: item.longitude?.toString() || "", radiusM: item.radius_m?.toString() || "", notes: item.description || "",
    } : emptySchoolForm);
    setStudentCount("1"); setStudentDrafts([{ name: "", phone: "" }]); setStudentNotice("");
    setStudentAction(null); setDeleteClassConfirmation("");
    setClassId(id); setError(""); setPanel({ kind, classId: id });
  }
  function closePanel() {
    if (busy) return;
    if (studentAction) setStudentAction(null); else setPanel(null);
    setError("");
  }
  function openStudentAction(kind: "edit" | "delete", student: RosterStudent) {
    setError(""); setStudentNotice("");
    setStudentEditDraft({ name: student.name, phone: student.phone || "" });
    setStudentAction({ kind, student });
  }
  async function deleteClass() {
    if (!panel || panel.kind !== "deleteClass" || busy || deleteClassConfirmation !== "delete") return;
    setBusy(true); setError("");
    try {
      await api("/api/admin/school-schedules", { classId: panel.classId, confirmation: deleteClassConfirmation }, "DELETE");
      setPanel(null); setNotice("Kelas dihapus dari jadwal. Riwayat absensi tetap tersimpan.");
      await onReload();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menghapus kelas."); }
    finally { setBusy(false); }
  }
  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rosterId || studentAction?.kind !== "edit" || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api("/api/admin/school-schedules/students", { classId: rosterId, studentId: studentAction.student.id, ...studentEditDraft }, "PATCH");
      setRoster((current) => ({ members: current.members.map((student) => student.id === result.student.id ? result.student : student) }));
      setStudentAction(null); setStudentNotice("Data siswa berhasil diperbarui.");
      await onReload();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal memperbarui siswa."); }
    finally { setBusy(false); }
  }
  async function deleteStudent() {
    if (!rosterId || studentAction?.kind !== "delete" || busy) return;
    const studentId = studentAction.student.id;
    setBusy(true); setError("");
    try {
      await api("/api/admin/school-schedules/students", { classId: rosterId, studentId, confirmed: true }, "DELETE");
      setRoster((current) => ({ members: current.members.filter((student) => student.id !== studentId) }));
      setStudentAction(null); setStudentNotice("Siswa dihapus dari kelas. Riwayat absensinya tetap tersimpan.");
      await onReload();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menghapus siswa."); }
    finally { setBusy(false); }
  }
  function changeStudentCount(value: string) {
    setStudentCount(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 1 && count <= 100) {
      setStudentDrafts((current) => Array.from({ length: Math.max(current.length, count) }, (_, index) => current[index] || { name: "", phone: "" }));
    }
  }
  function updateStudentDraft(index: number, field: keyof StudentDraft, value: string) {
    setStudentDrafts((current) => current.map((draft, position) => position === index ? { ...draft, [field]: value } : draft));
  }
  function changeSchool(schoolName: string) {
    const existing = schools.get(schoolName.trim());
    setSchoolForm((current) => existing && schoolName !== current.schoolName ? {
      ...current, schoolName, address: existing.location_name || "",
      latitude: existing.latitude?.toString() || "", longitude: existing.longitude?.toString() || "",
      radiusM: existing.radius_m?.toString() || "",
    } : { ...current, schoolName });
  }
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError("");
    try {
      await api("/api/admin/school-schedules", { ...values, classId });
      await onReload(); setPanel(null); setNotice("Kelas dan jadwal berhasil disimpan.");
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan jadwal."); }
    finally { setBusy(false); }
  }
  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rosterId || busy) return;
    if (!studentCountValid) { setError("Jumlah siswa harus antara 1–100."); return; }
    const students = studentDrafts.slice(0, studentTotal);
    if (students.length !== studentTotal || students.some((student) => !student.name.trim())) { setError("Lengkapi nama seluruh siswa sebelum menyimpan."); return; }
    setBusy(true); setError(""); setStudentNotice("");
    let saved = false;
    try {
      const result = await api("/api/admin/school-schedules/students", { students, classId: rosterId });
      saved = true;
      setStudentCount("1"); setStudentDrafts([{ name: "", phone: "" }]);
      setStudentNotice(result.savedCount + " siswa berhasil ditambahkan.");
      await onReload();
      setRoster(await api("/api/admin/school-schedules/students?classId=" + rosterId));
    } catch (err) { setError(saved ? "Siswa sudah tersimpan, tetapi daftar belum dapat dimuat ulang. Tutup dan buka kembali modal siswa." : err instanceof Error ? err.message : "Gagal menambahkan siswa."); }
    finally { setBusy(false); }
  }
  const groups = new Map<string, SchoolClass[]>();
  for (const item of activeClasses.filter((item) => (item.name + " " + (item.location_name || "")).toLowerCase().includes(search.toLowerCase()))) {
    const school = identity(item).school;
    groups.set(school, [...(groups.get(school) || []), item]);
  }
  return <div className="school-dashboard">
    <section className="card class-picker-card school-list-controls">
      <div className="card-heading"><h2>Jadwal kelas</h2><button className="btn small" onClick={() => open("schedule")}>+ Tambah kelas</button></div>
      {activeClasses.length > 0 && <div className="field"><input aria-label="Cari sekolah atau kelas" type="search" placeholder="Cari sekolah atau kelas" value={search} onChange={(event) => setSearch(event.target.value)} /></div>}
      {!activeClasses.length && <div className="empty-state"><div className="empty-icon"><NavIcon name="classes" /></div><p>Belum ada jadwal kelas. Tambahkan sekolah, kelas, serta hari dan jam belajarnya untuk memulai.</p><button className="btn" onClick={() => open("schedule")}>Buat kelas pertama</button></div>}
    </section>
    {notice && <div className="message success" role="status">{notice}</div>}
    {activeClasses.length > 0 && !groups.size && <section className="card"><div className="empty-state">Sekolah atau kelas tidak ditemukan.<button className="btn ghost" onClick={() => setSearch("")}>Tampilkan semua</button></div></section>}
    {Array.from(groups).map(([school, items]) => <section className="card history-card school-list-card" key={school}>
      <div className="card-heading"><h2>{school}</h2></div>
      <div className="table-wrap"><table className="data-table admin-tutor-table admin-schedule-table" aria-label={"Jadwal kelas " + school}>
        <thead><tr><th>Kelas dan jadwal</th><th>Siswa</th><th>Aksi</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td><strong>{identity(item).name}</strong><span className="table-muted">{scheduleLabel(item)}</span></td>
          <td className="school-student-count">{item.student_count} siswa</td>
          <td><div className="school-class-actions">
            <button type="button" className="btn ghost schedule-icon-button schedule-students-button" title="Kelola siswa" aria-label={"Kelola siswa " + item.name} onClick={() => open("students", item.id)}><NavIcon name="students" /></button>
            <button type="button" className="btn ghost schedule-icon-button" title="Edit kelas dan jadwal" aria-label={"Edit kelas dan jadwal " + item.name} onClick={() => open("schedule", item.id)}><NavIcon name="edit" /></button>
            <button type="button" className="btn ghost schedule-icon-button schedule-delete-button" title="Hapus kelas" aria-label={"Hapus kelas " + item.name} onClick={() => open("deleteClass", item.id)}><NavIcon name="trash" /></button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
    {panel && <SchoolDialog key={panel.kind + panel.classId + (studentAction?.kind || "") + (studentAction?.student.id || "")} title={panel.kind === "deleteClass" ? "Hapus kelas?" : panel.kind === "schedule" ? classId ? "Edit kelas dan jadwal" : "Tambah kelas dan jadwal" : studentAction?.kind === "edit" ? "Edit siswa" : studentAction?.kind === "delete" ? "Hapus siswa?" : "Siswa kelas"} busy={busy} onClose={closePanel}>
      {error && <div className="message error" role="alert">{error}</div>}
      {panel.kind === "deleteClass" && <>
        <p>Kelas <strong>{selectedClass?.name}</strong> akan dihapus dari jadwal dan tidak tersedia untuk presensi baru. Riwayat pertemuan, absensi, dan dokumentasi tetap tersimpan.</p>
        <div className="field"><label htmlFor="delete-class-confirmation">Ketik delete untuk mengonfirmasi</label><input id="delete-class-confirmation" value={deleteClassConfirmation} onChange={(event) => setDeleteClassConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} /></div>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={closePanel} disabled={busy}>Batal</button><button type="button" className="btn danger" onClick={() => void deleteClass()} disabled={busy || deleteClassConfirmation !== "delete"}>{busy ? "Menghapus…" : "Hapus kelas"}</button></div>
      </>}
      {panel.kind === "schedule" && <form className="form-stack" onSubmit={saveSchedule}>
        <div className="field"><label htmlFor="schedule-school">Nama sekolah</label><input id="schedule-school" name="schoolName" list="schedule-schools" value={schoolForm.schoolName} onChange={(event) => changeSchool(event.target.value)} required maxLength={80} disabled={busy} autoComplete="off" aria-describedby="schedule-school-help" /><datalist id="schedule-schools">{Array.from(schools.keys()).sort((a, b) => a.localeCompare(b, "id")).map((school) => <option key={school} value={school} />)}</datalist><span className="field-help" id="schedule-school-help">Pilih sekolah yang sudah ada dari saran, atau ketik nama sekolah baru.</span></div>
        <div className="field"><label htmlFor="schedule-name">Nama kelas / program</label><input id="schedule-name" name="className" value={schoolForm.className} onChange={(event) => setSchoolForm({ ...schoolForm, className: event.target.value })} required maxLength={80} disabled={busy} /></div>
        <div className="field"><label htmlFor="schedule-address">Alamat sekolah</label><textarea id="schedule-address" name="address" value={schoolForm.address} onChange={(event) => setSchoolForm({ ...schoolForm, address: event.target.value })} required maxLength={160} rows={2} disabled={busy} /></div>
        <details className="school-location-settings"><summary>Lokasi check-in (opsional)</summary><p>Isi koordinat dan radius yang ditetapkan sekolah jika sudah tersedia.</p><div className="form-grid"><div className="field"><label htmlFor="schedule-lat">Latitude</label><input id="schedule-lat" name="latitude" value={schoolForm.latitude} onChange={(event) => setSchoolForm({ ...schoolForm, latitude: event.target.value })} type="number" step="any" min={-90} max={90} disabled={busy} /></div><div className="field"><label htmlFor="schedule-lng">Longitude</label><input id="schedule-lng" name="longitude" value={schoolForm.longitude} onChange={(event) => setSchoolForm({ ...schoolForm, longitude: event.target.value })} type="number" step="any" min={-180} max={180} disabled={busy} /></div><div className="field"><label htmlFor="schedule-radius">Radius (meter)</label><input id="schedule-radius" name="radiusM" value={schoolForm.radiusM} onChange={(event) => setSchoolForm({ ...schoolForm, radiusM: event.target.value })} type="number" min={25} max={5000} disabled={busy} /></div></div></details>
        <div className="field"><label htmlFor="schedule-notes">Keterangan (opsional)</label><textarea id="schedule-notes" name="notes" value={schoolForm.notes} onChange={(event) => setSchoolForm({ ...schoolForm, notes: event.target.value })} maxLength={500} disabled={busy} /></div>
        <div className="field"><label htmlFor="schedule-day">Hari belajar</label><select key={"day-" + classId} id="schedule-day" name="weekday" required defaultValue={selectedClass?.weekday ?? ""} disabled={busy}><option value="" disabled>Pilih hari</option>{[1, 2, 3, 4, 5, 6, 0].map((day) => <option key={day} value={day}>{days[day]}</option>)}</select></div>
        <div className="form-grid"><div className="field"><label htmlFor="schedule-start">Jam mulai (WIB)</label><input key={"start-" + classId} id="schedule-start" name="startTime" type="time" required defaultValue={selectedClass?.start_time?.slice(0, 5) || ""} disabled={busy} /></div><div className="field"><label htmlFor="schedule-end">Jam selesai (opsional)</label><input key={"end-" + classId} id="schedule-end" name="endTime" type="time" defaultValue={selectedClass?.end_time?.slice(0, 5) || ""} disabled={busy} /></div></div>
        <div className="form-actions"><button type="button" className="btn ghost" disabled={busy} onClick={() => setPanel(null)}>Batal</button><button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan jadwal"}</button></div>
      </form>}
      {panel.kind === "students" && studentAction?.kind === "edit" && <form className="form-stack" onSubmit={saveStudent}>
        <p className="school-dialog-context">{selectedClass?.name}</p>
        <div className="field"><label htmlFor="edit-student-name">Nama lengkap</label><input id="edit-student-name" value={studentEditDraft.name} onChange={(event) => setStudentEditDraft({ ...studentEditDraft, name: event.target.value })} required maxLength={120} disabled={busy} /></div>
        <div className="field"><label htmlFor="edit-student-phone">Telepon orang tua (opsional)</label><input id="edit-student-phone" type="tel" value={studentEditDraft.phone} onChange={(event) => setStudentEditDraft({ ...studentEditDraft, phone: event.target.value })} maxLength={40} disabled={busy} /></div>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={closePanel} disabled={busy}>Batal</button><button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></div>
      </form>}
      {panel.kind === "students" && studentAction?.kind === "delete" && <>
        <p>Hapus <strong>{studentAction.student.name}</strong> dari kelas <strong>{selectedClass?.name}</strong>?</p>
        <p className="school-dialog-context">Siswa tidak lagi muncul pada daftar kelas ini. Riwayat absensi dan keanggotaan di kelas lain tetap tersimpan.</p>
        <div className="form-actions"><button type="button" className="btn ghost" onClick={closePanel} disabled={busy}>Batal</button><button type="button" className="btn danger" onClick={() => void deleteStudent()} disabled={busy}>{busy ? "Menghapus…" : "Hapus siswa"}</button></div>
      </>}
      {panel.kind === "students" && !studentAction && <><p className="school-dialog-context">{selectedClass?.name}</p>{rosterLoading ? <p role="status">Memuat siswa…</p> : <>
        <div className="school-roster"><h3>{roster.members.length} siswa terdaftar</h3>{roster.members.length ? <ul>{roster.members.map((student) => <li key={student.id}>
          <div className="school-roster-name"><strong>{student.name}</strong>{student.phone && <span>{student.phone}</span>}</div>
          <div className="school-roster-actions"><button type="button" className="btn ghost roster-icon-button" title="Edit siswa" aria-label={"Edit " + student.name} onClick={() => openStudentAction("edit", student)}><NavIcon name="edit" /></button><button type="button" className="btn ghost roster-icon-button roster-delete-button" title="Hapus siswa" aria-label={"Hapus " + student.name} onClick={() => openStudentAction("delete", student)}><NavIcon name="trash" /></button></div>
        </li>)}</ul> : <p>Belum ada siswa di kelas ini.</p>}</div>
        <form className="form-stack" onSubmit={addStudent}>
          {studentNotice && <div className="message success" role="status">{studentNotice}</div>}
          <div className="field"><label htmlFor="school-student-count">Jumlah siswa yang akan dimasukkan</label><input id="school-student-count" className="school-student-count-input" type="number" min={1} max={100} step={1} required value={studentCount} onChange={(event) => changeStudentCount(event.target.value)} disabled={busy} aria-describedby="school-student-count-help" /><span id="school-student-count-help" className="field-help">Masukkan 1–100 siswa sekaligus, lalu isi nama pada setiap baris.</span></div>
          <div className="school-student-batch">{studentCountValid && studentDrafts.slice(0, studentTotal).map((student, index) => <fieldset className="school-student-row" key={index}>
            <legend>Siswa {index + 1}</legend><div className="school-student-fields">
              <div className="field"><label htmlFor={"school-student-name-" + index}>Nama lengkap</label><input id={"school-student-name-" + index} value={student.name} onChange={(event) => updateStudentDraft(index, "name", event.target.value)} required maxLength={120} disabled={busy} /></div>
              <div className="field"><label htmlFor={"school-student-phone-" + index}>Telepon orang tua (opsional)</label><input id={"school-student-phone-" + index} value={student.phone} onChange={(event) => updateStudentDraft(index, "phone", event.target.value)} type="tel" maxLength={40} disabled={busy} /></div>
            </div>
          </fieldset>)}</div>
          <div className="school-student-submit"><button className="btn full" disabled={busy || !studentCountValid}>{busy ? "Menyimpan…" : studentCountValid ? "Simpan " + studentTotal + " siswa" : "Simpan siswa"}</button></div>
        </form></>}</>}

    </SchoolDialog>}
  </div>;
}
