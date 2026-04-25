'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Dumbbell } from 'lucide-react';

interface TrainingStatus {
  phase_1: {
    active: boolean;
    samples_collected: number;
    best_rating: number;
    convergence: number;
  };
  phase_2: {
    active: boolean;
    training_samples: number;
    ready_for_inference: boolean;
  };
}

export default function TrainingCard() {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/train/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const getColorClasses = (samples: number) => {
    if (samples <= 50) {
      return {
        border: 'border-red-200',
        bg: 'bg-red-50',
        bgHover: 'hover:bg-red-100',
        iconBg: 'bg-red-100',
        iconBgHover: 'group-hover:bg-red-200',
        iconText: 'text-red-600',
        iconTextHover: 'group-hover:text-red-700',
        titleText: 'text-red-900',
        titleTextHover: 'group-hover:text-red-900',
        subtitleText: 'text-red-600',
        subtitleTextHover: 'group-hover:text-red-700',
        bodyText: 'text-red-700',
        bodyTextHover: 'group-hover:text-red-800',
      };
    } else if (samples < 200) {
      return {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        bgHover: 'hover:bg-amber-100',
        iconBg: 'bg-amber-100',
        iconBgHover: 'group-hover:bg-amber-200',
        iconText: 'text-amber-600',
        iconTextHover: 'group-hover:text-amber-700',
        titleText: 'text-amber-900',
        titleTextHover: 'group-hover:text-amber-900',
        subtitleText: 'text-amber-600',
        subtitleTextHover: 'group-hover:text-amber-700',
        bodyText: 'text-amber-700',
        bodyTextHover: 'group-hover:text-amber-800',
      };
    } else {
      return {
        border: 'border-green-200',
        bg: 'bg-green-50',
        bgHover: 'hover:bg-green-100',
        iconBg: 'bg-green-100',
        iconBgHover: 'group-hover:bg-green-200',
        iconText: 'text-green-600',
        iconTextHover: 'group-hover:text-green-700',
        titleText: 'text-green-900',
        titleTextHover: 'group-hover:text-green-900',
        subtitleText: 'text-green-600',
        subtitleTextHover: 'group-hover:text-green-700',
        bodyText: 'text-green-700',
        bodyTextHover: 'group-hover:text-green-800',
      };
    }
  };

  if (loading || !status) {
    // Default styling while loading
    return (
      <Link
        href="/train"
        className="group border border-neutral-900 bg-neutral-900 rounded-xl p-6 hover:bg-neutral-50 transition-all duration-200"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neutral-50/10 group-hover:bg-neutral-900/10 flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-neutral-50 group-hover:text-neutral-900" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-50 group-hover:text-neutral-900">
                Entrenamiento
              </h3>
              <p className="text-xs text-neutral-400 group-hover:text-neutral-500 mt-0.5">
                Sistema de aprendizaje
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-300 group-hover:text-neutral-600 leading-relaxed">
            Mejora continua de parámetros mediante aprendizaje automático.
          </p>
        </div>
      </Link>
    );
  }

  const totalSamples = status.phase_1.samples_collected + status.phase_2.training_samples;
  const colors = getColorClasses(totalSamples);

  return (
    <Link
      href="/train"
      className={`group border ${colors.border} ${colors.bg} rounded-xl p-6 ${colors.bgHover} transition-all duration-200`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${colors.iconBg} ${colors.iconBgHover} flex items-center justify-center`}>
            <Dumbbell className={`w-5 h-5 ${colors.iconText} ${colors.iconTextHover}`} />
          </div>
          <div>
            <h3 className={`text-sm font-medium ${colors.titleText} ${colors.titleTextHover}`}>
              Entrenamiento ML
            </h3>
            <p className={`text-xs ${colors.subtitleText} ${colors.subtitleTextHover} mt-0.5`}>
              {totalSamples} muestras recolectadas
            </p>
          </div>
        </div>
        <p className={`text-xs ${colors.bodyText} ${colors.bodyTextHover} leading-relaxed`}>
          Mejora continua de parámetros y prompts mediante aprendizaje automático.
        </p>
      </div>
    </Link>
  );
}

