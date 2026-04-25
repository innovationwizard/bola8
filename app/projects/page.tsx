'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, ArrowRight, ArrowLeft } from 'lucide-react';

type Project = {
  id: string;
  client_name: string;
  project_name: string;
  status: string;
  updated_at: string;
  image_count: number;
};

const STATUS_LABELS: Record<string, string> = {
  lead:      'Draft',
  design:    'Active',
  completed: 'Completed',
};

const STATUS_COLORS: Record<string, string> = {
  lead:      'bg-neutral-100 text-neutral-500',
  design:    'bg-blue-50 text-blue-600',
  completed: 'bg-green-50 text-green-600',
};

export default function CampaignsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-4xl mx-auto px-6 py-12">

        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>

        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-light text-neutral-900">Campaigns</h1>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors text-sm font-light"
          >
            <Plus className="w-4 h-4" />
            New
          </Link>
        </div>

        {loading ? (
          <p className="text-neutral-400 text-sm">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-neutral-400 text-sm mb-6">No campaigns yet.</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-light"
            >
              <Plus className="w-4 h-4" />
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between bg-white border border-neutral-200 rounded-2xl px-6 py-5 hover:border-neutral-400 transition-all duration-150"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-neutral-900">{project.project_name}</p>
                  <p className="text-xs text-neutral-400">{project.client_name} · {formatDate(project.updated_at)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-2 py-1 rounded-md text-xs ${STATUS_COLORS[project.status] || STATUS_COLORS.lead}`}>
                    {STATUS_LABELS[project.status] || project.status}
                  </span>
                  <span className="text-xs text-neutral-300">{project.image_count || 0} images</span>
                  <ArrowRight className="w-4 h-4 text-neutral-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
