"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Trash2, Search, ChevronRight } from "lucide-react";
import type { EditionItem, MatterListItem } from "@/types/edition";
import { api } from "@/lib/api";

interface MatterKanbanProps {
  editionId: string;
  items: EditionItem[];
  onItemsChange: () => void;
  disabled?: boolean;
}

export default function MatterKanban({ editionId, items, onItemsChange, disabled }: MatterKanbanProps) {
  const [availableMatters, setAvailableMatters] = useState<MatterListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const fetchAvailable = () => {
    setLoading(true);
    api.listMatters({ status: "approved", search: search || undefined })
      .then(setAvailableMatters)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(fetchAvailable, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const addMatter = async (matterId: string) => {
    try {
      await api.addEditionItem(editionId, matterId);
      onItemsChange();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao adicionar");
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await api.removeEditionItem(editionId, itemId);
      onItemsChange();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  const handleDragStart = (itemId: string) => {
    setDragItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };

  const handleDrop = async () => {
    if (dragItemId === null || dragOverIdx.current === null) return;
    const sorted = [...items];
    const fromIdx = sorted.findIndex((i) => i.id === dragItemId);
    if (fromIdx === -1) return;
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(dragOverIdx.current, 0, moved);
    const reordered = sorted.map((item, idx) => ({ id: item.id, position: idx }));
    try {
      await api.reorderEditionItems(editionId, reordered);
      onItemsChange();
    } catch (_error) {
      // Keep the current UI state if reordering fails.
    }
    setDragItemId(null);
    dragOverIdx.current = null;
  };

  const usedMatterIds = new Set(items.map((i) => i.matter_id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Available Matters */}
      <div className="border border-gray-200 rounded-lg bg-white">
        <div className="p-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar matérias aprovadas..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Carregando...</div>
          ) : availableMatters.filter((m) => !usedMatterIds.has(m.id)).length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">Nenhuma matéria disponível</div>
          ) : (
            availableMatters
              .filter((m) => !usedMatterIds.has(m.id))
              .map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="truncate flex-1">{m.title}</span>
                  {!disabled && (
                    <button type="button" onClick={() => addMatter(m.id)} className="text-blue-600 hover:text-blue-800 ml-2">
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {/* Right: Edition Items */}
      <div className="border border-gray-200 rounded-lg bg-white">
        <div className="p-3 border-b font-medium text-sm text-gray-700">
          Matérias na edição ({items.length})
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">Nenhuma matéria adicionada</div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                draggable={!disabled}
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${dragItemId === item.id ? "opacity-50" : ""}`}
              >
                <GripVertical size={14} className="text-gray-300 cursor-grab shrink-0" />
                <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                <span className="flex-1 truncate">{item.matter_title || item.matter_id.slice(0, 8)}</span>
                {item.section_title && (
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{item.section_title}</span>
                )}
                {!disabled && (
                  <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
