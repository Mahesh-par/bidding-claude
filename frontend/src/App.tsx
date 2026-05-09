import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Send,
  Paperclip,
  LogOut,
  Zap,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  X,
  FileText,
  PanelLeftOpen,
  PanelLeftClose,
  Copy,
  Check,
} from "lucide-react";
import api from "./api";
import ReactMarkdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatItem {
  id: string;
  projectName?: string;
  chatUrl?: string;
  inputTime: string;
  input: string;
  output: string;
}

export default function App() {
  const [user, setUser] = useState<any>(
    JSON.parse(localStorage.getItem("user") || "null"),
  );
  const [view, setView] = useState<"auth" | "main">(user ? "main" : "auth");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    try {
      const res = await api.get("/chat/history");
      if (res.data.success) {
        setHistory(res.data.history);
      }
    } catch (err) {
      console.error("History fetch failed");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const body = isSignup ? { name, email, password } : { email, password };
      const res = await api.post(endpoint, body);
      localStorage.setItem("user", JSON.stringify(res.data));
      setUser(res.data);
      setView("main");
    } catch (err: any) {
      alert(err.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!prompt) return;
    setLoading(true);
    setQueueStatus("Submitting to queue...");
    const formData = new FormData();
    formData.append("prompt", prompt);
    files.forEach((file) => formData.append("attachments", file));

    try {
      const res = await api.post("/chat/new", formData);
      const jobId = res.data.jobId;
      setPrompt("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setQueueStatus("Queued — waiting for processing...");

      // Start polling for job completion
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await api.get(`/chat/status/${jobId}`);
          const { state, result, error, queuePosition, partialText } =
            statusRes.data;

          if (state === "waiting") {
            setQueueStatus(
              `Queued — position #${queuePosition || "?"} in line`,
            );
          } else if (state === "active") {
            setQueueStatus("Generating response...");
            // Show partial text as it streams in
            if (partialText) {
              setActiveChat({
                projectName: "Generating...",
                response: partialText,
                prompt: formData.get("prompt") as string,
                _isStreaming: true,
              });
            }
          } else if (state === "completed" && result) {
            // Done! Show the final result
            if (pollingRef.current) clearInterval(pollingRef.current);
            setActiveChat(result);
            setQueueStatus(null);
            setLoading(false);
            fetchHistory();
          } else if (state === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setQueueStatus(null);
            setLoading(false);
            alert("Automation failed: " + (error || "Unknown error"));
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      }, 3000);
    } catch (err: any) {
      setQueueStatus(null);
      setLoading(false);
      alert("Failed to queue: " + (err.response?.data?.message || err.message));
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
    setView("auth");
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this chat from history?")) return;

    try {
      await api.delete(`/chat/history/${id}`);
      if (activeChat?.id === id) setActiveChat(null);
      fetchHistory();
    } catch (err) {
      alert("Failed to delete chat");
    }
  };

  const handleCopy = () => {
    if (!activeChat?.response) return;

    // Strip ALL markdown to pure plain text
    const plain = activeChat.response
      .replace(/```[\s\S]*?```/g, (m: string) =>
        m.replace(/```\w*\n?/g, "").trim(),
      ) // code fences → just code
      .replace(/\*\*\*(.*?)\*\*\*/g, "$1") // ***bold italic***
      .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
      .replace(/\*(.*?)\*/g, "$1") // *italic*
      .replace(/__(.*?)__/g, "$1") // __bold__
      .replace(/_(.*?)_/g, "$1") // _italic_
      .replace(/~~(.*?)~~/g, "$1") // ~~strike~~
      .replace(/`([^`]+)`/g, "$1") // `inline code`
      .replace(/^#{1,6}\s+/gm, "") // # headings → text
      .replace(/^[\s]*[-*+]\s+/gm, "") // - bullets → remove
      .replace(/^\s*\d+\.\s+/gm, "") // 1. numbered → remove
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url) → link
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // images → remove
      .replace(/^>\s?/gm, "") // > blockquote → remove
      .replace(/---+/g, "") // horizontal rules → remove
      .replace(/\|[^\n]+\|/g, "") // tables → remove
      .replace(/\n{3,}/g, "\n\n") // collapse blank lines
      .trim();

    // Use fallback copy method (works on HTTP too)
    const textarea = document.createElement("textarea");
    textarea.value = plain;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatProjectName = (name?: string) => {
    if (!name) return "Unnamed Project";
    if (name.includes("/")) {
      return name.split("/").pop()?.trim() || name;
    }
    return name;
  };

  if (view === "auth") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-claude-card-dark border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-claude-orange rounded-xl flex items-center justify-center mb-4">
              <Zap className="text-white fill-current" />
            </div>
            <h1 className="text-2xl font-bold">Claude</h1>
            <p className="text-gray-400 text-sm mt-2">Automation Dashboard</p>
          </div>

          <div className="flex bg-black/40 p-1 rounded-lg mb-6">
            <button
              onClick={() => setIsSignup(false)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                !isSignup
                  ? "bg-claude-card-dark text-white shadow-lg"
                  : "text-gray-400 hover:text-white",
              )}
            >
              Login
            </button>
            <button
              onClick={() => setIsSignup(true)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                isSignup
                  ? "bg-claude-card-dark text-white shadow-lg"
                  : "text-gray-400 hover:text-white",
              )}
            >
              Signup
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignup && (
              <input
                type="text"
                placeholder="Full Name"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-claude-orange transition-colors"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <input
              type="email"
              placeholder="Email Address"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-claude-orange transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-claude-orange transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              disabled={loading}
              className="w-full bg-claude-orange hover:bg-claude-orange-hover text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : isSignup ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
              {!loading && <ChevronRight size={18} />}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-claude-bg-dark text-white relative">
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Toggle Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-80 border-r border-white/10 flex flex-col bg-claude-bg-dark z-40 transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-6 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2 font-bold text-claude-orange">
            <Zap size={20} fill="currentColor" />
            <span>History</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveChat(null);
                setPrompt("");
              }}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Close sidebar"
            >
              <PanelLeftClose size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {history.length === 0 ? (
            <div className="text-center mt-10 text-gray-500 text-sm">
              No past chats found
            </div>
          ) : (
            history.map((item, i) => (
              <button
                key={i}
                onClick={() =>
                  setActiveChat({
                    id: item.id,
                    projectName: item.projectName,
                    chatUrl: item.chatUrl,
                    response: item.output,
                    prompt: item.input,
                  })
                }
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all group relative",
                  activeChat?.id === item.id
                    ? "bg-claude-orange/10 border-claude-orange/30"
                    : "bg-white/5 border-transparent hover:bg-white/10",
                )}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate pr-2 group-hover:text-claude-orange">
                      {formatProjectName(item.projectName)}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {item.inputTime}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(e, item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded-md transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/40">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-claude-orange flex items-center justify-center font-bold text-xs">
              {user.name?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-[10px] text-gray-500 truncate">
                {user.email}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative w-full">
        {/* Top bar with toggle */}
        <div className="sticky top-0 z-10 bg-claude-bg-dark/80 backdrop-blur-md flex items-center gap-3 p-4 border-b border-white/5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Open history"
          >
            <PanelLeftOpen size={20} />
          </button>
          <span className="text-sm font-semibold text-claude-orange">
            10Turtle AI
          </span>
        </div>

        <div className="p-8 max-w-4xl mx-auto w-full">
          {activeChat ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              {activeChat.prompt && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                    Your Request
                  </div>
                  <div className="text-gray-300 leading-relaxed">
                    {activeChat.prompt}
                  </div>
                </div>
              )}

              <div className="bg-claude-card-dark border border-white/10 rounded-2xl p-8 shadow-xl">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-claude-orange">
                      {formatProjectName(activeChat.projectName)}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      {activeChat._isStreaming ? (
                        <span className="text-claude-orange animate-pulse">
                          ● Generating live...
                        </span>
                      ) : (
                        "Automation Response"
                      )}
                    </p>
                  </div>
                  {!activeChat._isStreaming && (
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-all"
                    >
                      {copied ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>
                <div
                  ref={responseRef}
                  className="prose prose-invert max-w-none text-gray-200 leading-loose"
                >
                  <ReactMarkdown>{activeChat.response}</ReactMarkdown>
                  {activeChat._isStreaming && (
                    <span className="inline-block w-2 h-5 bg-claude-orange ml-1 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            </div>
          ) : loading ? (
            /* ── Skeleton Shimmer while waiting for queue ── */
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Prompt echo skeleton */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="shimmer-line h-3 w-24 rounded mb-4" />
                <div className="space-y-2">
                  <div className="shimmer-line h-4 w-full rounded" />
                  <div className="shimmer-line h-4 w-3/4 rounded" />
                </div>
              </div>

              {/* Response card skeleton */}
              <div className="bg-claude-card-dark border border-white/10 rounded-2xl p-8 shadow-xl">
                <div className="flex items-start justify-between mb-6">
                  <div className="space-y-2">
                    <div className="shimmer-line h-6 w-48 rounded" />
                    <div className="shimmer-line h-3 w-32 rounded" />
                  </div>
                  <div className="shimmer-line h-8 w-16 rounded-lg" />
                </div>
                <div className="space-y-3">
                  <div className="shimmer-line h-4 w-full rounded" />
                  <div className="shimmer-line h-4 w-full rounded" />
                  <div className="shimmer-line h-4 w-5/6 rounded" />
                  <div className="shimmer-line h-4 w-full rounded" />
                  <div className="shimmer-line h-4 w-4/6 rounded" />
                  <div className="shimmer-line h-4 w-full rounded" />
                  <div className="shimmer-line h-4 w-3/4 rounded" />
                </div>
                <div className="mt-6 flex items-center gap-2 text-claude-orange">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-medium animate-pulse">
                    {queueStatus || "Waiting..."}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center opacity-40">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6">
                <MessageSquare size={32} />
              </div>
              <h2 className="text-xl font-medium">
                Ready for a new automation?
              </h2>
              <p className="text-sm text-gray-500 mt-2 max-w-xs">
                Enter your prompt below to start a new automated session with
                Claude.
              </p>
            </div>
          )}
        </div>

        {/* Input Area — sticky bottom */}
        <div className="sticky bottom-0 bg-claude-bg-dark/90 backdrop-blur-md p-8 pt-4 max-w-4xl mx-auto w-full">
          <div className="relative bg-claude-card-dark border border-white/20 rounded-2xl p-3 shadow-2xl focus-within:border-claude-orange transition-all">
            <textarea
              placeholder="Send a message to 10Turtle AI..."
              className="w-full bg-transparent border-none outline-none resize-none min-h-[40px] text-gray-200 placeholder:text-gray-600 disabled:opacity-50"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
            />

            {/* File Previews */}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 px-1">
                {files.map((file, i) => {
                  const isImage = file.type.startsWith("image/");
                  return (
                    <div
                      key={i}
                      className="relative group/file flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300"
                    >
                      {isImage ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      ) : (
                        <FileText
                          size={16}
                          className="text-claude-orange shrink-0"
                        />
                      )}
                      <span className="max-w-[100px] truncate">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="p-0.5 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between mt-2 border-t border-white/5 pt-2">
              <div className="flex items-center gap-4">
                <label
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer text-xs text-gray-400 hover:text-white transition-all",
                    loading &&
                      "opacity-20 cursor-not-allowed pointer-events-none",
                  )}
                >
                  <Paperclip size={14} />
                  <span>
                    {files.length > 0
                      ? `${files.length} file${files.length > 1 ? "s" : ""}`
                      : "Attach"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={loading}
                  />
                </label>
              </div>

              <button
                onClick={handleSendChat}
                disabled={loading || !prompt}
                className="bg-claude-orange hover:bg-claude-orange-hover text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-20"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Send size={18} />
                )}
                <span>{loading ? "Processing..." : "Send"}</span>
              </button>
            </div>
          </div>
          {loading && (
            <p className="text-lg text-center text-claude-orange mt-2 animate-pulse font-medium">
              {queueStatus || "Processing..."}  Please don't reload or close 
              the tab 
            </p>
          )}
          <p className="text-[10px] text-center text-gray-600 mt-4 uppercase tracking-[0.2em]">
            Automated Integration Engine
          </p>
        </div>
      </main>
    </div>
  );
}
