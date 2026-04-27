'use client';

import React from 'react';

import type { ProjectData } from '../../lib/github/types';

interface ProjectCardProps {
  project: ProjectData;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      onDelete(project.id);
    }
  }

  return (
    <div
      className="group relative bg-gray-900 border border-gray-700 rounded-xl shadow-sm hover:border-blue-500 hover:scale-[1.01] transition-all duration-150 cursor-pointer"
      onClick={() => onOpen(project.id)}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div>
          <h3 className="font-semibold text-white truncate">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 inline-block">📁</span>
            <span className="truncate max-w-[120px]">{project.canvasPath}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 inline-block">📅</span>
            {timeAgo(project.updatedAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(project.id); }}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Open
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors border border-transparent hover:border-red-800"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
