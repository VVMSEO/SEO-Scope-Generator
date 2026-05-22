import React, { useState } from "react";
import { FolderPlus, Globe, Building2, MapPin, Tag, Lightbulb, Trash2, CheckCircle, AlertCircle, Plus, Sparkles, RefreshCw } from "lucide-react";
import { Project } from "../types.js";
import { auth } from "../firebase.js";
import { addClientProject, deleteClientProject } from "../db-client.js";

interface ProjectsTabProps {
  projects: Project[];
  refreshData: () => void;
}

export default function ProjectsTab({ projects, refreshData }: ProjectsTabProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // States to add a project
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteType, setSiteType] = useState("ecommerce");
  const [niche, setNiche] = useState("");
  const [geography, setGeography] = useState("Москва, РФ");
  const [budgetLevel, setBudgetLevel] = useState("standard");
  const [durationMonths, setDurationMonths] = useState(6);

  // Structural switches states
  const [hasCatalog, setHasCatalog] = useState(true);
  const [hasBlog, setHasBlog] = useState(false);
  const [hasFilters, setHasFilters] = useState(true);
  const [hasEcommerce, setHasEcommerce] = useState(true);
  const [hasLocalSeo, setHasLocalSeo] = useState(true);
  const [hasMultilingual, setHasMultilingual] = useState(false);
  const [hasYmyl, setHasYmyl] = useState(false);
  const [hasMigration, setHasMigration] = useState(false);

  // Show Add Form state
  const [showAddForm, setShowAddForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Ошибка сеанса. Пройдите авторизацию.");
      return;
    }

    if (!name.trim()) {
      setErrorMsg("Укажите имя проекта.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      name,
      site_url: siteUrl,
      site_type: siteType,
      niche,
      geography,
      budget_level: budgetLevel,
      duration_months: parseInt(durationMonths as any, 10),
      has_catalog: hasCatalog,
      has_blog: hasBlog,
      has_filters: hasFilters,
      has_ecommerce: hasEcommerce,
      has_local_seo: hasLocalSeo,
      has_multilingual: hasMultilingual,
      has_ymyl: hasYmyl,
      has_migration: hasMigration
    };

    try {
      const data = await addClientProject(uid, payload);
      setSuccessMsg(`Профиль проекта "${data.name}" успешно сформирован!`);
      setName("");
      setSiteUrl("");
      setNiche("");
      setShowAddForm(false);
      refreshData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!confirm("Вы действительно хотите удалить проект и всю историю его генераций?")) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await deleteClientProject(uid, id);
      setSuccessMsg("Проект успешно удален.");
      refreshData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-sans">Проекты продвижения</h1>
          <p className="text-slate-500 font-sans mt-1">
            Профили клиентских сайтов со всеми спецификами структуры для корректной фильтрации задач.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center space-x-1 sm:space-x-1.5 shadow-xs cursor-pointer text-center"
        >
          <Plus className="h-4 w-4" />
          <span>{showAddForm ? "Скрыть форму" : "Новый проект"}</span>
        </button>
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

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in text-xs">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center space-x-1">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span>Общие реквизиты проекта</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Название проекта *</label>
              <input
                type="text"
                placeholder="Интернет-магазин мебели (Furni)"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Домен / URL сайта</label>
                <input
                  type="text"
                  placeholder="site.ru"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Тип проекта</label>
                <select
                  value={siteType}
                  onChange={(e) => setSiteType(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                >
                  <option value="ecommerce">Ecommerce (Магазин)</option>
                  <option value="services">Услуги (Сайт услуг)</option>
                  <option value="blog">Инфосайт / Блог / Медиа</option>
                  <option value="local_business">Локальный бизнес</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ниша / Описание сайта</label>
                <input
                  type="text"
                  placeholder="Мебель, Логистика, Запчасти..."
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Регион продвижения</label>
                <input
                  type="text"
                  placeholder="Москва, РФ"
                  value={geography}
                  onChange={(e) => setGeography(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">SEO Тариф</label>
                <select
                  value={budgetLevel}
                  onChange={(e) => setBudgetLevel(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                >
                  <option value="basic">Базовый (Критичные) 💰</option>
                  <option value="standard">Стандартный (Критичные + Важные) 💰💰</option>
                  <option value="premium">Расширенный (Все) 💰💰💰</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Срок договора</label>
                <select
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(parseInt(e.target.value, 10))}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                >
                  <option value="3">3 месяца</option>
                  <option value="6">6 месяцев</option>
                  <option value="12">12 месяцев</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center space-x-1">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span>Технические модули & Свежие триггеры</span>
            </h2>

            <p className="text-slate-400 text-xs">Эти опции управляют фильтрацией задач. Отключайте ненужные пункты, чтобы SOW соответствовал структуре.</p>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCatalog}
                  onChange={(e) => setHasCatalog(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Каталог товаров</span>
                  <span className="text-[10px] text-slate-400">Нужна иерархия</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBlog}
                  onChange={(e) => setHasBlog(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Имеется Блог</span>
                  <span className="text-[10px] text-slate-400">Контент-планы</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFilters}
                  onChange={(e) => setHasFilters(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Фильтры & Теги</span>
                  <span className="text-[10px] text-slate-400">Оптимизация ЧПУ</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEcommerce}
                  onChange={(e) => setHasEcommerce(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">E-Commerce корзина</span>
                  <span className="text-[10px] text-slate-400">Транзакции & Способы</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasLocalSeo}
                  onChange={(e) => setHasLocalSeo(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Локальное Map SEO</span>
                  <span className="text-[10px] text-slate-400">Google карты/Яндекс</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasMultilingual}
                  onChange={(e) => setHasMultilingual(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Мультиязычность</span>
                  <span className="text-[10px] text-slate-400">Hreflang, субдомены</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasYmyl}
                  onChange={(e) => setHasYmyl(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">YMYL тематика</span>
                  <span className="text-[10px] text-slate-400">Медицина, финансы, E-E-A-T</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasMigration}
                  onChange={(e) => setHasMigration(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Переезд сайта</span>
                  <span className="text-[10px] text-slate-400">Таблица редиректов</span>
                </div>
              </label>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-lg transition-colors cursor-pointer text-center flex items-center justify-center space-x-1"
            >
              {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span>СОХРАНИТЬ ПРОФИЛЬ ПРОЕКТА</span>
            </button>
          </div>
        </form>
      )}

      {/* Grid listing */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => (
          <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-snug">{p.name}</h3>
                    <span className="text-[10px] text-slate-400 font-mono">{p.site_url || "без домена"}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-1">
                  <span className="text-[9px] bg-amber-100 text-amber-900 font-bold uppercase tracking-wider py-0.5 px-2 rounded">
                    {p.budget_level}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    Срок: {p.duration_months} мес.
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-slate-600">
                <div className="flex justify-between items-center text-[10px]">
                  <span>Смысловая ниша:</span>
                  <span className="font-semibold text-slate-800">{p.niche || "Общая"}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span>Гео-таргетинг:</span>
                  <span className="font-semibold text-slate-800">{p.geography}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span>Тип движка:</span>
                  <span className="font-semibold text-slate-800 capitalize">{p.site_type}</span>
                </div>
              </div>

              {/* Status Checklist indicators */}
              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-50 text-[10px]">
                <span className={`text-center py-0.5 rounded ${p.has_catalog ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-slate-100 text-slate-400 line-through'}`}>Каталог</span>
                <span className={`text-center py-0.5 rounded ${p.has_blog ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-slate-100 text-slate-400 line-through'}`}>Блог</span>
                <span className={`text-center py-0.5 rounded ${p.has_local_seo ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-slate-100 text-slate-400 line-through'}`}>Map-Seo</span>
                <span className={`text-center py-0.5 rounded ${p.has_ymyl ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-slate-100 text-slate-400 line-through'}`}>E-E-A-T</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                Создан: {new Date(p.created_at || "").toLocaleDateString()}
              </span>
              
              <button
                onClick={() => handleDelete(p.id)}
                disabled={loading}
                className="p-1.5 bg-slate-50 hover:bg-red-50 hover:text-red-700 text-slate-400 border border-slate-100 hover:border-red-200 rounded-lg transition-all cursor-pointer"
                title="Удалить проект"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 font-sans shadow-xs">
            <Building2 className="h-12 w-12 mx-auto opacity-35 mb-2.5" />
            <p className="text-sm font-medium">Список проектов чист.</p>
            <p className="text-xs text-slate-500 mt-1">Добавьте первый сайт, используя синюю кнопку «Новый проект» в правом верхнем углу.</p>
          </div>
        )}
      </div>
    </div>
  );
}
