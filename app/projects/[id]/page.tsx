'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, Calculator, FileText, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import StepContent from './step-content';

type Project = {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  project_name: string;
  project_type: string;
  status: string;
  budget_range: string;
  room_type: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

const WORKFLOW_STEPS = [
  { id: 'lead', label: 'Prospecto', order: 1 },
  { id: 'scheduled', label: 'Agendado', order: 2 },
  { id: 'site_visit', label: 'Visita al Sitio', order: 3 },
  { id: 'design', label: 'Diseño', order: 4 },
  { id: 'client_review_1', label: 'Revisión Cliente 1', order: 5 },
  { id: 'design_revision_1', label: 'Revisión Diseño 1', order: 6 },
  { id: 'client_review_2', label: 'Revisión Cliente 2', order: 7 },
  { id: 'design_revision_2', label: 'Revisión Diseño 2', order: 8 },
  { id: 'client_review_3', label: 'Revisión Cliente 3', order: 9 },
  { id: 'quotation', label: 'Cotización', order: 10 },
  { id: 'technical_drawings', label: 'Planos Técnicos', order: 11 },
  { id: 'manufacturing', label: 'Manufactura', order: 12 },
  { id: 'installation', label: 'Instalación', order: 13 },
  { id: 'completed', label: 'Completado', order: 14 },
];

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

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'workflow'>('overview');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const fetchProject = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}`);
      const data = await response.json();
      setProject(data.project);
    } catch (error) {
      console.error('Error fetching project:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const updateStatus = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        fetchProject();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="text-gray-500">Cargando proyecto...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="text-gray-500">Proyecto no encontrado</p>
      </div>
    );
  }

  const currentStepIndex = WORKFLOW_STEPS.findIndex((step) => step.id === project.status);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Inicio
            </Link>
            <span className="text-gray-300">|</span>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Proyectos
            </Link>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">{project.project_name}</h1>
              <p className="text-sm text-gray-500">{project.client_name}</p>
            </div>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm">
              {STATUS_LABELS[project.status] || project.status}
            </span>
          </div>
        </div>

        {/* Workflow Progress */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-light text-gray-900 mb-4">Progreso del Flujo de Trabajo</h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-4">
            {WORKFLOW_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <div key={step.id} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => updateStatus(step.id)}
                    className={`px-4 py-2 rounded-md text-sm transition-colors ${
                      isCurrent
                        ? 'bg-gray-900 text-white'
                        : isCompleted
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {step.label}
                  </button>
                  {index < WORKFLOW_STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        isCompleted ? 'bg-gray-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex gap-6">
            {[
              { id: 'overview', label: 'Resumen', icon: FileText },
              { id: 'workflow', label: 'Flujo de Trabajo', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'overview' | 'workflow')}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Información del Cliente</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>Correo: {project.client_email || '—'}</p>
                  <p>Teléfono: {project.client_phone || '—'}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Detalles del Proyecto</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>Tipo: {project.project_type.replace('_', ' ')}</p>
                  <p>Tipo de Espacio: {project.room_type || '—'}</p>
                  <p>Rango de Presupuesto: {project.budget_range || '—'}</p>
                </div>
              </div>
              {project.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Notas</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.notes}</p>
                </div>
              )}
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <Link
                  href={`/projects/${projectId}/quotation`}
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <Calculator className="w-4 h-4" />
                  Ver Cotización
                </Link>
                <Link
                  href={`/projects/${projectId}/images`}
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <ImageIcon className="w-4 h-4" />
                  Ver Comparación de Imágenes
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500 mb-6">
                Agrega notas y sube fotos/archivos para cada paso del flujo de trabajo
              </p>
              {WORKFLOW_STEPS.map((step) => {
                const isExpanded = expandedSteps.has(step.id);
                return (
                  <div key={step.id} className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedSteps);
                        if (isExpanded) {
                          newExpanded.delete(step.id);
                        } else {
                          newExpanded.add(step.id);
                        }
                        setExpandedSteps(newExpanded);
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900">{step.label}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-4 py-4 border-t border-gray-200">
                        <StepContent
                          projectId={projectId}
                          workflowStep={step.id}
                          stepLabel={step.label}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

