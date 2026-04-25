'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';

type Project = {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  project_name: string;
  status: string;
  notes: string;
  updated_at: string;
};

const STAGES = [
  { id: 'lead',      label: 'Draft'     },
  { id: 'design',    label: 'Active'    },
  { id: 'completed', label: 'Completed' },
];

export default function CampaignDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const data = await response.json();
      setProject(data.project);
    } catch (error) {
      console.error('Error fetching campaign:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const updateStatus = async (status: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchProject();
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Loading...</p>
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Campaign not found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-4xl mx-auto px-8 py-16 space-y-10">

        {/* Header */}
        <div>
          <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Campaigns
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-light text-neutral-900">{project.project_name}</h1>
              <p className="text-sm text-neutral-400 mt-1">{project.client_name}</p>
            </div>
          </div>
        </div>

        {/* Stage */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-4">Stage</p>
          <div className="flex items-center gap-4">
            {STAGES.map((stage, i) => {
              const current = project.status === stage.id ||
                (!STAGES.find(s => s.id === project.status) && i === 0);
              return (
                <button
                  key={stage.id}
                  onClick={() => updateStatus(stage.id)}
                  className={`px-5 py-2.5 rounded-lg text-sm transition-colors ${
                    current
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                  }`}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-4">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Details</p>
          <div className="space-y-3 text-sm text-neutral-600">
            {project.client_email && <p>{project.client_email}</p>}
            {project.client_phone && <p>{project.client_phone}</p>}
            {project.notes && <p className="text-neutral-500 whitespace-pre-wrap pt-3">{project.notes}</p>}
          </div>
        </div>

        {/* Images */}
        <Link
          href={`/projects/${projectId}/images`}
          className="flex items-center justify-between bg-white border border-neutral-200 rounded-2xl px-8 py-6 hover:border-neutral-400 transition-all"
        >
          <div className="flex items-center gap-4">
            <ImageIcon className="w-4 h-4 text-neutral-400" />
            <span className="text-sm text-neutral-700">Image Assets</span>
          </div>
          <ArrowLeft className="w-4 h-4 text-neutral-300 rotate-180" />
        </Link>

      </div>
    </div>
  );
}
