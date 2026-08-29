import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from '@tanstack/react-query';
import { getQueryFn, apiRequest, invalidateByPrefix } from '@/lib/queryClient';
import {
  Loader2, Plus, Save, Trash2, ZoomIn, ZoomOut, Grid,
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Copy, Lock, Unlock,
  Maximize2, Undo2, Redo2, LayoutGrid, Move, History,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  AlignStartHorizontal, AlignEndHorizontal, AlignCenterHorizontal,
  AlignStartVertical, AlignEndVertical, AlignCenterVertical, ChevronDown
} from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { BARCODE_LABEL_SOURCES, BarcodeLabelField, resolveBarcodeLabelSource } from "@shared/barcode";

// Same positioned-field editor as the transport report template editor, but the
// canvas is a small sticker (millimetres) instead of A4 (points): field x/y are
// stored in mm so they map 1:1 onto the print CSS in key-label-print.ts.
type TemplateField = BarcodeLabelField;

interface Template {
  id: number;
  name: string;
  isDefault: boolean;
  labelWidthMm: number;
  labelHeightMm: number;
  fields: TemplateField[];
}

interface HistoryState {
  fields: TemplateField[];
  timestamp: number;
}

interface PositionPreset {
  key: string;
  x: number;
  y: number;
}

// Editor scale: 8 screen px per mm at zoom 1 (a 62mm label is 496px wide).
const MM_TO_PX = 8;
// Font sizes are stored in points (that is what the print CSS uses), so the
// canvas has to convert them to mm before scaling to px.
const PT_TO_MM = 25.4 / 72;

const DEFAULT_LABEL_WIDTH_MM = 62;
const DEFAULT_LABEL_HEIGHT_MM = 29;
const MIN_LABEL_WIDTH_MM = 20;
const MAX_LABEL_WIDTH_MM = 210;
const MIN_LABEL_HEIGHT_MM = 10;
const MAX_LABEL_HEIGHT_MM = 297;

// Sample values drawn on the canvas so a field shows what it will print.
const SAMPLE_VEHICLE = {
  id: 123,
  barcode: "VEH-000123",
  licensePlate: "12-XT-102",
  brand: "Mercedes-Benz",
  model: "C-Klasse",
  vehicleType: "Hatchback",
  chassisNumber: "WDB12345",
  apkDate: "2027-01-15",
  company: "Auto Lease LAM",
};

// Presets are relative to the label size (unlike the A4 editor's fixed points).
const buildPresets = (widthMm: number, heightMm: number): PositionPreset[] => {
  const margin = 2;
  const midX = Math.round((widthMm / 2) * 10) / 10;
  const midY = Math.round((heightMm / 2) * 10) / 10;
  const right = Math.max(margin, widthMm - 20);
  const bottom = Math.max(margin, heightMm - 6);
  return [
    { key: 'topLeft', x: margin, y: margin },
    { key: 'topCenter', x: midX, y: margin },
    { key: 'topRight', x: right, y: margin },
    { key: 'center', x: midX, y: midY },
    { key: 'bottomLeft', x: margin, y: bottom },
    { key: 'bottomCenter', x: midX, y: bottom },
    { key: 'bottomRight', x: right, y: bottom },
  ];
};

const roundMm = (value: number): number => Math.round(value * 10) / 10;

interface BarcodeLabelTemplateEditorProps {
  onClose?: () => void;
}

const BarcodeLabelTemplateEditor = ({ onClose }: BarcodeLabelTemplateEditorProps = {}) => {
  const { t } = useTranslation(["documents", "common"]);
  const DATA_SOURCE_KEYS: string[] = [...BARCODE_LABEL_SOURCES];
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldSource, setNewFieldSource] = useState('');
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [draggedField, setDraggedField] = useState<TemplateField | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [gridSize, setGridSize] = useState<number>(2);
  const [showRulers, setShowRulers] = useState<boolean>(false);
  const [showAlignmentGuides, setShowAlignmentGuides] = useState<boolean>(true);
  const [alignmentGuides, setAlignmentGuides] = useState<{x?: number, y?: number}>({});
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedFields, setCopiedFields] = useState<TemplateField[]>([]);
  const [fieldHistory, setFieldHistory] = useState<TemplateField[]>([]);
  const [selectionBox, setSelectionBox] = useState<{start: {x: number, y: number}, end: {x: number, y: number}} | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [dragOffset, setDragOffset] = useState<{x: number, y: number} | null>(null);
  const [deleteTemplateDialogOpen, setDeleteTemplateDialogOpen] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const labelWidthMm = currentTemplate?.labelWidthMm ?? DEFAULT_LABEL_WIDTH_MM;
  const labelHeightMm = currentTemplate?.labelHeightMm ?? DEFAULT_LABEL_HEIGHT_MM;
  const canvasWidth = labelWidthMm * MM_TO_PX * zoomLevel;
  const canvasHeight = labelHeightMm * MM_TO_PX * zoomLevel;

  const { data: templateData, isLoading: isTemplateLoading } = useQuery({
    queryKey: ['/api/barcode-label-templates'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Partial<Template> & { name: string }) => {
      const method = template.id ? 'PATCH' : 'POST';
      const url = template.id ? `/api/barcode-label-templates/${template.id}` : '/api/barcode-label-templates';

      const res = await apiRequest(method, url, template);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/barcode-label-templates');
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.templateSavedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.saveTemplateFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('DELETE', `/api/barcode-label-templates/${templateId}`);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/barcode-label-templates');
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.templateDeletedDescription'),
      });
      if (currentTemplate && templates.length > 1) {
        const nextTemplate = templates.find(t => t.id !== currentTemplate.id);
        if (nextTemplate) {
          setCurrentTemplate(nextTemplate);
        }
      } else {
        setCurrentTemplate(null);
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.deleteTemplateFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (templateData) {
      const templatesArray = Array.isArray(templateData) ? templateData : [];
      const processedTemplates: Template[] = templatesArray.map((template: any) => {
        let fields = template.fields;
        // Fields may come back as a JSON string from older rows
        if (fields && typeof fields === 'string') {
          try {
            fields = JSON.parse(fields);
          } catch (e) {
            console.error('Error parsing barcode label template fields:', e);
            fields = [];
          }
        }

        return {
          ...template,
          labelWidthMm: template.labelWidthMm ?? DEFAULT_LABEL_WIDTH_MM,
          labelHeightMm: template.labelHeightMm ?? DEFAULT_LABEL_HEIGHT_MM,
          isDefault: !!template.isDefault,
          fields: Array.isArray(fields) ? fields : []
        };
      });

      setTemplates(processedTemplates);

      if (processedTemplates.length > 0) {
        if (!currentTemplate) {
          const defaultTemplate = processedTemplates.find((t: Template) => t.isDefault) || processedTemplates[0];
          setCurrentTemplate(defaultTemplate);
          // Reset history and state for new template
          setHistory([{ fields: JSON.parse(JSON.stringify(defaultTemplate.fields)), timestamp: Date.now() }]);
          setHistoryIndex(0);
          setSelectedFields([]);
          setCopiedFields([]);
          setFieldHistory([]);
        } else {
          const updatedTemplate = processedTemplates.find(t => t.id === currentTemplate.id);
          if (updatedTemplate) {
            setCurrentTemplate(updatedTemplate);
          }
        }
      }
    }
  }, [templateData]);

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y for redo
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
      // Ctrl/Cmd + C for copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedFields.length > 0) {
        e.preventDefault();
        handleCopyFields();
      }
      // Ctrl/Cmd + V for paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedFields.length > 0) {
        e.preventDefault();
        handlePasteFields();
      }
      // Ctrl/Cmd + D for duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedFields.length > 0) {
        e.preventDefault();
        handleDuplicateFields();
      }
      // Arrow keys for precise movement
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedFields.length > 0) {
        e.preventDefault();
        handleArrowKeyMove(e.key, e.shiftKey);
      }
      // Delete key
      if (e.key === 'Delete' && selectedFields.length > 0) {
        e.preventDefault();
        handleDeleteSelectedFields();
      }
      // Escape to deselect
      if (e.key === 'Escape') {
        setSelectedFields([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFields, copiedFields, history, historyIndex, currentTemplate]);

  const addToHistory = (fields: TemplateField[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ fields: JSON.parse(JSON.stringify(fields)), timestamp: Date.now() });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0 && currentTemplate) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentTemplate({
        ...currentTemplate,
        fields: JSON.parse(JSON.stringify(history[newIndex].fields))
      });
      toast({ title: t('templateEditor.toasts.undoTitle'), description: t('templateEditor.toasts.undoDescription') });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && currentTemplate) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentTemplate({
        ...currentTemplate,
        fields: JSON.parse(JSON.stringify(history[newIndex].fields))
      });
      toast({ title: t('templateEditor.toasts.redoTitle'), description: t('templateEditor.toasts.redoDescription') });
    }
  };

  const snapPosition = (value: number): number => {
    if (!snapToGrid) return roundMm(value);
    const safeGridSize = Math.max(1, gridSize); // Ensure grid size is always at least 1
    return roundMm(Math.round(value / safeGridSize) * safeGridSize);
  };

  const handleCreateTemplate = () => {
    if (!newTemplateName) {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.templateNameRequired'),
        variant: "destructive",
      });
      return;
    }

    // Starter layout: a barcode near the top and the plate underneath it, so a
    // brand-new template already prints something scannable.
    const starterFields: TemplateField[] = [
      { id: crypto.randomUUID(), name: 'Barcode', x: 4, y: 4, fontSize: 10, isBold: false, source: 'barcode', textAlign: 'center', barcodeHeightMm: 12 },
      { id: crypto.randomUUID(), name: 'Kenteken', x: 4, y: 20, fontSize: 10, isBold: true, source: 'licensePlate', textAlign: 'center' },
    ];

    saveTemplateMutation.mutate({
      name: newTemplateName,
      isDefault: templates.length === 0,
      labelWidthMm: DEFAULT_LABEL_WIDTH_MM,
      labelHeightMm: DEFAULT_LABEL_HEIGHT_MM,
      fields: starterFields,
    });
    setNewTemplateName('');
  };

  const handleAddField = () => {
    if (!currentTemplate) return;
    if (!newFieldName || !newFieldSource) {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.fieldNameSourceRequired'),
        variant: "destructive",
      });
      return;
    }

    const x = snapPosition(labelWidthMm / 2);
    const y = snapPosition(labelHeightMm / 2);

    const newField: TemplateField = {
      id: `field-${Date.now()}`,
      name: newFieldName,
      x,
      y,
      fontSize: 10,
      isBold: false,
      source: newFieldSource,
      textAlign: 'left',
      locked: false,
      ...(newFieldSource === 'barcode' ? { barcodeHeightMm: 10 } : {})
    };

    const updatedTemplate = {
      ...currentTemplate,
      fields: [...currentTemplate.fields, newField]
    };

    setCurrentTemplate(updatedTemplate);
    addToHistory(updatedTemplate.fields);
    setNewFieldName('');
    setNewFieldSource('');
    setIsAddFieldDialogOpen(false);
  };

  const handleMouseDown = (e: React.MouseEvent, field: TemplateField) => {
    if (field.locked) {
      toast({ title: t('templateEditor.toasts.fieldLockedTitle'), description: t('templateEditor.toasts.fieldLockedDescription') });
      return;
    }

    if (!isMoving || !currentTemplate || !canvasContainerRef.current) return;
    e.preventDefault();

    // Multi-select with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      if (selectedFields.includes(field.id)) {
        setSelectedFields(selectedFields.filter(id => id !== field.id));
      } else {
        setSelectedFields([...selectedFields, field.id]);
      }
    } else if (!selectedFields.includes(field.id)) {
      setSelectedFields([field.id]);
    }

    // Calculate where on the field the user clicked (in label mm)
    const containerRect = canvasContainerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - containerRect.left) / (MM_TO_PX * zoomLevel);
    const clickY = (e.clientY - containerRect.top) / (MM_TO_PX * zoomLevel);

    // Store offset from field position to click position
    setDragOffset({
      x: clickX - field.x,
      y: clickY - field.y
    });

    setDraggedField(field);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMoving || !draggedField || !currentTemplate || !canvasContainerRef.current || !dragOffset) return;

    const containerRect = canvasContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - containerRect.left;
    const rawY = e.clientY - containerRect.top;

    // Convert cursor position to label mm and subtract drag offset
    let x = Math.max(0, Math.min(rawX / (MM_TO_PX * zoomLevel) - dragOffset.x, labelWidthMm));
    let y = Math.max(0, Math.min(rawY / (MM_TO_PX * zoomLevel) - dragOffset.y, labelHeightMm));

    x = snapPosition(x);
    y = snapPosition(y);

    const deltaX = x - draggedField.x;
    const deltaY = y - draggedField.y;

    // Move all selected fields together
    const fieldsToMove = selectedFields.length > 0 ? selectedFields : [draggedField.id];
    const updatedFields = currentTemplate.fields.map(f => {
      if (fieldsToMove.includes(f.id) && !f.locked) {
        return { ...f, x: snapPosition(f.x + deltaX), y: snapPosition(f.y + deltaY) };
      }
      return f;
    });

    // Show alignment guides (works for single or multi-select)
    if (showAlignmentGuides) {
      const guides: {x?: number, y?: number} = {};
      const threshold = 1; // mm

      currentTemplate.fields.forEach(f => {
        if (!fieldsToMove.includes(f.id)) {
          if (Math.abs(f.x - x) < threshold) guides.x = f.x;
          if (Math.abs(f.y - y) < threshold) guides.y = f.y;
        }
      });

      setAlignmentGuides(guides);
    }

    setCurrentTemplate({
      ...currentTemplate,
      fields: updatedFields
    });

    if (fieldsToMove.includes(draggedField.id)) {
      setDraggedField({ ...draggedField, x, y });
    }
  };

  const handleMouseUp = () => {
    if (draggedField && currentTemplate) {
      addToHistory(currentTemplate.fields);
    }
    setDraggedField(null);
    setDragOffset(null);
    setAlignmentGuides({});
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!isMoving && canvasContainerRef.current) {
      const containerRect = canvasContainerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      setSelectionBox({ start: { x, y }, end: { x, y } });
      setIsSelecting(true);
    }
  };

  const handleCanvasMouseUp = () => {
    if (isSelecting && selectionBox && currentTemplate) {
      const scale = MM_TO_PX * zoomLevel;
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x) / scale;
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x) / scale;
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y) / scale;
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y) / scale;

      const selected = currentTemplate.fields
        .filter(f => f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY)
        .map(f => f.id);

      setSelectedFields(selected);
    }
    setIsSelecting(false);
    setSelectionBox(null);
  };

  const handleFieldClick = (field: TemplateField, e?: React.MouseEvent) => {
    if (isMoving) return;

    if (e && (e.ctrlKey || e.metaKey)) {
      if (selectedFields.includes(field.id)) {
        setSelectedFields(selectedFields.filter(id => id !== field.id));
      } else {
        setSelectedFields([...selectedFields, field.id]);
      }
    } else {
      setSelectedFields([field.id]);
    }

    // Add to field history
    if (!fieldHistory.find(f => f.id === field.id)) {
      setFieldHistory([field, ...fieldHistory.slice(0, 9)]);
    }
  };

  const handleArrowKeyMove = (key: string, shiftKey: boolean) => {
    if (!currentTemplate || selectedFields.length === 0) return;

    const step = shiftKey ? 5 : 1; // mm
    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id) && !f.locked) {
        let { x, y } = f;
        if (key === 'ArrowLeft') x -= step;
        if (key === 'ArrowRight') x += step;
        if (key === 'ArrowUp') y -= step;
        if (key === 'ArrowDown') y += step;
        x = Math.max(0, Math.min(x, labelWidthMm));
        y = Math.max(0, Math.min(y, labelHeightMm));
        return { ...f, x: snapPosition(x), y: snapPosition(y) };
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
  };

  const handleCopyFields = () => {
    if (!currentTemplate || selectedFields.length === 0) return;
    const fieldsToCopy = currentTemplate.fields.filter(f => selectedFields.includes(f.id));
    setCopiedFields(fieldsToCopy);
    toast({ title: t('templateEditor.toasts.copiedTitle'), description: t('templateEditor.toasts.copiedDescription', { count: fieldsToCopy.length }) });
  };

  // Offset a pasted/duplicated copy by 2mm, kept inside the label.
  const offsetCopy = (f: TemplateField): TemplateField => ({
    ...f,
    id: `field-${Date.now()}-${Math.random()}`,
    x: roundMm(Math.min(Math.max(labelWidthMm - 2, 0), f.x + 2)),
    y: roundMm(Math.min(Math.max(labelHeightMm - 2, 0), f.y + 2))
  });

  const handlePasteFields = () => {
    if (!currentTemplate || copiedFields.length === 0) return;

    const newFields = copiedFields.map(offsetCopy);

    const updatedTemplate = {
      ...currentTemplate,
      fields: [...currentTemplate.fields, ...newFields]
    };

    setCurrentTemplate(updatedTemplate);
    addToHistory(updatedTemplate.fields);
    setSelectedFields(newFields.map(f => f.id));
    toast({ title: t('templateEditor.toasts.pastedTitle'), description: t('templateEditor.toasts.pastedDescription', { count: newFields.length }) });
  };

  const handleDuplicateFields = () => {
    if (!currentTemplate || selectedFields.length === 0) return;

    const fieldsToDuplicate = currentTemplate.fields.filter(f => selectedFields.includes(f.id));
    const newFields = fieldsToDuplicate.map(offsetCopy);

    const updatedTemplate = {
      ...currentTemplate,
      fields: [...currentTemplate.fields, ...newFields]
    };

    setCurrentTemplate(updatedTemplate);
    addToHistory(updatedTemplate.fields);
    setSelectedFields(newFields.map(f => f.id));
    toast({ title: t('templateEditor.toasts.duplicatedTitle'), description: t('templateEditor.toasts.duplicatedDescription', { count: newFields.length }) });
  };

  const handleDeleteSelectedFields = () => {
    if (!currentTemplate || selectedFields.length === 0) return;

    const updatedFields = currentTemplate.fields.filter(f => !selectedFields.includes(f.id));
    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    setSelectedFields([]);
    toast({ title: t('templateEditor.toasts.deletedTitle'), description: t('templateEditor.toasts.deletedDescription', { count: selectedFields.length }) });
  };

  const handleAlignFields = (type: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => {
    if (!currentTemplate || selectedFields.length < 2) return;

    const fieldsToAlign = currentTemplate.fields.filter(f => selectedFields.includes(f.id));
    let referenceValue: number;

    switch (type) {
      case 'left':
        referenceValue = Math.min(...fieldsToAlign.map(f => f.x));
        break;
      case 'right':
        referenceValue = Math.max(...fieldsToAlign.map(f => f.x));
        break;
      case 'top':
        referenceValue = Math.min(...fieldsToAlign.map(f => f.y));
        break;
      case 'bottom':
        referenceValue = Math.max(...fieldsToAlign.map(f => f.y));
        break;
      case 'centerH':
        referenceValue = fieldsToAlign.reduce((sum, f) => sum + f.x, 0) / fieldsToAlign.length;
        break;
      case 'centerV':
        referenceValue = fieldsToAlign.reduce((sum, f) => sum + f.y, 0) / fieldsToAlign.length;
        break;
    }

    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id) && !f.locked) {
        if (type === 'left' || type === 'right' || type === 'centerH') {
          return { ...f, x: snapPosition(referenceValue) };
        } else {
          return { ...f, y: snapPosition(referenceValue) };
        }
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    toast({ title: t('templateEditor.toasts.alignedTitle'), description: t('templateEditor.toasts.alignedDescription', { type }) });
  };

  const handleDistribute = (direction: 'horizontal' | 'vertical') => {
    if (!currentTemplate || selectedFields.length < 3) {
      toast({ title: t('common:status.error'), description: t('templateEditor.toasts.selectAtLeast3ToDistribute') });
      return;
    }

    const fieldsToDistribute = currentTemplate.fields
      .filter(f => selectedFields.includes(f.id))
      .sort((a, b) => direction === 'horizontal' ? a.x - b.x : a.y - b.y);

    const first = fieldsToDistribute[0];
    const last = fieldsToDistribute[fieldsToDistribute.length - 1];
    const totalSpace = direction === 'horizontal' ? last.x - first.x : last.y - first.y;
    const gap = totalSpace / (fieldsToDistribute.length - 1);

    const updatedFields = currentTemplate.fields.map(f => {
      const index = fieldsToDistribute.findIndex(field => field.id === f.id);
      if (index > 0 && index < fieldsToDistribute.length - 1 && !f.locked) {
        if (direction === 'horizontal') {
          return { ...f, x: snapPosition(first.x + gap * index) };
        } else {
          return { ...f, y: snapPosition(first.y + gap * index) };
        }
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    toast({ title: t('templateEditor.toasts.distributedTitle'), description: t('templateEditor.toasts.distributedDescription', { direction }) });
  };

  const handleToggleLock = (fieldId: string) => {
    if (!currentTemplate) return;

    const updatedFields = currentTemplate.fields.map(f =>
      f.id === fieldId ? { ...f, locked: !f.locked } : f
    );

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
  };

  const handleApplyPreset = (preset: PositionPreset) => {
    if (!currentTemplate || selectedFields.length === 0) return;

    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id) && !f.locked) {
        return { ...f, x: preset.x, y: preset.y };
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    toast({ title: t('templateEditor.toasts.presetAppliedTitle'), description: t('templateEditor.toasts.presetAppliedDescription', { presetName: t(`templateEditor.presets.${preset.key}`) }) });
  };

  const handleMatchProperty = (property: 'x' | 'y' | 'fontSize') => {
    if (!currentTemplate || selectedFields.length < 2) return;

    const firstField = currentTemplate.fields.find(f => f.id === selectedFields[0]);
    if (!firstField) return;

    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id) && f.id !== selectedFields[0] && !f.locked) {
        return { ...f, [property]: firstField[property] };
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    toast({ title: t('templateEditor.toasts.matchedTitle'), description: t('templateEditor.toasts.matchedDescription', { property }) });
  };

  const handleBatchEdit = (property: 'fontSize' | 'isBold' | 'textAlign', value: any) => {
    if (!currentTemplate || selectedFields.length === 0) return;

    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id)) {
        return { ...f, [property]: value };
      }
      return f;
    });

    setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
    addToHistory(updatedFields);
    toast({ title: t('templateEditor.toasts.batchEditTitle'), description: t('templateEditor.toasts.batchEditDescription', { property, count: selectedFields.length }) });
  };

  const handleZoomToFit = () => {
    if (!canvasContainerRef.current) return;
    const parent = canvasContainerRef.current.parentElement;
    if (!parent) return;

    const containerWidth = parent.clientWidth - 32;
    const containerHeight = parent.clientHeight - 32;
    const zoomWidth = containerWidth / (labelWidthMm * MM_TO_PX);
    const zoomHeight = containerHeight / (labelHeightMm * MM_TO_PX);
    const idealZoom = Math.min(zoomWidth, zoomHeight);
    setZoomLevel(Math.max(idealZoom, 0.3)); // Only enforce minimum, no maximum
    toast({ title: t('templateEditor.toasts.zoomToFitTitle'), description: t('templateEditor.toasts.zoomToFitDescription') });
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 0.1, 3);
    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 0.1, 0.3);
    setZoomLevel(newZoom);
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  const handleLabelSizeChange = (dimension: 'labelWidthMm' | 'labelHeightMm', raw: number) => {
    if (!currentTemplate) return;
    const min = dimension === 'labelWidthMm' ? MIN_LABEL_WIDTH_MM : MIN_LABEL_HEIGHT_MM;
    const max = dimension === 'labelWidthMm' ? MAX_LABEL_WIDTH_MM : MAX_LABEL_HEIGHT_MM;
    if (!Number.isFinite(raw)) return;
    const value = Math.round(Math.max(min, Math.min(max, raw)));
    setCurrentTemplate({ ...currentTemplate, [dimension]: value });
  };

  const buildTemplatePayload = (overrides: Partial<Template> = {}) => {
    if (!currentTemplate) return null;
    return {
      id: currentTemplate.id,
      name: currentTemplate.name,
      isDefault: currentTemplate.isDefault,
      labelWidthMm: currentTemplate.labelWidthMm,
      labelHeightMm: currentTemplate.labelHeightMm,
      ...overrides,
      fields: currentTemplate.fields.map(field => ({
        id: field.id,
        name: field.name,
        x: field.x,
        y: field.y,
        fontSize: field.fontSize,
        isBold: field.isBold,
        source: field.source,
        textAlign: field.textAlign,
        locked: field.locked || false,
        ...(field.source === 'barcode' ? { barcodeHeightMm: field.barcodeHeightMm ?? 10 } : {})
      }))
    };
  };

  const handleSaveTemplate = () => {
    const payload = buildTemplatePayload();
    if (payload) saveTemplateMutation.mutate(payload);
  };

  const handleDeleteTemplate = () => {
    if (!currentTemplate || !currentTemplate.id) return;
    setDeleteTemplateDialogOpen(true);
  };

  const confirmDeleteTemplate = () => {
    if (!currentTemplate || !currentTemplate.id) return;
    deleteTemplateMutation.mutate(currentTemplate.id);
  };

  const handleSetDefaultTemplate = () => {
    const payload = buildTemplatePayload({ isDefault: true });
    if (payload) saveTemplateMutation.mutate(payload);
  };

  const selectedField = selectedFields.length === 1
    ? currentTemplate?.fields.find(f => f.id === selectedFields[0])
    : null;

  // What a field will print, using the sample vehicle above.
  const sampleTextFor = (field: TemplateField): string =>
    resolveBarcodeLabelSource(field.source, SAMPLE_VEHICLE, field.name) || field.name;

  const backButtonLabel = t('barcodeLabelEditor.backToDocuments');

  if (isTemplateLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center mb-6">
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backButtonLabel}
            </Button>
          ) : (
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {backButtonLabel}
              </Button>
            </Link>
          )}
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('templateEditor.createFirstTemplateTitle')}</CardTitle>
            <CardDescription>
              {t('barcodeLabelEditor.createFirstTemplateDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-name">{t('templateEditor.templateNameLabel')}</Label>
                <Input
                  id="template-name"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder={t('barcodeLabelEditor.templateNamePlaceholder')}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleCreateTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {t('templateEditor.createTemplateButton')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backButtonLabel}
            </Button>
          ) : (
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {backButtonLabel}
              </Button>
            </Link>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <kbd className="px-2 py-1 rounded bg-muted">Ctrl+Z</kbd> {t('templateEditor.shortcutUndo')}
            <kbd className="px-2 py-1 rounded bg-muted">Ctrl+Y</kbd> {t('templateEditor.shortcutRedo')}
            <kbd className="px-2 py-1 rounded bg-muted">Ctrl+C/V</kbd> {t('templateEditor.shortcutCopyPaste')}
            <kbd className="px-2 py-1 rounded bg-muted">Ctrl+D</kbd> {t('templateEditor.shortcutDuplicate')}
            <kbd className="px-2 py-1 rounded bg-muted">↑←↓→</kbd> {t('templateEditor.shortcutMove')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{t('templateEditor.templateSelectionTitle')}</CardTitle>
                <CardDescription>{t('templateEditor.templateSelectionDescription')}</CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button onClick={() => handleUndo()} disabled={historyIndex <= 0} variant="outline" size="sm" title={t('templateEditor.undoTitleAttr')}>
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button onClick={() => handleRedo()} disabled={historyIndex >= history.length - 1} variant="outline" size="sm" title={t('templateEditor.redoTitleAttr')}>
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={handleDeleteTemplate} disabled={saveTemplateMutation.isPending || deleteTemplateMutation.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('templateEditor.deleteButton')}
                </Button>
                <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending} data-testid="button-save-barcode-label-template">
                  {saveTemplateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t('templateEditor.saveButton')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-4">
                <Label>{t('templateEditor.selectTemplateLabel')}</Label>
                <Select
                  value={currentTemplate?.id.toString() || ''}
                  onValueChange={(value) => {
                    const template = templates.find(t => t.id.toString() === value);
                    if (template) {
                      setCurrentTemplate(template);
                      // Reset all state when switching templates
                      setHistory([{ fields: JSON.parse(JSON.stringify(template.fields)), timestamp: Date.now() }]);
                      setHistoryIndex(0);
                      setSelectedFields([]);
                      setCopiedFields([]);
                      setFieldHistory([]);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-barcode-label-template">
                    <SelectValue placeholder={t('templateEditor.selectTemplatePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} {template.isDefault ? t('templateEditor.defaultSuffix') : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4">
                <Label>{t('barcodeLabelEditor.labelSizeLabel')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t('barcodeLabelEditor.labelWidthLabel')}</Label>
                    <Input
                      type="number"
                      min={MIN_LABEL_WIDTH_MM}
                      max={MAX_LABEL_WIDTH_MM}
                      value={labelWidthMm}
                      onChange={(e) => handleLabelSizeChange('labelWidthMm', Number(e.target.value))}
                      data-testid="input-label-width-mm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('barcodeLabelEditor.labelHeightLabel')}</Label>
                    <Input
                      type="number"
                      min={MIN_LABEL_HEIGHT_MM}
                      max={MAX_LABEL_HEIGHT_MM}
                      value={labelHeightMm}
                      onChange={(e) => handleLabelSizeChange('labelHeightMm', Number(e.target.value))}
                      data-testid="input-label-height-mm"
                    />
                  </div>
                </div>
              </div>
              {currentTemplate && !currentTemplate.isDefault && (
                <div className="space-y-4">
                  <Label>{t('templateEditor.setAsDefaultLabel')}</Label>
                  <Button variant="outline" onClick={handleSetDefaultTemplate} className="w-full">
                    {t('templateEditor.makeDefaultButton')}
                  </Button>
                </div>
              )}
              <div className="space-y-4">
                <Label>{t('templateEditor.moveModeLabel')}</Label>
                <div className="flex items-center space-x-2">
                  <Switch checked={isMoving} onCheckedChange={setIsMoving} id="move-mode" />
                  <Label htmlFor="move-mode">
                    {isMoving ? t('templateEditor.moveModeActive') : t('templateEditor.moveModeInactive')}
                  </Label>
                </div>
              </div>
              <div className="space-y-4">
                <Label>{t('templateEditor.snapToGridLabel', { size: gridSize })}</Label>
                <div className="flex items-center space-x-2">
                  <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} id="snap-grid" />
                  <Input type="number" value={gridSize} onChange={(e) => {
                    const value = Number(e.target.value);
                    setGridSize(value < 1 ? 1 : value > 20 ? 20 : value);
                  }} className="w-20" min="1" max="20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {currentTemplate && (
          <div className="space-y-6">
            {/* Template Editor and Field Properties - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>{t('templateEditor.templateEditorTitle')}</CardTitle>
                      <CardDescription>
                        {selectedFields.length > 0
                          ? t('templateEditor.fieldsSelected', { count: selectedFields.length })
                          : t('templateEditor.clickFieldsHint')}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex gap-1 rounded-md border border-input p-1">
                        <Button variant="ghost" size="icon" onClick={handleZoomOut} title={t('templateEditor.zoomOutTitle')}>
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleResetZoom} title={t('templateEditor.resetZoomTitle')}>
                          <span className="text-xs font-mono">{Math.round(zoomLevel * 100)}%</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleZoomIn} title={t('templateEditor.zoomInTitle')}>
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleZoomToFit} title={t('templateEditor.zoomToFitTitle')}>
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button variant="outline" size="icon" onClick={() => setShowGrid(!showGrid)} className={showGrid ? "bg-slate-100" : ""} title={t('templateEditor.toggleGridTitle')}>
                        <Grid className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setShowRulers(!showRulers)} className={showRulers ? "bg-slate-100" : ""} title={t('templateEditor.toggleRulersTitle')}>
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setShowAlignmentGuides(!showAlignmentGuides)} className={showAlignmentGuides ? "bg-slate-100" : ""} title={t('templateEditor.toggleAlignmentGuidesTitle')}>
                        <Move className="h-4 w-4" />
                      </Button>

                      {selectedFields.length > 0 && (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <AlignCenter className="h-4 w-4 mr-1" />
                                {t('templateEditor.alignButton')}
                                <ChevronDown className="h-3 w-3 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel>{t('templateEditor.alignFieldsLabel')}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleAlignFields('left')}>
                                <AlignStartHorizontal className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignLeft')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAlignFields('centerH')}>
                                <AlignCenterHorizontal className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignCenterH')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAlignFields('right')}>
                                <AlignEndHorizontal className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignRight')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleAlignFields('top')}>
                                <AlignStartVertical className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignTop')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAlignFields('centerV')}>
                                <AlignCenterVertical className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignCenterV')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAlignFields('bottom')}>
                                <AlignEndVertical className="h-4 w-4 mr-2" />
                                {t('templateEditor.alignBottom')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {selectedFields.length >= 3 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  {t('templateEditor.distributeButton')}
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleDistribute('horizontal')}>
                                  <AlignHorizontalDistributeCenter className="h-4 w-4 mr-2" />
                                  {t('templateEditor.distributeHorizontally')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDistribute('vertical')}>
                                  <AlignVerticalDistributeCenter className="h-4 w-4 mr-2" />
                                  {t('templateEditor.distributeVertically')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          <Button variant="outline" size="sm" onClick={handleDuplicateFields} title={t('templateEditor.duplicateTitleAttr')}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      <Dialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="default" data-testid="button-add-barcode-label-field">
                            <Plus className="mr-2 h-4 w-4" />
                            {t('templateEditor.addFieldButton')}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t('templateEditor.addNewFieldTitle')}</DialogTitle>
                            <DialogDescription>
                              {t('templateEditor.addNewFieldDescription')}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <div>
                              <Label htmlFor="field-name">{t('templateEditor.fieldNameLabel')}</Label>
                              <Input
                                id="field-name"
                                value={newFieldName}
                                onChange={(e) => setNewFieldName(e.target.value)}
                                placeholder={t('templateEditor.fieldNamePlaceholder')}
                              />
                            </div>
                            <div>
                              <Label htmlFor="field-source">{t('templateEditor.dataSourceLabel')}</Label>
                              <Select value={newFieldSource} onValueChange={setNewFieldSource}>
                                <SelectTrigger id="field-source">
                                  <SelectValue placeholder={t('templateEditor.dataSourcePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {DATA_SOURCE_KEYS.map((key) => (
                                    <SelectItem key={key} value={key}>
                                      {t(`barcodeLabelEditor.sources.${key}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddFieldDialogOpen(false)}>
                              {t('templateEditor.cancelButton')}
                            </Button>
                            <Button onClick={handleAddField}>{t('templateEditor.addFieldButton')}</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative">
                    {showRulers && (
                      <>
                        <div className="absolute top-0 left-8 right-0 h-8 bg-gray-100 border-b flex items-end text-xs text-gray-600" style={{ zIndex: 10 }}>
                          {Array.from({ length: Math.ceil(labelWidthMm / 5) + 1 }).map((_, i) => (
                            <div key={i} className="absolute" style={{ left: `${i * 5 * MM_TO_PX * zoomLevel + 32}px` }}>
                              <div className="h-2 w-px bg-gray-400" />
                              <span className="ml-1">{i * 5}</span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute top-8 left-0 bottom-0 w-8 bg-gray-100 border-r flex flex-col text-xs text-gray-600" style={{ zIndex: 10 }}>
                          {Array.from({ length: Math.ceil(labelHeightMm / 5) + 1 }).map((_, i) => (
                            <div key={i} className="absolute" style={{ top: `${i * 5 * MM_TO_PX * zoomLevel + 32}px` }}>
                              <div className="w-2 h-px bg-gray-400" />
                              <span className="ml-0.5">{i * 5}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div
                      className="relative overflow-auto"
                      style={{
                        maxHeight: '80vh',
                        paddingLeft: showRulers ? '32px' : '16px',
                        paddingTop: showRulers ? '32px' : '16px',
                        paddingRight: '16px',
                        paddingBottom: '16px'
                      }}
                      onMouseMove={(e) => {
                        if (isSelecting && selectionBox && canvasContainerRef.current) {
                          const containerRect = canvasContainerRef.current.getBoundingClientRect();
                          setSelectionBox({
                            ...selectionBox,
                            end: { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top }
                          });
                        }
                      }}
                    >
                      <div
                        ref={canvasContainerRef}
                        className={`relative border border-gray-300 shadow-lg bg-white ${showGrid ? 'bg-grid' : ''}`}
                        style={{
                          width: `${canvasWidth}px`,
                          height: `${canvasHeight}px`,
                          margin: '0 auto',
                          backgroundColor: '#ffffff',
                          backgroundImage: showGrid
                            ? `repeating-linear-gradient(0deg, transparent, transparent ${gridSize * MM_TO_PX * zoomLevel - 1}px, #e5e7eb ${gridSize * MM_TO_PX * zoomLevel - 1}px, #e5e7eb ${gridSize * MM_TO_PX * zoomLevel}px),
                               repeating-linear-gradient(90deg, transparent, transparent ${gridSize * MM_TO_PX * zoomLevel - 1}px, #e5e7eb ${gridSize * MM_TO_PX * zoomLevel - 1}px, #e5e7eb ${gridSize * MM_TO_PX * zoomLevel}px)`
                            : 'none',
                          backgroundPosition: 'top left',
                          backgroundRepeat: showGrid ? 'repeat, repeat' : 'no-repeat',
                        }}
                        onMouseMove={handleMouseMove}
                        onMouseUp={() => { handleMouseUp(); handleCanvasMouseUp(); }}
                        onMouseLeave={() => { handleMouseUp(); handleCanvasMouseUp(); }}
                        onMouseDown={handleCanvasMouseDown}
                        data-testid="barcode-label-canvas"
                      >
                        {alignmentGuides.x !== undefined && (
                          <div className="absolute top-0 bottom-0 w-px bg-blue-500" style={{ left: `${alignmentGuides.x * MM_TO_PX * zoomLevel}px` }} />
                        )}
                        {alignmentGuides.y !== undefined && (
                          <div className="absolute left-0 right-0 h-px bg-blue-500" style={{ top: `${alignmentGuides.y * MM_TO_PX * zoomLevel}px` }} />
                        )}

                        {currentTemplate.fields.map(field => {
                          const barcodeHeightPx = (field.barcodeHeightMm ?? 10) * MM_TO_PX * zoomLevel;
                          return (
                            <div
                              key={field.id}
                              className={`absolute cursor-pointer rounded transition-all ${
                                selectedFields.includes(field.id) ? 'ring-2 ring-blue-500' : ''
                              } ${isMoving && !field.locked ? 'cursor-move' : ''} ${field.locked ? 'opacity-60' : ''}`}
                              style={{
                                left: `${field.x * MM_TO_PX * zoomLevel}px`,
                                top: `${field.y * MM_TO_PX * zoomLevel}px`,
                                fontSize: field.source === 'barcode' ? undefined : `${field.fontSize * PT_TO_MM * MM_TO_PX * zoomLevel}px`,
                                fontWeight: field.isBold ? 'bold' : 'normal',
                                backgroundColor: selectedFields.includes(field.id) ? 'rgba(219, 234, 254, 0.8)' : 'transparent',
                                color: '#000000',
                                textAlign: field.textAlign,
                                whiteSpace: 'nowrap',
                                lineHeight: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                              }}
                              onClick={(e) => handleFieldClick(field, e)}
                              onMouseDown={(e) => handleMouseDown(e, field)}
                            >
                              {field.locked && <Lock className="h-3 w-3" />}
                              {field.source === 'barcode' ? (
                                <div style={{ height: barcodeHeightPx }} className="pointer-events-none">
                                  <BarcodeSvg
                                    value={SAMPLE_VEHICLE.barcode}
                                    height={barcodeHeightPx}
                                    className="h-full w-auto"
                                  />
                                </div>
                              ) : (
                                sampleTextFor(field)
                              )}
                            </div>
                          );
                        })}

                        {selectionBox && (
                          <div
                            className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20 pointer-events-none"
                            style={{
                              left: `${Math.min(selectionBox.start.x, selectionBox.end.x)}px`,
                              top: `${Math.min(selectionBox.start.y, selectionBox.end.y)}px`,
                              width: `${Math.abs(selectionBox.end.x - selectionBox.start.x)}px`,
                              height: `${Math.abs(selectionBox.end.y - selectionBox.start.y)}px`
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                </Card>
              </div>

              {/* Field Properties - Sidebar */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedFields.length === 0 ? t('templateEditor.noSelectionTitle') :
                       selectedFields.length === 1 ? t('templateEditor.fieldPropertiesTitle') :
                       t('templateEditor.batchEditTitleWithCount', { count: selectedFields.length })}
                    </CardTitle>
                    <CardDescription>
                      {selectedFields.length === 0 ? t('templateEditor.selectFieldsToEdit') :
                       selectedFields.length === 1 ? t('templateEditor.editSelectedField') :
                       t('templateEditor.editMultipleFieldsTogether')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedField ? (
                    <div className="space-y-4">
                      <div>
                        <Label>{t('templateEditor.fieldNameLabel')}</Label>
                        <Input
                          value={selectedField.name}
                          onChange={(e) => {
                            if (!currentTemplate) return;
                            const updatedFields = currentTemplate.fields.map(f =>
                              f.id === selectedField.id ? { ...f, name: e.target.value } : f
                            );
                            setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                          }}
                        />
                      </div>
                      <div>
                        <Label>{t('templateEditor.dataSourceLabel')}</Label>
                        <Select
                          value={selectedField.source}
                          onValueChange={(value) => {
                            if (!currentTemplate) return;
                            const updatedFields = currentTemplate.fields.map(f =>
                              f.id === selectedField.id
                                ? { ...f, source: value, ...(value === 'barcode' && f.barcodeHeightMm === undefined ? { barcodeHeightMm: 10 } : {}) }
                                : f
                            );
                            setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DATA_SOURCE_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>
                                {t(`barcodeLabelEditor.sources.${key}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t('barcodeLabelEditor.xPositionMmLabel')}</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={selectedField.x}
                            onChange={(e) => {
                              if (!currentTemplate) return;
                              const x = Number(e.target.value);
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, x } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t('barcodeLabelEditor.yPositionMmLabel')}</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={selectedField.y}
                            onChange={(e) => {
                              if (!currentTemplate) return;
                              const y = Number(e.target.value);
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, y } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          />
                        </div>
                      </div>
                      {selectedField.source === 'barcode' ? (
                        <div>
                          <Label>{t('barcodeLabelEditor.barcodeHeightLabel')}</Label>
                          <Input
                            type="number"
                            min={3}
                            max={100}
                            value={selectedField.barcodeHeightMm ?? 10}
                            onChange={(e) => {
                              if (!currentTemplate) return;
                              const barcodeHeightMm = Number(e.target.value);
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, barcodeHeightMm } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                            data-testid="input-barcode-height-mm"
                          />
                        </div>
                      ) : (
                        <div>
                          <Label>{t('templateEditor.fontSizeLabel')}</Label>
                          <Input
                            type="number"
                            value={selectedField.fontSize}
                            onChange={(e) => {
                              if (!currentTemplate) return;
                              const fontSize = Number(e.target.value);
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, fontSize } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <Label>{t('templateEditor.boldTextLabel')}</Label>
                        <Switch
                          checked={selectedField.isBold}
                          onCheckedChange={(checked) => {
                            if (!currentTemplate) return;
                            const updatedFields = currentTemplate.fields.map(f =>
                              f.id === selectedField.id ? { ...f, isBold: checked } : f
                            );
                            setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                          }}
                        />
                      </div>
                      <div>
                        <Label>{t('templateEditor.textAlignmentLabel')}</Label>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant={selectedField.textAlign === 'left' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              if (!currentTemplate) return;
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, textAlign: 'left' as const } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          >
                            <AlignLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={selectedField.textAlign === 'center' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              if (!currentTemplate) return;
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, textAlign: 'center' as const } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          >
                            <AlignCenter className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={selectedField.textAlign === 'right' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              if (!currentTemplate) return;
                              const updatedFields = currentTemplate.fields.map(f =>
                                f.id === selectedField.id ? { ...f, textAlign: 'right' as const } : f
                              );
                              setCurrentTemplate({ ...currentTemplate, fields: updatedFields });
                            }}
                          >
                            <AlignRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>{t('templateEditor.lockFieldLabel')}</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleLock(selectedField.id)}
                        >
                          {selectedField.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Separator />
                      <Button
                        variant="destructive"
                        onClick={handleDeleteSelectedFields}
                        className="w-full"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('templateEditor.deleteFieldButton')}
                      </Button>
                    </div>
                  ) : selectedFields.length > 1 ? (
                    <div className="space-y-4">
                      <div>
                        <Label>{t('templateEditor.batchFontSizeLabel')}</Label>
                        <Input
                          type="number"
                          placeholder={t('templateEditor.fontSizePlaceholder')}
                          onBlur={(e) => {
                            const value = Number(e.target.value);
                            if (value > 0) handleBatchEdit('fontSize', value);
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>{t('templateEditor.batchBoldLabel')}</Label>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleBatchEdit('isBold', true)}>
                            {t('templateEditor.onLabel')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleBatchEdit('isBold', false)}>
                            {t('templateEditor.offLabel')}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label>{t('templateEditor.batchAlignmentLabel')}</Label>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => handleBatchEdit('textAlign', 'left')}>
                            <AlignLeft className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleBatchEdit('textAlign', 'center')}>
                            <AlignCenter className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleBatchEdit('textAlign', 'right')}>
                            <AlignRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <Label>{t('templateEditor.matchPropertyLabel')}</Label>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => handleMatchProperty('x')}>{t('templateEditor.matchX')}</Button>
                          <Button size="sm" variant="outline" onClick={() => handleMatchProperty('y')}>{t('templateEditor.matchY')}</Button>
                          <Button size="sm" variant="outline" onClick={() => handleMatchProperty('fontSize')}>{t('templateEditor.matchSize')}</Button>
                        </div>
                      </div>
                      <Separator />
                      <Button
                        variant="destructive"
                        onClick={handleDeleteSelectedFields}
                        className="w-full"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('templateEditor.deleteAllSelectedButton')}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {t('templateEditor.selectFieldsPrompt')}
                    </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 2-Column Grid: Position Presets | Field History */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Position Presets */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('templateEditor.positionPresetsTitle')}</CardTitle>
                  <CardDescription>{t('templateEditor.positionPresetsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {buildPresets(labelWidthMm, labelHeightMm).map((preset) => (
                      <Button
                        key={preset.key}
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyPreset(preset)}
                        disabled={selectedFields.length === 0}
                      >
                        {t(`templateEditor.presets.${preset.key}`)}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Field History */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    {t('templateEditor.fieldHistoryTitle')}
                  </CardTitle>
                  <CardDescription>{t('templateEditor.fieldHistoryDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {fieldHistory.length > 0 ? (
                    <div className="space-y-2">
                      {fieldHistory.slice(0, 5).map((field) => (
                        <Button
                          key={field.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleFieldClick(field)}
                        >
                          {field.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {t('templateEditor.noRecentEdits')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Delete Template Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTemplateDialogOpen}
        onOpenChange={setDeleteTemplateDialogOpen}
        title={t('templateEditor.deleteTemplateDialogTitle')}
        description={t('templateEditor.deleteTemplateDialogDescription')}
        confirmLabel={t('templateEditor.deleteButton')}
        variant="danger"
        onConfirm={confirmDeleteTemplate}
      />
    </div>
  );
};

export default BarcodeLabelTemplateEditor;
