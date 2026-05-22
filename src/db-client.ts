import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  writeBatch 
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { db, auth, OperationType, handleFirestoreError } from "./firebase.js";
import { SEED_DATA } from "./seeds.js";
import { Project, Checklist, Task, GeneratedScope, LLMProvider } from "./types.js";
import { parseChecklistText } from "../server/parser.js";

// Silent initialization of custom sandbox via anonymous credentials
export async function initializeUserSession(onReady: (user: User) => void, onError?: (err: any) => void) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("[Firebase] Session active for UID:", user.uid);
      try {
        await seedUserDataIfEmpty(user.uid);
      } catch (err) {
        console.error("[Firebase] Error during automatic database seeding:", err);
      }
      onReady(user);
    } else {
      console.log("[Firebase] Silent authorization in progress...");
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("[Firebase] Failed silent authorization:", err);
        if (onError) onError(err);
      }
    }
  });
}

// Seeds user subcollections if this is a first-time or fresh sandbox
async function seedUserDataIfEmpty(uid: string) {
  const checklistsPath = `users/${uid}/checklists`;
  let existNum = 0;
  try {
    const snap = await getDocs(collection(db, "users", uid, "checklists"));
    existNum = snap.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, checklistsPath);
  }

  if (existNum > 0) {
    return; // Already populated
  }

  console.log("[Firebase] Seeding core checklists, tasks and sample projects to new user space...");

  // Write Checklists
  for (const c of SEED_DATA.checklists) {
    const ref = doc(db, "users", uid, "checklists", String(c.id));
    await setDoc(ref, c).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/checklists/${c.id}`));
  }

  // Write Tasks
  for (const t of SEED_DATA.tasks) {
    const ref = doc(db, "users", uid, "tasks", String(t.id));
    await setDoc(ref, t).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/tasks/${t.id}`));
  }

  // Write Projects
  for (const p of SEED_DATA.projects) {
    const ref = doc(db, "users", uid, "projects", String(p.id));
    await setDoc(ref, p).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/projects/${p.id}`));
  }

  // Write LLM Providers
  for (const provider of SEED_DATA.llm_providers) {
    const ref = doc(db, "users", uid, "llm_providers", String(provider.id));
    await setDoc(ref, provider).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/llm_providers/${provider.id}`));
  }

  console.log("[Firebase] Seeding complete successfully!");
}

// --- CRUD OPERATIONS ---

// 1. PROJECTS
export async function getClientProjects(uid: string): Promise<Project[]> {
  const path = `users/${uid}/projects`;
  try {
    const snap = await getDocs(collection(db, "users", uid, "projects"));
    return snap.docs.map(d => d.data() as Project);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function addClientProject(uid: string, pData: Partial<Project>): Promise<Project> {
  const projs = await getClientProjects(uid);
  const nextId = projs.length > 0 ? Math.max(...projs.map(p => p.id)) + 1 : 1;
  const project: Project = {
    ...pData,
    id: nextId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as Project;

  const path = `users/${uid}/projects/${nextId}`;
  try {
    await setDoc(doc(db, "users", uid, "projects", String(nextId)), project);
    return project;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateClientProject(uid: string, projectId: number, pData: Partial<Project>): Promise<Project> {
  const path = `users/${uid}/projects/${projectId}`;
  try {
    const ref = doc(db, "users", uid, "projects", String(projectId));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("Профиль сайта не найден.");
    }
    const updated = {
      ...snap.data(),
      ...pData,
      updated_at: new Date().toISOString()
    } as Project;
    await setDoc(ref, updated);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteClientProject(uid: string, projectId: number): Promise<void> {
  const path = `users/${uid}/projects/${projectId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "projects", String(projectId)));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// 2. CHECKLISTS & TASKS
export async function getClientChecklists(uid: string): Promise<Checklist[]> {
  const path = `users/${uid}/checklists`;
  try {
    const snap = await getDocs(collection(db, "users", uid, "checklists"));
    return snap.docs.map(d => d.data() as Checklist);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function deleteClientChecklist(uid: string, checklistId: number): Promise<void> {
  const cRef = doc(db, "users", uid, "checklists", String(checklistId));
  await deleteDoc(cRef);
  
  const qTasks = query(collection(db, "users", uid, "tasks"), where("checklist_id", "==", checklistId));
  const snap = await getDocs(qTasks);
  
  try {
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn("Failed to delete some associated tasks", e);
  }
}

export async function deleteAllClientChecklistsAndTasks(uid: string): Promise<void> {
  const qTasks = query(collection(db, "users", uid, "tasks"));
  const tasksSnap = await getDocs(qTasks);
  
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of tasksSnap.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count === 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  
  const qChecklists = query(collection(db, "users", uid, "checklists"));
  const checklistsSnap = await getDocs(qChecklists);
  for (const docSnap of checklistsSnap.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count === 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
}

export async function getClientTasks(uid: string, filterOpts?: { checklist_id?: number; month?: number; status?: string }): Promise<Task[]> {
  const path = `users/${uid}/tasks`;
  try {
    const snap = await getDocs(collection(db, "users", uid, "tasks"));
    let results = snap.docs.map(d => d.data() as Task);
    if (filterOpts) {
      if (filterOpts.checklist_id) {
        results = results.filter(t => t.checklist_id === filterOpts.checklist_id);
      }
      if (filterOpts.month) {
        results = results.filter(t => t.default_month === filterOpts.month);
      }
      if (filterOpts.status) {
        results = results.filter(t => t.status === filterOpts.status);
      }
    }
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function uploadClientChecklist(
  uid: string, 
  opts: { title?: string; raw_content?: string; version: string; google_url?: string }
): Promise<Checklist> {
  let { title, raw_content, version, google_url } = opts;

  if (google_url && google_url.trim()) {
    let downloadUrl = "";
    let isSpreadsheet = false;

    const docMatch = google_url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    const sheetMatch = google_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

    if (docMatch) {
      downloadUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    } else if (sheetMatch) {
      downloadUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=tsv`;
      isSpreadsheet = true;
    } else {
      throw new Error("Нераспознанный формат ссылки Google. Поддерживаются только Google Docs и Google Таблицы.");
    }

    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(downloadUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Ошибка прокси: ${res.status}`);
      const data = await res.json();
      const text = data.contents;

      if (!text) {
        throw new Error("Пустой ответ от прокси.");
      }

      if (text.includes("<!DOCTYPE html>") || text.includes("ServiceLogin") || text.includes("google-signin")) {
        throw new Error("Документ закрыт настройками приватности Google. Откройте доступ по ссылке 'Все у кого есть ссылка -> Читатель'.");
      }
      raw_content = text;
      if (!title) {
        title = isSpreadsheet ? "Таблица Google Таблиц" : "Текст Google Документа";
      }
    } catch (err: any) {
      throw new Error(`Не удалось скачать документ: ${err.message}. Пожалуйста, скопируйте текст вручную.`);
    }
  }

  if (!title || !raw_content) {
    throw new Error("Заполните название и тело чек-листа или предоставьте ссылку Google.");
  }

  const lists = await getClientChecklists(uid);
  
  if (lists.some(c => c.title === title || (google_url && c.source_type === "google_drive" && c.raw_content === raw_content))) {
    throw new Error("Чек-лист с таким названием или содержимым уже существует. Пожалуйста, удалите старый перед загрузкой нового.");
  }

  const nextId = lists.length > 0 ? Math.max(...lists.map(c => c.id)) + 1 : 1;

  const parsed = parseChecklistText(raw_content);
  if (parsed.length === 0) {
    throw new Error("Не удалось извлечь пункты задач. Проверьте правильность форматирования.");
  }

  const checklist: Checklist = {
    id: nextId,
    title,
    version,
    source_type: google_url ? "google_drive" : "upload",
    raw_content,
    task_count: parsed.length,
    status: parsed.some(pt => pt.work_block) ? "normalized" : "parsed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const initialTasks: Task[] = parsed.map(pt => {
    const tid = nextId * 10000 + pt.id;
    const isRich = !!pt.work_block;
    return {
      id: tid,
      checklist_id: nextId,
      section: pt.section,
      raw_task: pt.raw_task,
      priority: pt.priority,
      default_month: pt.default_month || 1,
      work_block: pt.work_block || "Общие работы",
      work_type: pt.work_type || "Анализ",
      process_text: pt.process_text || pt.raw_task,
      result_text: pt.result_text || "Пункт выполнен",
      artifact_type: pt.artifact_type || "Отчет",
      contract_text: pt.contract_text || pt.raw_task,
      client_text: pt.client_text || pt.raw_task,
      internal_text: pt.internal_text || pt.raw_task,
      acceptance_criteria: pt.acceptance_criteria || "Пункт полностью выполнен",
      responsible_role: pt.responsible_role || "SEO-специалист",
      repeatability: "Разово",
      status: isRich ? "normalized" : "raw",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      applicability: {
        id: tid,
        task_id: tid,
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

  // Save Checklist Document
  await setDoc(doc(db, "users", ...[uid, "checklists", String(nextId)]), checklist)
    .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/checklists/${nextId}`));

  // Batch-save corresponding tasks
  let batch = writeBatch(db);
  let count = 0;
  for (const t of initialTasks) {
    batch.set(doc(db, "users", uid, "tasks", String(t.id)), t);
    count++;
    if (count === 400) {
      await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, `Batch tasks write`));
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, `Batch tasks write`));
  }

  return checklist;
}

export async function parseClientChecklist(uid: string, cid: number): Promise<number> {
  const cRef = doc(db, "users", uid, "checklists", String(cid));
  const snap = await getDoc(cRef);
  if (!snap.exists()) throw new Error("Чек-лист не найден.");

  const checklist = snap.data() as Checklist;
  const parsed = parseChecklistText(checklist.raw_content);

  const tasksCol = collection(db, "users", uid, "tasks");
  const qTasks = query(tasksCol, where("checklist_id", "==", cid));
  const existingDocs = await getDocs(qTasks);
  const existingTasksMap = new Map<number, Task>();
  existingDocs.forEach(d => {
    existingTasksMap.set(Number(d.id), d.data() as Task);
  });

  let batch = writeBatch(db);
  let count = 0;

  for (const pt of parsed) {
    const tid = cid * 10000 + pt.id;
    const tRef = doc(db, "users", uid, "tasks", String(tid));
    
    if (existingTasksMap.has(tid)) {
      batch.update(tRef, {
        section: pt.section,
        raw_task: pt.raw_task,
        priority: pt.priority,
        updated_at: new Date().toISOString()
      });
    } else {
      const newTask: Task = {
        id: tid,
        checklist_id: cid,
        section: pt.section,
        raw_task: pt.raw_task,
        priority: pt.priority,
        default_month: 1,
        work_block: "Общие работы",
        work_type: "Анализ",
        process_text: pt.raw_task,
        result_text: "Пункт выполнен",
        artifact_type: "Отчет",
        contract_text: pt.raw_task,
        client_text: pt.raw_task,
        internal_text: pt.raw_task,
        acceptance_criteria: "Пункт полностью выполнен",
        responsible_role: "SEO-специалист",
        repeatability: "Разово",
        status: "raw",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        applicability: {
          id: tid,
          task_id: tid,
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
      batch.set(tRef, newTask);
    }
    
    count++;
    if (count === 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  await updateDoc(cRef, {
    task_count: parsed.length,
    status: "parsed",
    updated_at: new Date().toISOString()
  });

  return parsed.length;
}

export async function updateClientTask(uid: string, taskId: number, fields: Partial<Task>): Promise<Task> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    const ref = doc(db, "users", uid, "tasks", String(taskId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Задача не найдена.");
    const updated = {
      ...snap.data(),
      ...fields,
      updated_at: new Date().toISOString()
    } as Task;
    await setDoc(ref, updated);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// 3. GENERATED PLANS HISTORY
export async function getClientScopes(uid: string): Promise<GeneratedScope[]> {
  const path = `users/${uid}/generated_scopes`;
  try {
    const snap = await getDocs(collection(db, "users", uid, "generated_scopes"));
    return snap.docs.map(d => d.data() as GeneratedScope);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function getClientScopeById(uid: string, scopeId: number): Promise<GeneratedScope> {
  const path = `users/${uid}/generated_scopes/${scopeId}`;
  try {
    const snap = await getDoc(doc(db, "users", uid, "generated_scopes", String(scopeId)));
    if (!snap.exists()) throw new Error("План работ не найден.");
    return snap.data() as GeneratedScope;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function addClientScope(uid: string, sData: Omit<GeneratedScope, "id">): Promise<GeneratedScope> {
  const scopes = await getClientScopes(uid);
  const nextId = scopes.length > 0 ? Math.max(...scopes.map(s => s.id)) + 1 : 1;
  const scope: GeneratedScope = {
    ...sData,
    id: nextId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as GeneratedScope;

  const path = `users/${uid}/generated_scopes/${nextId}`;
  try {
    await setDoc(doc(db, "users", uid, "generated_scopes", String(nextId)), scope);
    return scope;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateClientScope(uid: string, scopeId: number, fields: Partial<GeneratedScope>): Promise<GeneratedScope> {
  const path = `users/${uid}/generated_scopes/${scopeId}`;
  try {
    const ref = doc(db, "users", uid, "generated_scopes", String(scopeId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Scope не найден.");
    const current = snap.data() as GeneratedScope;
    const updated = {
      ...current,
      ...fields,
      version: current.version + 1,
      updated_at: new Date().toISOString()
    } as GeneratedScope;
    await setDoc(ref, updated);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// 4. LLM PROVIDERS CONFIG
export async function getClientLLMProviders(uid: string): Promise<LLMProvider[]> {
  const path = `users/${uid}/llm_providers`;
  try {
    const snap = await getDocs(collection(db, "users", uid, "llm_providers"));
    return snap.docs.map(d => d.data() as LLMProvider);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function updateClientLLMProvider(uid: string, update: Partial<LLMProvider>): Promise<LLMProvider> {
  const path = `users/${uid}/llm_providers/1`;
  try {
    const ref = doc(db, "users", uid, "llm_providers", "1");
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() as LLMProvider : SEED_DATA.llm_providers[0];

    const updated = {
      ...existing,
      ...update,
      updated_at: new Date().toISOString()
    } as LLMProvider;

    await setDoc(ref, updated);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
