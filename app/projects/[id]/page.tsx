'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ImageIcon, Sparkles, RotateCcw } from 'lucide-react';

type Project = {
  id: string;
  client_id: string | null;
  client_name: string;
  client_has_brand_dna: boolean;
  has_project_brand: boolean;
  project_name: string;
  status: string;
  notes: string;
  updated_at: string;
};

type Post = {
  id: string;
  post_number: number | null;
  fecha: string | null;
  idea: string | null;
  texto_en_arte: string | null;
  formato: string | null;
  plataforma: string | null;
  estatus: string;
  image_id: string | null;
  image_url: string | null;
  image_rating: number | null;
  generating?: boolean;
  genError?: string;
};

const STAGES = [
  { id: 'lead',      label: 'Draft'     },
  { id: 'design',    label: 'Active'    },
  { id: 'completed', label: 'Completed' },
];

const formatFecha = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—';

export default function CampaignDetailPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params.id as string;

  const [project, setProject]   = useState<Project | null>(null);
  const [posts, setPosts]       = useState<Post[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [projRes, postsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/posts`),
      ]);
      const projData  = await projRes.json();
      const postsData = await postsRes.json();
      setProject(projData.project);
      setPosts(postsData.posts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateStatus = async (status: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchAll();
  };

  const generateImage = async (postId: string) => {
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, generating: true, genError: undefined } : p));
    try {
      const res  = await fetch(`/api/posts/${postId}/generate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar');
      router.push(`/projects/${projectId}/posts/${postId}?imageId=${data.imageId}`);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error al generar';
      setPosts(ps => ps.map(p => p.id === postId ? { ...p, generating: false, genError: msg } : p));
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Cargando...</p>
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Campaña no encontrada.</p>
    </div>
  );

  const total     = posts.length;
  const generated = posts.filter(p => p.image_id).length;

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
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-neutral-400">{project.client_name}</p>
                {project.client_id && (
                  <Link
                    href={`/clients/${project.client_id}/brand`}
                    className={`inline-flex items-center gap-1.5 text-xs underline-offset-2 transition-colors ${
                      project.client_has_brand_dna
                        ? 'text-neutral-400 underline hover:text-neutral-700'
                        : 'text-amber-600 underline hover:text-amber-800 font-medium'
                    }`}
                  >
                    {!project.client_has_brand_dna && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                      </span>
                    )}
                    Brand DNA
                  </Link>
                )}
                <Link
                  href={`/projects/${projectId}/brand`}
                  className={`inline-flex items-center gap-1.5 text-xs underline-offset-2 transition-colors ${
                    project.has_project_brand
                      ? 'text-neutral-400 underline hover:text-neutral-700'
                      : 'text-amber-600 underline hover:text-amber-800 font-medium'
                  }`}
                >
                  {!project.has_project_brand && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                  )}
                  Brand del proyecto
                </Link>
              </div>
            </div>
            {total > 0 && (
              <p className="text-xs text-neutral-400 mt-1">{generated} / {total} imágenes</p>
            )}
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

        {/* Posts list */}
        {posts.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
            <p className="text-sm text-neutral-400">No hay posts en esta campaña.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 px-1">Posts</p>
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-white border border-neutral-200 rounded-2xl px-6 py-5 flex items-center gap-5"
              >
                {/* Thumbnail or placeholder */}
                <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                  {post.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-neutral-300" />
                    </div>
                  )}
                </div>

                {/* Post info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-3">
                    {post.post_number && (
                      <span className="text-xs text-neutral-400">#{post.post_number}</span>
                    )}
                    <span className="text-xs text-neutral-400">{formatFecha(post.fecha)}</span>
                    {post.formato && post.formato !== 'Pendiente' && (
                      <span className="text-xs text-neutral-400">{post.formato}</span>
                    )}
                  </div>
                  {post.idea && (
                    <p className="text-sm text-neutral-800 truncate">{post.idea}</p>
                  )}
                  {post.texto_en_arte && (
                    <p className="text-xs text-neutral-500 truncate italic">&ldquo;{post.texto_en_arte}&rdquo;</p>
                  )}
                </div>

                {/* Action */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {post.image_id ? (
                    <Link
                      href={`/projects/${projectId}/posts/${post.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-600 border border-neutral-200 rounded-lg hover:border-neutral-400 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Refinar
                    </Link>
                  ) : (
                    <button
                      onClick={() => generateImage(post.id)}
                      disabled={post.generating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${post.generating ? 'animate-pulse' : ''}`} />
                      {post.generating ? 'Generando…' : 'Generar'}
                    </button>
                  )}
                  {post.genError && (
                    <p className="text-xs text-red-500 max-w-[160px] text-right">{post.genError}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
