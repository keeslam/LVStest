import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from '@tanstack/react-query';
import { getQueryFn, apiRequest, queryClient, invalidateByPrefix } from '@/lib/queryClient';
import { 
  Loader2, Plus, Save, Trash2, FileText, ZoomIn, ZoomOut, Grid, 
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Copy, Lock, Unlock,
  Maximize2, Undo2, Redo2, LayoutGrid, Move, History, Settings,
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

interface TemplateField {
  id: string;
  name: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
  source: string;
  textAlign: 'left' | 'center' | 'right';
  locked?: boolean;
}

interface Template {
  id: number;
  name: string;
  isDefault: boolean;
  backgroundPath?: string | null;
  backgroundPreviewPath?: string | null; // PNG preview for PDF backgrounds
  fields: TemplateField[];
}

interface TemplateBackground {
  id: number;
  templateId: number;
  name: string;
  backgroundPath: string;
  previewPath: string;
  createdAt: string;
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

const DEFAULT_PRESETS: PositionPreset[] = [
  { key: 'topLeft', x: 100, y: 100 },
  { key: 'topCenter', x: 297.5, y: 100 },
  { key: 'topRight', x: 495, y: 100 },
  { key: 'center', x: 297.5, y: 421 },
  { key: 'bottomLeft', x: 100, y: 742 },
  { key: 'bottomCenter', x: 297.5, y: 742 },
  { key: 'bottomRight', x: 495, y: 742 },
];

interface TransportReportTemplateEditorProps {
  onClose?: () => void;
}

const TransportReportTemplateEditor = ({ onClose }: TransportReportTemplateEditorProps = {}) => {
  const { t } = useTranslation(["documents", "common"]);
  const DATA_SOURCE_KEYS: string[] = [
    'lblVoertuig', 'lblKenteken', 'lblType', 'lblStatus', 'lblDatum', 'lblVoltooid', 'lblVan', 'lblNaar',
    'lblAfstand', 'lblTolkosten', 'lblChauffeur', 'lblReden', 'lblNotities', 'lblKlant', 'lblFactureerbaar',
    'lblBedrag', 'lblGegenereerd',
    'vehicleBrand', 'vehicleModel', 'vehicleFull', 'licensePlate', 'transportType', 'status',
    'scheduledDate', 'completedDate', 'originAddress', 'originCity', 'originFull',
    'destinationAddress', 'destinationCity', 'destinationFull', 'distanceKm', 'tollCost',
    'driverName', 'reason', 'notes', 'customerName', 'billable', 'billableAmount', 'generatedDate',
  ];
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldSource, setNewFieldSource] = useState('');
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<TemplateField | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [gridSize, setGridSize] = useState<number>(10);
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
  const [isBackgroundLibraryOpen, setIsBackgroundLibraryOpen] = useState(false);
  const [backgroundName, setBackgroundName] = useState('');
  const [deleteTemplateDialogOpen, setDeleteTemplateDialogOpen] = useState(false);
  const [deleteBackgroundDialogOpen, setDeleteBackgroundDialogOpen] = useState(false);
  const [backgroundToDelete, setBackgroundToDelete] = useState<TemplateBackground | null>(null);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: templateData, isLoading: isTemplateLoading } = useQuery({
    queryKey: ['/api/transport-report-templates'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Template) => {
      const method = template.id ? 'PATCH' : 'POST';
      const url = template.id ? `/api/transport-report-templates/${template.id}` : '/api/transport-report-templates';
      
      const dataToSend = {
        ...template,
        fields: typeof template.fields === 'string' 
          ? template.fields 
          : JSON.stringify(template.fields)
      };
      
      const res = await apiRequest(method, url, dataToSend);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/transport-report-templates');
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.templateSavedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: `Failed to save template: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('DELETE', `/api/transport-report-templates/${templateId}`);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/transport-report-templates');
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

  const uploadBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, file }: { templateId: number, file: File }) => {
      const formData = new FormData();
      formData.append('background', file);
      const res = await fetch(`/api/transport-report-templates/${templateId}/background`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Upload failed');
      }
      const data = await res.json();
      return data;
    },
    onSuccess: async (updatedTemplate) => {
      // Force refetch to ensure we get fresh data (no 304 cache)
      await invalidateByPrefix('/api/transport-report-templates');
      
      // Update current template to show the new background immediately
      if (currentTemplate && updatedTemplate.id === currentTemplate.id) {
        setCurrentTemplate(updatedTemplate);
      }
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.backgroundUploadedDescription'),
      });
    },
    onError: (error: Error) => {
      console.error('Background upload error:', error);
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.uploadBackgroundFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const removeBackgroundMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('DELETE', `/api/transport-report-templates/${templateId}/background`);
      return await res.json();
    },
    onSuccess: async (updatedTemplate) => {
      // Force refetch to ensure we get fresh data (no 304 cache)
      await invalidateByPrefix('/api/transport-report-templates');
      
      // Update current template to remove the background immediately
      if (currentTemplate && updatedTemplate.id === currentTemplate.id) {
        setCurrentTemplate(updatedTemplate);
      }
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.backgroundRemovedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.removeBackgroundFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  // Background Library query and mutations - GLOBAL shared library across all templates
  const { data: backgroundLibrary = [], refetch: refetchBackgrounds } = useQuery<TemplateBackground[]>({
    queryKey: ['/api/transport-report-templates/backgrounds/all'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: isBackgroundLibraryOpen,
  });

  const addBackgroundToLibraryMutation = useMutation({
    mutationFn: async ({ templateId, file, name }: { templateId: number, file: File, name: string }) => {
      const formData = new FormData();
      formData.append('background', file);
      formData.append('name', name);
      const res = await fetch(`/api/transport-report-templates/${templateId}/backgrounds`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Upload failed');
      }
      return await res.json();
    },
    onSuccess: async () => {
      await refetchBackgrounds();
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.backgroundAddedDescription'),
      });
      setBackgroundName('');
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.addBackgroundFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const selectBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, backgroundId }: { templateId: number, backgroundId: number }) => {
      const res = await apiRequest('POST', `/api/transport-report-templates/${templateId}/backgrounds/${backgroundId}/select`);
      return await res.json();
    },
    onSuccess: async (updatedTemplate) => {
      // Convert snake_case fields to camelCase for immediate display
      const convertedTemplate = { ...updatedTemplate };
      if (updatedTemplate.background_path) {
        convertedTemplate.backgroundPath = updatedTemplate.background_path;
      }
      if (updatedTemplate.background_preview_path) {
        convertedTemplate.backgroundPreviewPath = updatedTemplate.background_preview_path;
      }
      if (updatedTemplate.template_preview_path) {
        convertedTemplate.templatePreviewPath = updatedTemplate.template_preview_path;
      }
      if (updatedTemplate.is_default !== undefined) {
        convertedTemplate.isDefault = updatedTemplate.is_default;
      }
      if (updatedTemplate.fields && typeof updatedTemplate.fields === 'string') {
        try {
          convertedTemplate.fields = JSON.parse(updatedTemplate.fields);
        } catch (e) {
          convertedTemplate.fields = [];
        }
      }
      
      // Immediately update the current template with the new background info
      if (currentTemplate && parseInt(convertedTemplate.id) === currentTemplate.id) {
        setCurrentTemplate(convertedTemplate);
      }
      
      // Update the templates list so switching templates preserves the background
      const updatedTemplates = templates.map(t => 
        t.id === parseInt(convertedTemplate.id) ? convertedTemplate : t
      );
      setTemplates(updatedTemplates);
      
      // Then refetch to ensure everything is in sync
      await invalidateByPrefix('/api/transport-report-templates');
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.backgroundSelectedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.selectBackgroundFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const deleteBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, backgroundId }: { templateId: number, backgroundId: number }) => {
      const res = await apiRequest('DELETE', `/api/transport-report-templates/${templateId}/backgrounds/${backgroundId}`);
      return await res.json();
    },
    onSuccess: async () => {
      await refetchBackgrounds();
      toast({
        title: t('common:status.success'),
        description: t('templateEditor.toasts.backgroundDeletedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.deleteBackgroundFailed', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const generatePreviewMutation = useMutation({
    mutationFn: async ({ templateId }: { templateId: number }) => {
      const res = await apiRequest('GET', `/api/transport-report-templates/${templateId}/preview`);
      return await res.blob();
    },
    onSuccess: (data) => {
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }
      const url = URL.createObjectURL(data);
      setPreviewPdfUrl(url);
      toast({
        title: t('templateEditor.toasts.previewGeneratedTitle'),
        description: t('templateEditor.toasts.previewGeneratedDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.generatePreviewFailed', { message: error.message }),
        variant: "destructive",
      });
      setPreviewPdfUrl(null);
    }
  });

  useEffect(() => {
    if (templateData) {
      const templatesArray = Array.isArray(templateData) ? templateData : [];
      const processedTemplates = templatesArray.map((template: any) => {
        let processed = template;
        
        // Convert snake_case fields to camelCase (API returns snake_case)
        if (template.background_path) {
          processed = { ...processed, backgroundPath: template.background_path };
        }
        if (template.background_preview_path) {
          processed = { ...processed, backgroundPreviewPath: template.background_preview_path };
        }
        if (template.template_preview_path) {
          processed = { ...processed, templatePreviewPath: template.template_preview_path };
        }
        if (template.is_default !== undefined) {
          processed = { ...processed, isDefault: template.is_default };
        }
        
        // Parse fields if they're a string
        if (processed.fields && typeof processed.fields === 'string') {
          try {
            processed = { ...processed, fields: JSON.parse(processed.fields) };
          } catch (e) {
            console.error('Error parsing template fields:', e);
          }
        }
        
        return {
          ...processed,
          fields: Array.isArray(processed.fields) ? processed.fields : []
        };
      });
      
      console.log('📋 Loaded templates from API:', processedTemplates.map(t => ({ id: t.id, name: t.name, backgroundPath: t.backgroundPath, backgroundPreviewPath: t.backgroundPreviewPath })));
      
      setTemplates(processedTemplates);
      
      // CRITICAL FIX: Always update currentTemplate with fresh data from API
      // This ensures background path updates are reflected immediately
      if (processedTemplates.length > 0) {
        if (!currentTemplate) {
          // First load - set the default template
          const defaultTemplate = processedTemplates.find((t: Template) => t.isDefault) || processedTemplates[0];
          console.log('🎯 Setting current template to:', { id: defaultTemplate.id, name: defaultTemplate.name, backgroundPath: defaultTemplate.backgroundPath, backgroundPreviewPath: defaultTemplate.backgroundPreviewPath });
          setCurrentTemplate(defaultTemplate);
          // Reset history and state for new template
          setHistory([{ fields: JSON.parse(JSON.stringify(defaultTemplate.fields)), timestamp: Date.now() }]);
          setHistoryIndex(0);
          setSelectedFields([]);
          setCopiedFields([]);
          setFieldHistory([]);
        } else {
          // Template already selected - update it with fresh data from API (including background path!)
          const updatedTemplate = processedTemplates.find(t => t.id === currentTemplate.id);
          if (updatedTemplate) {
            console.log('🔄 Updating current template with fresh data:', { id: updatedTemplate.id, backgroundPath: updatedTemplate.backgroundPath, backgroundPreviewPath: updatedTemplate.backgroundPreviewPath });
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
    if (!snapToGrid) return value;
    const safeGridSize = Math.max(1, gridSize); // Ensure grid size is always at least 1
    return Math.round(value / safeGridSize) * safeGridSize;
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

    const newTemplate: Template = {
      id: 0,
      name: newTemplateName,
      isDefault: templates.length === 0,
      fields: []
    };

    saveTemplateMutation.mutate(newTemplate);
    setNewTemplateName('');
    setIsCreateDialogOpen(false);
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

    const x = snapPosition(595 / 2);
    const y = snapPosition(842 / 2);

    const newField: TemplateField = {
      id: `field-${Date.now()}`,
      name: newFieldName,
      x,
      y,
      fontSize: 12,
      isBold: false,
      source: newFieldSource,
      textAlign: 'left',
      locked: false
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
    
    if (!isMoving || !currentTemplate || !pdfContainerRef.current) return;
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
    
    // Calculate where on the field the user clicked (in PDF coordinates)
    const containerRect = pdfContainerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - containerRect.left) / zoomLevel;
    const clickY = (e.clientY - containerRect.top) / zoomLevel;
    
    // Store offset from field position to click position
    setDragOffset({
      x: clickX - field.x,
      y: clickY - field.y
    });
    
    setDraggedField(field);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMoving || !draggedField || !currentTemplate || !pdfContainerRef.current || !dragOffset) return;
    
    const containerRect = pdfContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - containerRect.left;
    const rawY = e.clientY - containerRect.top;
    
    // Convert cursor position to PDF coordinates and subtract drag offset
    let x = Math.max(0, Math.min(rawX / zoomLevel - dragOffset.x, 595));
    let y = Math.max(0, Math.min(rawY / zoomLevel - dragOffset.y, 842));
    
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
      const threshold = 5;
      
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
    if (!isMoving && pdfContainerRef.current) {
      const containerRect = pdfContainerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      setSelectionBox({ start: { x, y }, end: { x, y } });
      setIsSelecting(true);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isSelecting && selectionBox && pdfContainerRef.current) {
      const containerRect = pdfContainerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      setSelectionBox({ ...selectionBox, end: { x, y } });
    }
  };

  const handleCanvasMouseUp = () => {
    if (isSelecting && selectionBox && currentTemplate) {
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x) / zoomLevel;
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x) / zoomLevel;
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y) / zoomLevel;
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y) / zoomLevel;

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

    const step = shiftKey ? 10 : 1;
    const updatedFields = currentTemplate.fields.map(f => {
      if (selectedFields.includes(f.id) && !f.locked) {
        let { x, y } = f;
        if (key === 'ArrowLeft') x -= step;
        if (key === 'ArrowRight') x += step;
        if (key === 'ArrowUp') y -= step;
        if (key === 'ArrowDown') y += step;
        x = Math.max(0, Math.min(x, 595));
        y = Math.max(0, Math.min(y, 842));
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

  const handlePasteFields = () => {
    if (!currentTemplate || copiedFields.length === 0) return;
    
    const newFields = copiedFields.map(f => ({
      ...f,
      id: `field-${Date.now()}-${Math.random()}`,
      x: Math.min(575, f.x + 20), // Keep within page bounds (595 - 20 margin)
      y: Math.min(822, f.y + 20)  // Keep within page bounds (842 - 20 margin)
    }));

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
    const newFields = fieldsToDuplicate.map(f => ({
      ...f,
      id: `field-${Date.now()}-${Math.random()}`,
      x: Math.min(575, f.x + 20), // Keep within page bounds (595 - 20 margin)
      y: Math.min(822, f.y + 20)  // Keep within page bounds (842 - 20 margin)
    }));

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
    if (!pdfContainerRef.current) return;
    const parent = pdfContainerRef.current.parentElement;
    if (!parent) return;
    
    const containerWidth = parent.clientWidth - 32;
    const containerHeight = parent.clientHeight - 32;
    const zoomWidth = containerWidth / 595;
    const zoomHeight = containerHeight / 842;
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

  const handleUploadBackground = () => {
    if (!currentTemplate) return;
    backgroundInputRef.current?.click();
  };

  const handleBackgroundFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTemplate) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.invalidFileTypeSimple'),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t('common:status.error'),
        description: t('templateEditor.toasts.fileTooLargeSimple'),
        variant: "destructive",
      });
      return;
    }

    uploadBackgroundMutation.mutate({ templateId: currentTemplate.id, file });
    
    // Reset input
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = '';
    }
  };

  const handleRemoveBackground = () => {
    if (!currentTemplate) return;
    removeBackgroundMutation.mutate(currentTemplate.id);
  };

  const handleSaveTemplate = () => {
    if (!currentTemplate) return;
    
    const templateToSave = {
      id: currentTemplate.id,
      name: currentTemplate.name,
      isDefault: currentTemplate.isDefault,
      backgroundPath: currentTemplate.backgroundPath,
      fields: currentTemplate.fields.map(field => ({
        id: field.id,
        name: field.name,
        x: field.x,
        y: field.y,
        fontSize: field.fontSize,
        isBold: field.isBold,
        source: field.source,
        textAlign: field.textAlign,
        locked: field.locked || false
      }))
    };
    
    saveTemplateMutation.mutate(templateToSave);
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
    if (!currentTemplate) return;
    
    const templateToSave = {
      id: currentTemplate.id,
      name: currentTemplate.name,
      isDefault: true,
      backgroundPath: currentTemplate.backgroundPath,
      fields: currentTemplate.fields.map(field => ({
        id: field.id,
        name: field.name,
        x: field.x,
        y: field.y,
        fontSize: field.fontSize,
        isBold: field.isBold,
        source: field.source,
        textAlign: field.textAlign,
        locked: field.locked || false
      }))
    };
    
    saveTemplateMutation.mutate(templateToSave);
  };

  const handlePreviewGenerate = () => {
    if (!currentTemplate) return;
    
    if (saveTemplateMutation.isPending) {
      toast({
        title: t('templateEditor.toasts.templateSavingTitle'),
        description: t('templateEditor.toasts.templateSavingDescription'),
      });
      return;
    }
    
    generatePreviewMutation.mutate({ templateId: currentTemplate.id });
  };

  const selectedField = selectedFields.length === 1 
    ? currentTemplate?.fields.find(f => f.id === selectedFields[0]) 
    : null;

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
              {t('transportTemplateEditor.backToDelivery')}
            </Button>
          ) : (
            <Link href="/delivery">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Delivery
              </Button>
            </Link>
          )}
        </div>
        
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('templateEditor.createFirstTemplateTitle')}</CardTitle>
            <CardDescription>
              {t('transportTemplateEditor.createFirstTemplateDescription')}
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
                  placeholder={t('transportTemplateEditor.templateNamePlaceholder')}
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
              {t('transportTemplateEditor.backToDelivery')}
            </Button>
          ) : (
            <Link href="/delivery">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Delivery
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBackgroundLibraryOpen(true)}
                  disabled={!currentTemplate}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('templateEditor.backgroundLibraryButton')}
                </Button>
                <Button variant="outline" onClick={handleDeleteTemplate} disabled={saveTemplateMutation.isPending || deleteTemplateMutation.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('templateEditor.deleteButton')}
                </Button>
                <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
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
                  <SelectTrigger>
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
                <Label>{t('templateEditor.currentBackgroundLabel')}</Label>
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    {currentTemplate?.backgroundPath ? (
                      <p className="text-sm truncate" title={currentTemplate.backgroundPath}>
                        {currentTemplate.backgroundPath.split('/').pop()}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('templateEditor.defaultBackground')}</p>
                    )}
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
                    setGridSize(value < 1 ? 1 : value > 50 ? 50 : value);
                  }} className="w-20" min="1" max="50" />
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
                          <Button variant="default">
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
                                      {t(`transportTemplateEditor.dataSourceOptions.${key}`)}
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
                          {Array.from({ length: Math.ceil(595 / 50) + 1 }).map((_, i) => (
                            <div key={i} className="absolute" style={{ left: `${i * 50 * zoomLevel + 32}px` }}>
                              <div className="h-2 w-px bg-gray-400" />
                              <span className="ml-1">{i * 50}</span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute top-8 left-0 bottom-0 w-8 bg-gray-100 border-r flex flex-col text-xs text-gray-600" style={{ zIndex: 10 }}>
                          {Array.from({ length: Math.ceil(842 / 50) + 1 }).map((_, i) => (
                            <div key={i} className="absolute" style={{ top: `${i * 50 * zoomLevel + 32}px` }}>
                              <div className="w-2 h-px bg-gray-400" />
                              <span className="ml-0.5">{i * 50}</span>
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
                    >
                      <div 
                        ref={pdfContainerRef}
                        className={`relative border border-gray-300 shadow-lg ${showGrid ? 'bg-grid' : ''}`}
                        style={{ 
                          width: `${595 * zoomLevel}px`, 
                          height: `${842 * zoomLevel}px`,
                          margin: '0 auto',
                          backgroundColor: currentTemplate?.backgroundPreviewPath || currentTemplate?.backgroundPath ? 'transparent' : '#ffffff',
                          backgroundImage: (() => {
                            // Use preview image for template backgrounds (PNG converted from PDF)
                            if (currentTemplate?.backgroundPreviewPath) {
                              // Preview path is a PNG image that can be displayed in CSS
                              // Add cache-busting parameter to force browser to reload when background changes
                              const timestamp = currentTemplate.updatedAt ? new Date(currentTemplate.updatedAt).getTime() : Date.now();
                              const bgUrl = `/${currentTemplate.backgroundPreviewPath}?v=${timestamp}`;
                              console.log('🖼️ Loading preview image from:', bgUrl);
                              return showGrid ? 
                                `repeating-linear-gradient(0deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px),
                                 repeating-linear-gradient(90deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px),
                                 url(${bgUrl})` :
                                `url(${bgUrl})`;
                            } else if (currentTemplate?.backgroundPath) {
                              // Fallback to backgroundPath for backwards compatibility (images only)
                              // Add cache-busting parameter to force browser to reload when background changes
                              const timestamp = currentTemplate.updatedAt ? new Date(currentTemplate.updatedAt).getTime() : Date.now();
                              const bgUrl = `/${currentTemplate.backgroundPath}?v=${timestamp}`;
                              console.log('🖼️ Loading background (legacy) from:', bgUrl);
                              return showGrid ? 
                                `repeating-linear-gradient(0deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px),
                                 repeating-linear-gradient(90deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px),
                                 url(${bgUrl})` :
                                `url(${bgUrl})`;
                            }
                            
                            // No background set — plain white page (no default form image for transport reports)
                            return showGrid ?
                              `repeating-linear-gradient(0deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px),
                               repeating-linear-gradient(90deg, transparent, transparent ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel - 1}px, #e5e7eb ${gridSize * zoomLevel}px)` :
                              'none';
                          })(),
                          backgroundSize: showGrid ? `${gridSize * zoomLevel}px ${gridSize * zoomLevel}px, ${gridSize * zoomLevel}px ${gridSize * zoomLevel}px, 100% 100%` : '100% 100%',
                          backgroundPosition: 'top left',
                          backgroundRepeat: showGrid ? 'repeat, repeat, no-repeat' : 'no-repeat',
                        }}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onMouseDown={handleCanvasMouseDown}
                      >
                        {alignmentGuides.x !== undefined && (
                          <div className="absolute top-0 bottom-0 w-px bg-blue-500" style={{ left: `${alignmentGuides.x * zoomLevel}px` }} />
                        )}
                        {alignmentGuides.y !== undefined && (
                          <div className="absolute left-0 right-0 h-px bg-blue-500" style={{ top: `${alignmentGuides.y * zoomLevel}px` }} />
                        )}
                        
                        {currentTemplate.fields.map(field => (
                          <div
                            key={field.id}
                            className={`absolute cursor-pointer p-1 rounded transition-all ${
                              selectedFields.includes(field.id) ? 'ring-2 ring-blue-500 bg-white bg-opacity-90' : ''
                            } ${isMoving && !field.locked ? 'cursor-move' : ''} ${field.locked ? 'opacity-60' : ''}`}
                            style={{
                              left: `${field.x * zoomLevel}px`,
                              top: `${field.y * zoomLevel}px`,
                              fontSize: `${field.fontSize * zoomLevel}px`,
                              fontWeight: field.isBold ? 'bold' : 'normal',
                              backgroundColor: selectedFields.includes(field.id) ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.85)',
                              color: '#000000',
                              padding: `${1 * zoomLevel}px ${6 * zoomLevel}px`,
                              boxShadow: selectedFields.includes(field.id) ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.2)',
                              borderRadius: `${2 * zoomLevel}px`,
                              textAlign: field.textAlign,
                              minWidth: `${60 * zoomLevel}px`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: field.textAlign === 'left' ? 'flex-start' : field.textAlign === 'right' ? 'flex-end' : 'center',
                              lineHeight: 1.2
                            }}
                            onClick={(e) => handleFieldClick(field, e)}
                            onMouseDown={(e) => handleMouseDown(e, field)}
                          >
                            {field.locked && <Lock className="h-3 w-3 mr-1" />}
                            {field.name}
                          </div>
                        ))}
                        
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
                              f.id === selectedField.id ? { ...f, source: value } : f
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
                                {t(`transportTemplateEditor.dataSourceOptions.${key}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{t('templateEditor.xPositionLabel')}</Label>
                          <Input 
                            type="number"
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
                          <Label className="text-xs">{t('templateEditor.yPositionLabel')}</Label>
                          <Input 
                            type="number"
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

            {/* 3-Column Grid: Position Presets | Field History | Preview Template */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Position Presets */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('templateEditor.positionPresetsTitle')}</CardTitle>
                  <CardDescription>{t('templateEditor.positionPresetsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {DEFAULT_PRESETS.map((preset) => (
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

              {/* Preview Template */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('templateEditor.previewTemplateTitle')}</CardTitle>
                  <CardDescription>{t('templateEditor.previewTemplateDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button
                      onClick={handlePreviewGenerate}
                      disabled={generatePreviewMutation.isPending}
                      className="w-full"
                    >
                      {generatePreviewMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      {t('templateEditor.generatePreviewButton')}
                    </Button>
                    {previewPdfUrl && (
                      <a
                        href={previewPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline block"
                      >
                        {t('templateEditor.viewPreviewPdfLink')}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
      
      {/* Background Library Dialog */}
      <Dialog open={isBackgroundLibraryOpen} onOpenChange={setIsBackgroundLibraryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('templateEditor.backgroundLibraryTitle')}</DialogTitle>
            <DialogDescription>
              {t('templateEditor.backgroundLibraryDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Upload New Background */}
            <div className="border rounded-lg p-4 bg-muted/20">
              <h3 className="text-sm font-medium mb-3">{t('templateEditor.addNewBackgroundTitle')}</h3>
              <div className="flex gap-3">
                <Input
                  placeholder={t('templateEditor.backgroundNamePlaceholder')}
                  value={backgroundName}
                  onChange={(e) => setBackgroundName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={!backgroundName.trim() || addBackgroundToLibraryMutation.isPending}
                >
                  {addBackgroundToLibraryMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {t('templateEditor.uploadButton')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('templateEditor.supportsFileTypesHint')}
              </p>
            </div>

            {/* Background Gallery */}
            <div>
              <h3 className="text-sm font-medium mb-3">{t('templateEditor.availableBackgroundsTitle', { count: backgroundLibrary.length })}</h3>
              {backgroundLibrary.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{t('templateEditor.noBackgroundsTitle')}</p>
                  <p className="text-sm">{t('templateEditor.noBackgroundsDescription')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {backgroundLibrary.map((bg) => (
                    <div 
                      key={bg.id}
                      className="relative group border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => {
                        if (!currentTemplate) return;
                        selectBackgroundMutation.mutate({ 
                          templateId: currentTemplate.id, 
                          backgroundId: bg.id 
                        });
                        setIsBackgroundLibraryOpen(false);
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-[1/1.414] bg-gray-100 relative overflow-hidden">
                        <img 
                          src={`/${bg.previewPath}?_cb=${Date.now()}`} 
                          alt={bg.name}
                          className="w-full h-full object-contain"
                        />
                        {/* Selected indicator */}
                        {currentTemplate?.backgroundPath === bg.backgroundPath && (
                          <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                            <div className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium">
                              {t('templateEditor.activeLabel')}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="p-3 bg-white">
                        <p className="font-medium text-sm truncate">{bg.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {bg.backgroundPath.split('/').pop()}
                        </p>
                      </div>

                      {/* Delete button */}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!currentTemplate) return;
                          setBackgroundToDelete(bg);
                          setDeleteBackgroundDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBackgroundLibraryOpen(false)}>
              {t('templateEditor.closeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for background upload */}
      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !currentTemplate) return;

          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
          if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().match(/\.(jpg|jpeg|png|pdf)$/)) {
            toast({
              title: t('templateEditor.toasts.invalidFileTypeTitle'),
              description: t('templateEditor.toasts.invalidFileTypeDescription'),
              variant: "destructive",
            });
            return;
          }

          // Validate file size (max 10MB)
          const maxSize = 10 * 1024 * 1024; // 10MB in bytes
          if (file.size > maxSize) {
            toast({
              title: t('templateEditor.toasts.fileTooLargeTitle'),
              description: t('templateEditor.toasts.fileTooLargeDescription'),
              variant: "destructive",
            });
            return;
          }

          // If in library dialog with name, add to library
          if (backgroundName.trim()) {
            addBackgroundToLibraryMutation.mutate({ 
              templateId: currentTemplate.id, 
              file, 
              name: backgroundName.trim() 
            });
          } else {
            // Otherwise use old upload behavior
            uploadBackgroundMutation.mutate({ templateId: currentTemplate.id, file });
          }
          
          // Reset input
          if (backgroundInputRef.current) {
            backgroundInputRef.current.value = '';
          }
        }}
        style={{ display: 'none' }}
      />

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

      {/* Delete Background Confirmation Dialog */}
      <ConfirmDialog
        open={deleteBackgroundDialogOpen}
        onOpenChange={(open) => {
          setDeleteBackgroundDialogOpen(open);
          if (!open) setBackgroundToDelete(null);
        }}
        title={t('templateEditor.deleteBackgroundDialogTitle')}
        description={t('templateEditor.deleteBackgroundDialogDescription', { name: backgroundToDelete?.name })}
        confirmLabel={t('templateEditor.deleteButton')}
        variant="danger"
        onConfirm={() => {
          if (currentTemplate && backgroundToDelete) {
            deleteBackgroundMutation.mutate({
              templateId: currentTemplate.id,
              backgroundId: backgroundToDelete.id
            });
          }
        }}
      />
    </div>
  );
};

export default TransportReportTemplateEditor;
