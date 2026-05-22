import React, { useEffect, useState } from "react";
import { FolderKanban, FileSpreadsheet, FileCheck, CheckCircle2, ShieldAlert, Zap, Plus, FileClock, Upload, RefreshCw } from "lucide-react";
import { Project, Checklist, GeneratedScope } from "../types.js";
import { auth } from "../firebase.js";
import { getClientTasks } from "../db-client.js";

interface DashboardProps {
  onNavigate: (tab: string) => void;
  projects: Project[];
  checklists: Checklist[];
  scopes: GeneratedScope[];
  llmStatus: 'connected' | 'error' | 'pending';
  refreshData: () => void;
}

export default function Dashboard({ onNavigate, projects, checklists, scopes, llmStatus, refreshData }: DashboardProps) {
  const [totalTasks, setTotalTasks] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getClientTasks(uid)
      .then(data => {
        setTotalTasks(data.length);
        setLoadingTasks(false);
      })
      .catch(err => {
        console.error("Error loaded taskcount", err);
        setLoadingTasks(false);
      });
  }, [checklists]);

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">SEO Scope Generator Panel</h1>
        <p className="text-slate-500 font-sans mt-1">
          Автоматическая генерация клиентских списков работ и детальных чек-листов на базе AI.
        </p>
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <FolderKanban className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Проекты</p>
            <p className="text-2xl font-bold text-slate-800">{projects.length}</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Задач в Базе</p>
            <p className="text-2xl font-bold text-slate-800">
              {loadingTasks ? "..." : totalTasks}
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="p-3 rounded-lg bg-purple-50 text-purple-600">
            <FileCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Генерации</p>
            <p className="text-2xl font-bold text-slate-800">{scopes.length}</p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className={`p-3 rounded-lg ${llmStatus === 'connected' ? 'bg-emerald-50 text-emerald-600' : llmStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">AI Коннектор</p>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className={`h-2.5 w-2.5 rounded-full ${llmStatus === 'connected' ? 'bg-emerald-500' : llmStatus === 'error' ? 'bg-red-500' : 'bg-amber-400'}`}></span>
              <span className="text-sm font-semibold capitalize text-slate-700">
                {llmStatus === 'connected' ? 'Подключен' : llmStatus === 'error' ? 'Ошибка' : 'Проверка'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Panel */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Быстрые действия</h2>

          <button
            onClick={() => onNavigate("projects")}
            className="w-full bg-white hover:bg-slate-50 text-left p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex items-start space-x-3.5 group cursor-pointer"
          >
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Создать профиль проекта</p>
              <p className="text-xs text-slate-500 mt-0.5">Добавьте новый сайт клиента, укажите бюджет и специфику CMS.</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("generator")}
            className="w-full bg-slate-900 hover:bg-slate-800 text-left p-4 rounded-xl shadow-xs hover:shadow-md transition-all flex items-start space-x-3.5 group text-white cursor-pointer"
          >
            <div className="p-2.5 rounded-lg bg-slate-800 text-amber-400 group-hover:bg-slate-700 transition-colors">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Сгенерировать SOW</p>
              <p className="text-xs text-slate-300 mt-0.5">Запустить генерацию планов SOW на основе мастер-чек-листа.</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("checklists")}
            className="w-full bg-white hover:bg-slate-50 text-left p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex items-start space-x-3.5 group cursor-pointer"
          >
            <div className="p-2.5 rounded-lg bg-pink-50 text-pink-600 group-hover:bg-pink-100 transition-colors">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Импорт чек-листа</p>
              <p className="text-xs text-slate-500 mt-0.5">Разберите текстовый лог или вставьте новые списки задач.</p>
            </div>
          </button>
        </div>

        {/* Recent Generations List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Последние генерации SOW</h2>
            <button
              onClick={() => onNavigate("history")}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 font-sans cursor-pointer"
            >
              Вся история →
            </button>
          </div>

          {scopes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-sans">
              <FileClock className="h-10 w-10 mx-auto opacity-50 mb-2" />
              <p className="text-sm">Пока нет сгенерированных документов в архиве.</p>
              <p className="text-xs mt-1">Используйте раздел "Генератор", чтобы составить первый список.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-75 overflow-y-auto pr-1">
              {scopes.slice().reverse().map((scope) => {
                const project = projects.find(p => p.id === scope.project_id);
                return (
                  <div key={scope.id} className="py-3 flex items-center justify-between group">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {project ? project.name : "Неизвестный проект"}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-600 font-medium">
                          Месяц {scope.month}
                        </span>
                        <span>•</span>
                        <span>Версия {scope.version}</span>
                        <span>•</span>
                        <span>{new Date(scope.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        scope.status === 'saved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        scope.status === 'reviewed' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                        'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {scope.status === 'saved' ? 'Сохранен' :
                         scope.status === 'reviewed' ? 'Аудит пройден' : 'Черновик'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
