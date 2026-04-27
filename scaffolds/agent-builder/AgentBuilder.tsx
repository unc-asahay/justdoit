'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/lib/ai/settings-store';
import { SKILL_DEFINITIONS, DEFAULT_SKILLS, DEFAULT_ZONE, createCustomAgent } from '@/lib/agents';
import type { CustomAgent, AgentSkills, ZoneType } from '@/lib/agents';
import { generateSystemPrompt, PRESET_INTENTS } from './promptGenerator';

interface AgentBuilderProps {
  agent: CustomAgent | null;
  isCreating: boolean;
  onSave: (agent: CustomAgent) => void;
  onDelete: (agentId: string) => void;
  onTest: () => void;
  onDeploy?: () => void;
}

type EditorTab = 'identity' | 'model' | 'permissions' | 'prompt';

export function AgentBuilder({
  agent,
  isCreating,
  onSave,
  onDelete,
  onTest,
  onDeploy,
}: AgentBuilderProps) {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<EditorTab>('identity');

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [persona, setPersona] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [skills, setSkills] = useState<AgentSkills>({ ...DEFAULT_SKILLS });
  const [zoneType, setZoneType] = useState<ZoneType>('sandbox');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(3);

  // Auto-select model when connection changes
  useEffect(() => {
    if (!connectionId) return;
    const conn = settings.connections.find(c => c.id === connectionId);
    if (conn) setModel(conn.activeModel);
  }, [connectionId, settings.connections]);

  // Populate form when agent changes
  useEffect(() => {
    if (agent && !isCreating) {
      setName(agent.name);
      setIcon(agent.icon);
      setPersona(agent.persona);
      setDescription(agent.description);
      setConnectionId(agent.connectionId ?? settings.activeConnectionId ?? '');
      setModel(agent.defaultModel);
      setSystemPrompt(agent.systemPrompt);
      setSkills({ ...agent.skills });
      setZoneType(agent.zone.type);
      setPriority(agent.zone.priority);
      setActiveTab('identity');
    } else if (isCreating) {
      setName('');
      setIcon('🤖');
      setPersona('');
      setDescription('');
      const defConn = settings.activeConnectionId ?? '';
      setConnectionId(defConn);
      const conn = settings.connections.find(c => c.id === defConn);
      setModel(conn?.activeModel ?? '');
      setSystemPrompt('');
      setSkills({ ...DEFAULT_SKILLS });
      setZoneType('sandbox');
      setPriority(3);
      setActiveTab('identity');
    }
  }, [agent, isCreating]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSkill = (key: keyof AgentSkills) => {
    setSkills(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const selectedConn = settings.connections.find(c => c.id === connectionId);
    const resolvedModel = model || selectedConn?.activeModel || '';

    if (isCreating) {
      const newAgent = createCustomAgent({
        name: name.trim(), icon, persona, description,
        defaultModel: resolvedModel as any,
        systemPrompt, skills,
        zone: { type: zoneType, priority },
      });
      onSave({ ...newAgent, connectionId: connectionId || undefined });
    } else if (agent) {
      onSave({
        ...agent, name: name.trim(), icon, persona, description,
        defaultModel: resolvedModel as any, systemPrompt,
        skills: { ...skills },
        zone: { type: zoneType, priority },
        connectionId: connectionId || undefined,
      });
    }
  };

  const isBuiltIn = agent?.isBuiltIn ?? false;
  const selectedConn = settings.connections.find(c => c.id === connectionId);
  const modelList = selectedConn?.discoveredModels ?? (selectedConn ? [selectedConn.activeModel] : []);
  const hasConnections = settings.connections.length > 0;
  const activeSkillCount = Object.values(skills).filter(Boolean).length;
  const totalSkillCount = Object.keys(skills).length;

  const TABS: { id: EditorTab; label: string; icon: string }[] = [
    { id: 'identity', label: 'Identity', icon: '👤' },
    { id: 'model', label: 'Model', icon: '🧠' },
    { id: 'permissions', label: 'Permissions', icon: '🛡️' },
    { id: 'prompt', label: 'Prompt', icon: '💬' },
  ];

  return (
    <div className="agent-editor">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="agent-editor__header">
        <div className="agent-editor__header-left">
          <span className="agent-editor__header-icon">{icon}</span>
          <div>
            <h2 className="agent-editor__header-name">
              {name || (isCreating ? 'New Agent' : 'Untitled')}
            </h2>
            <span className="agent-editor__header-meta">
              {isBuiltIn ? '📦 Built-in' : isCreating ? '✨ Creating' : '✏️ Custom'}
              {selectedConn && ` · ${selectedConn.name}`}
              {model && ` · ${model.split('/').pop()}`}
            </span>
          </div>
        </div>
        <div className="agent-editor__header-actions">
          {!isCreating && agent && onDeploy && (
            <button
              className={`agent-editor__action-btn ${agent.enabled ? 'agent-editor__action-btn--deployed' : 'agent-editor__action-btn--deploy'}`}
              onClick={onDeploy}
              disabled={agent.enabled}
            >
              {agent.enabled ? '✅ Live' : '🚀 Deploy'}
            </button>
          )}
          <button className="agent-editor__action-btn agent-editor__action-btn--test" onClick={onTest} disabled={!name.trim()}>
            🧪 Test
          </button>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="agent-editor__tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`agent-editor__tab ${activeTab === tab.id ? 'agent-editor__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="agent-editor__content">

        {/* ── Identity Tab ────────────────────────────────────────────── */}
        {activeTab === 'identity' && (
          <div className="agent-editor__panel">
            <div className="agent-editor__section">
              <h3 className="agent-editor__section-title">Agent Identity</h3>
              <p className="agent-editor__section-desc">Name, persona, and visual identity of this agent.</p>
            </div>

            <div className="agent-editor__field-row">
              <label className="agent-editor__field agent-editor__field--grow">
                <span className="agent-editor__field-label">Name</span>
                <input className="agent-editor__input" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Architecture Agent"  />
              </label>
              <label className="agent-editor__field agent-editor__field--icon">
                <span className="agent-editor__field-label">Icon</span>
                <input className="agent-editor__input agent-editor__input--icon" value={icon}
                  onChange={e => setIcon(e.target.value)} maxLength={2}  />
              </label>
            </div>

            <label className="agent-editor__field">
              <span className="agent-editor__field-label">Persona</span>
              <input className="agent-editor__input" value={persona} onChange={e => setPersona(e.target.value)}
                placeholder="Senior Solutions Architect"  />
              <span className="agent-editor__field-hint">How this agent identifies itself in conversations.</span>
            </label>

            <label className="agent-editor__field">
              <span className="agent-editor__field-label">Description</span>
              <textarea className="agent-editor__textarea" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Designs system architecture diagrams — microservices, APIs, databases, and infrastructure."
                rows={3}  />
            </label>

            <div className="agent-editor__field-row">
              <label className="agent-editor__field">
                <span className="agent-editor__field-label">Zone</span>
                <select className="agent-editor__select" value={zoneType} onChange={e => setZoneType(e.target.value as ZoneType)} >
                  <option value="sandbox">🏖️ Sandbox — Safe testing area</option>
                  <option value="assigned">📌 Assigned — Specific canvas region</option>
                  <option value="global">🌍 Global — Full canvas access</option>
                </select>
              </label>
              <label className="agent-editor__field agent-editor__field--small">
                <span className="agent-editor__field-label">Priority</span>
                <select className="agent-editor__select" value={priority} onChange={e => setPriority(Number(e.target.value) as 1|2|3|4|5)} >
                  {[1,2,3,4,5].map(p => (
                    <option key={p} value={p}>{p} {p === 1 ? '🔴' : p === 2 ? '🟠' : p === 3 ? '🟡' : p === 4 ? '🟢' : '⚪'}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* ── Model Tab ───────────────────────────────────────────────── */}
        {activeTab === 'model' && (
          <div className="agent-editor__panel">
            <div className="agent-editor__section">
              <h3 className="agent-editor__section-title">AI Model Configuration</h3>
              <p className="agent-editor__section-desc">Select which AI connection and model powers this agent.</p>
            </div>

            {!hasConnections && (
              <div className="agent-editor__warning">
                <span>⚠️</span>
                <div>
                  <strong>No API connections configured</strong>
                  <p>You need at least one AI connection to power your agents. <a href="/settings" className="agent-editor__link">Configure in Settings →</a></p>
                </div>
              </div>
            )}

            {/* Connection Cards */}
            <div className="agent-editor__section">
              <span className="agent-editor__field-label">API Connection</span>
              <div className="agent-editor__model-cards">
                {/* Global option */}
                <button
                  className={`agent-editor__model-card ${!connectionId ? 'agent-editor__model-card--active' : ''}`}
                  onClick={() => { setConnectionId(''); setModel(settings.connections.find(c => c.id === settings.activeConnectionId)?.activeModel ?? ''); }}
                  
                >
                  <span className="agent-editor__model-card-icon">🌐</span>
                  <div className="agent-editor__model-card-info">
                    <strong>Global Connection</strong>
                    <span>Uses whatever is active in Settings</span>
                  </div>
                  {!connectionId && <span className="agent-editor__model-card-check">✓</span>}
                </button>

                {/* Individual connections */}
                {settings.connections.map(conn => (
                  <button
                    key={conn.id}
                    className={`agent-editor__model-card ${connectionId === conn.id ? 'agent-editor__model-card--active' : ''}`}
                    onClick={() => setConnectionId(conn.id)}
                    
                  >
                    <span className="agent-editor__model-card-icon">
                      {conn.providerId.includes('openai') ? '🟢' :
                       conn.providerId.includes('anthropic') ? '🟤' :
                       conn.providerId.includes('google') ? '🔵' :
                       conn.providerId.includes('minimax') ? '🟣' : '⚡'}
                    </span>
                    <div className="agent-editor__model-card-info">
                      <strong>{conn.name}</strong>
                      <span>{conn.providerId} · {conn.transport}</span>
                    </div>
                    {connectionId === conn.id && <span className="agent-editor__model-card-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selector */}
            <div className="agent-editor__section">
              <span className="agent-editor__field-label">Model</span>
              {modelList.length > 0 ? (
                <div className="agent-editor__model-grid">
                  {modelList.map(m => (
                    <button
                      key={m}
                      className={`agent-editor__model-chip ${model === m ? 'agent-editor__model-chip--active' : ''}`}
                      onClick={() => setModel(m)}
                      
                    >
                      {m.split('/').pop()}
                      {model === m && <span className="agent-editor__model-chip-dot" />}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="agent-editor__field">
                  <input className="agent-editor__input" value={model} onChange={e => setModel(e.target.value)}
                    placeholder="Type model ID (e.g. gpt-4o, claude-sonnet-4-20250514)"  />
                  <span className="agent-editor__field-hint">No discovered models — type a model ID manually.</span>
                </label>
              )}
              {selectedConn && (
                <div className="agent-editor__conn-badge">
                  <span>🔗</span> {selectedConn.baseUrl}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Permissions Tab ─────────────────────────────────────────── */}
        {activeTab === 'permissions' && (
          <div className="agent-editor__panel">
            <div className="agent-editor__section">
              <h3 className="agent-editor__section-title">Permission Matrix</h3>
              <p className="agent-editor__section-desc">
                Control what this agent is allowed to do on the canvas.
                <span className="agent-editor__perm-counter">{activeSkillCount}/{totalSkillCount} active</span>
              </p>
            </div>

            {/* Group skills by safety level */}
            {(['safe', 'elevated', 'dangerous'] as const).map(level => {
              const levelSkills = SKILL_DEFINITIONS.filter(s =>
                level === 'dangerous' ? s.dangerous :
                level === 'elevated' ? s.key === 'modifyExisting' || s.key === 'useConnectors' :
                !s.dangerous && s.key !== 'modifyExisting' && s.key !== 'useConnectors'
              );
              if (levelSkills.length === 0) return null;

              return (
                <div key={level} className="agent-editor__perm-group">
                  <div className={`agent-editor__perm-heading agent-editor__perm-heading--${level}`}>
                    {level === 'safe' ? '🟢 Safe' : level === 'elevated' ? '🟡 Elevated' : '🔴 Dangerous'}
                  </div>
                  {levelSkills.map(skill => (
                    <label key={skill.key} className={`agent-editor__perm-item ${skill.dangerous ? 'agent-editor__perm-item--danger' : ''}`}>
                      <div className="agent-editor__perm-info">
                        <span className="agent-editor__perm-name">{skill.label}</span>
                        <span className="agent-editor__perm-desc">{skill.description}</span>
                      </div>
                      <div
                        className={`agent-editor__toggle ${skills[skill.key] ? (skill.dangerous ? 'agent-editor__toggle--danger' : 'agent-editor__toggle--on') : ''}`}
                        onClick={() => toggleSkill(skill.key)}
                      >
                        <div className="agent-editor__toggle-knob" />
                      </div>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Prompt Tab ──────────────────────────────────────────────── */}
        {activeTab === 'prompt' && (
          <PromptTab
            systemPrompt={systemPrompt}
            onPromptChange={setSystemPrompt}
            agentName={name}
            persona={persona}
            description={description}
            skills={skills}
            zoneType={zoneType}
            priority={priority}
          />
        )}
      </div>

      {/* ── Bottom Action Bar ───────────────────────────────────────────── */}
      <div className="agent-editor__footer">
        {(
          <>
            <button className="agent-editor__action-btn agent-editor__action-btn--save" onClick={handleSave} disabled={!name.trim()}>
              💾 {isCreating ? 'Create Agent' : 'Save Changes'}
            </button>
            {!isCreating && agent && (
              <button className="agent-editor__action-btn agent-editor__action-btn--delete" onClick={() => onDelete(agent.id)}>
                🗑️ Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PromptTab — System Prompt Generator + Editor
// ═══════════════════════════════════════════════════════════════════════

interface PromptTabProps {
  systemPrompt: string;
  onPromptChange: (prompt: string) => void;
  agentName: string;
  persona: string;
  description: string;
  skills: AgentSkills;
  zoneType: ZoneType;
  priority: number;
}

function PromptTab({ systemPrompt, onPromptChange, agentName, persona, description, skills, zoneType, priority }: PromptTabProps) {
  const [intent, setIntent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerator, setShowGenerator] = useState(!systemPrompt);

  const handleGenerate = useCallback(() => {
    if (!intent.trim()) return;

    setIsGenerating(true);

    // Simulate a brief generation delay for UX polish
    setTimeout(() => {
      const generated = generateSystemPrompt({
        intent: intent.trim(),
        agentName: agentName || 'Canvas Agent',
        persona: persona || agentName || 'AI Collaborator',
        description,
        skills,
        zoneType,
        priority,
      });

      onPromptChange(generated);
      setIsGenerating(false);
      setShowGenerator(false);
    }, 400);
  }, [intent, agentName, persona, description, skills, zoneType, priority, onPromptChange]);

  const handlePresetClick = (presetIntent: string) => {
    setIntent(presetIntent);
  };

  return (
    <div className="agent-editor__panel">
      {/* ── Generator Section ────────────────────────────────────────── */}
      <div className="prompt-gen">
        <div className="prompt-gen__header" onClick={() => setShowGenerator(!showGenerator)}>
          <div>
            <h3 className="agent-editor__section-title">
              ✨ Prompt Generator
            </h3>
            <p className="agent-editor__section-desc">
              Describe what you want this agent to do — we'll generate a structured system prompt.
            </p>
          </div>
          <span className={`prompt-gen__chevron ${showGenerator ? 'prompt-gen__chevron--open' : ''}`}>
            ▸
          </span>
        </div>

        {showGenerator && (
          <div className="prompt-gen__body">
            {/* Quick presets */}
            <div className="prompt-gen__presets">
              {PRESET_INTENTS.map((p, i) => (
                <button
                  key={i}
                  className={`prompt-gen__preset ${intent === p.intent ? 'prompt-gen__preset--active' : ''}`}
                  onClick={() => handlePresetClick(p.intent)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Intent input */}
            <div className="prompt-gen__input-row">
              <textarea
                className="agent-editor__textarea prompt-gen__intent"
                value={intent}
                onChange={e => setIntent(e.target.value)}
                placeholder="Example: I want this agent to review architecture diagrams for performance bottlenecks, suggest optimizations, and add annotations with improvement ideas..."
                rows={3}
              />
              <button
                className={`prompt-gen__generate-btn ${isGenerating ? 'prompt-gen__generate-btn--loading' : ''}`}
                onClick={handleGenerate}
                disabled={!intent.trim() || isGenerating}
              >
                {isGenerating ? (
                  <span className="prompt-gen__spinner" />
                ) : (
                  '⚡'
                )}
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <div className="prompt-gen__divider">
        <span>System Prompt</span>
      </div>

      {/* ── Prompt Editor ────────────────────────────────────────────── */}
      <label className="agent-editor__field">
        <textarea
          className="agent-editor__textarea agent-editor__textarea--code"
          value={systemPrompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder={`You are a ${persona || 'collaborative AI agent'}.\n\nDescribe what this agent should do, or use the generator above to create a prompt automatically.`}
          rows={16}
        />
        <span className="agent-editor__field-hint">
          {systemPrompt.length} characters · {systemPrompt.split(/\s+/).filter(Boolean).length} words
          {systemPrompt && (
            <button className="prompt-gen__clear-btn" onClick={() => { onPromptChange(''); setShowGenerator(true); }}>
              Clear & Regenerate
            </button>
          )}
        </span>
      </label>
    </div>
  );
}

