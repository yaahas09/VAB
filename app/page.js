"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Clock, Trash2, Receipt, FileText, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ORG_NAME = "ವಿದ್ಯಾರಣ್ಯಪುರ ಆತ್ಮೀಯರ ಬಳಗ (ರಿ)";
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "1234";
const STATUS = { RECEIVED: "received", PENDING: "pending" };

function formatMoney(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function buildReceiptText(entry) {
  const dateStr = new Date(entry.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const statusLine =
    entry.status === STATUS.RECEIVED ? "Payment received ✅" : "Payment pending ⏳";
  return (
    `*${ORG_NAME}*\n*Receipt*\n` +
    `Name: ${entry.name}\nAmount: ₹${formatMoney(entry.amount)}\n` +
    `Status: ${statusLine}\nDate: ${dateStr}`
  );
}

function waLink(phone, text) {
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState(null); // null | 'admin' | 'member'
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [myName, setMyName] = useState("");
  const [newMemberInput, setNewMemberInput] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [previewEntry, setPreviewEntry] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  async function loadEntries() {
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setEntries(data);
    setLoading(false);
  }

  async function loadMembers() {
    const { data, error } = await supabase.from("members").select("name").order("name");
    if (!error && data) setMembers(data.map((m) => m.name));
  }

  useEffect(() => {
    loadEntries();
    loadMembers();
    const interval = setInterval(() => {
      loadEntries();
      loadMembers();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function ensureMember(nameValue) {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    await supabase.from("members").upsert({ name: trimmed }, { onConflict: "name" });
    loadMembers();
  }

  async function addMemberManually() {
    const trimmed = newMemberInput.trim();
    if (!trimmed) return;
    await supabase.from("members").upsert({ name: trimmed }, { onConflict: "name" });
    setNewMemberInput("");
    loadMembers();
  }

  async function removeMember(nameValue) {
    await supabase.from("members").delete().eq("name", nameValue);
    loadMembers();
  }

  function handleAdminLogin() {
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setRole("admin");
      setLoginError("");
      setPinInput("");
    } else {
      setLoginError("Incorrect PIN.");
    }
  }

  function handleMemberLogin() {
    if (!selectedMember) {
      setLoginError("Select your name to continue.");
      return;
    }
    setMyName(selectedMember);
    setRole("member");
    setLoginError("");
  }

  function logout() {
    setRole(null);
    setIsAdmin(false);
    setLoginError("");
    setPinInput("");
    setSelectedMember("");
  }

  function validate() {
    if (!myName.trim()) return "Your name is missing — log in again.";
    if (!name.trim()) return "Enter a name.";
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 8) return "Enter a valid contact number.";
    if (!amount || Number(amount) <= 0) return "Enter an amount greater than 0.";
    return "";
  }

  async function addEntry(status) {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    const entry = {
      name: name.trim(),
      phone: phone.replace(/[^\d]/g, ""),
      amount: Number(amount),
      status,
      collected_by: myName.trim(),
    };
    const { data, error: insertError } = await supabase
      .from("entries")
      .insert(entry)
      .select()
      .single();
    if (!insertError && data) {
      setEntries((prev) => [data, ...prev]);
      ensureMember(entry.collected_by);
      window.open(waLink(data.phone, buildReceiptText(data)), "_blank");
      setName("");
      setPhone("");
      setAmount("");
    }
  }

  async function removeEntry(id) {
    await supabase.from("entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function matchesSelectedDate(iso) {
    return iso.slice(0, 10) === selectedDate;
  }

  const myEntriesToday = entries.filter(
    (e) =>
      e.collected_by &&
      e.collected_by.toLowerCase() === myName.trim().toLowerCase() &&
      matchesSelectedDate(e.created_at)
  );
  const myTotalReceivedToday = myEntriesToday
    .filter((e) => e.status === STATUS.RECEIVED)
    .reduce((s, e) => s + Number(e.amount), 0);
  const myTotalPendingToday = myEntriesToday
    .filter((e) => e.status === STATUS.PENDING)
    .reduce((s, e) => s + Number(e.amount), 0);

  const totalReceived = entries
    .filter((e) => e.status === STATUS.RECEIVED)
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = entries
    .filter((e) => e.status === STATUS.PENDING)
    .reduce((s, e) => s + Number(e.amount), 0);

  if (!role) {return (
      <div className="min-h-screen bg-[#F1EDE4] text-[#2B2724] font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src="/logo.jpg" alt="Logo" className="w-20 h-20 mx-auto mb-3 rounded-full" />
            <p className="text-lg font-semibold mb-1 leading-snug">{ORG_NAME}</p>
            <div className="flex items-center justify-center gap-2">
              <Receipt size={24} className="text-[#8A3324]" />
              <h1 className="font-serif text-3xl tracking-tight">Ledger</h1>
            </div>
          </div>

          <div className="bg-white border border-[#DCD3C2] rounded-xl p-5 mb-4 shadow-sm">
            <h2 className="text-xs uppercase tracking-wide text-[#8A7F6E] mb-3">Admin login</h2>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter PIN"
              className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7] mb-3"
            />
            <button
              onClick={handleAdminLogin}
              style={{ backgroundColor: "#8A3324" }}
              className="w-full py-2.5 rounded-md text-white text-sm font-medium"
            >
              Log in as Admin
            </button>
          </div>

          <div className="bg-white border border-[#DCD3C2] rounded-xl p-5 shadow-sm">
            <h2 className="text-xs uppercase tracking-wide text-[#8A7F6E] mb-3">Member login</h2>
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7] mb-3"
            >
              <option value="">Select your name…</option>
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={handleMemberLogin}
              style={{ backgroundColor: "#2F6B3C" }}
              className="w-full py-2.5 rounded-md text-white text-sm font-medium"
            >
              Continue
            </button>
          </div>

          {loginError && <p className="text-sm text-[#8A3324] mt-4 text-center">{loginError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1EDE4] text-[#2B2724] font-sans">
      <div className="max-w-md mx-auto px-4 py-8">
        <header className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Logo" className="w-12 h-12 rounded-full shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-snug">{ORG_NAME}</p>
              <div className="flex items-center gap-1.5">
                <Receipt size={18} className="text-[#8A3324]" />
                <h1 className="font-serif text-xl tracking-tight">Ledger</h1>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-full font-medium bg-white border border-[#DCD3C2] text-[#8A7F6E] shrink-0"
          >
            {role === "admin" ? "Admin" : myName} · Logout
          </button>
        </header>

        <div className="bg-white border border-[#DCD3C2] rounded-xl p-4 mb-6 shadow-sm">
          <label className="block text-xs uppercase tracking-wide text-[#8A7F6E] mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white/70 border border-[#DCD3C2] rounded-lg px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[#8A7F6E]">Received</p>
            <p className="font-mono text-lg text-[#2F6B3C] mt-1">₹{formatMoney(totalReceived)}</p>
          </div>
          <div className="bg-white/70 border border-[#DCD3C2] rounded-lg px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[#8A7F6E]">Pending</p>
            <p className="font-mono text-lg text-[#8A3324] mt-1">₹{formatMoney(totalPending)}</p>
          </div>
        </div>

        <div className="bg-white border border-[#DCD3C2] rounded-xl p-4 mb-8 shadow-sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#8A7F6E] mb-1">
                Collected by
              </label>
              <input
                value={myName}
                onChange={(e) => isAdmin && setMyName(e.target.value)}
                readOnly={role === "member"}
                className={`w-full rounded-md border border-[#DCD3C2] px-3 py-2 ${
                  role === "member" ? "bg-[#F1EDE4] text-[#8A7F6E]" : "bg-[#FBFAF7]"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#8A7F6E] mb-1">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#8A7F6E] mb-1">
                Contact number
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7] font-mono"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-[#8A7F6E] mb-1">
                Amount (₹)
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                placeholder="e.g. 2500"
                className="w-full rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7] font-mono"
              />
            </div>
            {error && <p className="text-sm text-[#8A3324]">{error}</p>}
            <div className="flex flex-col gap-3 pt-1">
              <button
                onClick={() => addEntry(STATUS.RECEIVED)}
                style={{ backgroundColor: "#2F6B3C" }}
                className="flex items-center justify-center gap-1.5 rounded-md text-white py-3 text-sm font-medium w-full"
              >
                <CheckCircle2 size={16} /> Received
              </button>
              <button
                onClick={() => addEntry(STATUS.PENDING)}
                style={{ backgroundColor: "#8A3324" }}
                className="flex items-center justify-center gap-1.5 rounded-md text-white py-3 text-sm font-medium w-full"
              >
                <Clock size={16} /> Pending payment
              </button>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white border border-[#DCD3C2] rounded-xl p-4 mb-8 shadow-sm">
            <h2 className="text-xs uppercase tracking-wide text-[#8A7F6E] mb-3">
              Manage members
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                value={newMemberInput}
                onChange={(e) => setNewMemberInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMemberManually()}
                placeholder="e.g. Suresh"
                className="flex-1 rounded-md border border-[#DCD3C2] px-3 py-2 bg-[#FBFAF7]"
              />
              <button
                onClick={addMemberManually}
                style={{ backgroundColor: "#2F6B3C" }}
                className="px-4 rounded-md text-white text-sm font-medium"
              >
                Add
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {members.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-1.5 text-xs bg-[#F1EDE4] rounded-full px-3 py-1.5"
                >
                  {m}
                  <button onClick={() => removeMember(m)} className="text-[#8A7F6E]">✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {role === "member" && (
          <div className="mb-8">
            <h2 className="text-xs uppercase tracking-wide text-[#8A7F6E] mb-2">
              {myName} — {selectedDate}
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/70 border border-[#DCD3C2] rounded-lg px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-[#8A7F6E]">Received</p>
                <p className="font-mono text-lg text-[#2F6B3C] mt-1">
                  ₹{formatMoney(myTotalReceivedToday)}
                </p>
              </div>
              <div className="bg-white/70 border border-[#DCD3C2] rounded-lg px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-[#8A7F6E]">Pending</p>
                <p className="font-mono text-lg text-[#8A3324] mt-1">
                  ₹{formatMoney(myTotalPendingToday)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xs uppercase tracking-wide text-[#8A7F6E] mb-2">
            All records {loading ? "" : `(${entries.length})`}
          </h2>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="bg-white border border-[#DCD3C2] rounded-lg px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{entry.name}</p>
                  <p className="text-xs text-[#8A7F6E] font-mono">{entry.phone}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-sm">₹{formatMoney(entry.amount)}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      entry.status === STATUS.RECEIVED
                        ? "bg-[#E4F0E6] text-[#2F6B3C]"
                        : "bg-[#F3E2DC] text-[#8A3324]"
                    }`}
                  >
                    {entry.status === STATUS.RECEIVED ? "Received" : "Pending"}
                  </span>
                  <button
                    onClick={() =>
                      window.open(waLink(entry.phone, buildReceiptText(entry)), "_blank")
                    }
                    className="p-1.5 rounded-md hover:bg-[#F1EDE4]"
                  >
                    <Send size={15} />
                  </button>
                  <button
                    onClick={() => setPreviewEntry(entry)}
                    className="p-1.5 rounded-md hover:bg-[#F1EDE4]"
                  >
                    <FileText size={15} />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="p-1.5 rounded-md hover:bg-[#F1EDE4] text-[#8A7F6E]"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {previewEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0"
          onClick={(e) => e.target === e.currentTarget && setPreviewEntry(null)}
        >
          <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl print:shadow-none">
            <div id="receipt-print-area" className="p-8" style={{ fontFamily: "Georgia, serif" }}>
              <div className="text-center border-b-2 pb-4 mb-6" style={{ borderColor: "#8A3324" }}>
                <img src="/logo.jpg" alt="Logo" className="w-16 h-16 mx-auto mb-2 rounded-full" />
                <p className="text-lg font-bold leading-snug">{ORG_NAME}</p>
                <p className="text-xs text-[#8A7F6E] mt-1">Payment Receipt</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#8A7F6E]">Name</span>
                  <span className="font-medium">{previewEntry.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A7F6E]">Contact</span>
                  <span className="font-mono">{previewEntry.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A7F6E]">Date</span>
                  <span>
                    {new Date(previewEntry.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="text-center my-6">
                <p className="font-mono text-3xl font-bold">
                  ₹{formatMoney(previewEntry.amount)}
                </p>
              </div>
              <div className="text-center">
                <span
                  className="inline-block px-4 py-1 rounded-full text-xs font-bold text-white"
                  style={{
                    backgroundColor:
                      previewEntry.status === STATUS.RECEIVED ? "#2F6B3C" : "#8A3324",
                  }}
                >
                  {previewEntry.status === STATUS.RECEIVED ? "RECEIVED" : "PENDING"}
                </span>
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-[#DCD3C2] print:hidden">
              <button
                onClick={() => setPreviewEntry(null)}
                className="flex-1 py-2.5 rounded-md border border-[#DCD3C2] text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                style={{ backgroundColor: "#8A3324" }}
                className="flex-1 py-2.5 rounded-md text-white text-sm font-medium"
              >
                Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-print-area,
          #receipt-print-area * {
            visibility: visible;
          }
          #receipt-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
                  }
