'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, ArrowRight, Filter, ArrowLeft } from 'lucide-react';

type Project = {
  id: string;
  client_name: string;
  project_name: string;
  project_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  quote_count: number;
  image_count: number;
};

const STATUS_LABELS: Record<string, string> = {
  lead: 'Prospecto',
  scheduled: 'Agendado',
  site_visit: 'Visita al Sitio',
  design: 'Diseño',
  client_review_1: 'Revisión Cliente 1',
  design_revision_1: 'Revisión Diseño 1',
  client_review_2: 'Revisión Cliente 2',
  design_revision_2: 'Revisión Diseño 2',
  client_review_3: 'Revisión Cliente 3',
  quotation: 'Cotización',
  technical_drawings: 'Planos Técnicos',
  manufacturing: 'Manufactura',
  installation: 'Instalación',
  completed: 'Completado',
};

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  site_visit: 'bg-purple-100 text-purple-700',
  design: 'bg-yellow-100 text-yellow-700',
  design_revision_1: 'bg-yellow-100 text-yellow-700',
  design_revision_2: 'bg-yellow-100 text-yellow-700',
  client_review_1: 'bg-orange-100 text-orange-700',
  client_review_2: 'bg-orange-100 text-orange-700',
  client_review_3: 'bg-orange-100 text-orange-700',
  quotation: 'bg-green-100 text-green-700',
  technical_drawings: 'bg-indigo-100 text-indigo-700',
  manufacturing: 'bg-pink-100 text-pink-700',
  installation: 'bg-teal-100 text-teal-700',
  completed: 'bg-gray-200 text-gray-800',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterType !== 'all') params.append('project_type', filterType);

      const response = await fetch(`/api/projects?${params.toString()}`);
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Inicio
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Proyectos</h1>
            <p className="text-sm text-gray-500">Gestiona todos los proyectos de diseño</p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-light"
          >
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Filtrar:</span>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="all">Todos los Estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="all">Todos los Tipos</option>
            <option value="space_design">Diseño de Espacios</option>
            <option value="furniture_design">Diseño de Mobiliario</option>
          </select>
        </div>

        {/* Projects List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Cargando proyectos...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No se encontraron proyectos</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Crea Tu Primer Proyecto
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-light text-gray-900 mb-1">
                      {project.project_name}
                    </h3>
                    <p className="text-sm text-gray-500">{project.client_name}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[project.status] || STATUS_COLORS.lead}`}
                  >
                    {STATUS_LABELS[project.status] || project.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                  <span className="capitalize">
                    {project.project_type.replace('_', ' ')}
                  </span>
                  <span>•</span>
                  <span>{formatDate(project.updated_at)}</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400 pt-4 border-t border-gray-100">
                  <span>{project.quote_count || 0} cotizaciones</span>
                  <span>•</span>
                  <span>{project.image_count || 0} imágenes</span>
                  <ArrowRight className="w-3 h-3 ml-auto" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

