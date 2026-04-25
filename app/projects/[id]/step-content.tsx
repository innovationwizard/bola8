'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, FileText, Image as ImageIcon, Download } from 'lucide-react';

type Note = {
  id: string;
  note_text: string;
  created_by: string | null;
  created_at: string;
};

type FileItem = {
  id: string;
  filename: string;
  url: string;
  mime_type: string | null;
  size: number | null;
  description: string | null;
  created_at: string;
  source: 'file' | 'image';
};

type StepContentProps = {
  projectId: string;
  workflowStep: string;
  stepLabel: string;
};

export default function StepContent({ projectId, workflowStep, stepLabel }: StepContentProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [newNoteAuthor, setNewNoteAuthor] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [notesRes, filesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/notes?workflow_step=${workflowStep}`),
        fetch(`/api/projects/${projectId}/files?workflow_step=${workflowStep}`),
      ]);

      const notesData = await notesRes.json();
      const filesData = await filesRes.json();

      setNotes(notesData.notes || []);
      setFiles([...(filesData.files || []), ...(filesData.images || [])]);
    } catch (error) {
      console.error('Error fetching step content:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, workflowStep]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_step: workflowStep,
          note_text: newNote,
          created_by: newNoteAuthor || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes([data.note, ...notes]);
        setNewNote('');
        setNewNoteAuthor('');
        setShowAddNote(false);
      }
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workflow_step', workflowStep);
      if (file.type.startsWith('image/')) {
        formData.append('description', `Foto subida para ${stepLabel}`);
      }

      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setFiles([data.file, ...files]);
        setShowAddFile(false);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-4">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Notes Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notas
          </h3>
          {!showAddNote && (
            <button
              onClick={() => setShowAddNote(true)}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Agregar Nota
            </button>
          )}
        </div>

        {showAddNote && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Autor (opcional)
                </label>
                <input
                  type="text"
                  value={newNoteAuthor}
                  onChange={(e) => setNewNoteAuthor(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nota
                </label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  placeholder="Agrega una nota para este paso..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddNote}
                  className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800"
                >
                  Guardar Nota
                </button>
                <button
                  onClick={() => {
                    setShowAddNote(false);
                    setNewNote('');
                    setNewNoteAuthor('');
                  }}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aún no hay notas</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="p-3 bg-white border border-gray-200 rounded-md">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-xs text-gray-500">
                    {note.created_by || 'Anónimo'} • {formatDate(note.created_at)}
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Files Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Fotos y Archivos
          </h3>
          {!showAddFile && (
            <label className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer">
              <Plus className="w-3 h-3" />
              Subir
              <input
                type="file"
                className="hidden"
                onChange={handleUploadFile}
                disabled={uploading}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
            </label>
          )}
        </div>

        {uploading && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-600">
            Subiendo...
          </div>
        )}

        {files.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aún no se han subido archivos</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {files.map((file) => (
              <div key={file.id} className="relative group">
                {file.source === 'image' || file.mime_type?.startsWith('image/') ? (
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={file.filename}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                      <a
                        href={file.url}
                        download
                        className="opacity-0 group-hover:opacity-100 text-white p-2 hover:bg-white hover:bg-opacity-20 rounded transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square bg-gray-100 rounded-lg border border-gray-200 flex flex-col items-center justify-center p-4">
                    <FileText className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-xs text-gray-600 text-center truncate w-full">
                      {file.filename}
                    </p>
                    {file.size && (
                      <p className="text-xs text-gray-400 mt-1">{formatFileSize(file.size)}</p>
                    )}
                    <a
                      href={file.url}
                      download
                      className="mt-2 text-xs text-gray-600 hover:text-gray-900"
                    >
                      Descargar
                    </a>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1 truncate">{file.filename}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

