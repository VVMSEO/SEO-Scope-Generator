import React, { useState, useEffect } from "react";
import { Zap, ShieldCheck, KeyRound, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { auth } from "../firebase.js";
import { getClientLLMProviders, updateClientLLMProvider } from "../db-client.js";
import { testLLMConnection } from "../ai-client.js";

interface SettingsTabProps {
  onStatusChange: (status: 'connected' | 'error' | 'pending') => void;
}

export default function SettingsTab({ onStatusChange }: SettingsTabProps) {
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(8000);
  const [defaultModel, setDefaultModel] = useState("gemini-2.5-flash"); 
  const [providerName, setProviderName] = useState("Gemini");
  const [apiEndpoint, setApiEndpoint] = useState("https://generativelanguage.googleapis.com");

  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testResult, setTestResult] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadProviderSettings = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const list = await getClientLLMProviders(uid);
      if (list.length > 0) {
        const active = list[0];
        setApiKey(active.api_key_encrypted || "");
        setTemperature(active.temperature ?? 0.3);
        setMaxTokens(active.max_tokens ?? 8000);
        setDefaultModel(active.default_model || "gemini-2.5-flash");
        setProviderName(active.provider_name || "Gemini");
        setApiEndpoint(active.api_endpoint || "https://generativelanguage.googleapis.com");
      }
    } catch (err) {
      console.error("Could not fetch LLM configuration", err);
    }
  };

  useEffect(() => {
    loadProviderSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Ошибка авторизации.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      provider_name: providerName,
      api_endpoint: apiEndpoint, 
      api_key_encrypted: apiKey,
      default_model: defaultModel,
      temperature: Number.isNaN(temperature) ? 0.3 : temperature,
      max_tokens: Number.isNaN(maxTokens) ? 8000 : maxTokens,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    try {
      const updated = await updateClientLLMProvider(uid, payload);
      
      setApiKey(updated.api_key_encrypted);
      setSuccessMsg("Параметры и API-ключ успешно сохранены в Firestore!");
      await checkConnection(updated);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async (providerOverride?: any) => {
    setTestStatus('testing');
    setTestResult("");
    try {
      const payload = providerOverride || {
        provider_name: providerName,
        api_endpoint: apiEndpoint, 
        api_key_encrypted: apiKey,
        default_model: defaultModel
      };
      const isOK = await testLLMConnection(payload);
      if (isOK) {
        setTestStatus('success');
        onStatusChange('connected');
        setTestResult("Соединение успешно установлено! Модель готова к работе на клиенте.");
      } else {
        setTestStatus('failed');
        onStatusChange('error');
        setTestResult("Ошибка авторизации. Проверьте правильность предоставленного ключа и URL.");
      }
    } catch (err: any) {
      setTestStatus('failed');
      onStatusChange('error');
      setTestResult(err.message || "Ошибка подключения.");
    }
  };

  const handleReset = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!confirm("Вы действительно хотите удалить ваш персональный ключ и сбросить параметры?")) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const payload = {
        provider_name: "Gemini",
        api_endpoint: "https://generativelanguage.googleapis.com", 
        api_key_encrypted: "", // Reset core values
        default_model: "gemini-2.5-flash",
        temperature: 0.3,
        max_tokens: 8000,
        is_active: true,
        updated_at: new Date().toISOString()
      };

      await updateClientLLMProvider(uid, payload);
      setSuccessMsg("Интеграционные настройки очищены.");
      setApiKey("");
      setProviderName("Gemini");
      setApiEndpoint("https://generativelanguage.googleapis.com");
      setDefaultModel("gemini-2.5-flash");
      setTestStatus('failed');
      onStatusChange('error');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs font-sans">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-sans">Настройки подключения AI</h1>
        <p className="text-slate-500 font-sans mt-1">
          Параметры интеграции с моделями искусственного интеллекта Google Gemini для качественного нормализера и аудитора.
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
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        {/* Left Form credentials */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1.5 border-b border-slate-100 pb-2">
            <KeyRound className="h-4 w-4 text-blue-500" />
            <span>Конфигуратор API Gemini</span>
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Провайдер</label>
                <select
                  value={providerName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProviderName(val);
                    if (val === "Gemini") {
                      setApiEndpoint("https://generativelanguage.googleapis.com");
                      setDefaultModel("gemini-2.5-flash");
                    } else if (val === "OpenAI Compatible") {
                      setApiEndpoint("https://routerai.ru/api/v1");
                      setDefaultModel("anthropic/claude-3.5-sonnet");
                    }
                  }}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500"
                >
                  <option value="Gemini">Google Gemini</option>
                  <option value="OpenAI Compatible">Custom / OpenAI Compatible</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Base URL / Endpoint</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Ваш API Ключ</label>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 block mt-1 leading-relaxed">
                Введите API Ключ. Криптографическая переменная сохраняется локально в вашей базе данных Firestore и никогда не передается сторонним лицам.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Выбор AI Модели</label>
                <input
                  type="text"
                  placeholder="gemini-2.5-flash"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="text-slate-500 hover:text-red-700 hover:bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-lg font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Сбросить настройки</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                {loading && <RefreshCw className="h-4.5 w-4.5 animate-spin" />}
                <span>Сохранить параметры</span>
              </button>
            </div>
          </form>
        </div>

        {/* Diagnostic Panel */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-1 border-b border-slate-100 pb-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Статус соединения</span>
          </h2>

          <div className="space-y-4 leading-relaxed">
            <p className="text-[11px] text-slate-500">
              Этот блок используется в целях отладки и проверки действительности встроенного Google API шлюза.
            </p>

            {testStatus === 'idle' && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex flex-col items-center justify-center py-6 text-center text-slate-400">
                <RefreshCw className="h-6 w-6 opacity-30 mb-2" />
                <span>Ожидание проверки...</span>
              </div>
            )}

            {testStatus === 'testing' && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex flex-col items-center justify-center py-6 text-center text-blue-600">
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                <span className="font-semibold">Тестируем соединение...</span>
              </div>
            )}

            {testStatus === 'success' && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg space-y-2">
                <div className="flex items-center space-x-1.5 text-emerald-800 font-bold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Соединение Активно</span>
                </div>
                <p className="text-[11px] text-emerald-700 leading-snug">{testResult}</p>
              </div>
            )}

            {testStatus === 'failed' && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-lg space-y-2">
                <div className="flex items-center space-x-1.5 text-red-800 font-bold">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <span>Соединение Прервано</span>
                </div>
                <p className="text-[11px] text-red-700 leading-snug">{testResult}</p>
              </div>
            )}

            <button
              onClick={() => checkConnection()}
              disabled={testStatus === 'testing'}
              className="w-full text-center py-2 bg-slate-900 font-bold text-white uppercase rounded-lg shadow-sm hover:bg-slate-800 disabled:bg-slate-200 cursor-pointer"
            >
              Проверить шлюз AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
