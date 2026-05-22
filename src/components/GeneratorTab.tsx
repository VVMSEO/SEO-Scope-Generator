import React, { useState } from "react";
import { Zap, Sparkles, FileText, CheckCircle2, ChevronRight, Edit3, Save, Download, Copy, AlertCircle, RefreshCw, FileClock } from "lucide-react";
import { Project, Checklist, Task, GeneratedScope, GeneratedScopeResult } from "../types.js";
import { auth } from "../firebase.js";
import { 
  getClientTasks, 
  addClientScope, 
  updateClientScope, 
  getClientLLMProviders 
} from "../db-client.js";
import { generateMonthlyScope, runAIReviewer } from "../ai-client.js";
import { downloadClientDocx } from "../docx-client.js";

interface GeneratorTabProps {
  projects: Project[];
  checklists: Checklist[];
  refreshData: () => void;
}

// Client-side implementation of filterTasksForProject
function filterTasksForProject(
  tasks: Task[],
  project: Project,
  month: number
): Task[] {
  let results = tasks.filter(t => Number(t.default_month) === Number(month));

  results = results.filter(task => {
    const app = task.applicability;
    if (!app) return true;

    if (app.exclude_if_no_blog && !project.has_blog) return false;
    if (app.exclude_if_no_ecommerce && !project.has_ecommerce) return false;
    if (app.exclude_if_no_multilingual && !project.has_multilingual) return false;
    if (app.exclude_if_no_local_seo && !project.has_local_seo) return false;

    if (app.applies_to_all) return true;

    let isIncluded = false;
    if (app.applies_to_ecommerce && project.has_ecommerce) isIncluded = true;
    if (app.applies_to_services && project.site_type === 'services') isIncluded = true;
    if (app.applies_to_local && project.has_local_seo) isIncluded = true;
    if (app.applies_to_blog && project.has_blog) isIncluded = true;
    if (app.applies_to_ymyl && project.has_ymyl) isIncluded = true;
    if (app.requires_catalog && project.has_catalog) isIncluded = true;
    if (app.requires_filters && project.has_filters) isIncluded = true;
    if (app.requires_multilingual && project.has_multilingual) isIncluded = true;
    if (app.requires_migration && project.has_migration) isIncluded = true;
    if (app.requires_local_business && project.has_local_seo) isIncluded = true;

    return isIncluded;
  });

  const budget = (project.budget_level || 'standard').toLowerCase();
  
  results = results.filter(task => {
    const priority = (task.priority || 'optional').toLowerCase();
    
    if (budget === 'basic' || budget === 'базовый') {
      return priority === 'critical' || priority === 'критично';
    } else if (budget === 'standard' || budget === 'стандарт') {
      return priority === 'critical' || priority === 'критично' || priority === 'important' || priority === 'важно';
    } else {
      return true;
    }
  });

  return results;
}

// Client-side markdown formatter
function compileScopeMarkdown(project: Project | undefined, data: GeneratedScopeResult): string {
  let markdown = `# SEO Plan & Scope of Work\n\n`;
  markdown += `**Проект**: ${project ? project.name : "SEO Проект"}\n`;
  markdown += `**Месяц продвижения**: ${data.month} — ${data.month_title}\n\n`;
  markdown += `> ${data.summary}\n\n`;

  markdown += `## 1. Блоки планируемых работ\n\n`;
  data.work_blocks.forEach((block, idx) => {
    markdown += `### 1.${idx + 1}. Блок: ${block.block_title}\n`;
    markdown += `- **Процесс**: ${block.process}\n`;
    markdown += `- **Результат**: ${block.result}\n`;
    markdown += `- **Артефакт**: ${block.artifact || "Сводка / Таблица"}\n`;
    markdown += `- **Критерий приемки**: ${block.acceptance_criteria}\n`;
    markdown += `- **Ответственный**: ${block.responsible_role || "SEO-специалист"}\n`;
    markdown += `\n**Договорная формулировка**:\n> *${block.contract_text}*\n\n`;
    markdown += `**Для клиента (простым языком)**:\n${block.client_text}\n\n`;
  });

  markdown += `## 2. Итоговые результаты и артефакты месяца\n\n`;
  data.month_outputs.forEach((out) => {
    markdown += `- [x] ${out}\n`;
  });

  markdown += `\n## 3. Внутренние пункты чек-листа\n\n`;
  data.work_blocks.forEach((block) => {
    block.internal_tasks.forEach((task) => {
      markdown += `- [ ] ${task}\n`;
    });
  });

  return markdown;
}

export default function GeneratorTab({ projects, checklists, refreshData }: GeneratorTabProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id?.toString() || "");
  const [selectedMonth, setSelectedMonth] = useState<string>("1");
  const [selectedDepth, setSelectedDepth] = useState<string>("standard");
  const [selectedTone, setSelectedTone] = useState<string>("business");
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>(checklists[0]?.id?.toString() || "");

  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [activeScope, setActiveScope] = useState<GeneratedScope | null>(null);
  const [editingBlockIdx, setEditingBlockIdx] = useState<number | null>(null);

  const [editBlockTitle, setEditBlockTitle] = useState("");
  const [editBlockProcess, setEditBlockProcess] = useState("");
  const [editBlockResult, setEditBlockResult] = useState("");
  const [editBlockArtifact, setEditBlockArtifact] = useState("");
  const [editBlockContract, setEditBlockContract] = useState("");
  const [editBlockClient, setEditBlockClient] = useState("");
  const [editBlockInternal, setEditBlockInternal] = useState("");

  const [outputTab, setOutputTab] = useState<'contract' | 'client' | 'internal' | 'all'>('all');

  const triggerGenerate = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Сессия пользователя не найдена. Авторизуйтесь.");
      return;
    }

    if (!selectedProjectId) {
      setErrorMsg("Сначала выберите или создайте проект.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setActiveScope(null);

    try {
      const project = projects.find(p => p.id === parseInt(selectedProjectId, 10));
      if (!project) throw new Error("Проект не найден.");

      const targetChecklistId = selectedChecklistId ? parseInt(selectedChecklistId, 10) : (checklists[0]?.id || 1);
      
      // Load raw tasks and filter them based on constraints
      const allTasks = await getClientTasks(uid, { checklist_id: targetChecklistId });
      const filteredTasks = filterTasksForProject(allTasks, project, parseInt(selectedMonth, 10));

      if (filteredTasks.length === 0) {
        throw new Error("Нет подходящих задач в чек-листе под параметры сайта и тарифа на этот месяц.");
      }

      // Fetch active custom AI key from Firestore configurations
      const providers = await getClientLLMProviders(uid);
      const active = providers.find(p => p.is_active) || providers[0];
      const customKey = active?.api_key_encrypted || "";

      // Trigger Gemini compiler
      const generatedScopeResult = await generateMonthlyScope({
        project,
        month: parseInt(selectedMonth, 10),
        tasks: filteredTasks,
        output_mode: "all",
        depth: selectedDepth,
        tone: selectedTone
      }, customKey);

      // Save scope record
      const contractText = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\n${b.contract_text}`).join('\n\n');
      const clientText = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\nПроцесс: ${b.process}\nРезультат: ${b.result}\n${b.client_text}`).join('\n\n');
      const internalChecklist = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\n` + b.internal_tasks.map(it => `[ ] ${it}`).join('\n')).join('\n\n');

      const scopePayload: Omit<GeneratedScope, "id"> = {
        project_id: project.id,
        checklist_id: targetChecklistId,
        month: parseInt(selectedMonth, 10),
        output_mode: 'all',
        generated_json: generatedScopeResult,
        contract_text: contractText,
        client_text: clientText,
        internal_checklist: internalChecklist,
        status: 'draft',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const finalScope = await addClientScope(uid, scopePayload);
      setActiveScope(finalScope);
      setSuccessMsg("SEO SOW Сгенерирован на клиенте успешно!");
      refreshData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerAIReview = async () => {
    const uid = auth.currentUser?.uid;
    if (!activeScope || !uid) return;
    setReviewing(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const project = projects.find(p => p.id === activeScope.project_id);
      if (!project) throw new Error("Проект не найден");

      const allTasks = await getClientTasks(uid, { checklist_id: activeScope.checklist_id });
      const filteredTasks = filterTasksForProject(allTasks, project, activeScope.month);

      // Load API key
      const providers = await getClientLLMProviders(uid);
      const active = providers.find(p => p.is_active) || providers[0];
      const customKey = active?.api_key_encrypted || "";

      const reviewReport = await runAIReviewer({
        project,
        month: activeScope.month,
        tasks: filteredTasks,
        generatedScope: activeScope.generated_json
      }, customKey);

      const notes = `### Замечания аудитора:\n${reviewReport.errors.map(e => `- ❌ ${e}`).join('\n')}\n\n### Пропущенные/Лишние задачи:\n- Пропущены: ${reviewReport.missing_tasks_idsOrTitles.join(', ') || 'нет'}\n- Лишние: ${reviewReport.extra_tasks_idsOrTitles.join(', ') || 'нет'}`;
      
      const r = reviewReport.revised_scope;
      const contractText = r.work_blocks.map(b => `${b.block_title}:\n${b.contract_text}`).join('\n\n');
      const clientText = r.work_blocks.map(b => `${b.block_title}:\nПроцесс: ${b.process}\nРезультат: ${b.result}\n${b.client_text}`).join('\n\n');
      const internalChecklist = r.work_blocks.map(b => `${b.block_title}:\n` + r.work_blocks.flatMap(wb => wb.internal_tasks).map(it => `[ ] ${it}`).join('\n')).join('\n\n');

      const updated = await updateClientScope(uid, activeScope.id, {
        reviewer_notes: notes,
        generated_json: r,
        status: 'reviewed',
        version: activeScope.version + 1,
        contract_text: contractText,
        client_text: clientText,
        internal_checklist: internalChecklist,
        updated_at: new Date().toISOString()
      });

      setActiveScope(updated);
      setSuccessMsg("AI-Reviewer аудит качества завершен! Исправленный план синхронизирован.");
      refreshData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const startEditBlock = (idx: number, block: any) => {
    setEditingBlockIdx(idx);
    setEditBlockTitle(block.block_title);
    setEditBlockProcess(block.process);
    setEditBlockResult(block.result);
    setEditBlockArtifact(block.artifact || "");
    setEditBlockContract(block.contract_text);
    setEditBlockClient(block.client_text);
    setEditBlockInternal(block.internal_tasks.join("\n"));
  };

  const saveEditedBlock = async () => {
    const uid = auth.currentUser?.uid;
    if (!activeScope || editingBlockIdx === null || !uid) return;
    setErrorMsg("");
    setSuccessMsg("");

    const updatedJson: GeneratedScopeResult = { ...activeScope.generated_json };
    const targetBlock = updatedJson.work_blocks[editingBlockIdx];

    targetBlock.block_title = editBlockTitle;
    targetBlock.process = editBlockProcess;
    targetBlock.result = editBlockResult;
    targetBlock.artifact = editBlockArtifact;
    targetBlock.contract_text = editBlockContract;
    targetBlock.client_text = editBlockClient;
    targetBlock.internal_tasks = editBlockInternal.split("\n").filter(t => t.trim() !== "");

    try {
      const data = await updateClientScope(uid, activeScope.id, { 
        generated_json: updatedJson,
        version: activeScope.version + 1,
        updated_at: new Date().toISOString() 
      });
      setActiveScope(data);
      setEditingBlockIdx(null);
      setSuccessMsg("Абзац успешно сохранен и сохранен на облаке!");
      refreshData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const copyMarkdown = async () => {
    if (!activeScope) return;
    const project = projects.find(p => p.id === activeScope.project_id);
    try {
      const md = compileScopeMarkdown(project, activeScope.generated_json);
      await navigator.clipboard.writeText(md);
      alert("Документ в Markdown скопирован в буфер обмена!");
    } catch (err) {
      alert("Ошибка копирования: " + err);
    }
  };

  const triggerDownloadDocx = () => {
    if (!activeScope) return;
    const project = projects.find(p => p.id === activeScope.project_id);
    if (!project) return;
    downloadClientDocx(project, activeScope.generated_json);
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-sans">AI Генератор списков работ SOW</h1>
        <p className="text-slate-500 font-sans mt-1">
          Задайте специфику месяца для сайта, отберите релевантные задачи и сформируйте документ в один клик.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-4 border-l-4 border-red-500 rounded-r-lg flex items-center space-x-2 text-sm justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 border-l-4 border-emerald-500 rounded-r-lg flex items-center space-x-2 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Клиентский Проект</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="">-- Выберите бренд --</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Месяц продвижения</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="1">Месяц 1 — Старт & Вебмастера</option>
            <option value="2">Месяц 2 — Техно краул & Robots</option>
            <option value="3">Месяц 3 — Семантика & Архитектура</option>
            <option value="4">Месяц 4 — On-page & Метатеги</option>
            <option value="5">Месяц 5 — Местные карты & E-E-A-T</option>
            <option value="6">Месяц 6 — Контроль & Коррекция</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Проработка тарифа</label>
          <select
            value={selectedDepth}
            onChange={(e) => setSelectedDepth(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="basic">Базовая (Только критичные)</option>
            <option value="standard">Стандартная SOW</option>
            <option value="premium">Расширенная (Доп. чек-листы)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Специфика тона</label>
          <select
            value={selectedTone}
            onChange={(e) => setSelectedTone(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            <option value="business">Строгий Деловой</option>
            <option value="detailed">Подробный с объяснениями</option>
            <option value="short">Краткие лозунги</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Чек-лист</label>
          <select
            value={selectedChecklistId}
            onChange={(e) => setSelectedChecklistId(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none"
          >
            {checklists.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={triggerGenerate}
          disabled={loading || reviewing}
          className="bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 font-bold text-white text-xs py-3 px-8 rounded-lg shadow-md transition-all flex items-center space-x-2 shrink-0 cursor-pointer"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-400" />}
          <span>СГЕНЕРИРОВАТЬ СПИСОК РАБОТ SOW</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Scope Result Viewer Card */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 text-xs">
          {activeScope ? (
            <div className="space-y-4">
              {/* Header Title SOW */}
              <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="bg-blue-50 text-blue-800 font-mono font-bold text-[10px] uppercase py-1 px-2.5 rounded">
                    Месяц {activeScope.month} — {activeScope.generated_json.month_title}
                  </span>
                  <h2 className="text-md font-bold text-slate-900 mt-2">SEO План Работ на месяц (v{activeScope.version})</h2>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={triggerAIReview}
                    disabled={reviewing || loading}
                    className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                    <span>{reviewing ? "Рецензия..." : "Аудит AI-Reviewer"}</span>
                  </button>

                  <button
                    onClick={triggerDownloadDocx}
                    className="py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Скачать Word DOCX</span>
                  </button>

                  <button
                    onClick={copyMarkdown}
                    className="py-1.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Markdown</span>
                  </button>
                </div>
              </div>

              {/* Scope Summary Block */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-relaxed text-slate-700">
                <span className="font-bold text-slate-800">Обзор стратегии: </span>
                {activeScope.generated_json.summary}
              </div>

              {/* SOW Format Tabs */}
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => setOutputTab('all')}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 outline-none ${outputTab === 'all' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  Все данные
                </button>
                <button
                  onClick={() => setOutputTab('contract')}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 outline-none ${outputTab === 'contract' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  Для договора
                </button>
                <button
                  onClick={() => setOutputTab('client')}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 outline-none ${outputTab === 'client' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  Для клиента
                </button>
                <button
                  onClick={() => setOutputTab('internal')}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 outline-none ${outputTab === 'internal' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  Внутренний чек-лист
                </button>
              </div>

              {/* Dynamic list */}
              <div className="space-y-4 max-h-135 overflow-y-auto pr-1">
                {activeScope.generated_json.work_blocks.map((block: any, idx: number) => {
                  const isEditingThis = editingBlockIdx === idx;

                  return (
                    <div key={idx} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3.5 relative shadow-xs">
                      {/* Top bar Block */}
                      <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                        <div>
                          {isEditingThis ? (
                            <input
                              type="text"
                              value={editBlockTitle}
                              onChange={(e) => setEditBlockTitle(e.target.value)}
                              className="font-bold text-slate-800 rounded border border-slate-300 p-1 text-xs"
                            />
                          ) : (
                            <h3 className="font-bold text-slate-800 text-sm">
                              Блок {idx + 1}. {block.block_title}
                            </h3>
                          )}
                        </div>

                        <div>
                          {isEditingThis ? (
                            <button
                              onClick={saveEditedBlock}
                              className="p-1 px-2.5 bg-emerald-600 text-white rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer hover:bg-emerald-700 hover:scale-105"
                            >
                              <Save className="h-3 w-3" />
                              <span>Сохранить</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditBlock(idx, block)}
                              className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-semibold text-[10px] flex items-center space-x-1 cursor-pointer"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Редактировать</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Editing fields active */}
                      {isEditingThis ? (
                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400">Процесс</label>
                              <input
                                type="text"
                                style={{ width: '100%' }}
                                value={editBlockProcess}
                                onChange={(e) => setEditBlockProcess(e.target.value)}
                                className="rounded border border-slate-200 p-1 bg-slate-50 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400">Результат</label>
                              <input
                                type="text"
                                style={{ width: '100%' }}
                                value={editBlockResult}
                                onChange={(e) => setEditBlockResult(e.target.value)}
                                className="rounded border border-slate-200 p-1 bg-slate-50 text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400">Артефакт</label>
                              <input
                                type="text"
                                style={{ width: '100%' }}
                                value={editBlockArtifact}
                                onChange={(e) => setEditBlockArtifact(e.target.value)}
                                className="rounded border border-slate-200 p-1 bg-slate-50 text-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400">Договорная версия</label>
                            <textarea
                              rows={2}
                              style={{ width: '100%' }}
                              value={editBlockContract}
                              onChange={(e) => setEditBlockContract(e.target.value)}
                              className="rounded border border-slate-200 p-2 bg-slate-50 text-xs resize-y w-full"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400">Клиентская версия (Простым языком)</label>
                            <textarea
                              rows={2}
                              style={{ width: '100%' }}
                              value={editBlockClient}
                              onChange={(e) => setEditBlockClient(e.target.value)}
                              className="rounded border border-slate-200 p-2 bg-slate-50 text-xs resize-y w-full"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400">Внутренний чек-лист (строки)</label>
                            <textarea
                              rows={3}
                              style={{ width: '100%' }}
                              value={editBlockInternal}
                              onChange={(e) => setEditBlockInternal(e.target.value)}
                              className="rounded border border-slate-200 p-2 bg-slate-50 text-xs resize-y font-mono w-full"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {(outputTab === 'all' || outputTab === 'client') && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="bg-emerald-50/40 p-2.5 rounded border border-emerald-100/40">
                                <span className="text-[10px] text-emerald-800 font-bold block mb-1">ПРОЦЕСС</span>
                                <p className="text-slate-700 leading-snug">{block.process}</p>
                              </div>
                              <div className="bg-blue-50/40 p-2.5 rounded border border-blue-100/40">
                                <span className="text-[10px] text-blue-800 font-bold block mb-1">РЕЗУЛЬТАТ</span>
                                <p className="text-slate-700 leading-snug">{block.result}</p>
                              </div>
                              <div className="bg-purple-50/40 p-2.5 rounded border border-purple-100/40">
                                <span className="text-[10px] text-purple-800 font-bold block mb-1">АРТЕФАКТ</span>
                                <p className="text-slate-700 leading-snug">{block.artifact || "План / Таблица"}</p>
                              </div>
                            </div>
                          )}

                          {(outputTab === 'all' || outputTab === 'contract') && (
                            <div className="bg-slate-50 p-3 rounded text-xs">
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">ЮРИДИЧЕСКАЯ ВЕРСИЯ (ДОГОВОР)</span>
                              <p className="italic text-slate-800">«{block.contract_text}»</p>
                            </div>
                          )}

                          {(outputTab === 'all' || outputTab === 'client') && (
                            <div className="bg-blue-50/20 p-3 rounded border border-blue-100/20 text-xs">
                              <span className="text-[10px] text-blue-700 font-bold block mb-1">ДЛЯ КЛИЕНТА (ПРОСТЫМИ СЛОВАМИ)</span>
                              <p className="text-slate-800">{block.client_text}</p>
                            </div>
                          )}

                          {(outputTab === 'all' || outputTab === 'internal') && (
                            <div className="bg-slate-50 p-3 rounded text-xs">
                              <span className="text-[10px] text-slate-500 font-bold block mb-1.5">ВНУТРЕННИЙ ЧЕК-ЛИСТ (TASKS)</span>
                              <div className="space-y-1.5 pl-1">
                                {block.internal_tasks.map((it: string, itIdx: number) => (
                                  <div key={itIdx} className="flex items-start space-x-2 text-xs">
                                    <input type="checkbox" disabled className="h-3.5 w-3.5 mt-0.5 rounded text-blue-600" />
                                    <span className="text-slate-700">{it}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-slate-200/50 text-[10px] text-slate-400">
                                <span>✔ Критерий приёмки: {block.acceptance_criteria}</span>
                                <span>• Исполнитель: {block.responsible_role || "SEO-специалист"}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Month outputs card */}
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">ИТОГОВЫЕ РЕЗУЛЬТАТЫ МЕСЯЦА</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs">
                  {activeScope.generated_json.month_outputs.map((mo: string, moIdx: number) => (
                    <div key={moIdx} className="flex items-center space-x-2 text-slate-300 font-sans">
                      <span className="text-emerald-500 font-bold">✔</span>
                      <span>{mo}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 bg-white border border-slate-200 rounded-xl shadow-xs leading-relaxed max-h-165 flex flex-col items-center justify-center">
              <Zap className="h-12 w-12 text-blue-500 opacity-60 animate-pulse mb-3" />
              <p className="text-sm font-semibold text-slate-600">Результат генерации пуст (создайте SOW).</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Выберите проект, месяц работы и нажмите кнопку "Сгенерировать список работ" вверху панели.
              </p>
            </div>
          )}
        </div>

        {/* Audit & Inconsistencies Report Panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center space-x-1.5">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
              <span>Зона качества — AI Reviewer</span>
            </h3>

            {activeScope && activeScope.reviewer_notes ? (
              <div className="space-y-3 font-sans leading-relaxed text-slate-700 bg-indigo-50/40 p-3.5 rounded-lg border border-indigo-100 text-xs whitespace-pre-line">
                {activeScope.reviewer_notes}
              </div>
            ) : (
              <div className="text-slate-400 text-xs py-10 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <FileClock className="h-8 w-8 mx-auto opacity-40 mb-2" />
                <p>Аудит не запускался для этого черновика.</p>
                <p className="text-[10px] mt-1 text-slate-400">Нажмите кнопку "Аудит AI-Reviewer" для проверки качества.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Правила SEO методологии</h3>
            <p className="text-slate-500 text-xs leading-relaxed mb-3">Сопоставление планов с целями проекта:</p>

            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 font-bold">■</span>
                <span><strong>Процесс → Результат</strong>: Каждый блок формирует реальный артефакт.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 font-bold">■</span>
                <span><strong>Договор</strong>: Краткий, юридически безопасный, без обещаний точных позиций.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-blue-500 font-bold">■</span>
                <span><strong>Внутренний чек-лист</strong>: Полная детализация с критериями сдачи.</span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
