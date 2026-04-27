'use client';

import React, { useState, useEffect } from 'react';
import { useSettings } from '@/lib/ai/settings-store';
import { 
  fetchModelsDevCatalog, 
  HERMES_PROVIDERS, 
  type AIConnection, 
  type ModelsDevProvider 
} from '@/lib/ai/providers';
import { streamChat } from '@/lib/ai/stream';

export default function SettingsPage() {
  const {
    settings,
    addConnection,
    updateConnection,
    removeConnection,
    setActiveConnection,
    resetSettings,
  } = useSettings();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{name: string, baseUrl: string, apiKey: string} | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string, ok: boolean, message: string } | null>(null);

  async function handleTestConnection(conn: AIConnection) {
    setTestingId(conn.id);
    setTestResult(null);
    try {
      let gotChunk = false;
      await streamChat({
        model: conn.activeModel,
        connectionId: conn.id,
        messages: [{ role: 'user', content: 'Say exactly: OK' }],
        maxTokens: 10,
        onChunk: () => { gotChunk = true; },
        onDone: () => {
           setTestResult({ id: conn.id, ok: gotChunk, message: gotChunk ? 'Connection successful!' : 'Empty response' });
           setTestingId(null);
        },
        onError: (err) => {
           setTestResult({ id: conn.id, ok: false, message: err.message });
           setTestingId(null);
        }
      });
    } catch (err: any) {
      setTestResult({ id: conn.id, ok: false, message: err.message });
      setTestingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Connections</h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure native API endpoints using the models.dev + Hermes overlay protocol.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <a href="/home" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Back to Home
          </a>
          <button
            onClick={() => { if (confirm('Reset all settings to defaults?')) resetSettings(); }}
            className="text-sm text-red-400 hover:text-red-300 transition-colors bg-red-900/20 px-3 py-1.5 rounded"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Active Connections List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Configured Endpoints</h2>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Add Connection
            </button>
          </div>

          {settings.connections.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-3xl mb-3">🔌</p>
              <p className="text-gray-400 font-medium">No API connections configured.</p>
              <p className="text-sm text-gray-500 mt-1">Add an endpoint to start using the AI Canvas.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {settings.connections.map(conn => {
                const isActive = settings.activeConnectionId === conn.id;
                
                return (
                  <div 
                    key={conn.id} 
                    className={`p-5 rounded-xl border transition-all ${
                      isActive 
                        ? 'bg-blue-900/20 border-blue-500 ring-1 ring-blue-500' 
                        : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {editingId === conn.id && editForm ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg text-white">Edit Connection</h3>
                        </div>
                        <div className="grid gap-3">
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">Base URL</label>
                            <input
                              type="text"
                              value={editForm.baseUrl}
                              onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })}
                              className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">API Key</label>
                            <input
                              type="password"
                              value={editForm.apiKey}
                              onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })}
                              placeholder="sk-..."
                              className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={() => { setEditingId(null); setEditForm(null); }}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              updateConnection(conn.id, editForm);
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg text-white">{conn.name}</h3>
                          {isActive && (
                            <span className="bg-blue-600 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded text-white">
                              Active
                            </span>
                          )}
                          <span className="bg-gray-800 text-[10px] px-2 py-0.5 rounded text-gray-400 font-mono">
                            {conn.transport}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-1 truncate">{conn.baseUrl}</p>
                        
                        <div className="mt-4 flex items-center gap-3">
                          <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            Operational Model:
                          </label>
                          <input
                            type="text"
                            list={`existing-models-${conn.id}`}
                            value={conn.activeModel}
                            onChange={(e) => updateConnection(conn.id, { activeModel: e.target.value })}
                            className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 min-w-[200px]"
                          />
                          {conn.discoveredModels.length > 0 && (
                            <datalist id={`existing-models-${conn.id}`}>
                              {conn.discoveredModels.map(m => (
                                <option key={m} value={m} />
                              ))}
                            </datalist>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 items-end">
                        {!isActive && (
                          <button
                            onClick={() => setActiveConnection(conn.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 px-3 py-1.5 rounded transition-colors"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTestConnection(conn)}
                          disabled={testingId === conn.id}
                          className="text-xs text-green-400 hover:text-green-300 bg-green-900/30 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                        >
                          {testingId === conn.id ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(conn.id);
                            setEditForm({ name: conn.name, baseUrl: conn.baseUrl, apiKey: conn.apiKey });
                          }}
                          className="text-xs text-gray-400 hover:text-gray-300 bg-gray-800/50 px-3 py-1.5 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this connection?')) {
                              removeConnection(conn.id);
                            }
                          }}
                          className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 px-3 py-1.5 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    )}
                    
                    {testResult && testResult.id === conn.id && (
                      <div className={`mt-3 px-3 py-2 text-xs rounded border ${testResult.ok ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
                        {testResult.ok ? '✅ ' : '❌ '}{testResult.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Connection Modal */}
      {isAdding && (
        <AddConnectionModal
          onClose={() => setIsAdding(false)}
          onAdd={(conn) => {
            addConnection(conn);
            setIsAdding(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Connection Modal
// ---------------------------------------------------------------------------

function AddConnectionModal({ onClose, onAdd }: { onClose: () => void, onAdd: (c: AIConnection) => void }) {
  const [catalog, setCatalog] = useState<Record<string, ModelsDevProvider>>({});
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  
  const [providerId, setProviderId] = useState<string>('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [activeModel, setActiveModel] = useState('');
  
  // Importer state
  const [importMode, setImportMode] = useState(false);
  const [pastedCode, setPastedCode] = useState('');

  // Testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean, message: string } | null>(null);

  // Load catalog on mount
  useEffect(() => {
    fetchModelsDevCatalog().then(data => {
      setCatalog(data);
      setIsLoadingCatalog(false);
      
      // Select first provider by default
      const defaultProviderId = 'openai';
      if (data[defaultProviderId]) {
        handleProviderSelect(defaultProviderId, data);
      } else {
        handleProviderSelect(Object.keys(data)[0], data);
      }
    });
  }, []);

  const handleProviderSelect = (id: string, currentCatalog: Record<string, ModelsDevProvider>) => {
    const p = currentCatalog[id];
    if (!p) return;
    
    setProviderId(id);
    setName(`My ${p.name}`);
    
    // Base URL resolution (Hermes Overlay > models.dev API > empty)
    const overlay = HERMES_PROVIDERS[id];
    setBaseUrl(overlay?.defaultBaseUrl || p.api || '');
    
    // Auto-select first model from the models.dev list
    if (p.models.length > 0) {
      setActiveModel(p.models[0]);
    } else {
      setActiveModel('');
    }
  };

  const handleCodeImport = () => {
    if (!pastedCode.trim()) return;

    let foundBaseUrl = '';
    let foundApiKey = '';
    let foundModel = '';

    // Match base_url="...", baseURL: '...', endpoint="...", etc.
    const urlMatch = pastedCode.match(/(?:base_url|baseURL|endpoint|api_base)\s*[=:]\s*["']([^"']+)["']/i);
    if (urlMatch) foundBaseUrl = urlMatch[1];

    // Match api_key="...", apiKey: '...', Authorization: "Bearer ...", etc.
    const keyMatch = pastedCode.match(/(?:api_key|apiKey|token|Bearer)\s*[=:]\s*["'](?:Bearer\s+)?([^"']+)["']/i);
    if (keyMatch) foundApiKey = keyMatch[1];

    // Match model="...", model: '...', etc.
    const modelMatch = pastedCode.match(/(?:model|model_id|modelName|model_name)\s*[=:]\s*["']([^"']+)["']/i);
    if (modelMatch) foundModel = modelMatch[1];

    if (foundBaseUrl) setBaseUrl(foundBaseUrl);
    if (foundApiKey) setApiKey(foundApiKey);
    if (foundModel) setActiveModel(foundModel);

    // Auto-detect provider
    const targetUrl = foundBaseUrl.toLowerCase();
    let matchedProvider = 'openai';
    if (targetUrl.includes('together')) matchedProvider = 'together';
    else if (targetUrl.includes('groq')) matchedProvider = 'groq';
    else if (targetUrl.includes('minimax')) matchedProvider = 'minimax';
    else if (targetUrl.includes('deepseek')) matchedProvider = 'deepseek';
    else if (targetUrl.includes('fireworks')) matchedProvider = 'fireworks';
    else if (targetUrl.includes('openrouter')) matchedProvider = 'openrouter';

    if (catalog[matchedProvider]) {
      setProviderId(matchedProvider);
      setName(`My ${catalog[matchedProvider].name}`);
    }

    setImportMode(false);
    setPastedCode('');
  };

  const handleTestForm = async () => {
    if (!baseUrl || !activeModel) {
      alert('Please fill in Base URL and Active Model to test.');
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const transport = HERMES_PROVIDERS[providerId]?.transport || 'openai_chat';
      
      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'Say exactly: OK' }],
          maxTokens: 10,
          transport: transport,
          baseUrl: baseUrl,
          apiKey: apiKey,
        }),
      });

      if (!response.ok) {
        let errMsg = `API error ${response.status}`;
        try {
          const parsed = await response.json();
          if (parsed.error) {
            errMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
          }
        } catch {
          const textMsg = await response.text();
          if (textMsg) errMsg = textMsg;
        }
        throw new Error(errMsg);
      }

      setTestResult({ ok: true, message: 'Connection successful!' });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !baseUrl || !activeModel) {
      alert('Please fill in all required fields and select an active model.');
      return;
    }
    
    // Resolve transport from overlay, default to openai_chat
    const transport = HERMES_PROVIDERS[providerId]?.transport || 'openai_chat';
    
    const p = catalog[providerId];
    
    onAdd({
      id: crypto.randomUUID(),
      providerId,
      name,
      transport,
      baseUrl,
      apiKey,
      activeModel,
      discoveredModels: p?.models && p.models.length > 0 ? p.models : [activeModel],
    });
  };

  if (isLoadingCatalog) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl p-8 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-300">Fetching live models.dev database (100+ providers)...</p>
        </div>
      </div>
    );
  }

  const selectedProvider = catalog[providerId];
  const modelList = selectedProvider?.models || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Add API Connection</h2>
            <p className="text-xs text-blue-400 mt-1">Live from models.dev database</p>
          </div>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button 
              onClick={() => setImportMode(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!importMode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Manual
            </button>
            <button 
              onClick={() => setImportMode(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${importMode ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Import Code
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {importMode ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                Paste an SDK code snippet (Python, Go, JS, cURL, etc.) from any provider. 
                We will automatically extract the Base URL, API Key, and Model.
              </p>
              <textarea
                value={pastedCode}
                onChange={e => setPastedCode(e.target.value)}
                placeholder={'client = OpenAI(\n  base_url="https://api.groq.com/openai/v1",\n  api_key="gsk_..."\n)'}
                className="w-full h-48 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCodeImport}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                Extract Configuration
              </button>
            </div>
          ) : (
            <form id="add-conn-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1.5">Provider</label>
              <select
                value={providerId}
                onChange={e => handleProviderSelect(e.target.value, catalog)}
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              >
                {Object.values(catalog).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1.5">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-300">Base URL</label>
                <span className="text-[10px] text-gray-500">Auto-filled from models.dev</span>
              </div>
              <input
                type="url"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-300">Active Operational Model</label>
                <span className="text-[10px] text-gray-500">Auto-filled from models.dev</span>
              </div>
              
              <input
                type="text"
                list={`models-list-${providerId}`}
                value={activeModel}
                onChange={e => setActiveModel(e.target.value)}
                required
                placeholder="Select or type model ID (e.g. gpt-4o)"
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              {modelList.length > 0 && (
                <datalist id={`models-list-${providerId}`}>
                  {modelList.map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              )}
              
              <p className="text-[10px] text-green-500 mt-1">
                {modelList.length > 0 
                  ? `✓ Autocomplete available with ${modelList.length} valid models from models.dev. You can also type your own.` 
                  : 'No known models found. Please type the exact model ID manually.'}
              </p>
            </div>
          </form>
          )}
          
          {testResult && !importMode && (
            <div className={`mt-4 px-4 py-3 text-sm rounded-lg border ${testResult.ok ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'}`}>
              {testResult.ok ? '✅ ' : '❌ '}{testResult.message}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-800 bg-gray-950 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestForm}
            disabled={isTesting || importMode}
            className="px-4 py-2 text-sm text-green-400 border border-green-800 hover:bg-green-900/30 font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              form="add-conn-form"
              type="submit"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Save Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
