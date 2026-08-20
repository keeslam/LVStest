import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient, invalidateByPrefix } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft, Loader2, Plus, Save, Trash2, FileText, ZoomIn, ZoomOut, Grid,
  AlignCenter, AlignLeft, AlignRight, Lock, Unlock, Maximize2, Undo2, Redo2,
  LayoutGrid, Move, Type, Database, CheckSquare, ClipboardList, PenLine, Minus, Square, Image as ImageIcon, Sparkles,
} from 'lucide-react';
import { type DamageCheckFieldsConfig, DEFAULT_DAMAGE_CHECK_FIELDS } from '@shared/schema';

type FieldType = 'text' | 'dynamic' | 'inspection' | 'checkbox' | 'signature' | 'line' | 'box' | 'diagram';

interface CanvasField {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  name: string;
  source?: string;
  fontSize: number;
  isBold: boolean;
  textAlign: 'left' | 'center' | 'right';
  damageTypes?: string[];
  diagramTemplateId?: number | null; // for type=='diagram'; null = auto-match by vehicle
  locked?: boolean;
  page?: number;
}

interface DiagramTemplateSummary {
  id: number;
  make: string;
  model: string;
  year?: number | null;
  diagramPath?: string | null;
}

interface Template {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  language: string;
  canvasFields: CanvasField[];
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}

const DYNAMIC_SOURCES: { value: string; label: string }[] = [
  { value: 'licensePlate', label: 'License Plate' },
  { value: 'brand', label: 'Vehicle Brand' },
  { value: 'model', label: 'Vehicle Model' },
  { value: 'buildYear', label: 'Build Year' },
  { value: 'fuel', label: 'Fuel Type' },
  { value: 'currentMileage', label: 'Current Mileage' },
  { value: 'customerName', label: 'Customer Name' },
  { value: 'contractNumber', label: 'Contract Number' },
  { value: 'startDate', label: 'Start Date' },
  { value: 'endDate', label: 'End Date' },
  { value: 'rentalDays', label: 'Rental Days' },
  { value: 'currentDate', label: 'Today\'s Date' },
  { value: 'notes', label: 'Inspection Notes' },
  { value: 'inspectorName', label: 'Inspector / Logged-in User (Controle door)' },
];

const PAGE_W = 595;
const PAGE_H = 842;

const newId = () => `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

function defaultFieldFor(type: FieldType, x: number, y: number): CanvasField {
  const base = { id: newId(), x, y, fontSize: 11, isBold: false, textAlign: 'left' as const, page: 1 };
  switch (type) {
    case 'text':
      return { ...base, type, name: 'Static text' };
    case 'dynamic':
      return { ...base, type, name: 'License Plate', source: 'licensePlate' };
    case 'inspection':
      return { ...base, type, name: 'Voorruit', damageTypes: ['Kras', 'Deuk', 'Ster'] };
    case 'checkbox':
      return { ...base, type, name: 'Checkbox label' };
    case 'signature':
      return { ...base, type, name: 'Signature', width: 200, height: 40 };
    case 'line':
      return { ...base, type, name: '', width: 200, height: 1 };
    case 'box':
      return { ...base, type, name: '', width: 150, height: 80 };
    case 'diagram':
      return { ...base, type, name: 'Vehicle diagram', width: 400, height: 220, diagramTemplateId: null };
  }
}

// Default starter layout matching the legacy structured form: header text, key
// dynamic fields (license plate, customer, contract #, dates), a vehicle diagram
// placeholder, an inspection grid and signature lines. Editors can move/delete
// anything — this is just a starting point so a blank canvas isn't overwhelming.
function buildDefaultLayout(config: DamageCheckFieldsConfig = DEFAULT_DAMAGE_CHECK_FIELDS): CanvasField[] {
  const mk = (
    type: FieldType,
    x: number,
    y: number,
    name: string,
    extra: Partial<CanvasField> = {},
  ): CanvasField => ({
    ...defaultFieldFor(type, x, y),
    name,
    ...extra,
  });
  const out: CanvasField[] = [];

  // Sizing tuned for tablet readability while still fitting on A4.
  // ============ LEFT COLUMN ============
  const LX = 30;                  // left edge for checkbox/label column
  const LABEL_X = LX + 16;        // text label after the checkbox
  const OPT_X = LX + 150;         // option text (e.g. "schoon / vuil")
  const ROW_H = 15;               // distance between checklist rows
  const HEAD_GAP = 22;            // space the heading bar + small gap takes
  const COL_W = 350;              // full width of the left column (heading bar)
  const ROW_FS = 10;
  const HEAD_FS = 13;

  // Heading bar (filled blue rectangle + centered white text in the image — we
  // approximate with a box + bold centered text).
  const heading = (title: string, y: number) => {
    out.push(mk('box', LX, y, '', { width: COL_W, height: 18 }));
    out.push(mk('text', LX, y + 3, title, { fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: COL_W } as any));
  };

  // Single checklist row: checkbox + label + options text.
  const row = (y: number, label: string, options: string) => {
    out.push(mk('checkbox', LX, y, '', { fontSize: ROW_FS }));
    out.push(mk('text', LABEL_X, y, label, { fontSize: ROW_FS }));
    if (options) out.push(mk('text', OPT_X, y, options, { fontSize: ROW_FS }));
  };

  // Build the three columns from the admin-editable schema so the editor's
  // default layout stays in lock-step with the interactive damage check.
  let y = 30;
  const findGroup = (id: 'interior' | 'exterior' | 'delivery') =>
    config.groups.find(g => g.id === id) || { label: id, fields: [] as { label: string; options: string[]; inputType: string }[] };

  const interior = findGroup('interior');
  heading(interior.label, y); y += HEAD_GAP;
  interior.fields.forEach(f => {
    row(y, f.label, f.options.join(' / '));
    y += ROW_H;
  });

  y += 6;
  const exterior = findGroup('exterior');
  heading(exterior.label, y); y += HEAD_GAP;
  exterior.fields.forEach(f => {
    row(y, f.label, f.options.join(' / '));
    y += ROW_H;
  });

  y += 6;
  const delivery = findGroup('delivery');
  heading(delivery.label, y); y += HEAD_GAP;
  delivery.fields.forEach(f => {
    row(y, f.label, '');
    y += ROW_H;
  });

  // Track where the left column ends so we can place the diagram below it.
  const leftEndY = y;

  // Vertical divider between columns (drawn from top through end of right block).
  out.push(mk('line', 390, 30, '', { width: 1, height: 560 }));

  // ============ RIGHT COLUMN ============
  const RX = 405;
  const RCOL_W = 160;
  const rheading = (title: string, y: number) => {
    out.push(mk('box', RX, y, '', { width: RCOL_W, height: 18 }));
    out.push(mk('text', RX, y + 3, title, { fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: RCOL_W } as any));
  };

  // --- GEGEVENS VOERTUIG ---
  let ry = 30;
  rheading('Gegevens voertuig', ry); ry += HEAD_GAP;
  const vehicleRow = (label: string, source: string | null, valueText?: string) => {
    out.push(mk('text', RX, ry, label, { fontSize: ROW_FS, isBold: true }));
    if (source) {
      out.push(mk('dynamic', RX + 70, ry, label, { source, fontSize: ROW_FS } as any));
    }
    out.push(mk('line', RX + 70, ry + 12, '', { width: RCOL_W - 70, height: 1 }));
    if (valueText) {
      out.push(mk('text', RX + 70, ry, valueText, { fontSize: ROW_FS }));
    }
    ry += 20;
  };
  vehicleRow('Merk:', 'brand');
  vehicleRow('Type:', 'model');
  vehicleRow('Kenteken:', 'licensePlate');
  vehicleRow('Tellerstand:', 'currentMileage');
  // Tank — pulls the live fuel level recorded during the interactive check
  // so the actual selection (vol / leeg / 1/4 / 1/2 / 3/4) appears here.
  vehicleRow('Tank:', 'fuel');

  // --- GEGEVENS HUURDER --- (rental info that should auto-fill from the
  // reservation: customer name, contract number, start/end dates).
  ry += 6;
  rheading('Gegevens huurder', ry); ry += HEAD_GAP;
  vehicleRow('Naam:', 'customerName');
  vehicleRow('Contract:', 'contractNumber');
  vehicleRow('Van:', 'startDate');
  vehicleRow('Tot:', 'endDate');

  // --- OPMERKINGEN --- (first line auto-fills with the inspection notes;
  // remaining blank lines remain available for hand-written remarks).
  ry += 6;
  rheading('Opmerkingen', ry); ry += HEAD_GAP;
  out.push(mk('dynamic', RX, ry, 'Inspection Notes', { source: 'notes', fontSize: ROW_FS } as any));
  out.push(mk('line', RX, ry + 12, '', { width: RCOL_W, height: 1 }));
  ry += 17;
  for (let i = 0; i < 4; i++) {
    out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 }));
    ry += 17;
  }

  // --- CONTROLE DOOR ---
  ry += 6;
  rheading('Controle door', ry); ry += HEAD_GAP;
  out.push(mk('text', RX, ry, 'Datum:', { fontSize: ROW_FS, isBold: true }));
  out.push(mk('dynamic', RX + 50, ry, 'Today\'s Date', { source: 'currentDate', fontSize: ROW_FS } as any));
  out.push(mk('line', RX + 50, ry + 12, '', { width: RCOL_W - 50, height: 1 }));
  ry += 22;
  out.push(mk('text', RX, ry, 'NAAM:', { fontSize: ROW_FS, isBold: true }));
  out.push(mk('line', RX + 50, ry + 12, '', { width: RCOL_W - 50, height: 1 }));
  ry += 22;

  // --- HANDTEKENING ---
  ry += 6;
  rheading('Handtekening', ry); ry += HEAD_GAP;
  out.push(mk('text', RX, ry, 'Naam verhuurder', { fontSize: ROW_FS })); ry += 13;
  out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 })); ry += 6;
  out.push(mk('text', RX, ry, 'Voor akkoord:', { fontSize: ROW_FS }));
  out.push(mk('signature', RX + 70, ry - 4, 'Verhuurder', { width: RCOL_W - 70, height: 26 } as any));
  ry += 32;
  out.push(mk('text', RX, ry, 'Naam huurder', { fontSize: ROW_FS })); ry += 13;
  out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 })); ry += 6;
  out.push(mk('text', RX, ry, 'Voor akkoord:', { fontSize: ROW_FS }));
  out.push(mk('signature', RX + 70, ry - 4, 'Huurder', { width: RCOL_W - 70, height: 26 } as any));
  ry += 32;

  // ============ BOTTOM: VEHICLE DIAGRAM (full width, prominent) ============
  // Start below whichever column extends further so we never overlap.
  const diagStart = Math.max(leftEndY, ry) + 10;
  // Heading bar across the full page width.
  out.push(mk('box', 30, diagStart, '', { width: 535, height: 18 }));
  out.push(mk('text', 30, diagStart + 3, 'Voertuig diagram', {
    fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: 535,
  } as any));
  // The diagram itself fills the rest of the page (down to ~y=820 with a small
  // bottom margin).
  const diagY = diagStart + 22;
  const diagH = Math.max(140, 820 - diagY);
  out.push(mk('diagram', 30, diagY, 'Vehicle diagram', {
    width: 535, height: diagH, diagramTemplateId: null,
  } as any));

  return out;
}

interface HistoryState { fields: CanvasField[]; ts: number; }

export default function DamageCheckTemplateCanvasEditor({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [currentId, setCurrentId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'nl' | 'en'>('nl');
  const [fields, setFields] = useState<CanvasField[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // History (undo/redo) — snapshots of fields array
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  // Drag state
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [clipboard, setClipboard] = useState<CanvasField[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Load templates list
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['/api/damage-check-templates'],
  });

  // Vehicle diagram templates — used for the 'diagram' field type so editors
  // can pick which diagram appears on the form (or leave it as auto-match).
  const { data: diagramTemplates = [] } = useQuery<DiagramTemplateSummary[]>({
    queryKey: ['/api/vehicle-diagram-templates'],
  });

  // Admin-editable damage check field schema — used by "Insert Default Layout"
  // so the editor's starter rows match the interactive damage check's fields.
  const { data: damageCheckFields = DEFAULT_DAMAGE_CHECK_FIELDS } = useQuery<DamageCheckFieldsConfig>({
    queryKey: ['/api/damage-check-fields'],
  });

  // Parse ?id= from URL once templates load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam && templates.length > 0 && currentId === null) {
      const id = parseInt(idParam, 10);
      if (!Number.isNaN(id)) {
        const t = templates.find(x => x.id === id);
        if (t) loadTemplate(t);
      }
    }
  }, [templates]);

  // Cleanup preview blob URL on unmount/change
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function loadTemplate(t: Template) {
    setCurrentId(t.id);
    setName(t.name);
    setDescription(t.description || '');
    setLanguage((t.language as 'nl' | 'en') || 'nl');
    const f = Array.isArray(t.canvasFields) ? t.canvasFields : [];
    setFields(f);
    setSelectedIds([]);
    setHistory([{ fields: f, ts: Date.now() }]);
    setHistIdx(0);
    // Sync URL
    const url = new URL(window.location.href);
    url.searchParams.set('id', String(t.id));
    window.history.replaceState({}, '', url.toString());
  }

  // Mirror live state in refs so event handlers (keyboard, drag, etc.) don't
  // need these in their dependency arrays. Without this, the keyboard `useEffect`
  // re-binds 60+ times per second during a drag, eventually causing the editor
  // tab to lag or crash on long sessions.
  const fieldsRef = useRef<CanvasField[]>(fields);
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const historyRef = useRef<HistoryState[]>(history);
  const histIdxRef = useRef<number>(histIdx);
  const clipboardRef = useRef<CanvasField[]>(clipboard);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { histIdxRef.current = histIdx; }, [histIdx]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  function pushHistory(next: CanvasField[]) {
    const slice = historyRef.current.slice(0, histIdxRef.current + 1);
    slice.push({ fields: next, ts: Date.now() });
    if (slice.length > 50) slice.shift();
    historyRef.current = slice;
    histIdxRef.current = slice.length - 1;
    setHistory(slice);
    setHistIdx(slice.length - 1);
  }

  function updateFields(next: CanvasField[], record = true) {
    fieldsRef.current = next;
    setFields(next);
    if (record) pushHistory(next);
  }

  function undo() {
    if (histIdxRef.current <= 0) return;
    const i = histIdxRef.current - 1;
    histIdxRef.current = i;
    setHistIdx(i);
    const f = historyRef.current[i].fields;
    fieldsRef.current = f;
    setFields(f);
  }

  function redo() {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    const i = histIdxRef.current + 1;
    histIdxRef.current = i;
    setHistIdx(i);
    const f = historyRef.current[i].fields;
    fieldsRef.current = f;
    setFields(f);
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentId) return null;
      // Read from the ref so a save fired immediately after a drag captures
      // the final field positions rather than a pre-drop React snapshot.
      const res = await apiRequest('PUT', `/api/damage-check-templates/${currentId}`, {
        name, description, language, canvasFields: fieldsRef.current,
      });
      return res.json();
    },
    onSuccess: (saved: Template | null) => {
      invalidateByPrefix('/api/damage-check-templates');
      // Reload local state from what the server actually persisted so the
      // canvas reflects the saved data exactly (no drift between editor and
      // what reload would show).
      if (saved && Array.isArray(saved.canvasFields)) {
        const f = saved.canvasFields as CanvasField[];
        fieldsRef.current = f;
        setFields(f);
        const snap: HistoryState[] = [{ fields: f, ts: Date.now() }];
        historyRef.current = snap;
        histIdxRef.current = 0;
        setHistory(snap);
        setHistIdx(0);
      }
      toast({ title: 'Saved', description: 'Template saved successfully' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: async (templateName: string) => {
      const res = await apiRequest('POST', '/api/damage-check-templates', {
        name: templateName, language: 'nl', canvasFields: [], inspectionPoints: [], categories: [], handoverChecklist: [],
      });
      return res.json();
    },
    onSuccess: (created: Template) => {
      invalidateByPrefix('/api/damage-check-templates');
      toast({ title: 'Created', description: `Template "${created.name}" created` });
      setCreateOpen(false);
      setNewName('');
      loadTemplate({ ...created, canvasFields: [] });
    },
    onError: (e: Error) => toast({ title: 'Create failed', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentId) return null;
      return apiRequest('DELETE', `/api/damage-check-templates/${currentId}`);
    },
    onSuccess: () => {
      invalidateByPrefix('/api/damage-check-templates');
      toast({ title: 'Deleted', description: 'Template deleted' });
      setDeleteOpen(false);
      setCurrentId(null);
      setName('');
      setFields([]);
      setSelectedIds([]);
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  async function handleGeneratePreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/damage-check-templates/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name || 'Preview',
          description, language,
          canvasFields: fields,
          inspectionPoints: [], categories: [], handoverChecklist: [],
        }),
      });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  }

  // Add a field at the center of the visible canvas
  function addField(type: FieldType) {
    const f = defaultFieldFor(type, 60, 60 + fields.length * 22);
    const next = [...fields, f];
    updateFields(next);
    setSelectedIds([f.id]);
  }

  // These helpers are also called from the one-time-bound keyboard listener,
  // so they MUST read from refs (not React state) to avoid stale-closure bugs
  // like Ctrl+C/V/D acting on the initial selection.
  function deleteSelected() {
    const sel = selectedIdsRef.current;
    if (sel.length === 0) return;
    const next = fieldsRef.current.filter(f => !sel.includes(f.id));
    updateFields(next);
    setSelectedIds([]);
  }

  function duplicateSelected() {
    const sel = selectedIdsRef.current;
    if (sel.length === 0) return;
    const dup: CanvasField[] = sel
      .map(id => fieldsRef.current.find(f => f.id === id))
      .filter(Boolean)
      .map(f => ({ ...(f as CanvasField), id: newId(), x: (f as CanvasField).x + 10, y: (f as CanvasField).y + 10 }));
    const next = [...fieldsRef.current, ...dup];
    updateFields(next);
    setSelectedIds(dup.map(d => d.id));
  }

  function copySelected() {
    const sel = selectedIdsRef.current;
    const copied = fieldsRef.current.filter(f => sel.includes(f.id)).map(f => ({ ...f }));
    clipboardRef.current = copied;
    setClipboard(copied);
  }

  function pasteClipboard() {
    const clip = clipboardRef.current;
    if (clip.length === 0) return;
    const pasted = clip.map(f => ({ ...f, id: newId(), x: f.x + 10, y: f.y + 10 }));
    const next = [...fieldsRef.current, ...pasted];
    updateFields(next);
    setSelectedIds(pasted.map(p => p.id));
  }

  // Keyboard shortcuts. Bind ONCE and read state from refs — without this the
  // listener re-binds on every drag mousemove (which mutates `fields`) and the
  // browser tab eventually grinds to a halt.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (ctrl && e.key === 'v') { e.preventDefault(); pasteClipboard(); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const sel = selectedIdsRef.current;
        const next = fieldsRef.current.map(f => sel.includes(f.id) && !f.locked
          ? { ...f, x: Math.max(0, Math.min(PAGE_W, f.x + dx)), y: Math.max(0, Math.min(PAGE_H, f.y + dy)) }
          : f);
        updateFields(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse interactions on the canvas
  function getCanvasPoint(e: React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function snap(v: number) { return snapToGrid ? Math.round(v / gridSize) * gridSize : v; }

  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.target !== canvasRef.current) return;
    const p = getCanvasPoint(e);
    setSelectedIds([]);
    setSelectionBox({ sx: p.x, sy: p.y, ex: p.x, ey: p.y });
  }

  function onFieldMouseDown(e: React.MouseEvent, f: CanvasField) {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id]);
    } else if (!selectedIds.includes(f.id)) {
      setSelectedIds([f.id]);
    }
    if (f.locked) return;
    const p = getCanvasPoint(e);
    setDragging({ id: f.id, offX: p.x - f.x, offY: p.y - f.y });
  }

  // Throttle drag updates with requestAnimationFrame — without this the editor
  // does one full React render per native mousemove event, which on a busy
  // canvas can flood the React scheduler and crash the tab.
  const rafRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  function onCanvasMouseMove(e: React.MouseEvent) {
    if (dragging) {
      lastPointRef.current = getCanvasPoint(e);
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = lastPointRef.current;
        if (!p || !dragging) return;
        const nx = snap(Math.max(0, Math.min(PAGE_W, p.x - dragging.offX)));
        const ny = snap(Math.max(0, Math.min(PAGE_H, p.y - dragging.offY)));
        const cur = fieldsRef.current.find(f => f.id === dragging.id);
        if (!cur) return;
        const dx = nx - cur.x;
        const dy = ny - cur.y;
        const sel = selectedIdsRef.current;
        const moveIds = sel.includes(dragging.id) && sel.length > 1 ? sel : [dragging.id];
        const next = fieldsRef.current.map(f => moveIds.includes(f.id) && !f.locked
          ? { ...f, x: Math.max(0, Math.min(PAGE_W, f.x + dx)), y: Math.max(0, Math.min(PAGE_H, f.y + dy)) }
          : f);
        fieldsRef.current = next;
        setFields(next);
      });
    } else if (selectionBox) {
      const p = getCanvasPoint(e);
      setSelectionBox({ ...selectionBox, ex: p.x, ey: p.y });
    }
  }
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  function onCanvasMouseUp() {
    if (dragging) {
      // Flush any pending drag frame so the final position is in fieldsRef
      // before we snapshot history.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        const p = lastPointRef.current;
        if (p) {
          const nx = snap(Math.max(0, Math.min(PAGE_W, p.x - dragging.offX)));
          const ny = snap(Math.max(0, Math.min(PAGE_H, p.y - dragging.offY)));
          const cur = fieldsRef.current.find(f => f.id === dragging.id);
          if (cur) {
            const dx = nx - cur.x;
            const dy = ny - cur.y;
            const sel = selectedIdsRef.current;
            const moveIds = sel.includes(dragging.id) && sel.length > 1 ? sel : [dragging.id];
            const next = fieldsRef.current.map(f => moveIds.includes(f.id) && !f.locked
              ? { ...f, x: Math.max(0, Math.min(PAGE_W, f.x + dx)), y: Math.max(0, Math.min(PAGE_H, f.y + dy)) }
              : f);
            fieldsRef.current = next;
            setFields(next);
          }
        }
      }
      pushHistory(fieldsRef.current);
      lastPointRef.current = null;
      setDragging(null);
    }
    if (selectionBox) {
      const { sx, sy, ex, ey } = selectionBox;
      const x1 = Math.min(sx, ex), x2 = Math.max(sx, ex);
      const y1 = Math.min(sy, ey), y2 = Math.max(sy, ey);
      if (Math.abs(x2 - x1) > 3 && Math.abs(y2 - y1) > 3) {
        const inside = fields.filter(f => f.x >= x1 && f.x <= x2 && f.y >= y1 && f.y <= y2);
        setSelectedIds(inside.map(f => f.id));
      }
      setSelectionBox(null);
    }
  }

  const selectedField = useMemo(
    () => (selectedIds.length === 1 ? fields.find(f => f.id === selectedIds[0]) : null),
    [selectedIds, fields],
  );

  function updateSelected(patch: Partial<CanvasField>) {
    if (!selectedField) return;
    const next = fields.map(f => f.id === selectedField.id ? { ...f, ...patch } : f);
    updateFields(next);
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!embedded && (
            <Link href="/documents">
              <Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
            </Link>
          )}
          {!embedded && <h1 className="text-xl font-semibold">Damage Check Template Editor</h1>}
        </div>
        <div className="text-xs text-muted-foreground hidden md:flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl+Z</kbd> Undo
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl+Y</kbd> Redo
          <kbd className="px-1.5 py-0.5 bg-muted rounded">Ctrl+C/V/D</kbd> Copy/Paste/Dup
          <kbd className="px-1.5 py-0.5 bg-muted rounded">↑←↓→</kbd> Move (Shift=10px)
        </div>
      </div>

      {/* Template selection bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label className="text-xs">Template</Label>
              <Select
                value={currentId?.toString() ?? ''}
                onValueChange={(v) => {
                  const t = templates.find(x => x.id.toString() === v);
                  if (t) loadTemplate(t);
                }}
              >
                <SelectTrigger data-testid="select-template"><SelectValue placeholder={isLoading ? 'Loading…' : 'Select template'} /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name}{t.isDefault ? ' (Default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-new-template"><Plus className="h-4 w-4 mr-1" /> New</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create new template</DialogTitle>
                    <DialogDescription>Start a blank canvas damage check template.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label>Template name</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Sedan generic" data-testid="input-new-template-name" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
                      disabled={!newName.trim() || createMutation.isPending}
                      data-testid="button-confirm-create-template"
                    >
                      {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" onClick={undo} disabled={histIdx <= 0} title="Undo (Ctrl+Z)" data-testid="button-undo">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (Ctrl+Y)" data-testid="button-redo">
                <Redo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive" size="sm"
                onClick={() => setDeleteOpen(true)}
                disabled={!currentId}
                data-testid="button-delete-template"
              ><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!currentId || saveMutation.isPending}
                data-testid="button-save-template"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
          {currentId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} data-testid="input-template-name" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} data-testid="input-template-description" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as 'nl' | 'en')}>
                  <SelectTrigger data-testid="select-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nl">Dutch (NL)</SelectItem>
                    <SelectItem value="en">English (EN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {currentId ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left palette */}
          <Card className="lg:col-span-2 h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-3"><CardTitle className="text-base">Add Field</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('text')} data-testid="button-add-text"><Type className="h-4 w-4 mr-2" /> Text</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('dynamic')} data-testid="button-add-dynamic"><Database className="h-4 w-4 mr-2" /> Dynamic</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('inspection')} data-testid="button-add-inspection"><ClipboardList className="h-4 w-4 mr-2" /> Inspection</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('checkbox')} data-testid="button-add-checkbox"><CheckSquare className="h-4 w-4 mr-2" /> Checkbox</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('signature')} data-testid="button-add-signature"><PenLine className="h-4 w-4 mr-2" /> Signature</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('line')} data-testid="button-add-line"><Minus className="h-4 w-4 mr-2" /> Line</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('box')} data-testid="button-add-box"><Square className="h-4 w-4 mr-2" /> Box</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => addField('diagram')} data-testid="button-add-diagram"><ImageIcon className="h-4 w-4 mr-2" /> Vehicle Diagram</Button>
              <Separator />
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  if (fields.length > 0 && !confirm('Replace current fields with the default layout?')) return;
                  updateFields(buildDefaultLayout(damageCheckFields));
                  setSelectedIds([]);
                }}
                data-testid="button-insert-default-layout"
              >
                <Sparkles className="h-4 w-4 mr-2" /> Insert Default Layout
              </Button>
              <Separator />
              <Button variant="outline" className="w-full" onClick={handleGeneratePreview} disabled={previewLoading} data-testid="button-generate-preview">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                Generate Preview
              </Button>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block text-center" data-testid="link-open-preview">
                  Open last preview →
                </a>
              )}
            </CardContent>
          </Card>

          {/* Center canvas */}
          <Card className="lg:col-span-7">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Canvas (A4 portrait)</CardTitle>
                  <CardDescription className="text-xs">
                    {selectedIds.length === 0 ? 'Click a field to select. Drag to move.' : `${selectedIds.length} selected`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setZoom(1)} className="font-mono text-xs">{Math.round(zoom * 100)}%</Button>
                  <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setZoom(0.75)} title="Fit"><Maximize2 className="h-4 w-4" /></Button>
                  <Separator orientation="vertical" className="h-6 mx-1" />
                  <Button variant={showGrid ? 'secondary' : 'ghost'} size="icon" onClick={() => setShowGrid(g => !g)} title="Toggle grid"><Grid className="h-4 w-4" /></Button>
                  <Button variant={showRulers ? 'secondary' : 'ghost'} size="icon" onClick={() => setShowRulers(r => !r)} title="Toggle rulers"><LayoutGrid className="h-4 w-4" /></Button>
                  <Button variant={snapToGrid ? 'secondary' : 'ghost'} size="icon" onClick={() => setSnapToGrid(s => !s)} title="Snap to grid"><Move className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-auto bg-slate-100 p-4 rounded" style={{ maxHeight: '80vh' }}>
                {showRulers && (
                  <>
                    <div className="absolute top-4 left-12 right-4 h-6 bg-gray-200 border-b text-[10px] text-gray-600" style={{ zIndex: 5 }}>
                      {Array.from({ length: Math.ceil(PAGE_W / 50) + 1 }).map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0" style={{ left: `${i * 50 * zoom}px` }}>
                          <div className="h-2 w-px bg-gray-500" />
                          <span className="ml-0.5">{i * 50}</span>
                        </div>
                      ))}
                    </div>
                    <div className="absolute top-12 left-4 bottom-4 w-8 bg-gray-200 border-r text-[10px] text-gray-600" style={{ zIndex: 5 }}>
                      {Array.from({ length: Math.ceil(PAGE_H / 50) + 1 }).map((_, i) => (
                        <div key={i} className="absolute left-0 right-0" style={{ top: `${i * 50 * zoom}px` }}>
                          <div className="w-2 h-px bg-gray-500" />
                          <span className="ml-0.5">{i * 50}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="mx-auto" style={{ paddingLeft: showRulers ? 36 : 0, paddingTop: showRulers ? 28 : 0, width: 'fit-content' }}>
                  <div
                    ref={canvasRef}
                    className="relative bg-white shadow-lg border border-gray-300 select-none"
                    style={{
                      width: PAGE_W * zoom,
                      height: PAGE_H * zoom,
                      backgroundImage: showGrid
                        ? `repeating-linear-gradient(0deg, transparent, transparent ${gridSize * zoom - 1}px, #e5e7eb ${gridSize * zoom - 1}px, #e5e7eb ${gridSize * zoom}px),
                           repeating-linear-gradient(90deg, transparent, transparent ${gridSize * zoom - 1}px, #e5e7eb ${gridSize * zoom - 1}px, #e5e7eb ${gridSize * zoom}px)`
                        : undefined,
                    }}
                    onMouseDown={onCanvasMouseDown}
                    onMouseMove={onCanvasMouseMove}
                    onMouseUp={onCanvasMouseUp}
                    onMouseLeave={onCanvasMouseUp}
                  >
                    <img
                      src="/api/damage-check-fields/header"
                      alt="Header"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: PAGE_W * zoom,
                        height: 'auto',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                      draggable={false}
                    />
                    {fields.map(f => (
                      <FieldRender
                        key={f.id}
                        field={f}
                        zoom={zoom}
                        selected={selectedIds.includes(f.id)}
                        onMouseDown={(e) => onFieldMouseDown(e, f)}
                        diagramTemplates={diagramTemplates}
                      />
                    ))}
                    {selectionBox && (
                      <div
                        className="absolute border border-blue-500 bg-blue-200/20 pointer-events-none"
                        style={{
                          left: Math.min(selectionBox.sx, selectionBox.ex) * zoom,
                          top: Math.min(selectionBox.sy, selectionBox.ey) * zoom,
                          width: Math.abs(selectionBox.ex - selectionBox.sx) * zoom,
                          height: Math.abs(selectionBox.ey - selectionBox.sy) * zoom,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right properties */}
          <Card className="lg:col-span-3 h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {selectedField ? 'Properties' : selectedIds.length > 1 ? `${selectedIds.length} selected` : 'No selection'}
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedField ? `Type: ${selectedField.type}` : 'Click a field to edit'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedField ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{selectedField.type === 'text' ? 'Text' : 'Label'}</Label>
                    <Input value={selectedField.name} onChange={e => updateSelected({ name: e.target.value })} data-testid="input-field-name" />
                  </div>
                  {selectedField.type === 'dynamic' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Data source</Label>
                      <Select value={selectedField.source || ''} onValueChange={(v) => {
                        const opt = DYNAMIC_SOURCES.find(o => o.value === v);
                        updateSelected({ source: v, name: opt?.label || v });
                      }}>
                        <SelectTrigger data-testid="select-field-source"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DYNAMIC_SOURCES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedField.type === 'diagram' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Vehicle diagram</Label>
                      <Select
                        value={selectedField.diagramTemplateId ? String(selectedField.diagramTemplateId) : 'auto'}
                        onValueChange={(v) => updateSelected({ diagramTemplateId: v === 'auto' ? null : Number(v) })}
                      >
                        <SelectTrigger data-testid="select-diagram-template"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (match vehicle)</SelectItem>
                          {diagramTemplates.map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.make} {d.model}{d.year ? ` (${d.year})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedField.type === 'inspection' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Damage types (comma separated)</Label>
                      <Input
                        value={(selectedField.damageTypes || []).join(', ')}
                        onChange={e => updateSelected({ damageTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="Kras, Deuk, Ster"
                        data-testid="input-damage-types"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">X</Label>
                      <Input type="number" value={Math.round(selectedField.x)} onChange={e => updateSelected({ x: Number(e.target.value) })} data-testid="input-field-x" />
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Y</Label>
                      <Input type="number" value={Math.round(selectedField.y)} onChange={e => updateSelected({ y: Number(e.target.value) })} data-testid="input-field-y" />
                    </div>
                  </div>
                  {(selectedField.type === 'signature' || selectedField.type === 'line' || selectedField.type === 'box' || selectedField.type === 'diagram') && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-xs">Width</Label>
                        <Input type="number" value={selectedField.width ?? 100} onChange={e => updateSelected({ width: Number(e.target.value) })} data-testid="input-field-width" />
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Height</Label>
                        <Input type="number" value={selectedField.height ?? 20} onChange={e => updateSelected({ height: Number(e.target.value) })} data-testid="input-field-height" />
                      </div>
                    </div>
                  )}
                  {(selectedField.type === 'text' || selectedField.type === 'dynamic' || selectedField.type === 'inspection' || selectedField.type === 'checkbox') && (
                    <>
                      <div className="space-y-1"><Label className="text-xs">Font size</Label>
                        <Input type="number" value={selectedField.fontSize} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} data-testid="input-field-fontsize" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Bold</Label>
                        <Switch checked={selectedField.isBold} onCheckedChange={(c) => updateSelected({ isBold: c })} data-testid="switch-field-bold" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Text alignment</Label>
                        <div className="flex gap-1">
                          <Button size="sm" variant={selectedField.textAlign === 'left' ? 'default' : 'outline'} onClick={() => updateSelected({ textAlign: 'left' })}><AlignLeft className="h-4 w-4" /></Button>
                          <Button size="sm" variant={selectedField.textAlign === 'center' ? 'default' : 'outline'} onClick={() => updateSelected({ textAlign: 'center' })}><AlignCenter className="h-4 w-4" /></Button>
                          <Button size="sm" variant={selectedField.textAlign === 'right' ? 'default' : 'outline'} onClick={() => updateSelected({ textAlign: 'right' })}><AlignRight className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Lock</Label>
                    <Button size="sm" variant="outline" onClick={() => updateSelected({ locked: !selectedField.locked })} data-testid="button-toggle-lock">
                      {selectedField.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Separator />
                  <Button variant="destructive" className="w-full" onClick={deleteSelected} data-testid="button-delete-field"><Trash2 className="h-4 w-4 mr-2" /> Delete field</Button>
                </div>
              ) : selectedIds.length > 1 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Batch actions:</p>
                  <Button variant="outline" className="w-full" onClick={duplicateSelected}>Duplicate all (Ctrl+D)</Button>
                  <Button variant="outline" className="w-full" onClick={copySelected}>Copy (Ctrl+C)</Button>
                  <Button variant="destructive" className="w-full" onClick={deleteSelected}><Trash2 className="h-4 w-4 mr-2" /> Delete all</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Click a field on the canvas to edit its properties, or use the palette to add a new field.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <p className="mb-4">Select a template above, or create a new one to begin.</p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> New template</Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete template?"
        description="This permanently deletes the template. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// Render a single canvas field
function FieldRender({ field, zoom, selected, onMouseDown, diagramTemplates }: {
  field: CanvasField; zoom: number; selected: boolean; onMouseDown: (e: React.MouseEvent) => void;
  diagramTemplates?: DiagramTemplateSummary[];
}) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: field.x * zoom,
    top: field.y * zoom,
    cursor: field.locked ? 'not-allowed' : 'move',
    outline: selected ? '2px solid #3b82f6' : '1px dashed transparent',
    outlineOffset: 1,
    opacity: field.locked ? 0.7 : 1,
  };

  if (field.type === 'line') {
    return (
      <div onMouseDown={onMouseDown} style={{ ...baseStyle, width: (field.width ?? 100) * zoom, height: Math.max(1, (field.height ?? 1) * zoom), background: '#111' }} />
    );
  }
  if (field.type === 'box') {
    return (
      <div onMouseDown={onMouseDown} style={{ ...baseStyle, width: (field.width ?? 100) * zoom, height: (field.height ?? 50) * zoom, border: '1px solid #111', background: 'transparent' }} />
    );
  }
  if (field.type === 'signature') {
    return (
      <div onMouseDown={onMouseDown} style={{ ...baseStyle, width: (field.width ?? 200) * zoom, height: (field.height ?? 40) * zoom, borderBottom: '1px solid #111', display: 'flex', alignItems: 'flex-end', paddingBottom: 2 * zoom, fontSize: 9 * zoom, color: '#666' }}>
        {field.name || 'Signature'}
      </div>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <div onMouseDown={onMouseDown} style={{ ...baseStyle, display: 'inline-flex', alignItems: 'center', gap: 4 * zoom, padding: 2 * zoom, background: 'rgba(255,255,255,0.85)', borderRadius: 2, fontSize: field.fontSize * zoom, fontWeight: field.isBold ? 700 : 400 }}>
        <span style={{ display: 'inline-block', width: 10 * zoom, height: 10 * zoom, border: '1px solid #111' }} />
        <span>{field.name}</span>
      </div>
    );
  }
  if (field.type === 'diagram') {
    const w = (field.width ?? 400) * zoom;
    const h = (field.height ?? 220) * zoom;
    const resolvedId = field.diagramTemplateId ?? diagramTemplates?.[0]?.id ?? null;
    const imgSrc = resolvedId ? `/api/vehicle-diagram-templates/${resolvedId}/image` : null;
    return (
      <div
        onMouseDown={onMouseDown}
        style={{ ...baseStyle, width: w, height: h, border: '1px dashed #6b7280', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {imgSrc ? (
          <img src={imgSrc} alt="Vehicle diagram" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} draggable={false} />
        ) : (
          <span style={{ fontSize: 11 * zoom, color: '#6b7280' }}>Vehicle diagram (no templates uploaded)</span>
        )}
      </div>
    );
  }
  if (field.type === 'inspection') {
    return (
      <div onMouseDown={onMouseDown} style={{ ...baseStyle, padding: 2 * zoom, background: 'rgba(255,255,255,0.85)', borderRadius: 2, fontSize: field.fontSize * zoom, fontWeight: field.isBold ? 700 : 400, textAlign: field.textAlign, lineHeight: 1.3 }}>
        <div>{field.name}</div>
        <div style={{ display: 'flex', gap: 6 * zoom, marginTop: 2 * zoom, fontSize: (field.fontSize - 1) * zoom }}>
          {(field.damageTypes || []).map((d, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 * zoom }}>
              <span style={{ display: 'inline-block', width: 8 * zoom, height: 8 * zoom, border: '1px solid #111' }} />
              {d}
            </span>
          ))}
        </div>
      </div>
    );
  }
  // text / dynamic
  return (
    <div onMouseDown={onMouseDown} style={{
      ...baseStyle, padding: `${1 * zoom}px ${4 * zoom}px`, background: field.type === 'dynamic' ? 'rgba(219,234,254,0.85)' : 'rgba(255,255,255,0.85)',
      borderRadius: 2, fontSize: field.fontSize * zoom, fontWeight: field.isBold ? 700 : 400, textAlign: field.textAlign, minWidth: 40 * zoom,
    }}>
      {field.type === 'dynamic' ? `{{${field.source || 'field'}}}` : field.name}
    </div>
  );
}
