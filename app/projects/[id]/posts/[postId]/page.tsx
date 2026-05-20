'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ImageVersionNavigator from '@/app/components/ImageVersionNavigator';
import PostReferenceImages from '@/app/components/PostReferenceImages';
import AssetPackPanel from '@/app/components/AssetPackPanel';

type Post = {
  id: string;
  post_number: number | null;
  fecha: string | null;
  idea: string | null;
  descripcion: string | null;
  caption: string | null;
  texto_en_arte: string | null;
  formato: string | null;
  plataforma: string | null;
  estatus: string;
  image_id: string | null;
};

export default function PostDetailPage() {
  const params    = useParams();
  const projectId = params.id as string;
  const postId    = params.postId as string;

  const [post, setPost]     = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/posts`);
      const data = await res.json();
      const found = (data.posts as Post[]).find(p => p.id === postId) ?? null;
      setPost(found);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId, postId]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const formatFecha = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  if (loading) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Cargando...</p>
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Post no encontrado.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-3xl mx-auto px-8 py-16 space-y-8">

        {/* Header */}
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Campaña
          </Link>

          <div className="space-y-1">
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              {post.post_number && <span>#{post.post_number}</span>}
              {formatFecha(post.fecha) && <span>{formatFecha(post.fecha)}</span>}
              {post.formato && post.formato !== 'Pendiente' && <span>{post.formato}</span>}
              {post.plataforma && post.plataforma !== 'Pendiente' && <span>{post.plataforma}</span>}
            </div>
            {post.idea && (
              <h1 className="text-xl font-light text-neutral-900">{post.idea}</h1>
            )}
            {post.texto_en_arte && (
              <p className="text-sm text-neutral-500 italic">&ldquo;{post.texto_en_arte}&rdquo;</p>
            )}
            {post.descripcion && (
              <p className="text-sm text-neutral-500 pt-1">{post.descripcion}</p>
            )}
          </div>
        </div>

        {/* Pinterest Inspo */}
        <PostReferenceImages postId={postId} projectId={projectId} />

        {/* Layered studio — asset pack */}
        <AssetPackPanel postId={postId} projectId={projectId} />

        {/* Legacy single-image refine loop — only shows when this post has an
            existing legacy image (image_id set). New posts use the AssetPackPanel
            above; the legacy flow stays accessible for backwards compatibility
            but is no longer the entry point. */}
        {post.image_id && (
          <ImageVersionNavigator imageId={post.image_id} projectId={projectId} />
        )}

      </div>
    </div>
  );
}
