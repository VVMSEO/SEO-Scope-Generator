import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { readDB, writeDB } from "./server/db.js";
import { parseChecklistText } from "./server/parser.js";
import { filterTasksForProject } from "./server/filter.js";
import { normalizeTask, generateMonthlyScope, runAIReviewer, testLLMConnection } from "./server/ai.js";
import { buildDocxBuffer } from "./server/docx-builder.js";
import { Checklist, Task, Project, LLMProvider, GeneratedScope, GeneratedScopeResult } from "./src/types.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON and urlencoded parser with generous limits for big checklists
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Helper: Retrieve active LLM config and select custom key if present
  async function getActiveApiKey(): Promise<string | undefined> {
    const db = await readDB();
    const active = db.llm_providers.find(p => p.is_active);
    if (active && active.api_key_encrypted && active.api_key_encrypted !== 'AUTO_ENV_KEY') {
      return active.api_key_encrypted;
    }
    return process.env.GEMINI_API_KEY; // Fallback to environment variable
  }

  // Helper: Mask API key for frontend safety
  function maskKey(key: string): string {
    if (!key || key === 'AUTO_ENV_KEY') return 'sk-•••••••••••••••ENV';
    if (key.length <= 8) return '••••' + key.slice(-2);
    return key.slice(0, 3) + '••••••••••••••••' + key.slice(-4);
  }

  // --- API ENDPOINTS ---

  // Checklists
  app.get("/api/checklists", async (req, res) => {
    try {
      const db = await readDB();
      res.json(db.checklists);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/checklists/:id", async (req, res) => {
    try {
      const db = await readDB();
      const item = db.checklists.find(c => c.id === parseInt(req.params.id, 10));
      if (!item) return res.status(404).json({ error: "Checklist not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/checklists/upload", async (req, res) => {
    try {
      let { title, raw_content, version, google_url } = req.body;

      if (google_url && google_url.trim()) {
        let downloadUrl = "";
        let isSpreadsheet = false;

        // Extract Document ID
        const docMatch = google_url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        const sheetMatch = google_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

        if (docMatch) {
          const docId = docMatch[1];
          downloadUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
        } else if (sheetMatch) {
          const sheetId = sheetMatch[1];
          downloadUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv`;
          isSpreadsheet = true;
        } else {
          return res.status(400).json({ error: "Нераспознанный формат ссылки. Поддерживаются только Google Docs и Google Spreadsheets." });
        }

        try {
          const fetchRes = await fetch(downloadUrl);
          if (!fetchRes.ok) {
            throw new Error(`Ошибка подключения: Google вернул код ${fetchRes.status}`);
          }
          const text = await fetchRes.text();

          // Check if Google redirected to a sign-in or consent HTML screen
          if (text.includes("<!DOCTYPE html>") || text.includes("ServiceLogin") || text.includes("google-signin")) {
            throw new Error("Файл заблокирован настройками приватности Google. Пожалуйста, откройте общий доступ по ссылке ('Все, у кого есть ссылка' -> 'Читатель_') или скопируйте контент документа вручную.");
          }

          raw_content = text;
          if (!title) {
            title = isSpreadsheet ? `Импорт таблицы: ${google_url.slice(0, 30)}...` : `Импорт документа: ${google_url.slice(0, 30)}...`;
          }
        } catch (fetchErr: any) {
          return res.status(400).json({ 
            error: `Не удалось скачать документ автоматически: ${fetchErr.message}. Вы можете обойти это, просто скопировав текст из файла и вставив его в поле ввода ниже.`
          });
        }
      }

      if (!title || !raw_content) {
        return res.status(400).json({ error: "Укажите название и предоставьте контент или Google Ссылку." });
      }

      const db = await readDB();
      const newId = db.checklists.length > 0 ? Math.max(...db.checklists.map(c => c.id)) + 1 : 1;

      // Parse the checklist content immediately to count tasks and seed task definitions
      const parsedTasks = parseChecklistText(raw_content);

      if (parsedTasks.length === 0) {
        return res.status(400).json({ error: "Не удалось извлечь ни одной задачи. Проверьте формат текста или таблицы." });
      }

      const checklist: Checklist = {
        id: newId,
        title,
        version: version || "v1.0-auto",
        source_type: google_url ? "google_drive" : "upload",
        raw_content,
        task_count: parsedTasks.length,
        status: parsedTasks.some(pt => pt.work_block) ? 'normalized' : 'parsed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      db.checklists.push(checklist);

      // Save corresponding tasks inside database with support for rich spreadsheet columns
      const initialTasks: Task[] = parsedTasks.map(pt => {
        const id = pt.id;
        const reflectsTSV = !!pt.work_block;
        return {
          id: id,
          checklist_id: newId,
          section: pt.section,
          raw_task: pt.raw_task,
          priority: pt.priority,
          default_month: pt.default_month || 1,
          work_block: pt.work_block || "Общий аудит",
          work_type: pt.work_type || "Анализ",
          process_text: pt.process_text || pt.raw_task,
          result_text: pt.result_text || "Выполненная задача",
          artifact_type: pt.artifact_type || "Отчет",
          contract_text: pt.contract_text || pt.raw_task,
          client_text: pt.client_text || pt.raw_task,
          internal_text: pt.internal_text || pt.raw_task,
          acceptance_criteria: pt.acceptance_criteria || "Пункт полностью выполнен",
          responsible_role: pt.responsible_role || "SEO-специалист",
          repeatability: "Разово",
          status: reflectsTSV ? 'normalized' : 'raw',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          applicability: {
            id,
            task_id: id,
            applies_to_all: true,
            applies_to_ecommerce: false,
            applies_to_services: false,
            applies_to_local: false,
            applies_to_blog: false,
            applies_to_ymyl: false,
            requires_catalog: false,
            requires_filters: false,
            requires_multilingual: false,
            requires_migration: false,
            requires_local_business: false,
            exclude_if_no_blog: false,
            exclude_if_no_ecommerce: false,
            exclude_if_no_multilingual: false,
            exclude_if_no_local_seo: false
          }
        };
      });

      // Filter out pre-existing tasks that have matching IDs to prevent duplicates
      const preIds = new Set(initialTasks.map(t => t.id));
      db.tasks = [...db.tasks.filter(t => !preIds.has(t.id)), ...initialTasks];

      await writeDB(db);
      res.json(checklist);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/checklists/:id/parse", async (req, res) => {
    try {
      const db = await readDB();
      const checklist = db.checklists.find(c => c.id === parseInt(req.params.id, 10));
      if (!checklist) return res.status(404).json({ error: "Checklist not found" });

      const parsed = parseChecklistText(checklist.raw_content);
      // Update tasks inside DB
      const checklistTasks = parsed.map(pt => {
        const existing = db.tasks.find(t => t.id === pt.id && t.checklist_id === checklist.id);
        if (existing) {
          return {
            ...existing,
            section: pt.section,
            raw_task: pt.raw_task,
            priority: pt.priority,
            updated_at: new Date().toISOString()
          };
        }
        return {
          id: pt.id,
          checklist_id: checklist.id,
          section: pt.section,
          raw_task: pt.raw_task,
          priority: pt.priority,
          default_month: 1,
          work_block: "Общий аудит",
          work_type: "Анализ",
          process_text: pt.raw_task,
          result_text: "Выполненная задача",
          artifact_type: "Отчет",
          contract_text: pt.raw_task,
          client_text: pt.raw_task,
          internal_text: pt.raw_task,
          acceptance_criteria: "Пункт полностью выполнен",
          responsible_role: "SEO-специалист",
          repeatability: "Разово",
          status: 'raw',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          applicability: {
            id: pt.id,
            task_id: pt.id,
            applies_to_all: true,
            applies_to_ecommerce: false,
            applies_to_services: false,
            applies_to_local: false,
            applies_to_blog: false,
            applies_to_ymyl: false,
            requires_catalog: false,
            requires_filters: false,
            requires_multilingual: false,
            requires_migration: false,
            requires_local_business: false,
            exclude_if_no_blog: false,
            exclude_if_no_ecommerce: false,
            exclude_if_no_multilingual: false,
            exclude_if_no_local_seo: false
          }
        } as Task;
      });

      const checklistTaskIds = new Set(checklistTasks.map(t => t.id));
      db.tasks = [
        ...db.tasks.filter(t => t.checklist_id !== checklist.id || !checklistTaskIds.has(t.id)),
        ...checklistTasks
      ];

      checklist.task_count = parsed.length;
      checklist.status = 'parsed';
      checklist.updated_at = new Date().toISOString();

      await writeDB(db);
      res.json({ status: "success", count: parsed.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk AI normalizer for checklist tasks
  app.post("/api/checklists/:id/normalize", async (req, res) => {
    try {
      const db = await readDB();
      const checklist = db.checklists.find(c => c.id === parseInt(req.params.id, 10));
      if (!checklist) return res.status(404).json({ error: "Checklist not found" });

      const key = await getActiveApiKey();
      if (!key) {
        return res.status(400).json({ error: "API key is missing. Please configure Gemini API key in settings." });
      }

      // Fetch raw tasks to normalize
      const rawTasks = db.tasks.filter(t => t.checklist_id === checklist.id && t.status === 'raw');
      if (rawTasks.length === 0) {
        checklist.status = 'normalized';
        await writeDB(db);
        return res.json({ message: "All tasks are already normalized", count: 0 });
      }

      // To stay within free limits and prevent timeouts in a single call, normalize up to 8 tasks at a time
      const batch = rawTasks.slice(0, 8);
      const normalizedResults: Task[] = [];

      for (const t of batch) {
        try {
          const result = await normalizeTask({
            id: t.id,
            section: t.section,
            raw_task: t.raw_task,
            priority: t.priority
          }, key);

          const updatedTask: Task = {
            ...t,
            ...result,
            status: 'normalized',
            updated_at: new Date().toISOString(),
            applicability: {
              ...t.applicability!,
              ...(result.applicability || {})
            }
          };

          normalizedResults.push(updatedTask);
        } catch (normErr) {
          console.error(`Error normalizing task ${t.id}:`, normErr);
          // If a single normalization errors, we fall back to raw task structures so the loop does not fully break
          normalizedResults.push({
            ...t,
            status: 'normalized', // Mark normalized to avoid stuck queues
            updated_at: new Date().toISOString()
          });
        }
      }

      // Merge back normalized structures into database
      const normMap = new Map(normalizedResults.map(t => [t.id, t]));
      db.tasks = db.tasks.map(t => normMap.has(t.id) ? normMap.get(t.id)! : t);

      // Check if more raw tasks are outstanding
      const remainingRaw = db.tasks.filter(t => t.checklist_id === checklist.id && t.status === 'raw');
      if (remainingRaw.length === 0) {
        checklist.status = 'normalized';
      }

      checklist.updated_at = new Date().toISOString();
      await writeDB(db);

      res.json({
        message: "Successfully normalized a batch of tasks.",
        count: batch.length,
        remaining_raw: remainingRaw.length,
        normalized: normalizedResults
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Tasks API
  app.get("/api/tasks", async (req, res) => {
    try {
      const db = await readDB();
      let results = db.tasks;

      // Fit Filter parameters
      if (req.query.month) {
        results = results.filter(t => t.default_month === parseInt(req.query.month as string, 10));
      }
      if (req.query.priority) {
        results = results.filter(t => t.priority === req.query.priority);
      }
      if (req.query.status) {
        results = results.filter(t => t.status === req.query.status);
      }
      if (req.query.checklist_id) {
        results = results.filter(t => t.checklist_id === parseInt(req.query.checklist_id as string, 10));
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const db = await readDB();
      const task = db.tasks.find(t => t.id === parseInt(req.params.id, 10));
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const db = await readDB();
      const index = db.tasks.findIndex(t => t.id === parseInt(req.params.id, 10));
      if (index === -1) return res.status(404).json({ error: "Task not found" });

      const updated = {
        ...db.tasks[index],
        ...req.body,
        updated_at: new Date().toISOString()
      };

      db.tasks[index] = updated;
      await writeDB(db);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Projects API
  app.get("/api/projects", async (req, res) => {
    try {
      const db = await readDB();
      res.json(db.projects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const db = await readDB();
      const p = db.projects.find(p => p.id === parseInt(req.params.id, 10));
      if (!p) return res.status(404).json({ error: "Project not found" });
      res.json(p);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const db = await readDB();
      const id = db.projects.length > 0 ? Math.max(...db.projects.map(p => p.id)) + 1 : 1;
      const project: Project = {
        ...req.body,
        id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.projects.push(project);
      await writeDB(db);
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const db = await readDB();
      const index = db.projects.findIndex(p => p.id === parseInt(req.params.id, 10));
      if (index === -1) return res.status(404).json({ error: "Project not found" });

      const updated = {
        ...db.projects[index],
        ...req.body,
        updated_at: new Date().toISOString()
      };
      db.projects[index] = updated;
      await writeDB(db);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const db = await readDB();
      const idStr = req.params.id;
      db.projects = db.projects.filter(p => p.id !== parseInt(idStr, 10));
      db.generated_scopes = db.generated_scopes.filter(s => s.project_id !== parseInt(idStr, 10));
      await writeDB(db);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Scope Of Work Generation API
  app.post("/api/scopes/generate", async (req, res) => {
    try {
      const { project_id, month, depth, tone, checklist_id } = req.body;
      if (!project_id || !month) {
        return res.status(400).json({ error: "Missing project_id or month values" });
      }

      const db = await readDB();
      const project = db.projects.find(p => p.id === parseInt(project_id, 10));
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Determine the checklist id, fallback to first in DB if none provided
      const targetChecklistId = checklist_id ? parseInt(checklist_id, 10) : (db.checklists[0]?.id || 1);

      // Get all tasks related to the target checklist
      const allTasks = db.tasks.filter(t => t.checklist_id === targetChecklistId);

      // Filter tasks to build context
      const filteredTasks = filterTasksForProject(allTasks, project, parseInt(month, 10));
      if (filteredTasks.length === 0) {
        return res.status(400).json({
          error: "No tasks found for the selected month, project type and budget combo! Please add corresponding items to the database or adjust criteria."
        });
      }

      const key = await getActiveApiKey();
      if (!key) {
        return res.status(400).json({ error: "Gemini API Key is not set. Please connect a key in AI settings." });
      }

      // Trigger AI monthly scope compilation SOW
      const generatedScopeResult = await generateMonthlyScope({
        project,
        month: parseInt(month, 10),
        tasks: filteredTasks,
        output_mode: "all",
        depth: depth || "standard",
        tone: tone || "business"
      }, key);

      // We initially draft the results and store inside db
      const sId = db.generated_scopes.length > 0 ? Math.max(...db.generated_scopes.map(s => s.id)) + 1 : 1;

      // Extract details
      const contractText = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\n${b.contract_text}`).join('\n\n');
      const clientText = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\nПроцесс: ${b.process}\nРезультат: ${b.result}\n${b.client_text}`).join('\n\n');
      const internalChecklist = generatedScopeResult.work_blocks.map(b => `${b.block_title}:\n` + b.internal_tasks.map(it => `[ ] ${it}`).join('\n')).join('\n\n');

      const scopeScope: GeneratedScope = {
        id: sId,
        project_id: project.id,
        checklist_id: targetChecklistId,
        month: parseInt(month, 10),
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

      db.generated_scopes.push(scopeScope);
      await writeDB(db);

      res.json(scopeScope);
    } catch (err: any) {
      console.error("Scope generation failed:", err);
      res.status(500).json({ error: err.message || "An error occurred during AI scope generation" });
    }
  });

  // AI Reviewer
  app.post("/api/scopes/review", async (req, res) => {
    try {
      const { scope_id } = req.body;
      if (!scope_id) return res.status(400).json({ error: "Missing scope_id parameter" });

      const db = await readDB();
      const scope = db.generated_scopes.find(s => s.id === parseInt(scope_id, 10));
      if (!scope) return res.status(404).json({ error: "Scope not found" });

      const project = db.projects.find(p => p.id === scope.project_id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Get reference tasks
      const allTasks = db.tasks.filter(t => t.checklist_id === scope.checklist_id);
      const filteredTasks = filterTasksForProject(allTasks, project, scope.month);

      const key = await getActiveApiKey();
      if (!key) return res.status(400).json({ error: "Gemini API key is not configured in settings." });

      const reviewReport = await runAIReviewer({
        project,
        month: scope.month,
        tasks: filteredTasks,
        generatedScope: scope.generated_json
      }, key);

      // Update scope in database with corrected details
      scope.reviewer_notes = `### Замечания аудитора:\n${reviewReport.errors.map(e => `- ❌ ${e}`).join('\n')}\n\n### Пропущенные/Лишние задачи:\n- Пропущены: ${reviewReport.missing_tasks_idsOrTitles.join(', ') || 'нет'}\n- Лишние: ${reviewReport.extra_tasks_idsOrTitles.join(', ') || 'нет'}`;
      scope.generated_json = reviewReport.revised_scope;
      scope.status = 'reviewed';
      scope.version += 1;
      scope.updated_at = new Date().toISOString();

      // Recalculate quick texts
      const r = reviewReport.revised_scope;
      scope.contract_text = r.work_blocks.map(b => `${b.block_title}:\n${b.contract_text}`).join('\n\n');
      scope.client_text = r.work_blocks.map(b => `${b.block_title}:\nПроцесс: ${b.process}\nРезультат: ${b.result}\n${b.client_text}`).join('\n\n');
      scope.internal_checklist = r.work_blocks.map(b => `${b.block_title}:\n` + b.internal_tasks.map(it => `[ ] ${it}`).join('\n')).join('\n\n');

      await writeDB(db);
      res.json(scope);
    } catch (err: any) {
      console.error("Scope review failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Retrieve Scopes History
  app.get("/api/scopes", async (req, res) => {
    try {
      const db = await readDB();
      res.json(db.generated_scopes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/scopes/:id", async (req, res) => {
    try {
      const db = await readDB();
      const s = db.generated_scopes.find(sc => sc.id === parseInt(req.params.id, 10));
      if (!s) return res.status(404).json({ error: "Scope not found" });
      res.json(s);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Edit / Update scope version
  app.patch("/api/scopes/:id", async (req, res) => {
    try {
      const db = await readDB();
      const index = db.generated_scopes.findIndex(sc => sc.id === parseInt(req.params.id, 10));
      if (index === -1) return res.status(404).json({ error: "Scope not found" });

      const updated = {
        ...db.generated_scopes[index],
        ...req.body,
        version: db.generated_scopes[index].version + 1,
        updated_at: new Date().toISOString()
      };

      db.generated_scopes[index] = updated;
      await writeDB(db);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export: Markdown & Word DOCX
  app.post("/api/export/markdown", async (req, res) => {
    try {
      const { scope_id } = req.body;
      const db = await readDB();
      const scope = db.generated_scopes.find(s => s.id === parseInt(scope_id, 10));
      if (!scope) return res.status(404).json({ error: "Scope not found" });

      const project = db.projects.find(p => p.id === scope.project_id);
      const data: GeneratedScopeResult = scope.generated_json;

      let markdown = `# SEO Scope of Work\n\n`;
      markdown += `**Проект**: ${project ? project.name : "SEO Проект"}\n`;
      markdown += `**Месяц работы**: ${data.month} — ${data.month_title}\n\n`;
      markdown += `> ${data.summary}\n\n`;

      markdown += `## 1. Блоки планируемых работ\n\n`;
      data.work_blocks.forEach((block, idx) => {
        markdown += `### 1.${idx + 1}. Блок: ${block.block_title}\n`;
        markdown += `- **Процесс**: ${block.process}\n`;
        markdown += `- **Результат**: ${block.result}\n`;
        markdown += `- **Артефакт**: ${block.artifact}\n`;
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

      res.json({ markdown });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/export/:id/docx", async (req, res) => {
    try {
      const scopeId = parseInt(req.params.id, 10);
      const db = await readDB();
      const scope = db.generated_scopes.find(s => s.id === scopeId);
      if (!scope) return res.status(404).send("Scope report not found");

      const project = db.projects.find(p => p.id === scope.project_id);
      if (!project) return res.status(404).send("Project profile not found");

      const buffer = await buildDocxBuffer(project, scope.generated_json);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="sow_month_${scope.month}_${project.name.replace(/\s+/g, '_')}.docx"`);
      res.end(buffer);
    } catch (err: any) {
      console.error("DOCX build failed:", err);
      res.status(500).send(err.message || "Could not generate DOCX file");
    }
  });

  // Settings
  app.get("/api/settings/llm-provider", async (req, res) => {
    try {
      const db = await readDB();
      // Only returning the provider name, temperature and a masked key for frontend display stability
      const maskedList = db.llm_providers.map(p => ({
        ...p,
        api_key_encrypted: maskKey(p.api_key_encrypted)
      }));
      res.json(maskedList);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings/llm-provider", async (req, res) => {
    try {
      const { provider_name, api_endpoint, api_key, default_model, temperature, max_tokens, is_active } = req.body;
      const db = await readDB();

      let provider = db.llm_providers.find(p => p.provider_name === provider_name);
      if (!provider) {
        provider = {
          id: db.llm_providers.length + 1,
          provider_name: provider_name || "Gemini",
          api_endpoint: api_endpoint || 'https://generativelanguage.googleapis.com',
          api_key_encrypted: 'AUTO_ENV_KEY',
          default_model: default_model || 'gemini-3.5-flash',
          temperature: temperature !== undefined ? parseFloat(temperature) : 0.3,
          max_tokens: max_tokens !== undefined ? parseInt(max_tokens, 10) : 8000,
          is_active: is_active !== undefined ? is_active : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        db.llm_providers.push(provider);
      } else {
        provider.api_endpoint = api_endpoint || provider.api_endpoint;
        provider.default_model = default_model || provider.default_model;
        if (temperature !== undefined) provider.temperature = parseFloat(temperature);
        if (max_tokens !== undefined) provider.max_tokens = parseInt(max_tokens, 10);
        if (is_active !== undefined) provider.is_active = is_active;

        // If api_key does not contain dots/masks and is not empty, rewrite it
        if (api_key && api_key.trim() !== "" && !api_key.includes('••••')) {
          provider.api_key_encrypted = api_key;
        }
        provider.updated_at = new Date().toISOString();
      }

      await writeDB(db);
      res.json({
        ...provider,
        api_key_encrypted: maskKey(provider.api_key_encrypted)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings/llm-provider/test", async (req, res) => {
    try {
      const { api_key } = req.body;
      const db = await readDB();
      const active = db.llm_providers[0];

      let keyToTest = process.env.GEMINI_API_KEY;
      if (api_key && api_key.trim() !== '' && !api_key.includes('••••')) {
        keyToTest = api_key;
      } else if (active && active.api_key_encrypted && active.api_key_encrypted !== 'AUTO_ENV_KEY') {
        keyToTest = active.api_key_encrypted;
      }

      const isWorking = await testLLMConnection(keyToTest);
      res.json({ status: isWorking ? "connected" : "error" });
    } catch (err: any) {
      res.json({ status: "error", message: err.message });
    }
  });

  app.delete("/api/settings/llm-provider", async (req, res) => {
    try {
      const db = await readDB();
      // Default / reset the api key back to the environment variable AUTO_ENV_KEY
      if (db.llm_providers.length > 0) {
        db.llm_providers[0].api_key_encrypted = 'AUTO_ENV_KEY';
        db.llm_providers[0].updated_at = new Date().toISOString();
        await writeDB(db);
      }
      res.json({ success: true, message: "Custom API settings deleted, reset to fallback AUTO_ENV_KEY" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- VITE AND PUBLIC ROUTING ---

  // Vite development routing or compiled assets serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express] SEO Scope Generator server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical server starter failed: ", err);
});
