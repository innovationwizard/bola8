'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    client_name: '',
    project_name: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_type: 'space_design',
          status: 'lead',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create campaign');
      router.push(`/projects/${data.project.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-xl mx-auto px-8 py-16">

        <div className="mb-12">
          <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Campaigns
          </Link>
        </div>

        <h1 className="text-2xl font-light text-neutral-900 mb-10">New Campaign</h1>

        <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-2xl p-10 space-y-8">

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.15em] text-neutral-400">
              Brand / Client
            </label>
            <input
              type="text"
              required
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              className="w-full px-4 py-3 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.15em] text-neutral-400">
              Campaign Name
            </label>
            <input
              type="text"
              required
              value={formData.project_name}
              onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
              className="w-full px-4 py-3 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.15em] text-neutral-400">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-4 pt-3">
            <Link
              href="/projects"
              className="px-6 py-2.5 border border-neutral-200 rounded-lg text-sm text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-light hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
