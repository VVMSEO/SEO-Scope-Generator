import React, { useEffect, useState } from "react";
import { Search, Filter, Layers, BadgeHelp, CheckCircle, Sparkles, AlertCircle, Edit3, Save, X, RefreshCw, Trash } from "lucide-react";
import { Task } from "../types.js";
import { auth } from "../firebase.js";
import { getClientTasks, updateClientTask, deleteAllClientChecklistsAndTasks } from "../db-client.js";

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Table representation */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-xs overflow-hidden">
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
                  <tr
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                      selectedTask?.id === task.id ? "bg-blue-50/40" : ""
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Panel Drawer */}
        <div className="lg:col-span-1">
          {selectedTask ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">
                    ID {selectedTask.id}
                  </span>
                  <h3 className="font-extrabold text-slate-900 mt-1">Обогащенные данные</h3>
                </div>

                <div className="flex items-center space-x-1">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer"
                      >
                        <Save className="h-3 w-3" />
                        <span>Да</span>
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="p-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Изм.</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Scrolable detailed info fields block */}
              <div className="space-y-4 max-h-120 overflow-y-auto pr-1">
                <div className="space-y-3.5 text-xs border-b border-slate-100 pb-3">
                  {/* Task Priority & Default Month */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400">Приоритет</span>
                      {isEditing ? (
                        <select
                          value={editedTask.priority || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value })}
                          className="w-full text-xs rounded border border-slate-200 px-2 py-1 bg-slate-50 outline-none"
                        >
                          <option value="critical">🔴 Критично</option>
                          <option value="important">🟡 Важно</option>
                          <option value="optional">🟢 Опционально</option>
                        </select>
                      ) : (
                        <p className="font-semibold text-slate-800 capitalize">
                          {selectedTask.priority === 'critical' ? '🔴 Критично' : selectedTask.priority === 'important' ? '🟡 Важно' : '🟢 Опционально'}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400">Срок по умолчанию</span>
                      {isEditing ? (
                        <select
                          value={editedTask.default_month || 1}
                          onChange={(e) => setEditedTask({ ...editedTask, default_month: parseInt(e.target.value, 10) })}
                          className="w-full text-xs rounded border border-slate-200 px-2 py-1 bg-slate-50 outline-none"
                        >
                          {[1, 2, 3, 4, 5, 6].map(m => (
                            <option key={m} value={m}>Месяц {m}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-bold text-slate-800 font-mono">Месяц {selectedTask.default_month}</p>
                      )}
                    </div>
                  </div>

                  {/* SOW Смысловой Блок & Тип работы */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400">Смысловой блок SOW</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedTask.work_block || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, work_block: e.target.value })}
                          className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        />
                      ) : (
                        <p className="font-semibold text-slate-800">{selectedTask.work_block || "—"}</p>
                      )}
                    </div>

                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400">Тип SEO работ</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedTask.work_type || ''}
                          onChange={(e) => setEditedTask({ ...editedTask, work_type: e.target.value })}
                          className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        />
                      ) : (
                        <p className="font-semibold text-slate-800">{selectedTask.work_type || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Process */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Процесс исполнения</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedTask.process_text || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, process_text: e.target.value })}
                        className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                      />
                    ) : (
                      <p className="text-slate-700">{selectedTask.process_text || "—"}</p>
                    )}
                  </div>

                  {/* Result & Artifact */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Результат / Артефакт</span>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editedTask.result_text || ''}
                          placeholder="Результат"
                          onChange={(e) => setEditedTask({ ...editedTask, result_text: e.target.value })}
                          className="text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        />
                        <input
                          type="text"
                          value={editedTask.artifact_type || ''}
                          placeholder="Артефакт"
                          onChange={(e) => setEditedTask({ ...editedTask, artifact_type: e.target.value })}
                          className="text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        />
                      </div>
                    ) : (
                      <p className="text-slate-700">
                        {selectedTask.result_text || "—"} <span className="text-slate-400 font-mono">({selectedTask.artifact_type})</span>
                      </p>
                    )}
                  </div>

                  {/* Contract Version */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Версия для Договора (кратко)</span>
                    {isEditing ? (
                      <textarea
                        value={editedTask.contract_text || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, contract_text: e.target.value })}
                        className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        rows={2}
                      />
                    ) : (
                      <p className="text-slate-700 italic">{selectedTask.contract_text || "—"}</p>
                    )}
                  </div>

                  {/* Client Version */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Версия для Клиента (Простыми словами)</span>
                    {isEditing ? (
                      <textarea
                        value={editedTask.client_text || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, client_text: e.target.value })}
                        className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        rows={2}
                      />
                    ) : (
                      <p className="text-slate-700">{selectedTask.client_text || "—"}</p>
                    )}
                  </div>

                  {/* Internal SOW */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Внутренний чек-лист (Для SEO-специалиста)</span>
                    {isEditing ? (
                      <textarea
                        value={editedTask.internal_text || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, internal_text: e.target.value })}
                        className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                        rows={2}
                      />
                    ) : (
                      <p className="text-slate-700">{selectedTask.internal_text || "—"}</p>
                    )}
                  </div>

                  {/* Acceptance Criteria */}
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-400">Критерий приёмки</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedTask.acceptance_criteria || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, acceptance_criteria: e.target.value })}
                        className="w-full text-xs rounded border border-slate-200 p-1 bg-slate-50"
                      />
                    ) : (
                      <p className="text-slate-700">{selectedTask.acceptance_criteria || "—"}</p>
                    )}
                  </div>
                </div>

                <div className="pt-3">
                  <span className="block font-semibold text-slate-500 mb-1">Роли и повторяемость</span>
                  <div className="flex space-x-4">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Роль</span>
                      <span className="font-sans font-medium">{selectedTask.responsible_role || "SEO-специалист"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Частота</span>
                      <span className="font-sans font-medium">{selectedTask.repeatability || "Разово"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 font-sans shadow-xs">
              <BadgeHelp className="h-10 w-10 mx-auto opacity-40 mb-2" />
              <p className="text-sm">Выберите строку задачи в таблице для детального просмотра и ручной нормализации параметров.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
