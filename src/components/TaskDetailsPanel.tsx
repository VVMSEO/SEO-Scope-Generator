import React from "react";
import { Edit3, Save, X, Sparkles } from "lucide-react";
import { Task } from "../types.js";

interface TaskDetailsPanelProps {
  task: Task;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  editedTask: Partial<Task>;
  setEditedTask: (t: Partial<Task>) => void;
  handleSaveEdit: () => void;
  onRegenerateTask?: () => void;
  isRegenerating?: boolean;
}

export function TaskDetailsPanel({
  task,
  isEditing,
  setIsEditing,
  editedTask,
  setEditedTask,
  handleSaveEdit,
  onRegenerateTask,
  isRegenerating
}: TaskDetailsPanelProps) {
  return (
    <div className="bg-slate-50 border border-t-0 border-slate-200 p-5 shadow-inner space-y-4 rounded-b-xl w-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <span className="font-mono text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-bold">
            ID {task.id}
          </span>
          <h3 className="font-extrabold text-slate-900 mt-1">
            Обогащенные данные: <span className="font-semibold text-blue-700">{task.raw_task}</span>
          </h3>
        </div>

        <div className="flex items-center space-x-1">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer"
              >
                <Save className="h-3 w-3" />
                <span>Сохранить</span>
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1 px-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-[10px] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              {onRegenerateTask && (
                <button
                  onClick={onRegenerateTask}
                  disabled={isRegenerating}
                  className="p-1 px-2.5 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-50 text-indigo-800 rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isRegenerating ? "animate-pulse" : ""}`} />
                  <span>{isRegenerating ? "Генерация..." : "ТЗ ИИ"}</span>
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 px-2.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Редактировать</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto pr-1 text-xs">
        <div className="space-y-3.5 border-b border-slate-200 pb-3">
          {/* Task Priority & Default Month */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Приоритет</span>
              {isEditing ? (
                <select
                  value={editedTask.priority || ''}
                  onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value })}
                  className="w-full text-xs rounded border border-slate-300 px-2 py-1 bg-white outline-none focus:border-blue-500"
                >
                  <option value="critical">🔴 Критично</option>
                  <option value="important">🟡 Важно</option>
                  <option value="optional">🟢 Опционально</option>
                </select>
              ) : (
                <p className="font-semibold text-slate-800 capitalize">
                  {task.priority === 'critical' ? '🔴 Критично' : task.priority === 'important' ? '🟡 Важно' : '🟢 Опционально'}
                </p>
              )}
            </div>

            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Срок по умолчанию (Месяц)</span>
              {isEditing ? (
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={editedTask.default_month || 1}
                  onChange={(e) => setEditedTask({ ...editedTask, default_month: parseInt(e.target.value, 10) || 1 })}
                  className="w-full text-xs rounded border border-slate-300 px-2 py-1 bg-white outline-none focus:border-blue-500"
                />
              ) : (
                <p className="font-bold text-slate-800 font-mono">Месяц {task.default_month}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Смысловой блок SOW</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedTask.work_block || ''}
                  onChange={(e) => setEditedTask({ ...editedTask, work_block: e.target.value })}
                  className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                />
              ) : (
                <p className="font-semibold text-slate-800">{task.work_block || "—"}</p>
              )}
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Тип работ</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedTask.work_type || ''}
                  onChange={(e) => setEditedTask({ ...editedTask, work_type: e.target.value })}
                  className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                />
              ) : (
                <p className="font-semibold text-slate-800">{task.work_type || "—"}</p>
              )}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Процесс исполнения</span>
            {isEditing ? (
              <input
                type="text"
                value={editedTask.process_text || ''}
                onChange={(e) => setEditedTask({ ...editedTask, process_text: e.target.value })}
                className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
              />
            ) : (
              <p className="text-slate-800">{task.process_text || "—"}</p>
            )}
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Результат / Артефакт</span>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={editedTask.result_text || ''}
                  placeholder="Результат"
                  onChange={(e) => setEditedTask({ ...editedTask, result_text: e.target.value })}
                  className="text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                />
                <input
                  type="text"
                  value={editedTask.artifact_type || ''}
                  placeholder="Артефакт"
                  onChange={(e) => setEditedTask({ ...editedTask, artifact_type: e.target.value })}
                  className="text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                />
              </div>
            ) : (
              <p className="text-slate-800">
                {task.result_text || "—"} <span className="text-slate-500 font-mono">({task.artifact_type})</span>
              </p>
            )}
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Версия для Договора (кратко)</span>
            {isEditing ? (
              <textarea
                value={editedTask.contract_text || ''}
                onChange={(e) => setEditedTask({ ...editedTask, contract_text: e.target.value })}
                className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                rows={2}
              />
            ) : (
              <p className="text-slate-800 italic">{task.contract_text || "—"}</p>
            )}
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Версия для Клиента (Простыми словами)</span>
            {isEditing ? (
              <textarea
                value={editedTask.client_text || ''}
                onChange={(e) => setEditedTask({ ...editedTask, client_text: e.target.value })}
                className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                rows={2}
              />
            ) : (
              <p className="text-slate-800">{task.client_text || "—"}</p>
            )}
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Внутренний чек-лист (Для специалиста)</span>
            {isEditing ? (
              <textarea
                value={editedTask.internal_text || ''}
                onChange={(e) => setEditedTask({ ...editedTask, internal_text: e.target.value })}
                className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
                rows={2}
              />
            ) : (
              <p className="text-slate-800">{task.internal_text || "—"}</p>
            )}
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-500">Критерий приёмки</span>
            {isEditing ? (
              <input
                type="text"
                value={editedTask.acceptance_criteria || ''}
                onChange={(e) => setEditedTask({ ...editedTask, acceptance_criteria: e.target.value })}
                className="w-full text-xs rounded border border-slate-300 p-1 bg-white focus:border-blue-500 outline-none"
              />
            ) : (
              <p className="text-slate-800">{task.acceptance_criteria || "—"}</p>
            )}
          </div>
        </div>

        <div className="pt-2">
          <span className="block font-semibold text-slate-600 mb-1">Дополнительно</span>
          <div className="flex space-x-6">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Роль</span>
              {isEditing ? (
                 <input type="text" value={editedTask.responsible_role || ''} onChange={e => setEditedTask({...editedTask, responsible_role: e.target.value})} className="w-full text-xs rounded border border-slate-300 p-1 bg-white outline-none" />
              ) : (
                 <span className="font-sans font-medium text-slate-900">{task.responsible_role || "Основной"}</span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Частота</span>
              {isEditing ? (
                 <input type="text" value={editedTask.repeatability || ''} onChange={e => setEditedTask({...editedTask, repeatability: e.target.value})} className="w-full text-xs rounded border border-slate-300 p-1 bg-white outline-none" />
              ) : (
                 <span className="font-sans font-medium text-slate-900">{task.repeatability || "Разово"}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
