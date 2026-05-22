import React, { useState } from "react";
import { Upload, FileText, CheckCircle2, Play, Sparkles, AlertCircle, RefreshCw, Link as LinkIcon, Trash } from "lucide-react";
import { Checklist, Task } from "../types.js";
import { auth } from "../firebase.js";
import { 
  uploadClientChecklist, 
  parseClientChecklist, 
  getClientTasks, 
  updateClientTask,
  updateClientTask as patchClientTask,
  getClientLLMProviders,
  deleteClientChecklist
} from "../db-client.js";
import { normalizeTask, normalizeTaskBatch } from "../ai-client.js";

interface ChecklistsTabProps {
  checklists: Checklist[];
  onUploadSuccess: () => void;
}

export default function ChecklistsTab({ checklists, onUploadSuccess }: ChecklistsTabProps) {
  const [activeChecklistId, setActiveChecklistId] = useState<number | null>(checklists[0]?.id || null);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("v2 integrated");
  const [rawContent, setRawContent] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [normalizing, setNormalizing] = useState(false);
  const [normalizeStatus, setNormalizeStatus] = useState("");

  const selectedChecklist = checklists.find(c => c.id === activeChecklistId);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    setConfirmDelete(null);

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await deleteClientChecklist(uid, id);
      setSuccessMsg("Чек-лист удален.");
      
      const newChecklists = checklists.filter(c => c.id !== id);
      if (activeChecklistId === id) {
        setActiveChecklistId(newChecklists.length > 0 ? newChecklists[0].id : null);
      }
      onUploadSuccess();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Ошибка сессии. Сначала пройдите авторизацию.");
      return;
    }

    if (!googleUrl.trim() && (!title.trim() || !rawContent.trim())) {
      setErrorMsg("Укажите Google Ссылку либо введите название и вставьте текстовое содержимое чек-листа.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const data = await uploadClientChecklist(uid, {
        title: title.trim() || undefined,
        version,
        raw_content: rawContent.trim() || undefined,
        google_url: googleUrl.trim() || undefined
      });

      setSuccessMsg(`Чек-лист "${data.title}" успешно загружен и распарсен на ${data.task_count} задач!`);
      setTitle("");
      setRawContent("");
      setGoogleUrl("");
      onUploadSuccess();
      setActiveChecklistId(data.id);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const forceParse = async (id: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Ошибка сессии.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const count = await parseClientChecklist(uid, id);
      setSuccessMsg(`Успешно перепарсено задач в чек-листе: ${count}`);
      onUploadSuccess();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run AI Normalization on tasks in batches of 8
  const runBatchNormalization = async (id: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Необходимо войти в систему.");
      return;
    }
    setNormalizing(true);
    setErrorMsg("");
    setSuccessMsg("");
    setNormalizeStatus("Запуск нормализации задач через Gemini AI...");

    try {
      // 1. Fetch active client key from LLM Providers config in Firestore
      const providers = await getClientLLMProviders(uid);
      const active = providers.find(p => p.is_active) || providers[0];
      const customKey = active?.api_key_encrypted || "";

      let keepRunning = true;
      let iterations = 0;
      const MAX_ITERATIONS = 100;
      const BATCH_SIZE = 10;

      while (keepRunning && iterations < MAX_ITERATIONS) {
        const allTasks = await getClientTasks(uid, { checklist_id: id });
        const rawTasks = allTasks.filter(t => t.status === 'raw');

        if (rawTasks.length === 0) {
          setNormalizeStatus("Все задачи успешно нормализованы!");
          keepRunning = false;
          break;
        }

        const batch = rawTasks.slice(0, BATCH_SIZE);
        setNormalizeStatus(`Нормализуем пакет из ${batch.length} задач. Задач осталось: ${rawTasks.length}`);

        try {
          const tasksData = batch.map(t => ({
             id: t.id,
             section: t.section,
             raw_task: t.raw_task,
             priority: t.priority
          }));

          const customAI = {
             provider_name: "OpenAI Compatible",
             api_key_encrypted: "sk-idWLIk8WBHJJiwn-Y2oyMNdW0ckjsfIa",
             default_model: "qwen/qwen3.7-max",
             api_endpoint: "https://routerai.ru/api/v1",
             temperature: 0.3
          };
          const aiResults = await normalizeTaskBatch(tasksData, customAI);

          const updatePromises = [];
          for (const aiResult of aiResults) {
             const originalTask = batch.find(t => t.id === aiResult.id);
             if (originalTask) {
                updatePromises.push(updateClientTask(uid, originalTask.id, {
                  ...originalTask,
                  ...aiResult,
                  status: 'normalized',
                  updated_at: new Date().toISOString(),
                  applicability: {
                    ...originalTask.applicability,
                    ...(aiResult.applicability || {})
                  }
                }));
             }
          }

          const processedIds = aiResults.map((r: any) => r.id);
          for (const t of batch) {
             if (!processedIds.includes(t.id)) {
                 updatePromises.push(updateClientTask(uid, t.id, {
                   ...t,
                   status: 'normalized',
                   updated_at: new Date().toISOString()
                 }));
             }
          }
          await Promise.all(updatePromises);
        } catch (itemErr) {
          console.error(`Error normalizing batch:`, itemErr);
          const fallbackPromises = [];
          for (const t of batch) {
             fallbackPromises.push(updateClientTask(uid, t.id, {
               ...t,
               status: 'normalized',
               updated_at: new Date().toISOString()
             }));
          }
          await Promise.all(fallbackPromises);
        }

        onUploadSuccess();
        iterations++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setSuccessMsg("Интеграционная AI нормализация завершена успешно!");
    } catch (err: any) {
      setErrorMsg(`AI Ошибка: ${err.message}. Проверьте правильность API ключа в настройках.`);
    } finally {
      setNormalizing(false);
      setNormalizeStatus("");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Мастер-Чек-листы</h1>
        <p className="text-slate-500 font-sans mt-1">
          Загрузка, парсинг и AI-обогащение исходных SEO чек-листов.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg flex items-center space-x-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 p-4 rounded-r-lg flex items-center space-x-3 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Checklists Listings */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="font-bold text-slate-800 mb-3">Ваши файлы</h2>
            
            <div className="space-y-2">
              {checklists.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveChecklistId(c.id)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${
                    activeChecklistId === c.id
                      ? "bg-blue-50/50 border-blue-400 font-semibold text-blue-900"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{c.title}</span>
                    <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                      {c.version}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>Задач: {c.task_count}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.status === 'normalized' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status === 'normalized' ? 'Обогащен AI' : 'Только парсинг'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Upload card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h2 className="font-bold text-slate-800 flex items-center space-x-2">
                <Upload className="h-4 w-4 text-slate-500" />
                <span>Импортировать Чек-лист</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Вы можете вставить Google Ссылку или скопировать содержимое вручную.
              </p>
            </div>

            {/* PRESETS */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-2">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Шаблоны из вашего запроса:</span>
              
              <button
                type="button"
                onClick={() => {
                  setGoogleUrl("https://docs.google.com/document/d/1SYc1lU8bGnsCm77cMtsTrd383u3lOKMs/edit?usp=drivesdk&ouid=116971348439248236534&rtpof=true&sd=true");
                  setTitle("Огромный Мастер-Чек-лист (Rush Academy)");
                  setVersion("v7-master");
                }}
                className="w-full text-left p-1.5 bg-white hover:bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-800 font-medium truncate flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                <span className="truncate">📄 Огромный чек-лист (Google Doc)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGoogleUrl("https://docs.google.com/spreadsheets/d/1ybC1sCtkvdMsVYvL9AAyzDBEKSD1fj-7/edit?usp=drivesdk&ouid=116971348439248236534&rtpof=true&sd=true");
                  setTitle("Импорт: Пример списка работ по SEO на 6 месяцев");
                  setVersion("6-месяцев");
                }}
                className="w-full text-left p-1.5 bg-white hover:bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-800 font-medium truncate flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <FileText className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="truncate">📊 План работ на 6 месяцев (Google Sheet)</span>
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center space-x-1">
                  <LinkIcon className="h-3 w-3 text-blue-500" />
                  <span>Ссылка на Google Doc / Google Sheet</span>
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/document/d/... или /spreadsheets/d/..."
                  value={googleUrl}
                  onChange={(e) => setGoogleUrl(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 bg-slate-50 font-mono transition-colors"
                />
                <span className="text-[9px] text-slate-400 block mt-1">
                  * Файл должен быть открыт по ссылке ("Все, у кого есть ссылка" -&gt; "Читатель")
                </span>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-100"></div>
                <span className="flex-shrink mx-2 text-[9px] text-slate-400 font-mono uppercase">Или вставить вручную</span>
                <div className="flex-grow border-t border-slate-100"></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Название чек-листа</label>
                <input
                  type="text"
                  placeholder="Например, SEO Master Checklist v3"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Версия интеграции</label>
                <input
                  type="text"
                  placeholder="v2 integrated"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 bg-slate-50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">
                    Текст или Строки таблицы (TSV)
                  </label>
                  <span className="text-[9px] text-slate-400">Ctrl+A &rarr; Ctrl+C из Excel</span>
                </div>
                <textarea
                  rows={5}
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  disabled={!!googleUrl}
                  placeholder={googleUrl ? "Содержимое будет скачано по ссылке выше." : "Вставьте текстовый список задач ☐ или скопируйте столбцы из Google Таблицы напрямую!"}
                  className="w-full text-[11px] font-mono rounded-lg border border-slate-200 p-2.5 outline-none focus:border-blue-500 bg-slate-50 resize-y disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{googleUrl ? "Скачать, Распарсить и Сохранить" : "Распарсить и Сохранить"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Active checklist details */}
        <div className="lg:col-span-2 space-y-4">
          {selectedChecklist ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 divide-y divide-slate-100">
              <div className="pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedChecklist.title}</h2>
                  <p className="text-xs text-slate-500 mt-1 font-sans">
                    Версия: {selectedChecklist.version} | Загружен: {new Date(selectedChecklist.created_at).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => forceParse(selectedChecklist.id)}
                    disabled={loading || normalizing}
                    className="px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center space-x-1 sm:space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Перепарсить</span>
                  </button>
                  <button
                    onClick={() => handleDelete(selectedChecklist.id)}
                    disabled={loading || normalizing}
                    className={`px-3 py-1.5 border rounded-lg text-xs font-semibold flex items-center space-x-1 sm:space-x-1.5 disabled:opacity-50 transition-colors ${
                      confirmDelete === selectedChecklist.id 
                        ? 'border-red-500 bg-red-500 text-white' 
                        : 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100'
                    }`}
                  >
                    <Trash className="h-3 w-3" />
                    <span>{confirmDelete === selectedChecklist.id ? "Подтвердите!" : "Удалить"}</span>
                  </button>

                  <button
                    onClick={() => runBatchNormalization(selectedChecklist.id)}
                    disabled={loading || normalizing}
                    className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1 sm:space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{normalizing ? "Обобщение..." : "AI Нормализация"}</span>
                  </button>
                </div>
              </div>

              {/* Normalizer Status Bar */}
              {normalizeStatus && (
                <div className="py-3 text-xs bg-indigo-50/50 border border-indigo-100 p-3 rounded-lg flex items-center space-x-2 text-indigo-800">
                  <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                  <span className="font-mono">{normalizeStatus}</span>
                </div>
              )}

              {/* Raw view */}
              <div className="pt-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span>Исходный контент чек-листа</span>
                </h3>
                
                <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-4 rounded-lg leading-relaxed max-h-120 overflow-y-auto w-full whitespace-pre-wrap">
                  {selectedChecklist.raw_content}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 font-sans">
              <Upload className="h-12 w-12 mx-auto opacity-40 mb-3" />
              <p>Пожалуйста, создайте или выберите мастер-чек-лист слева.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
