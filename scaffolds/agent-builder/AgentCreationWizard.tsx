'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/lib/ai/settings-store';
import { AGENT_TEMPLATES, type AgentTemplate } from '@/lib/agents/templates';
import { createCustomAgent, SKILL_DEFINITIONS, DEFAULT_SKILLS, DEFAULT_ZONE } from '@/lib/agents';
import type { CustomAgent, AgentSkills, ZoneType } from '@/lib/agents';

interface AgentCreationWizardProps {
  onSave: (agent: CustomAgent) => void;
  onDeploy: (agent: CustomAgent) => void;
  onCancel: () => void;
}

type WizardStep = 'template' | 'identity' | 'brain' | 'permissions' | 'zone' | 'review';
const STEPS: WizardStep[] = ['template', 'identity', 'brain', 'permissions', 'zone', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
  template: 'Template',
  identity: 'Identity',
  brain: 'Brain',
  permissions: 'Permissions',
  zone: 'Zone & Behavior',
  review: 'Review & Deploy',
};

export function AgentCreationWizard({ onSave, onDeploy, onCancel }: AgentCreationWizardProps) {
  const { settings } = useSettings();
  const [step, setStep] = useState<WizardStep>('template');

  // Form state
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

  // When connection changes, auto-select model
  useEffect(() => {
    if (!connectionId) return;
    const conn = settings.connections.find(c => c.id === connectionId);
    if (conn) setModel(conn.activeModel);
  }, [connectionId, settings.connections]);

  // Set default connection
  useEffect(() => {
    const defConn = settings.activeConnectionId ?? '';
    setConnectionId(defConn);
    const conn = settings.connections.find(c => c.id === defConn);
    if (conn) setModel(conn.activeModel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (tpl: AgentTemplate) => {
    setName(tpl.name);
    setIcon(tpl.icon);
    setPersona(tpl.persona);
    setDescription(tpl.description);
    setSystemPrompt(tpl.systemPrompt);
    setSkills({ ...tpl.skills });
    setZoneType(tpl.zoneType);
    setPriority(tpl.priority);
    setStep('identity');
  };

  const stepIndex = STEPS.indexOf(step);
  const canGoNext = stepIndex < STEPS.length - 1;
  const canGoBack = stepIndex > 0;

  const goNext = () => {
    if (canGoNext) setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (canGoBack) setStep(STEPS[stepIndex - 1]);
  };

  const buildAgent = (): CustomAgent => {
    const selectedConn = settings.connections.find(c => c.id === connectionId);
    const resolvedModel = model || selectedConn?.activeModel || 'claude-sonnet-4-20250514';
    return {
      ...createCustomAgent({
        name: name.trim(),
        icon,
        persona,
        description,
        defaultModel: resolvedModel as any,
        systemPrompt,
        skills,
        zone: { type: zoneType, priority },
      }),
      connectionId: connectionId || undefined,
    };
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(buildAgent());
  };

  const handleDeploy = () => {
    if (!name.trim()) return;
    const agent = buildAgent();
    onDeploy({ ...agent, enabled: true, status: 'idle' });
  };

  const toggleSkill = (key: keyof AgentSkills) => {
    setSkills(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedConn = settings.connections.find(c => c.id === connectionId);
  const modelList = selectedConn?.discoveredModels ?? (selectedConn ? [selectedConn.activeModel] : []);

  return (
    <div className="agent-wizard">
      {/* ── Progress Bar ──────────────────────────────────────────────── */}
      <div className="agent-wizard__progress">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => s === 'template' || name.trim() ? setStep(s) : null}
            className={`agent-wizard__step-dot ${step === s ? 'agent-wizard__step-dot--active' : i < stepIndex ? 'agent-wizard__step-dot--done' : ''}`}
          >
            <span className="agent-wizard__step-num">{i < stepIndex ? '✓' : i + 1}</span>
            <span className="agent-wizard__step-label">{STEP_LABELS[s]}</span>
          </button>
        ))}
      </div>

      {/* ── Step Content ──────────────────────────────────────────────── */}
      <div className="agent-wizard__content">

        {/* STEP: Template Selection */}
        {step === 'template' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Choose a Template</h2>
            <p className="agent-wizard__subtitle">Start from a pre-built agent or create one from scratch.</p>

            <div className="agent-wizard__templates">
              {AGENT_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  className="agent-wizard__template-card"
                  onClick={() => applyTemplate(tpl)}
                  style={{ borderColor: tpl.color + '40' }}
                >
                  <div className="agent-wizard__template-icon" style={{ backgroundColor: tpl.color + '20', color: tpl.color }}>
                    {tpl.icon}
                  </div>
                  <div className="agent-wizard__template-info">
                    <h4>{tpl.name}</h4>
                    <p>{tpl.description}</p>
                  </div>
                </button>
              ))}

              {/* From Scratch */}
              <button
                className="agent-wizard__template-card agent-wizard__template-card--scratch"
                onClick={() => setStep('identity')}
              >
                <div className="agent-wizard__template-icon" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  ✨
                </div>
                <div className="agent-wizard__template-info">
                  <h4>Start from Scratch</h4>
                  <p>Create a fully custom agent with your own configuration.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP: Identity */}
        {step === 'identity' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Agent Identity</h2>
            <p className="agent-wizard__subtitle">Give your agent a name, icon, and personality.</p>

            <div className="agent-wizard__form">
              <div className="agent-wizard__row">
                <label className="agent-wizard__field">
                  <span>Name</span>
                  <input
                    className="agent-wizard__input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Architecture Agent"
                    autoFocus
                  />
                </label>
                <label className="agent-wizard__field agent-wizard__field--small">
                  <span>Icon</span>
                  <input
                    className="agent-wizard__input agent-wizard__input--icon"
                    value={icon}
                    onChange={e => setIcon(e.target.value)}
                    maxLength={2}
                  />
                </label>
              </div>

              <label className="agent-wizard__field">
                <span>Persona</span>
                <input
                  className="agent-wizard__input"
                  value={persona}
                  onChange={e => setPersona(e.target.value)}
                  placeholder="e.g. Senior Solutions Architect"
                />
              </label>

              <label className="agent-wizard__field">
                <span>Description</span>
                <textarea
                  className="agent-wizard__textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What does this agent specialize in?"
                  rows={3}
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP: Brain (Model & API) */}
        {step === 'brain' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Brain (Model & API)</h2>
            <p className="agent-wizard__subtitle">Assign the AI model that powers this agent.</p>

            <div className="agent-wizard__form">
              {settings.connections.length === 0 ? (
                <div className="agent-wizard__warning">
                  <span>⚠️</span>
                  <div>
                    <strong>No API connections configured.</strong>
                    <p>Go to <a href="/settings" className="agent-wizard__link">Settings</a> to add an API connection (OpenAI, Anthropic, etc.), then come back here.</p>
                  </div>
                </div>
              ) : (
                <>
                  <label className="agent-wizard__field">
                    <span>API Connection</span>
                    <select
                      className="agent-wizard__select"
                      value={connectionId}
                      onChange={e => setConnectionId(e.target.value)}
                    >
                      <option value="">— Use Global Active Connection —</option>
                      {settings.connections.map(conn => (
                        <option key={conn.id} value={conn.id}>
                          {conn.name} ({conn.providerId})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="agent-wizard__field">
                    <span>Model</span>
                    {modelList.length > 0 ? (
                      <select
                        className="agent-wizard__select"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                      >
                        {modelList.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="agent-wizard__input"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        placeholder="Type model ID (e.g. gpt-4o, claude-sonnet-4-20250514)"
                      />
                    )}
                    {selectedConn && (
                      <span className="agent-wizard__hint">
                        {selectedConn.transport} — {selectedConn.baseUrl}
                      </span>
                    )}
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP: Permissions */}
        {step === 'permissions' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Canvas Permissions</h2>
            <p className="agent-wizard__subtitle">Control what this agent can do on the shared canvas.</p>

            <div className="agent-wizard__permissions">
              {/* Safe */}
              <div className="agent-wizard__perm-group">
                <h4 className="agent-wizard__perm-heading agent-wizard__perm-heading--safe">🟢 Safe</h4>
                {SKILL_DEFINITIONS.filter(s => !s.dangerous && !s.key.includes('Memory')).map(skill => (
                  <label key={skill.key} className="agent-wizard__perm-item">
                    <div>
                      <span className="agent-wizard__perm-label">{skill.label}</span>
                      <span className="agent-wizard__perm-desc">{skill.description}</span>
                    </div>
                    <div className={`agent-wizard__toggle ${skills[skill.key] ? 'agent-wizard__toggle--on' : ''}`}
                      onClick={() => toggleSkill(skill.key)}>
                      <div className="agent-wizard__toggle-knob" />
                    </div>
                  </label>
                ))}
              </div>

              {/* Elevated */}
              <div className="agent-wizard__perm-group">
                <h4 className="agent-wizard__perm-heading agent-wizard__perm-heading--elevated">🟡 Elevated</h4>
                {SKILL_DEFINITIONS.filter(s => s.key.includes('Memory')).map(skill => (
                  <label key={skill.key} className="agent-wizard__perm-item">
                    <div>
                      <span className="agent-wizard__perm-label">{skill.label}</span>
                      <span className="agent-wizard__perm-desc">{skill.description}</span>
                    </div>
                    <div className={`agent-wizard__toggle ${skills[skill.key] ? 'agent-wizard__toggle--on' : ''}`}
                      onClick={() => toggleSkill(skill.key)}>
                      <div className="agent-wizard__toggle-knob" />
                    </div>
                  </label>
                ))}
              </div>

              {/* Dangerous */}
              <div className="agent-wizard__perm-group">
                <h4 className="agent-wizard__perm-heading agent-wizard__perm-heading--dangerous">🔴 Dangerous</h4>
                {SKILL_DEFINITIONS.filter(s => s.dangerous).map(skill => (
                  <label key={skill.key} className="agent-wizard__perm-item agent-wizard__perm-item--dangerous">
                    <div>
                      <span className="agent-wizard__perm-label">{skill.label}</span>
                      <span className="agent-wizard__perm-desc">{skill.description}</span>
                    </div>
                    <div className={`agent-wizard__toggle ${skills[skill.key] ? 'agent-wizard__toggle--on agent-wizard__toggle--danger' : ''}`}
                      onClick={() => toggleSkill(skill.key)}>
                      <div className="agent-wizard__toggle-knob" />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP: Zone & Behavior */}
        {step === 'zone' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Zone & Behavior</h2>
            <p className="agent-wizard__subtitle">Define where and how this agent operates on the canvas.</p>

            <div className="agent-wizard__form">
              <label className="agent-wizard__field">
                <span>Canvas Zone</span>
                <div className="agent-wizard__zone-cards">
                  {([
                    { type: 'sandbox' as const, icon: '🧪', label: 'Sandbox', desc: 'Isolated testing area — safe for experimentation' },
                    { type: 'assigned' as const, icon: '📐', label: 'Assigned Region', desc: 'Operates only within a defined canvas region' },
                    { type: 'global' as const, icon: '🌐', label: 'Global', desc: 'Full canvas access — can work anywhere' },
                  ]).map(z => (
                    <button
                      key={z.type}
                      className={`agent-wizard__zone-card ${zoneType === z.type ? 'agent-wizard__zone-card--active' : ''}`}
                      onClick={() => setZoneType(z.type)}
                    >
                      <span className="agent-wizard__zone-icon">{z.icon}</span>
                      <strong>{z.label}</strong>
                      <span className="agent-wizard__zone-desc">{z.desc}</span>
                    </button>
                  ))}
                </div>
              </label>

              <label className="agent-wizard__field">
                <span>Priority Level</span>
                <div className="agent-wizard__priority">
                  {([1, 2, 3, 4, 5] as const).map(p => (
                    <button
                      key={p}
                      className={`agent-wizard__priority-btn ${priority === p ? 'agent-wizard__priority-btn--active' : ''}`}
                      onClick={() => setPriority(p)}
                    >
                      {p}
                      {p === 1 && <span>Highest</span>}
                      {p === 3 && <span>Default</span>}
                      {p === 5 && <span>Lowest</span>}
                    </button>
                  ))}
                </div>
                <span className="agent-wizard__hint">Higher priority agents take precedence during canvas conflicts.</span>
              </label>

              <label className="agent-wizard__field">
                <span>System Prompt</span>
                <textarea
                  className="agent-wizard__textarea agent-wizard__textarea--lg"
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="You are a senior architect. When given a system description, create clear architecture diagrams..."
                  rows={8}
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP: Review & Deploy */}
        {step === 'review' && (
          <div className="agent-wizard__section">
            <h2 className="agent-wizard__title">Review & Deploy</h2>
            <p className="agent-wizard__subtitle">Review your agent configuration before deploying to the canvas.</p>

            <div className="agent-wizard__review-card">
              <div className="agent-wizard__review-header">
                <span className="agent-wizard__review-icon">{icon}</span>
                <div>
                  <h3>{name || 'Unnamed Agent'}</h3>
                  <span className="agent-wizard__review-persona">{persona}</span>
                </div>
              </div>

              <div className="agent-wizard__review-grid">
                <div className="agent-wizard__review-item">
                  <span className="agent-wizard__review-label">Model</span>
                  <span className="agent-wizard__review-value">{model || 'Not set'}</span>
                </div>
                <div className="agent-wizard__review-item">
                  <span className="agent-wizard__review-label">Zone</span>
                  <span className="agent-wizard__review-value">{zoneType}</span>
                </div>
                <div className="agent-wizard__review-item">
                  <span className="agent-wizard__review-label">Priority</span>
                  <span className="agent-wizard__review-value">{priority}</span>
                </div>
                <div className="agent-wizard__review-item">
                  <span className="agent-wizard__review-label">Skills</span>
                  <span className="agent-wizard__review-value">
                    {Object.entries(skills).filter(([_, v]) => v).length} / {Object.keys(skills).length} enabled
                  </span>
                </div>
              </div>

              {description && (
                <div className="agent-wizard__review-desc">
                  <span className="agent-wizard__review-label">Description</span>
                  <p>{description}</p>
                </div>
              )}

              {systemPrompt && (
                <div className="agent-wizard__review-desc">
                  <span className="agent-wizard__review-label">System Prompt</span>
                  <pre className="agent-wizard__review-prompt">{systemPrompt.slice(0, 300)}{systemPrompt.length > 300 ? '...' : ''}</pre>
                </div>
              )}
            </div>

            <div className="agent-wizard__deploy-actions">
              <button
                className="agent-wizard__btn agent-wizard__btn--save"
                onClick={handleSave}
                disabled={!name.trim()}
              >
                💾 Save Agent
              </button>
              <button
                className="agent-wizard__btn agent-wizard__btn--deploy"
                onClick={handleDeploy}
                disabled={!name.trim()}
              >
                🚀 Create & Deploy to Canvas
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation Bar ────────────────────────────────────────────── */}
      {step !== 'template' && (
        <div className="agent-wizard__nav">
          <button className="agent-wizard__nav-btn" onClick={goBack} disabled={!canGoBack}>
            ← Back
          </button>
          <button className="agent-wizard__nav-btn agent-wizard__nav-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          {step !== 'review' && (
            <button
              className="agent-wizard__nav-btn agent-wizard__nav-btn--next"
              onClick={goNext}
              disabled={step === 'identity' && !name.trim()}
            >
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
