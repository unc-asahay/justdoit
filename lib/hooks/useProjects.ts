'use client';

import { useState, useEffect, useCallback } from 'react';
import { listProjects, createProject, deleteProject } from '../github/workspace';
import type { ProjectData } from '../github/types';

interface UseProjectsReturn {
  projects: ProjectData[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (name: string, description?: string) => Promise<boolean>;
  remove: (projectId: string) => Promise<boolean>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (name: string, description?: string): Promise<boolean> => {
    setError(null);
    try {
      const id = crypto.randomUUID();
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      const canvasPath = `projects/${slug}/canvas/main.canvas.json`;
      await createProject({ id, name, description, canvasPath });
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      return false;
    }
  }, [refresh]);

  const remove = useCallback(async (projectId: string): Promise<boolean> => {
    setError(null);
    try {
      await deleteProject(projectId);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      return false;
    }
  }, [refresh]);

  return { projects, isLoading, error, refresh, create, remove };
}
