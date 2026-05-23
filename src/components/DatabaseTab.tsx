import React, { useEffect, useState } from "react";
import { Search, Filter, Layers, BadgeHelp, CheckCircle, Sparkles, AlertCircle, Edit3, Save, X, RefreshCw, Trash } from "lucide-react";
import { Task } from "../types.js";
import { auth } from "../firebase.js";
import { getClientTasks, updateClientTask, deleteAllClientChecklistsAndTasks } from "../db-client.js";
import { normalizeTaskBatch } from "../ai-client.js";
import { TaskDetailsPanel } from "./TaskDetailsPanel.js";

interface DatabaseTabProps {
  checklists: any[];
  onDataChanged?: () => void;
}

export default function DatabaseTab({ checklists, onDataChanged }: DatabaseTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters state
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterChecklist, setFilterChecklist] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Drawer / Selection details for editing
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<Partial<Task>>({});
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadTasks = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await getClientTasks(uid);
      setTasks(data);
      setFilteredTasks(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateAISingle = async () => {
    if (!selectedTask) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setErrorMsg("");
    setSuccessMsg("");
    setIsRegenerating(true);

    try {
      const dbTaskData = {
        id: selectedTask.id,
        section: selectedTask.section || "",
        raw_task: selectedTask.raw_task || "",
        priority: selectedTask.priority || "optional"
      };

      const customAI = {
         provider_name: "OpenAI Compatible",
         api_key_encrypted: "sk-idWLIk8WBHJJiwn-Y2oyMNdW0ckjsfIa",
         default_model: "qwen/qwen3.7-max",
         api_endpoint: "https://routerai.ru/api/v1",
         temperature: 0.3
      };

      const aiResults = await normalizeTaskBatch([dbTaskData], customAI);

      if (aiResults && aiResults.length > 0) {
        const enriched = aiResults[0];
        
        // Save back to DB
        const result = await updateClientTask(uid, selectedTask.id, {
          contract_text: enriched.contract_text,
          client_text: enriched.client_text,
          internal_text: enriched.internal_text,
          acceptance_criteria: enriched.acceptance_criteria,
          artifact_type: enriched.artifact_type,
          result_text: enriched.result_text,
          work_block: enriched.work_block,
          work_type: enriched.work_type,
          process_text: enriched.process_text
        });

        // Use functional setState to ensure we update based on current state
        setTasks(prevTasks => prevTasks.map(t => t.id === result.id ? result : t));
        setSelectedTask(result);
        setEditedTask({ ...result });
        setIsEditing(false);
        setSuccessMsg("ТЗ для задачи успешно пересобрано (ИИ)!");
      }
    } catch (err: any) {
       setErrorMsg("Ошибка при генерации ТЗ: " + err.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setConfirmDelete(false);

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      await deleteAllClientChecklistsAndTasks(uid);
      setTasks([]);
      setFilteredTasks([]);
      setSuccessMsg("База полностью очищена.");
      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [checklists]);

  // Apply inputs and filters
  useEffect(() => {
    let result = [...tasks];

    if (filterMonth !== "all") {
      result = result.filter(t => t.default_month === parseInt(filterMonth, 10));
    }
    if (filterPriority !== "all") {
      result = result.filter(t => t.priority === filterPriority);
    }
    if (filterStatus !== "all") {
      result = result.filter(t => t.status === filterStatus);
    }
    if (filterChecklist !== "all") {
      result = result.filter(t => t.checklist_id === parseInt(filterChecklist, 10));
    }
    if (searchTerm.trim() !== "") {
      const low = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.id.toString().includes(low) ||
        (t.raw_task || '').toLowerCase().includes(low) ||
        (t.section || '').toLowerCase().includes(low) ||
        (t.work_block || '').toLowerCase().includes(low)
      );
    }

    setFilteredTasks(result);
  }, [tasks, filterMonth, filterPriority, filterStatus, filterChecklist, searchTerm]);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setEditedTask({ ...task });
    setIsEditing(false);
    setSuccessMsg("");
  };

  const handleSaveEdit = async () => {
    const uid = auth.currentUser?.uid;
    if (!selectedTask || !uid) return;
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const data = await updateClientTask(uid, selectedTask.id, editedTask);
      setTasks(tasks.map(t => t.id === data.id ? data : t));
      setSelectedTask(data);
      setSuccessMsg("Задача успешно сохранена и обновлена в базе данных!");
      setIsEditing(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in relative text-xs">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-sans">База задач</h1>
        <p className="text-slate-500 font-sans mt-1">
          Единый реестр нормализованных задач с привязкой к месяцам по умолчанию и правилами применимости.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-4 border-l-4 border-red-500 rounded-r-lg flex items-center space-x-2 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 border-l-4 border-emerald-500 rounded-r-lg flex items-center space-x-2 text-sm">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Поиск заголовка</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="ID или название..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-blue-500 bg-slate-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Рабочий месяц</label>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="all">Все месяца (1-6)</option>
            <option value="1">Месяц 1</option>
            <option value="2">Месяц 2</option>
            <option value="3">Месяц 3</option>
            <option value="4">Месяц 4</option>
            <option value="5">Месяц 5</option>
            <option value="6">Месяц 6</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Приоритет задачи</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="all">Все приоритеты</option>
            <option value="critical">🔴 Критично</option>
            <option value="important">🟡 Важно</option>
            <option value="optional">🟢 Опционально</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">AI Статус</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="all">Все</option>
            <option value="normalized">✨ Обогащен AI</option>
            <option value="raw">⏳ Исходный сырой</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Чек-лист источник</label>
          <select
            value={filterChecklist}
            onChange={(e) => setFilterChecklist(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="all">Все чек-листы</option>
            {checklists.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* Table representation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h2 className="font-bold text-slate-800 flex items-center space-x-2">
              <Layers className="h-4.5 w-4.5 text-blue-500" />
              <span>Задачи в базе ({filteredTasks.length})</span>
            </h2>
            <div className="flex items-center space-x-3">
              {loading && <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />}
              <button
                onClick={handleDeleteAll}
                disabled={loading}
                className={`px-3 py-1.5 border rounded-lg text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50 transition-colors ${
                  confirmDelete 
                    ? 'border-red-500 bg-red-500 text-white' 
                    : 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100'
                }`}
                title="Очистить все чек-листы и задачи"
              >
                <Trash className="h-3 w-3" />
                <span className="hidden sm:inline">{confirmDelete ? "Подтвердите очистку!" : "Очистить всё"}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 bg-slate-50 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Код ID</th>
                  <th className="py-2.5 px-3">Смысловой Блок</th>
                  <th className="py-2.5 px-3 w-1/2">Название задачи</th>
                  <th className="py-2.5 px-3">Месяц</th>
                  <th className="py-2.5 px-3 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => (
                  <React.Fragment key={task.id}>
                  <tr
                    onClick={() => handleSelectTask(task)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors border-l-4 ${
                      selectedTask?.id === task.id ? "bg-blue-50/70 border-blue-500" : "border-transparent"
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-blue-600">
                      {task.id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 truncate max-w-36">
                      {task.work_block || "Общие"}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 line-clamp-2">
                      {task.raw_task}
                    </td>
                    <td className="py-2.5 px-3 font-bold font-mono text-center">
                      M{task.default_month}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        task.status === 'normalized' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {task.status === 'normalized' ? 'AI' : 'Сырой'}
                      </span>
                    </td>
                  </tr>
                  {selectedTask?.id === task.id && (
                    <tr className="border-b border-slate-200">
                      <td colSpan={5} className="p-0">
                        <TaskDetailsPanel
                           task={selectedTask}
                           isEditing={isEditing}
                           setIsEditing={setIsEditing}
                           editedTask={editedTask}
                           setEditedTask={setEditedTask}
                           handleSaveEdit={handleSaveEdit}
                           onRegenerateTask={handleRegenerateAISingle}
                           isRegenerating={isRegenerating}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
