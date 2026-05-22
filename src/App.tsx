import React, { useEffect, useState } from "react";
import { 
  Briefcase, 
  FolderKanban, 
  FileSpreadsheet, 
  Settings, 
  Zap, 
  FileClock, 
  LayoutDashboard, 
  Layers, 
  Upload, 
  History,
  AlertTriangle,
  Mail,
  User,
  ShieldAlert,
  Menu,
  X,
  LogIn,
  LogOut
} from "lucide-react";

import Dashboard from "./components/Dashboard.js";
import ChecklistsTab from "./components/ChecklistsTab.js";
import DatabaseTab from "./components/DatabaseTab.js";
import ProjectsTab from "./components/ProjectsTab.js";
import GeneratorTab from "./components/GeneratorTab.js";
import HistoryTab from "./components/HistoryTab.js";
import SettingsTab from "./components/SettingsTab.js";

import { Project, Checklist, GeneratedScope } from "./types.js";
import { 
  initializeUserSession, 
  getClientProjects, 
  getClientChecklists, 
  getClientScopes,
  getClientLLMProviders
} from "./db-client.js";
import { auth, signInWithPopup, signOut, googleProvider } from "./firebase.js";
import { testLLMConnection } from "./ai-client.js";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [scopes, setScopes] = useState<GeneratedScope[]>([]);
  const [llmStatus, setLlmStatus] = useState<'connected' | 'error' | 'pending'>('pending');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Real active authorized profile metadata
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // Load all foundational data elements from express API server
  const loadData = async (uid: string) => {
    try {
      const pData = await getClientProjects(uid);
      if (Array.isArray(pData)) setProjects(pData);

      const cData = await getClientChecklists(uid);
      if (Array.isArray(cData)) setChecklists(cData);

      const sData = await getClientScopes(uid);
      if (Array.isArray(sData)) setScopes(sData);
    } catch (err) {
      console.error("Could not load database elements", err);
    }
  };

  const checkLlmGateway = async (uid: string) => {
    try {
      const providers = await getClientLLMProviders(uid);
      const active = providers.find(p => p.is_active) || providers[0];
      const isOK = await testLLMConnection(active);
      if (isOK) {
        setLlmStatus("connected");
      } else {
        setLlmStatus("error");
      }
    } catch {
      setLlmStatus("error");
    }
  };

  // Setup silent session and bind listeners
  useEffect(() => {
    initializeUserSession(
      (user) => {
        setCurrentUser(user);
        setAuthLoading(false);
        loadData(user.uid);
        checkLlmGateway(user.uid);
      },
      (err) => {
        setAuthError(err?.message || "Failed to initialize Firebase Auth");
        setAuthLoading(false);
      }
    );
  }, []);

  const triggerGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      await signInWithPopup(auth, googleProvider);
      window.location.reload();
    } catch (err) {
      console.error("Google Sign In failed:", err);
      setAuthLoading(false);
    }
  };

  const triggerSignOut = async () => {
    try {
      setAuthLoading(true);
      await signOut(auth);
      // Reload on sign-out to trigger fresh silent anonymous workspace
      window.location.reload();
    } catch (err) {
      console.error("Sign Out failed:", err);
      setAuthLoading(false);
    }
  };

  const handleOpenScopeFromHistory = (scope: GeneratedScope) => {
    setActiveTab("generator");
  };

  const currentTabStyles = (tabName: string) => {
    return activeTab === tabName
      ? "bg-slate-900 text-amber-400 font-semibold shadow-xs"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-all";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 space-y-4">
        <Zap className="h-10 w-10 text-amber-400 animate-bounce" />
        <h2 className="text-sm font-semibold tracking-widest font-mono uppercase">SEO Scope Generator</h2>
        <p className="text-xs text-slate-500 font-mono">Авторизация песочницы в Firebase...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 space-y-4">
        <h2 className="text-xl font-bold text-red-500 flex items-center gap-2">
          Firebase Authentication Error
        </h2>
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 max-w-xl text-center space-y-3">
          <p className="text-sm text-red-200">{authError}</p>
          <div className="mt-4 text-xs font-mono text-slate-300 text-left bg-black/30 p-3 rounded leading-relaxed">
            <p className="font-bold text-white mb-2">How to fix this issue:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open your Firebase Console.</li>
              <li>Go to <strong>Authentication</strong> &rarr; <strong>Sign-in method</strong>.</li>
              <li>Find <strong>Anonymous</strong> in the providers list.</li>
              <li>Click <strong>Enable</strong> and save.</li>
              <li>Refresh this page.</li>
            </ol>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 mt-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      
      {/* MOBILE HEADER BAR */}
      <div className="md:hidden bg-slate-950 text-white flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Zap className="h-5 w-5 text-amber-400 animate-pulse" />
          <span className="font-bold tracking-tight text-white font-sans">SEO Scope MVP</span>
        </div>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-slate-800 rounded text-slate-300 animate-pulse"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* LEFT STATIC SIDEBAR / NAVIGATION DRAWER */}
      <div className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:static top-14 md:top-0 bottom-0 left-0 z-40
        w-64 bg-slate-950 text-slate-100 border-r border-slate-900 flex flex-col justify-between 
        transition-transform duration-300 ease-in-out shrink-0
      `}>
        <div className="p-5 flex flex-col space-y-6">
          {/* Logo Branding */}
          <div className="hidden md:flex items-center space-x-2.5 pb-2">
            <Zap className="h-6 w-6 text-amber-400 animate-pulse shrink-0" />
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white block uppercase">SEO Scope</span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wide">AI MONTHLY GENERATOR</span>
            </div>
          </div>

          {/* Current user context box metadata with authentication toggles */}
          <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 flex flex-col space-y-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="h-8.5 w-8.5 rounded-full bg-slate-800 text-amber-300 font-semibold flex items-center justify-center font-mono text-xs overflow-hidden shrink-0">
                {currentUser?.photoURL ? (
                  <img src={currentUser.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  currentUser?.displayName ? currentUser.displayName[0] : "U"
                )}
              </div>
              <div className="truncate flex-1">
                <span className="block text-xs font-bold text-slate-200">
                  {currentUser?.isAnonymous ? "Гостевой режим" : (currentUser?.displayName || "SEO Специалист")}
                </span>
                <span className="text-[9px] text-slate-500 font-mono truncate block">
                  {currentUser?.isAnonymous ? "Синхронизация с Firestore" : (currentUser?.email || "Профиль Google")}
                </span>
              </div>
            </div>

            {currentUser?.isAnonymous ? (
              <button
                onClick={triggerGoogleSignIn}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Войти через Google</span>
              </button>
            ) : (
              <button
                onClick={triggerSignOut}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 bg-slate-800 hover:bg-red-900 text-slate-200 font-semibold text-[10px] uppercase rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5 text-red-400" />
                <span>Выйти из профиля</span>
              </button>
            )}
          </div>

          {/* Nav List */}
          <nav className="flex flex-col space-y-1 text-xs">
            <button
              onClick={() => { setActiveTab("dashboard"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("dashboard")}`}
            >
              <LayoutDashboard className="h-4.5 w-4.5" />
              <span>Главный дашборд</span>
            </button>

            <button
              onClick={() => { setActiveTab("checklists"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("checklists")}`}
            >
              <Upload className="h-4.5 w-4.5" />
              <span>Сырые чек-листы</span>
            </button>

            <button
              onClick={() => { setActiveTab("database"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("database")}`}
            >
              <Layers className="h-4.5 w-4.5" />
              <span>Реестр задач</span>
            </button>

            <button
              onClick={() => { setActiveTab("projects"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("projects")}`}
            >
              <FolderKanban className="h-4.5 w-4.5" />
              <span>Профили сайтов</span>
            </button>

            <button
              onClick={() => { setActiveTab("generator"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("generator")}`}
            >
              <Zap className="h-4.5 w-4.5" />
              <span>AI Генератор SOW</span>
            </button>

            <button
              onClick={() => { setActiveTab("history"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("history")}`}
            >
              <History className="h-4.5 w-4.5" />
              <span>Архив планов</span>
            </button>

            <button
              onClick={() => { setActiveTab("settings"); setSidebarOpen(false); }}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-lg text-left ${currentTabStyles("settings")}`}
            >
              <Settings className="h-4.5 w-4.5" />
              <span>Конфигуратор AI</span>
            </button>
          </nav>
        </div>

        {/* Footer Meta indicator details */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 text-[10px] text-slate-500 font-mono space-y-1.5 flex flex-col">
          <div className="flex items-center justify-between">
            <span>База данных:</span>
            <span className="text-emerald-400 font-bold">Firestore</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Режим сети:</span>
            <span className="text-amber-400">GitHub Cloud Static</span>
          </div>
        </div>
      </div>

      {/* RIGHT WORKSPACE PANELS */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-hidden">
        {activeTab === "dashboard" && (
          <Dashboard
            onNavigate={setActiveTab}
            projects={projects}
            checklists={checklists}
            scopes={scopes}
            llmStatus={llmStatus}
            refreshData={() => loadData(currentUser.uid)}
          />
        )}

        {activeTab === "checklists" && (
          <ChecklistsTab
            checklists={checklists}
            onUploadSuccess={() => loadData(currentUser.uid)}
          />
        )}

        {activeTab === "database" && (
          <DatabaseTab
            checklists={checklists}
            onDataChanged={() => loadData(currentUser.uid)}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsTab
            projects={projects}
            refreshData={() => loadData(currentUser.uid)}
          />
        )}

        {activeTab === "generator" && (
          <GeneratorTab
            projects={projects}
            checklists={checklists}
            refreshData={() => loadData(currentUser.uid)}
          />
        )}

        {activeTab === "history" && (
          <HistoryTab
            scopes={scopes}
            projects={projects}
            onSelectScope={handleOpenScopeFromHistory}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            onStatusChange={setLlmStatus}
          />
        )}
      </main>

    </div>
  );
}
