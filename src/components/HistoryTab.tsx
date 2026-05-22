import React from "react";
import { FileClock, Download, Sparkles, Folder, Calendar, UserCheck } from "lucide-react";
import { GeneratedScope, Project } from "../types.js";
import { downloadClientDocx } from "../docx-client.js";

interface HistoryTabProps {
  scopes: GeneratedScope[];
  projects: Project[];
  onSelectScope: (scope: GeneratedScope) => void;
}

export default function HistoryTab({ scopes, projects, onSelectScope }: HistoryTabProps) {
  
  const handleDownloadDocx = (scope: GeneratedScope) => {
    const project = projects.find(p => p.id === scope.project_id);
    if (!project) return;
    downloadClientDocx(project, scope.generated_json);
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-sans">Архив генераций</h1>
        <p className="text-slate-500 font-sans mt-1">
          Все сгенерированные, отредактированные и подтвержденные документы SOW для ваших клиентов.
        </p>
      </div>

      {scopes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-400">
          <FileClock className="h-12 w-12 mx-auto leading-none opacity-40 mb-3" />
          <p className="font-semibold text-slate-600">Ваш архив пуст</p>
          <p className="text-xs text-slate-400 mt-1">Перейдите на вкладку "Генератор" и сделайте первый запуск по клиентским спецификациям.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-xs">
          <table className="w-full text-left font-sans border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Клиентский Проект / Сайт</th>
                <th className="px-5 py-3">Месяц</th>
                <th className="px-5 py-3">Дата создания</th>
                <th className="px-5 py-3">Версия / Статус</th>
                <th className="px-5 py-3 shrink-0 text-right">Файлы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {scopes.slice().reverse().map((scope) => {
                const project = projects.find(p => p.id === scope.project_id);
                return (
                  <tr key={scope.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-slate-400">#{scope.id}</td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800 text-sm leading-snug">{project ? project.name : "Удаленный проект"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{project?.site_url || "—"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        Месяц {scope.month}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-500">{new Date(scope.created_at).toLocaleDateString()}</p>
                      <p className="text-[10px] text-slate-400 font-mono leading-none mt-1">
                        {new Date(scope.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 font-medium">v{scope.version}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          scope.status === 'saved' ? 'bg-emerald-100 text-emerald-800' :
                          scope.status === 'reviewed' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {scope.status === 'saved' ? 'Сохранен' :
                           scope.status === 'reviewed' ? 'Аудит пройден' : 'Черновик'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onSelectScope(scope)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          Открыть
                        </button>
                        <button
                          onClick={() => handleDownloadDocx(scope)}
                          className="p-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded transition-colors cursor-pointer"
                          title="Скачать DOCX"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
