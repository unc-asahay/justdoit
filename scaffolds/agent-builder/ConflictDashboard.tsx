'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ConflictSystem, ConflictEvent, Lock, AgentActionSummary } from '@/lib/conflict';

interface ConflictDashboardProps {
  conflictSystem: ConflictSystem;
}

export function ConflictDashboard({ conflictSystem }: ConflictDashboardProps) {
  const [activeLocks, setActiveLocks] = useState<Lock[]>([]);
  const [recentEvents, setRecentEvents] = useState<ConflictEvent[]>([]);
  const [agentSummaries, setAgentSummaries] = useState<AgentActionSummary[]>([]);

  useEffect(() => {
    const refresh = () => {
      setActiveLocks(conflictSystem.locks.getActiveLocks());
      setRecentEvents(conflictSystem.logger.getRecent(15));
      setAgentSummaries(conflictSystem.rollback.getAllSummaries());
    };

    refresh();

    const unsubscribe = conflictSystem.logger.subscribe(() => {
      refresh();
    });

    const interval = setInterval(refresh, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [conflictSystem]);

  const denialCount = useMemo(
    () => recentEvents.filter(e => e.severity === 'error').length,
    [recentEvents],
  );

  return (
    <div className="conflict-dashboard">
      <h2 className="conflict-dashboard__title">🔒 Conflict Dashboard</h2>

      {/* Summary Stats */}
      <div className="conflict-dashboard__stats">
        <div className="conflict-dashboard__stat">
          <span className="conflict-dashboard__stat-value">{activeLocks.length}</span>
          <span className="conflict-dashboard__stat-label">Active Locks</span>
        </div>
        <div className="conflict-dashboard__stat">
          <span className="conflict-dashboard__stat-value conflict-dashboard__stat-value--warning">
            {denialCount}
          </span>
          <span className="conflict-dashboard__stat-label">Denials</span>
        </div>
        <div className="conflict-dashboard__stat">
          <span className="conflict-dashboard__stat-value">{agentSummaries.length}</span>
          <span className="conflict-dashboard__stat-label">Active Agents</span>
        </div>
      </div>

      {/* Active Locks */}
      <section className="conflict-dashboard__section">
        <h3 className="conflict-dashboard__heading">Active Locks</h3>
        {activeLocks.length === 0 ? (
          <p className="conflict-dashboard__empty">No active locks</p>
        ) : (
          <div className="conflict-dashboard__lock-list">
            {activeLocks.map(lock => {
              const ttlSeconds = Math.max(0, Math.round((lock.expiresAt - Date.now()) / 1000));
              return (
                <div key={lock.nodeId} className="conflict-dashboard__lock-item">
                  <span className="conflict-dashboard__lock-icon">🔒</span>
                  <div className="conflict-dashboard__lock-info">
                    <span className="conflict-dashboard__lock-node">
                      Node: {lock.nodeId}
                    </span>
                    <span className="conflict-dashboard__lock-agent">
                      Held by: {lock.agentId}
                    </span>
                  </div>
                  <span className="conflict-dashboard__lock-ttl">{ttlSeconds}s</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Agent Action Summary */}
      <section className="conflict-dashboard__section">
        <h3 className="conflict-dashboard__heading">Agent Actions (Session)</h3>
        {agentSummaries.length === 0 ? (
          <p className="conflict-dashboard__empty">No actions recorded</p>
        ) : (
          <div className="conflict-dashboard__summary-list">
            {agentSummaries.map(summary => (
              <div key={summary.agentId} className="conflict-dashboard__summary-item">
                <span className="conflict-dashboard__summary-agent">{summary.agentId}</span>
                <div className="conflict-dashboard__summary-counts">
                  <span className="conflict-dashboard__count conflict-dashboard__count--create">
                    +{summary.creates}
                  </span>
                  <span className="conflict-dashboard__count conflict-dashboard__count--modify">
                    ~{summary.modifies}
                  </span>
                  <span className="conflict-dashboard__count conflict-dashboard__count--delete">
                    -{summary.deletes}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Conflict Events */}
      <section className="conflict-dashboard__section">
        <h3 className="conflict-dashboard__heading">Recent Events</h3>
        {recentEvents.length === 0 ? (
          <p className="conflict-dashboard__empty">No events yet</p>
        ) : (
          <div className="conflict-dashboard__event-list">
            {recentEvents.map(event => (
              <div
                key={event.id}
                className={`conflict-dashboard__event conflict-dashboard__event--${event.severity}`}
              >
                <span className="conflict-dashboard__event-icon">
                  {event.severity === 'error' ? '🚫' : event.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <div className="conflict-dashboard__event-body">
                  <span className="conflict-dashboard__event-type">
                    {formatEventType(event.type)}
                  </span>
                  <span className="conflict-dashboard__event-detail">
                    {event.agentId}: {event.details}
                  </span>
                </div>
                <span className="conflict-dashboard__event-time">
                  {formatTime(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}