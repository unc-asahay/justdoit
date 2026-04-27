'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGitHub } from '@/lib/hooks/useGitHub';
import { useActiveProject } from '@/lib/hooks/useActiveProject';
import { useProjects } from '@/lib/hooks/useProjects';
import { getRecentActivity, type ActivityItem } from '@/lib/github/activity';
import { WorkspaceHeader } from '@/scaffolds/home/WorkspaceHeader';
import { ProjectCard } from '@/scaffolds/home/ProjectCard';
import { CreateProjectDialog } from '@/scaffolds/home/CreateProjectDialog';
import { ActivityFeed } from '@/scaffolds/home/ActivityFeed';
import { GitStatus } from '@/scaffolds/home/GitStatus';

export default function HomePage() {
  const router = useRouter();
  const { user, repo, isAuthenticated, isLoading: authLoading } = useGitHub();
  const { setActiveProject } = useActiveProject();
  const { projects, isLoading: projectsLoading, create, remove } = useProjects();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [lastSync] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load activity feed
  useEffect(() => {
    async function load() {
      setActivitiesLoading(true);
      try {
        const data = await getRecentActivity(10);
        setActivities(data);
      } finally {
        setActivitiesLoading(false);
      }
    }
    if (isAuthenticated) load();
  }, [isAuthenticated]);

  function handleOpenProject(projectId: string) {
    setActiveProject(projectId);
    router.push(`/canvas?project=${projectId}`);
  }

  async function handleCreateProject(name: string, description?: string): Promise<boolean> {
    return create(name, description);
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Workspace header */}
        <WorkspaceHeader
          user={user}
          repo={repo}
          isLoading={authLoading}
        />

        {/* Projects section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Projects
              {!projectsLoading && (
                <span className="ml-2 text-sm font-normal text-gray-500">({projects.length})</span>
              )}
            </h2>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span>+</span> New Project
            </button>
          </div>

          {projectsLoading ? (
            /* Loading skeleton */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-900 border border-gray-700 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-gray-700 rounded w-2/3 mb-3" />
                  <div className="h-3 bg-gray-700 rounded w-full mb-4" />
                  <div className="flex gap-2">
                    <div className="h-7 bg-gray-700 rounded w-16" />
                    <div className="h-7 bg-gray-700 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            /* Empty state */
            <div className="text-center py-12 border border-dashed border-gray-700 rounded-xl">
              <p className="text-gray-500">No projects yet.</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300"
              >
                Create your first project →
              </button>
            </div>
          ) : (
            /* Project grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpenProject}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </section>

        {/* Activity section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            <GitStatus
              branch={repo?.defaultBranch ?? 'main'}
              lastSyncTime={lastSync}
              syncStatus="idle"
            />
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <ActivityFeed activities={activities} isLoading={activitiesLoading} />
          </div>
        </section>
      </div>

      {/* Create project dialog */}
      <CreateProjectDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateProject}
        isLoading={projectsLoading}
      />
    </div>
  );
}
