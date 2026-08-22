import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Car,
  CheckCircle2,
  Circle,
  Download,
  Upload,
  Star,
  Copy,
  ClipboardList,
  X,
  GripVertical,
  MapPin,
  Loader2,
  Eye,
  EyeOff,
  Settings,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InspectionPoint {
  id: string;
  name: string;
  category: string;
  damageTypes: string[]; // e.g., ["Kapot", "Gat", "Kras", "Deuk"]
  description?: string;
  required: boolean;
  position?: { x: number; y: number };
  // Phase 1 additions
  notes?: string;
  photoPaths?: string[];
  inputType?: "checkbox" | "text" | "dropdown";
  dropdownOptions?: string[];
  order?: number;
}

interface TemplateCategory {
  id: string;
  label: string;
  order: number;
  // Phase 2 layout controls
  columns?: 1 | 2 | 3 | 4;
  alignment?: "left" | "center" | "right";
}

interface HandoverChecklistItem {
  id: string;
  label: string;
  type: "checkbox" | "text";
  order: number;
}

interface DamageCheckTemplate {
  id: number;
  name: string;
  description: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleType: string | null;
  buildYearFrom: string | null;
  buildYearTo: string | null;
  inspectionPoints: InspectionPoint[];
  categories: TemplateCategory[];
  handoverChecklist: HandoverChecklistItem[];
  headerText: string | null;
  footerText: string | null;
  isDefault: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES: TemplateCategory[] = [
  { id: "interieur", label: "Interieur", order: 0 },
  { id: "exterieur", label: "Exterieur", order: 1 },
  { id: "afweez_check", label: "Afweez Check", order: 2 },
  { id: "documents", label: "Documents", order: 3 },
];

const CATEGORY_COLORS = [
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800",
  "bg-orange-100 text-orange-800",
  "bg-gray-100 text-gray-800",
  "bg-purple-100 text-purple-800",
  "bg-pink-100 text-pink-800",
  "bg-yellow-100 text-yellow-800",
  "bg-cyan-100 text-cyan-800",
];

function getCategoryColor(categoryId: string, categories: TemplateCategory[]): string {
  const idx = categories.findIndex((c) => c.id === categoryId);
  if (idx < 0) return "bg-gray-100 text-gray-800";
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

function getCategoryLabel(categoryId: string, categories: TemplateCategory[]): string {
  return categories.find((c) => c.id === categoryId)?.label || categoryId;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `cat_${Date.now()}`
  );
}

const DAMAGE_TYPES = [
  { value: "kapot", label: "Kapot" },
  { value: "gat", label: "Gat" },
  { value: "kras", label: "Kras" },
  { value: "deuk", label: "Deuk" },
  { value: "ster", label: "Ster" },
  { value: "beschadigd", label: "Beschadigd" },
  { value: "vuil", label: "Vuil" },
  { value: "ontbreekt", label: "Ontbreekt" },
];

// ---------------------------------------------------------------------------
// Sortable helpers (Phase 2 — drag & drop)
// ---------------------------------------------------------------------------

/**
 * Generic sortable row wrapper. Wraps children in a div that registers
 * itself with the surrounding `<SortableContext>` and exposes a `handle`
 * render prop the caller can mount on its drag affordance.
 */
function SortableRow({
  id,
  data,
  children,
  className,
}: {
  id: string;
  data?: Record<string, any>;
  children: (args: {
    handleProps: any;
    isDragging: boolean;
  }) => React.ReactNode;
  className?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({
        handleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  );
}

/**
 * Diagram placement panel — shows the template's top-view diagram and lets
 * the user click anywhere to drop a marker for an inspection point, drag
 * existing markers to reposition, and remove markers via a hover button.
 * Stored coordinates are 0..1 fractions of the image so they scale with the
 * rendered diagram on screen and in the PDF.
 */
function DiagramPlacementPanel({
  topViewPath,
  points,
  onSetPosition,
}: {
  topViewPath?: string | null;
  points: InspectionPoint[];
  onSetPosition: (id: string, position: { x: number; y: number } | undefined) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Drag-to-reposition: window-level listeners while a marker is being dragged.
  useEffect(() => {
    if (!dragId) return;
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const onMove = (e: MouseEvent) => {
      const rect = imgRef.current?.getBoundingClientRect();
      if (!rect) return;
      onSetPosition(dragId, {
        x: clamp((e.clientX - rect.left) / rect.width),
        y: clamp((e.clientY - rect.top) / rect.height),
      });
    };
    const onUp = () => setDragId(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragId, onSetPosition]);

  if (!topViewPath) {
    return (
      <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-500 text-xs">
        Set this template's vehicle make and model above, and upload a matching diagram under Documents → Damage Check → Diagram Templates, to start placing inspection points on it.
      </div>
    );
  }

  const placedPoints = points.filter((p) => p.position);
  const unplacedPoints = points.filter((p) => !p.position);
  const imgSrc = topViewPath.startsWith("/") || topViewPath.startsWith("http")
    ? topViewPath
    : `/${topViewPath}`;

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragId) return;
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingPos({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    });
    setPickerOpen(true);
  };

  return (
    <div className="space-y-3">
      <div
        ref={imgRef}
        onClick={handleImageClick}
        className="relative border rounded-lg overflow-hidden bg-gray-50 cursor-crosshair"
        style={{ maxWidth: 800 }}
        data-testid="diagram-placement-canvas"
      >
        <img
          src={imgSrc}
          alt="Vehicle top view"
          className="block w-full select-none pointer-events-none"
          draggable={false}
        />
        {placedPoints.map((p, idx) => (
          <div
            key={p.id}
            data-marker
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragId(p.id);
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-move"
            style={{
              left: `${p.position!.x * 100}%`,
              top: `${p.position!.y * 100}%`,
            }}
            title={p.name}
            data-testid={`diagram-marker-${p.id}`}
          >
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center shadow border-2 border-white">
                {idx + 1}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetPosition(p.id, undefined);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center shadow opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label={`Remove ${p.name} from diagram`}
                data-testid={`diagram-marker-remove-${p.id}`}
              >
                ×
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                {p.name}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600">
        {placedPoints.length} of {points.length} point
        {points.length === 1 ? "" : "s"} placed. Click the diagram to add,
        drag markers to move, hover to remove.
      </p>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Place inspection point</DialogTitle>
            <DialogDescription>
              Choose which point should be marked at this location.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {points.length === 0 && (
              <p className="text-sm text-gray-500">
                No inspection points exist yet — add some first.
              </p>
            )}
            {unplacedPoints.length === 0 && points.length > 0 && (
              <p className="text-xs text-gray-500 mb-2">
                All points already placed. Selecting one moves it here.
              </p>
            )}
            {(unplacedPoints.length > 0 ? unplacedPoints : points).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (pendingPos) onSetPosition(p.id, pendingPos);
                  setPickerOpen(false);
                  setPendingPos(null);
                }}
                className="w-full text-left p-2 hover:bg-gray-100 rounded text-sm flex items-center gap-2"
                data-testid={`button-place-point-${p.id}`}
              >
                <Circle className="h-3 w-3 text-gray-400" />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates list page
// ---------------------------------------------------------------------------

export default function DamageCheckTemplates({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DamageCheckTemplate | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<DamageCheckTemplate | null>(null);
  const [clonePickerOpen, setClonePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<DamageCheckTemplate[]>({
    queryKey: ["/api/damage-check-templates"],
  });

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEdit = (template: DamageCheckTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleDeleteClick = (template: DamageCheckTemplate) => {
    setTemplateToDelete(template);
    setDeleteConfirmOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/damage-check-templates/${id}`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: "Success", description: "Template deleted successfully" });
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/damage-check-templates/${id}/set-default`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: "Default updated", description: "Template marked as default" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set default",
        variant: "destructive",
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (payload: { id: number; name?: string }) => {
      return await apiRequest(
        "POST",
        `/api/damage-check-templates/${payload.id}/clone`,
        payload.name ? { name: payload.name } : {},
      );
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: "Cloned", description: "Template cloned successfully" });
      setClonePickerOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clone template",
        variant: "destructive",
      });
    },
  });

  const handleExportTemplate = async (template: DamageCheckTemplate) => {
    try {
      const response = await fetch(`/api/damage-check-templates/${template.id}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to export template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sanitizedName = template.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
      a.download = `damage_check_${sanitizedName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Success", description: "Template exported successfully" });
    } catch (error) {
      console.error("Error exporting template:", error);
      toast({ title: "Error", description: "Failed to export template", variant: "destructive" });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const templateData = JSON.parse(text);
      await apiRequest("POST", "/api/damage-check-templates/import", templateData);
      invalidateByPrefix("/api/damage-check-templates");
      toast({ title: "Success", description: "Template imported successfully" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      console.error("Error importing template:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to import template",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={embedded ? "p-4 md:p-6" : "container mx-auto p-6 max-w-7xl"}>
      <div className="flex justify-between items-center mb-6">
        <div>
          {!embedded && (
            <>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Car className="h-8 w-8" />
                Damage Check Templates
              </h1>
              <p className="text-muted-foreground mt-1">
                Create custom vehicle inspection templates for different makes and models
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            onClick={() => setClonePickerOpen(true)}
            variant="outline"
            className="gap-2"
            disabled={templates.length === 0}
            data-testid="button-open-clone-picker"
          >
            <Copy className="h-4 w-4" />
            Clone from existing…
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="gap-2"
            data-testid="button-import-template"
          >
            <Upload className="h-4 w-4" />
            Import Template
          </Button>
          <Button onClick={handleCreateNew} className="gap-2" data-testid="button-create-template">
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading templates...
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Car className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Templates Created</h3>
            <p className="text-muted-foreground mb-4">
              Create your first damage check template to standardize vehicle inspections
            </p>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const categories =
              template.categories && template.categories.length > 0
                ? template.categories
                : DEFAULT_CATEGORIES;
            return (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {template.name}
                        {template.isDefault && (
                          <Badge variant="default" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-700 mb-1">Vehicle Target</div>
                      {template.vehicleMake || template.vehicleModel || template.vehicleType ? (
                        <div className="flex flex-wrap gap-1">
                          {template.vehicleMake && (
                            <Badge variant="outline" className="text-xs">
                              {template.vehicleMake}
                            </Badge>
                          )}
                          {template.vehicleModel && (
                            <Badge variant="outline" className="text-xs">
                              {template.vehicleModel}
                            </Badge>
                          )}
                          {template.vehicleType && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {template.vehicleType}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">Generic (all vehicles)</span>
                      )}
                    </div>

                    <div className="text-sm">
                      <div className="font-medium text-gray-700 mb-1">Inspection Points</div>
                      <div className="text-gray-600">
                        {template.inspectionPoints?.length || 0} check points
                        {template.inspectionPoints?.filter((p) => p.required).length > 0 && (
                          <span className="text-xs text-orange-600 ml-2">
                            ({template.inspectionPoints.filter((p) => p.required).length} required)
                          </span>
                        )}
                      </div>
                    </div>

                    {template.inspectionPoints && template.inspectionPoints.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(template.inspectionPoints.map((p) => p.category))).map(
                          (category) => (
                            <Badge
                              key={category}
                              className={`text-xs ${getCategoryColor(category, categories)}`}
                            >
                              {getCategoryLabel(category, categories)}
                            </Badge>
                          ),
                        )}
                      </div>
                    )}

                    {template.handoverChecklist && template.handoverChecklist.length > 0 && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {template.handoverChecklist.length} handover item
                        {template.handoverChecklist.length === 1 ? "" : "s"}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        className="flex-1 min-w-[80px]"
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      {!template.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(template.id)}
                          disabled={setDefaultMutation.isPending}
                          data-testid={`button-set-default-${template.id}`}
                          title="Set as default"
                        >
                          <Star className="h-3.5 w-3.5 mr-1" />
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportTemplate(template)}
                        data-testid={`button-export-template-${template.id}`}
                        title="Export to JSON"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(template)}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <TemplateEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          template={editingTemplate}
        />
      )}

      <ClonePickerDialog
        open={clonePickerOpen}
        onOpenChange={setClonePickerOpen}
        templates={templates}
        onConfirm={(id, name) => cloneMutation.mutate({ id, name })}
        isPending={cloneMutation.isPending}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => templateToDelete && deleteMutation.mutate(templateToDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clone-from-existing picker (single button at top of list)
// ---------------------------------------------------------------------------

function ClonePickerDialog({
  open,
  onOpenChange,
  templates,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: DamageCheckTemplate[];
  onConfirm: (id: number, name?: string) => void;
  isPending: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedId("");
      setNewName("");
    }
  }, [open]);

  const selected = templates.find((t) => String(t.id) === selectedId);

  useEffect(() => {
    if (selected && !newName.trim()) {
      setNewName(`${selected.name} (Copy)`);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clone from existing template</DialogTitle>
          <DialogDescription>
            Pick a template to copy. The clone will be created as a new (non-default) template that
            you can edit independently.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Source template</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger data-testid="select-clone-source">
                <SelectValue placeholder="Select a template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                    {t.isDefault ? "  (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New template name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Standard Sedan (Copy)"
              data-testid="input-clone-name"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => selected && onConfirm(selected.id, newName.trim() || undefined)}
            disabled={!selected || isPending}
            data-testid="button-confirm-clone"
          >
            {isPending ? "Cloning…" : "Clone"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Template metadata — create a template, or edit name/description/vehicle
// targeting/language for an existing one. Layout editing happens separately
// in the canvas editor; this dialog only owns the fields that used to live
// in the deleted structured "Edit Template" form's top section.
// ---------------------------------------------------------------------------

function TemplateMetadataDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DamageCheckTemplate | null;
  onSaved: (saved: DamageCheckTemplate) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [buildYearFrom, setBuildYearFrom] = useState("");
  const [buildYearTo, setBuildYearTo] = useState("");
  const [language, setLanguage] = useState<"nl" | "en">("nl");

  useEffect(() => {
    if (!open) return;
    setName(template?.name || "");
    setDescription(template?.description || "");
    setVehicleMake(template?.vehicleMake || "");
    setVehicleModel(template?.vehicleModel || "");
    setVehicleType(template?.vehicleType || "");
    setBuildYearFrom(template?.buildYearFrom || "");
    setBuildYearTo(template?.buildYearTo || "");
    setLanguage((template?.language as "nl" | "en") || "nl");
  }, [open, template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        vehicleMake: vehicleMake.trim() || null,
        vehicleModel: vehicleModel.trim() || null,
        vehicleType: vehicleType || null,
        buildYearFrom: buildYearFrom.trim() || null,
        buildYearTo: buildYearTo.trim() || null,
        language,
      };
      const url = template
        ? `/api/damage-check-templates/${template.id}`
        : "/api/damage-check-templates";
      const method = template ? "PUT" : "POST";
      const res = await apiRequest(method, url, data);
      return res.json();
    },
    onSuccess: (saved: DamageCheckTemplate) => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({
        title: "Success",
        description: template ? "Template updated" : "Template created",
      });
      onOpenChange(false);
      onSaved(saved);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Template Settings" : "Create Template"}</DialogTitle>
          <DialogDescription>
            Name, description, and vehicle targeting. Field layout is edited separately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tmd-name">Name</Label>
            <Input
              id="tmd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-metadata-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-description">Description</Label>
            <Textarea
              id="tmd-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-metadata-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-make">Vehicle Make</Label>
              <Input
                id="tmd-make"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="e.g., Toyota"
                data-testid="input-metadata-make"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-model">Vehicle Model</Label>
              <Input
                id="tmd-model"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="e.g., Camry"
                data-testid="input-metadata-model"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-type">Vehicle Type</Label>
              <Select
                value={vehicleType || "all"}
                onValueChange={(v) => setVehicleType(v === "all" ? "" : v)}
              >
                <SelectTrigger id="tmd-type" data-testid="select-metadata-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="sedan">Sedan</SelectItem>
                  <SelectItem value="suv">SUV</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="truck">Truck</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-from">Build Year From</Label>
              <Input
                id="tmd-year-from"
                value={buildYearFrom}
                onChange={(e) => setBuildYearFrom(e.target.value)}
                placeholder="2015"
                data-testid="input-metadata-year-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-to">Build Year To</Label>
              <Input
                id="tmd-year-to"
                value={buildYearTo}
                onChange={(e) => setBuildYearTo(e.target.value)}
                placeholder="2020"
                data-testid="input-metadata-year-to"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-language">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as "nl" | "en")}>
              <SelectTrigger id="tmd-language" data-testid="select-metadata-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Dutch (NL)</SelectItem>
                <SelectItem value="en">English (EN)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => name.trim() && saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
            data-testid="button-save-metadata"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Template Editor
// ---------------------------------------------------------------------------

function TemplateEditor({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DamageCheckTemplate | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [vehicleMake, setVehicleMake] = useState(template?.vehicleMake || "");
  const [vehicleModel, setVehicleModel] = useState(template?.vehicleModel || "");
  const [vehicleType, setVehicleType] = useState(template?.vehicleType || "");
  const [buildYearFrom, setBuildYearFrom] = useState(template?.buildYearFrom || "");
  const [buildYearTo, setBuildYearTo] = useState(template?.buildYearTo || "");
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [headerText, setHeaderText] = useState(template?.headerText || "");
  const [footerText, setFooterText] = useState(template?.footerText || "");
  const [categories, setCategories] = useState<TemplateCategory[]>(
    template?.categories && template.categories.length > 0
      ? template.categories
      : DEFAULT_CATEGORIES,
  );
  const [handoverChecklist, setHandoverChecklist] = useState<HandoverChecklistItem[]>(
    template?.handoverChecklist || [],
  );
  const [inspectionPoints, setInspectionPoints] = useState<InspectionPoint[]>(
    template?.inspectionPoints || [],
  );
  const [editingPoint, setEditingPoint] = useState<InspectionPoint | null>(null);
  const [pointEditorOpen, setPointEditorOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Vehicle diagram used by the "Diagram Placement" panel below — sourced
  // from the make/model-keyed vehicleDiagramTemplates library (the same one
  // used by the live pickup/return flow and the canvas editor's 'diagram'
  // field), matched against this template's own vehicleMake/vehicleModel.
  // Replaces the old per-template 4-slot diagram upload.
  const { data: vehicleDiagramTemplates = [] } = useQuery<Array<{
    id: number; make: string; model: string; yearFrom?: number | null; yearTo?: number | null;
  }>>({
    queryKey: ["/api/vehicle-diagram-templates"],
  });
  const matchedDiagramUrl = useMemo(() => {
    if (!vehicleMake.trim() || !vehicleModel.trim()) return null;
    const nm = vehicleMake.trim().toLowerCase();
    const nmo = vehicleModel.trim().toLowerCase();
    const year = buildYearFrom.trim() ? parseInt(buildYearFrom.trim(), 10) : undefined;
    const match = vehicleDiagramTemplates.find((t) => {
      if (t.make.trim().toLowerCase() !== nm || t.model.trim().toLowerCase() !== nmo) return false;
      if (year !== undefined && !Number.isNaN(year)) {
        if (t.yearFrom != null && t.yearFrom > year) return false;
        if (t.yearTo != null && t.yearTo < year) return false;
      }
      return true;
    });
    return match ? `/api/vehicle-diagram-templates/${match.id}/image` : null;
  }, [vehicleDiagramTemplates, vehicleMake, vehicleModel, buildYearFrom]);

  // Phase 3 — live PDF preview. Debounced POST of the current draft to a
  // dedicated preview endpoint that renders the PDF in memory and streams
  // the bytes back. The blob URL is revoked when superseded or on unmount.
  const [showPreview, setShowPreview] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Monotonically-increasing request id so only the latest preview fetch is
  // allowed to mutate loading/error/url state. Older requests that resolve
  // after a newer one was scheduled simply no-op.
  const previewReqIdRef = useRef(0);

  // Revoke the previous preview blob URL whenever it changes or unmounts so
  // long editing sessions don't accumulate blobs in memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setVehicleMake(template.vehicleMake || "");
      setVehicleModel(template.vehicleModel || "");
      setVehicleType(template.vehicleType || "");
      setBuildYearFrom(template.buildYearFrom || "");
      setBuildYearTo(template.buildYearTo || "");
      setIsDefault(template.isDefault);
      setHeaderText(template.headerText || "");
      setFooterText(template.footerText || "");
      setCategories(
        template.categories && template.categories.length > 0
          ? template.categories
          : DEFAULT_CATEGORIES,
      );
      setHandoverChecklist(template.handoverChecklist || []);
      setInspectionPoints(template.inspectionPoints || []);
    } else {
      setName("");
      setDescription("");
      setVehicleMake("");
      setVehicleModel("");
      setVehicleType("");
      setBuildYearFrom("");
      setBuildYearTo("");
      setIsDefault(false);
      setHeaderText("");
      setFooterText("");
      setCategories(DEFAULT_CATEGORIES);
      setHandoverChecklist([]);
      setInspectionPoints([]);
    }
    // Reset Phase 3 live-preview transient state so values from a previous
    // edit session can't leak into a different template's preview/save.
    setPreviewError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    // Bump the request id so any in-flight preview fetch from the previous
    // template is ignored when it resolves.
    previewReqIdRef.current++;
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = template
        ? `/api/damage-check-templates/${template.id}`
        : "/api/damage-check-templates";
      const method = template ? "PUT" : "POST";
      return await apiRequest(method, url, data);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({
        title: "Success",
        description: template ? "Template updated successfully" : "Template created successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required",
        variant: "destructive",
      });
      return;
    }

    if (categories.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one category is required",
        variant: "destructive",
      });
      return;
    }

    const validCategoryIds = new Set(categories.map((c) => c.id));
    const orphanPoints = inspectionPoints.filter((p) => !validCategoryIds.has(p.category));
    if (orphanPoints.length > 0) {
      toast({
        title: "Validation Error",
        description: `${orphanPoints.length} inspection point(s) reference a removed category. Reassign them before saving.`,
        variant: "destructive",
      });
      return;
    }

    // Normalise per-category order so the backend gets a stable ordering hint.
    const orderedPoints = (() => {
      const grouped = new Map<string, InspectionPoint[]>();
      inspectionPoints.forEach((p) => {
        if (!grouped.has(p.category)) grouped.set(p.category, []);
        grouped.get(p.category)!.push(p);
      });
      const out: InspectionPoint[] = [];
      grouped.forEach((arr) => {
        arr
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .forEach((p, idx) => out.push({ ...p, order: idx }));
      });
      return out;
    })();

    const data = {
      name: name.trim(),
      description: description.trim() || null,
      vehicleMake: vehicleMake.trim() || null,
      vehicleModel: vehicleModel.trim() || null,
      vehicleType: vehicleType || null,
      buildYearFrom: buildYearFrom.trim() || null,
      buildYearTo: buildYearTo.trim() || null,
      language: "nl",
      isDefault,
      headerText: headerText.trim() || null,
      footerText: footerText.trim() || null,
      categories: categories.map((c, idx) => ({ ...c, order: idx })),
      handoverChecklist: handoverChecklist.map((h, idx) => ({ ...h, order: idx })),
      inspectionPoints: orderedPoints,
    };

    saveMutation.mutate(data);
  };

  const handleAddPoint = () => {
    setEditingPoint(null);
    setPointEditorOpen(true);
  };

  const handleEditPoint = (point: InspectionPoint) => {
    setEditingPoint(point);
    setPointEditorOpen(true);
  };

  const handleSavePoint = (point: InspectionPoint) => {
    if (editingPoint) {
      setInspectionPoints((points) => points.map((p) => (p.id === point.id ? point : p)));
    } else {
      setInspectionPoints((points) => [...points, point]);
    }
    setPointEditorOpen(false);
  };

  const handleDeletePoint = (id: string) => {
    setInspectionPoints((points) => points.filter((p) => p.id !== id));
  };

  // Category management ------------------------------------------------------
  const addCategory = () => {
    const label = `New Category ${categories.length + 1}`;
    setCategories((cs) => [...cs, { id: `cat_${Date.now()}`, label, order: cs.length }]);
  };
  const updateCategoryLabel = (id: string, label: string) => {
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, label } : c)));
  };
  const removeCategory = (id: string) => {
    const inUse = inspectionPoints.some((p) => p.category === id);
    if (inUse) {
      toast({
        title: "Cannot remove",
        description: "This category is in use by inspection points. Reassign them first.",
        variant: "destructive",
      });
      return;
    }
    setCategories((cs) => cs.filter((c) => c.id !== id));
  };

  // Handover checklist management -------------------------------------------
  const addHandoverItem = () => {
    setHandoverChecklist((items) => [
      ...items,
      {
        id: `hand_${Date.now()}`,
        label: "New item",
        type: "checkbox",
        order: items.length,
      },
    ]);
  };
  const updateHandoverItem = (id: string, patch: Partial<HandoverChecklistItem>) => {
    setHandoverChecklist((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeHandoverItem = (id: string) => {
    setHandoverChecklist((items) => items.filter((it) => it.id !== id));
  };

  // Phase 2 — column / alignment per category ------------------------------
  const updateCategoryColumns = (id: string, columns: 1 | 2 | 3 | 4) => {
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, columns } : c)));
  };
  const updateCategoryAlignment = (
    id: string,
    alignment: "left" | "center" | "right",
  ) => {
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, alignment } : c)));
  };

  // Phase 2 — drag & drop ---------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activePointId, setActivePointId] = useState<string | null>(null);

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setCategories((cs) =>
      arrayMove(cs, oldIndex, newIndex).map((c, idx) => ({ ...c, order: idx })),
    );
  };

  /**
   * Multi-container point DnD. Each category is a droppable container; each
   * point is a sortable item identified by `point::<id>`. Source/destination
   * containers are resolved from the dnd-kit drag payload (`active.data` /
   * `over.data`) rather than from outer-state lookups so we are not vulnerable
   * to stale-closure issues during fast drag sequences where state mutations
   * race with handlers.
   */
  const resolveContainerFromNode = (
    node: { id: string | number; data?: { current?: any } } | null | undefined,
  ): string | null => {
    if (!node) return null;
    const fromData = node.data?.current?.category as string | undefined;
    if (fromData) return fromData;
    const sId = String(node.id);
    if (sId.startsWith("container::")) return sId.slice("container::".length);
    return null;
  };

  const handlePointDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = resolveContainerFromNode(active);
    const overContainer = resolveContainerFromNode(over);
    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }
    // Move the active point into the over container immediately so the
    // drop indicator follows the cursor between lists. Mutate the data
    // payload on the active node so subsequent handlers see the new container
    // without relying on outer-state reads.
    const activePid = String(active.id).slice("point::".length);
    if (active.data?.current) {
      (active.data.current as any).category = overContainer;
    }
    setInspectionPoints((pts) =>
      pts.map((p) =>
        p.id === activePid ? { ...p, category: overContainer } : p,
      ),
    );
  };

  const handlePointDragEnd = (event: DragEndEvent) => {
    setActivePointId(null);
    const { active, over } = event;
    if (!over) return;
    const activePid = String(active.id).slice("point::".length);
    // Prefer the destination container from the over node's payload, fall
    // back to the active node (it may already have been moved in dragOver).
    const destContainer =
      resolveContainerFromNode(over) ?? resolveContainerFromNode(active);
    if (!destContainer) return;

    setInspectionPoints((pts) => {
      // Snapshot grouped points so we can compute the new ordering for the
      // destination container.
      const grouped = new Map<string, InspectionPoint[]>();
      pts.forEach((p) => {
        if (!grouped.has(p.category)) grouped.set(p.category, []);
        grouped.get(p.category)!.push(p);
      });
      grouped.forEach((arr) =>
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      );

      const destList = grouped.get(destContainer) ?? [];
      const activeIdx = destList.findIndex((p) => p.id === activePid);
      let newIdx: number;
      const overIdStr = String(over.id);
      if (overIdStr.startsWith("container::")) {
        // Dropped on empty space at end of the container.
        newIdx = destList.length - 1;
      } else {
        const overPid = overIdStr.slice("point::".length);
        newIdx = destList.findIndex((p) => p.id === overPid);
        if (newIdx < 0) newIdx = destList.length - 1;
      }
      if (activeIdx < 0 || activeIdx === newIdx) return pts;

      const reordered = arrayMove(destList, activeIdx, newIdx).map((p, idx) => ({
        ...p,
        order: idx,
      }));
      grouped.set(destContainer, reordered);

      // Flatten back into a single list — preserve other categories' order.
      const out: InspectionPoint[] = [];
      grouped.forEach((arr) => arr.forEach((p) => out.push(p)));
      return out;
    });
  };

  // Phase 2 — diagram placement --------------------------------------------
  const setPointPosition = (
    id: string,
    position: { x: number; y: number } | undefined,
  ) => {
    setInspectionPoints((pts) =>
      pts.map((p) => (p.id === id ? { ...p, position } : p)),
    );
  };

  // Bulk paste --------------------------------------------------------------
  const handleBulkAdd = (
    parsed: Array<{ name: string; category: string; damageTypes: string[] }>,
  ) => {
    const newPoints: InspectionPoint[] = parsed.map((p, idx) => ({
      id: `point-${Date.now()}-${idx}`,
      name: p.name,
      category: p.category,
      damageTypes: p.damageTypes,
      required: false,
      inputType: "checkbox",
    }));
    setInspectionPoints((points) => [...points, ...newPoints]);
    setBulkOpen(false);
    toast({
      title: "Added",
      description: `${newPoints.length} inspection point${newPoints.length === 1 ? "" : "s"} added`,
    });
  };

  // Group + sort points by category for display
  const pointsByCategory = useMemo(() => {
    const map = new Map<string, InspectionPoint[]>();
    categories.forEach((c) => map.set(c.id, []));
    inspectionPoints.forEach((p) => {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    });
    map.forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return map;
  }, [inspectionPoints, categories]);

  // Phase 3 — debounced live preview fetch. Whenever any field that affects
  // the rendered PDF changes, schedule a single POST 600ms later so rapid
  // typing doesn't spam the server. An AbortController guards against races
  // where a newer change finishes before an in-flight older request.
  useEffect(() => {
    if (!open || !showPreview) return;
    const controller = new AbortController();
    const reqId = ++previewReqIdRef.current;
    const timer = setTimeout(async () => {
      // Only the latest request may mutate UI state.
      if (reqId !== previewReqIdRef.current) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const draft = {
          name,
          description,
          vehicleMake,
          vehicleModel,
          vehicleType,
          buildYearFrom,
          buildYearTo,
          headerText,
          footerText,
          categories,
          inspectionPoints,
          handoverChecklist,
        };
        const res = await fetch("/api/damage-check-templates/preview-pdf", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const blob = await res.blob();
        if (reqId !== previewReqIdRef.current) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (reqId !== previewReqIdRef.current) return;
        setPreviewError(err?.message || "Failed to generate preview");
      } finally {
        if (reqId === previewReqIdRef.current) setPreviewLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    open,
    showPreview,
    name,
    description,
    vehicleMake,
    vehicleModel,
    vehicleType,
    buildYearFrom,
    buildYearTo,
    headerText,
    footerText,
    categories,
    inspectionPoints,
    handoverChecklist,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{template ? "Edit Template" : "Create New Template"}</DialogTitle>
              <DialogDescription>
                {template
                  ? "Update template details and inspection points"
                  : "Create a custom damage check template for vehicle inspections"}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              data-testid="button-toggle-preview"
            >
              {showPreview ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" /> Hide Preview
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" /> Show Preview
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">
          <div className={`${showPreview ? "flex-1 min-w-0" : "w-full"} overflow-y-auto px-6 pb-2`}>
        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Standard Sedan Check"
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-default"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="checkbox-is-default"
              />
              <Label htmlFor="is-default" className="cursor-pointer">
                Set as default template (will replace any current default)
              </Label>
            </div>
          </section>

          {/* Vehicle Targeting */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Vehicle Targeting (Optional)</h3>
            <p className="text-xs text-gray-600">
              Leave blank to create a generic template for all vehicles
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="e.g., Audi"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="e.g., A3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={vehicleType || "all"}
                  onValueChange={(val) => setVehicleType(val === "all" ? "" : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="sedan">Sedan</SelectItem>
                    <SelectItem value="suv">SUV</SelectItem>
                    <SelectItem value="van">Van</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="coupe">Coupe</SelectItem>
                    <SelectItem value="wagon">Wagon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="buildYearFrom">Build Year From</Label>
                <Input
                  id="buildYearFrom"
                  value={buildYearFrom}
                  onChange={(e) => setBuildYearFrom(e.target.value)}
                  placeholder="e.g., 2015"
                  type="number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buildYearTo">Build Year To</Label>
                <Input
                  id="buildYearTo"
                  value={buildYearTo}
                  onChange={(e) => setBuildYearTo(e.target.value)}
                  placeholder="e.g., 2020"
                  type="number"
                />
              </div>
            </div>
          </section>

          {/* Header / Footer */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">PDF Header &amp; Footer</h3>
            <p className="text-xs text-gray-600">
              Optional text rendered at the top / bottom of every page of the generated damage
              check PDF.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="header-text">Header Text</Label>
                <Textarea
                  id="header-text"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  rows={2}
                  placeholder="e.g., Company name, address, phone"
                  data-testid="input-header-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="footer-text">Footer Text</Label>
                <Textarea
                  id="footer-text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  rows={2}
                  placeholder="e.g., Terms &amp; conditions notice"
                  data-testid="input-footer-text"
                />
              </div>
            </div>
          </section>

          {/* Categories */}
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Categories</h3>
                <p className="text-xs text-gray-600">
                  Group inspection points. Rename, add, or remove categories as needed.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addCategory} data-testid="button-add-category">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Category
              </Button>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {categories.map((cat, idx) => (
                    <SortableRow key={cat.id} id={cat.id}>
                      {({ handleProps }) => (
                        <div className="flex items-center gap-2 bg-white border rounded-md p-2">
                          <button
                            type="button"
                            {...handleProps}
                            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
                            data-testid={`drag-category-${cat.id}`}
                            aria-label="Drag category"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <Badge
                            className={`text-xs ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                          >
                            {cat.id}
                          </Badge>
                          <Input
                            value={cat.label}
                            onChange={(e) => updateCategoryLabel(cat.id, e.target.value)}
                            className="flex-1 min-w-[120px]"
                            data-testid={`input-category-label-${cat.id}`}
                          />
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-gray-500">Cols</Label>
                            <Select
                              value={String(cat.columns ?? 1)}
                              onValueChange={(v) =>
                                updateCategoryColumns(cat.id, Number(v) as 1 | 2 | 3 | 4)
                              }
                            >
                              <SelectTrigger
                                className="w-[64px] h-8"
                                data-testid={`select-category-columns-${cat.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                                <SelectItem value="4">4</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-gray-500">Align</Label>
                            <Select
                              value={cat.alignment ?? "left"}
                              onValueChange={(v) =>
                                updateCategoryAlignment(
                                  cat.id,
                                  v as "left" | "center" | "right",
                                )
                              }
                            >
                              <SelectTrigger
                                className="w-[88px] h-8"
                                data-testid={`select-category-alignment-${cat.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCategory(cat.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-remove-category-${cat.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </SortableRow>
                  ))}
                  {categories.length === 0 && (
                    <p className="text-xs text-red-600">
                      No categories defined — at least one category is required.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </section>

          {/* Handover checklist */}
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Handover Checklist
                </h3>
                <p className="text-xs text-gray-600">
                  Items handed over with the vehicle (keys, fuel card, jack, registration…).
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addHandoverItem}
                data-testid="button-add-handover"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            </div>
            {handoverChecklist.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-gray-500">
                No handover items yet.
              </div>
            ) : (
              <div className="space-y-2">
                {handoverChecklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      value={item.label}
                      onChange={(e) => updateHandoverItem(item.id, { label: e.target.value })}
                      className="flex-1"
                      placeholder="e.g., Vehicle keys"
                      data-testid={`input-handover-label-${item.id}`}
                    />
                    <Select
                      value={item.type}
                      onValueChange={(val) =>
                        updateHandoverItem(item.id, { type: val as "checkbox" | "text" })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checkbox">Checkbox</SelectItem>
                        <SelectItem value="text">Text field</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeHandoverItem(item.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-remove-handover-${item.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Diagram Placement */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Diagram Placement
              </h3>
              <p className="text-xs text-gray-600">
                Pin inspection points to the top-view diagram. Click anywhere
                on the image to place a point; drag markers to reposition.
              </p>
            </div>
            <DiagramPlacementPanel
              topViewPath={matchedDiagramUrl}
              points={inspectionPoints}
              onSetPosition={setPointPosition}
            />
          </section>

          {/* Inspection Points */}
          <section className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-700">Inspection Points</h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => setBulkOpen(true)}
                  size="sm"
                  variant="outline"
                  data-testid="button-bulk-add"
                >
                  <ClipboardList className="h-3.5 w-3.5 mr-1" />
                  Bulk Add / Paste
                </Button>
                <Button onClick={handleAddPoint} size="sm" data-testid="button-add-inspection-point">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Point
                </Button>
              </div>
            </div>

            {inspectionPoints.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-500">
                <Circle className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No inspection points yet</p>
                <p className="text-xs mt-1">
                  Click "Add Point" or use Bulk Add to paste a list of points
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={(e: DragStartEvent) => {
                  const sId = String(e.active.id);
                  if (sId.startsWith("point::"))
                    setActivePointId(sId.slice("point::".length));
                }}
                onDragOver={handlePointDragOver}
                onDragEnd={handlePointDragEnd}
                onDragCancel={() => setActivePointId(null)}
              >
                <div className="space-y-4">
                  {categories.map((cat) => {
                    const pts = pointsByCategory.get(cat.id) || [];
                    const containerId = `container::${cat.id}`;
                    const itemIds = pts.map((p) => `point::${p.id}`);
                    // Include the container id in the sortable set so the
                    // container itself remains a valid drop target when empty.
                    const sortableItems = [...itemIds, containerId];
                    return (
                      <div key={cat.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`text-xs ${getCategoryColor(cat.id, categories)}`}
                          >
                            {cat.label}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {pts.length} point{pts.length === 1 ? "" : "s"}
                          </span>
                          {(cat.columns ?? 1) > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              {cat.columns} cols
                            </Badge>
                          )}
                          {cat.alignment && cat.alignment !== "left" && (
                            <Badge variant="outline" className="text-[10px]">
                              {cat.alignment}
                            </Badge>
                          )}
                        </div>
                        <SortableContext
                          items={sortableItems}
                          strategy={verticalListSortingStrategy}
                        >
                          <SortableRow
                            id={containerId}
                            data={{ kind: "container", category: cat.id }}
                          >
                            {() => (
                              <div
                                className={`space-y-2 min-h-[40px] rounded-lg ${
                                  pts.length === 0
                                    ? "border-2 border-dashed border-gray-200 p-3"
                                    : ""
                                }`}
                                data-testid={`droppable-category-${cat.id}`}
                              >
                                {pts.length === 0 && (
                                  <p className="text-xs text-gray-400 text-center">
                                    Drop points here
                                  </p>
                                )}
                                {pts.map((point) => (
                                  <SortableRow
                                    key={point.id}
                                    id={`point::${point.id}`}
                                    data={{ kind: "point", category: cat.id }}
                                  >
                                    {({ handleProps }) => (
                                      <div className="border rounded-lg p-3 flex items-start justify-between hover:bg-gray-50 bg-white">
                                        <div className="flex items-start gap-2 flex-1">
                                          <button
                                            type="button"
                                            {...handleProps}
                                            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 mt-0.5 touch-none"
                                            data-testid={`drag-point-${point.id}`}
                                            aria-label="Drag point"
                                          >
                                            <GripVertical className="h-4 w-4" />
                                          </button>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {point.required ? (
                                                <CheckCircle2 className="h-4 w-4 text-orange-500" />
                                              ) : (
                                                <Circle className="h-4 w-4 text-gray-400" />
                                              )}
                                              <span className="font-medium">{point.name}</span>
                                              {point.required && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-xs text-orange-600 border-orange-300"
                                                >
                                                  Required
                                                </Badge>
                                              )}
                                              {point.inputType &&
                                                point.inputType !== "checkbox" && (
                                                  <Badge variant="outline" className="text-xs">
                                                    {point.inputType}
                                                  </Badge>
                                                )}
                                              {point.position && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] text-orange-600 border-orange-300"
                                                >
                                                  <MapPin className="h-3 w-3 mr-0.5" />
                                                  placed
                                                </Badge>
                                              )}
                                            </div>
                                            {point.description && (
                                              <p className="text-xs text-gray-600 mt-1 ml-6">
                                                {point.description}
                                              </p>
                                            )}
                                            {point.notes && (
                                              <p className="text-xs text-blue-600 mt-1 ml-6 italic">
                                                Note: {point.notes}
                                              </p>
                                            )}
                                            {point.inputType === "dropdown" &&
                                              (point.dropdownOptions?.length ?? 0) > 0 && (
                                                <p className="text-xs text-gray-500 mt-1 ml-6">
                                                  Options:{" "}
                                                  {point.dropdownOptions!.join(", ")}
                                                </p>
                                              )}
                                            {(point.photoPaths?.length ?? 0) > 0 && (
                                              <p className="text-xs text-gray-500 mt-1 ml-6">
                                                {point.photoPaths!.length} reference photo
                                                {point.photoPaths!.length === 1 ? "" : "s"}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditPoint(point)}
                                            data-testid={`button-edit-point-${point.id}`}
                                          >
                                            <Edit className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeletePoint(point.id)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            data-testid={`button-delete-point-${point.id}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </SortableRow>
                                ))}
                              </div>
                            )}
                          </SortableRow>
                        </SortableContext>
                      </div>
                    );
                  })}
                {/* Orphan points (category was deleted) */}
                {(() => {
                  const validIds = new Set(categories.map((c) => c.id));
                  const orphans = inspectionPoints.filter((p) => !validIds.has(p.category));
                  if (orphans.length === 0) return null;
                  return (
                    <div className="border border-red-300 bg-red-50 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-red-700 font-medium">
                        Points without a valid category — please edit and reassign:
                      </p>
                      {orphans.map((point) => (
                        <div
                          key={point.id}
                          className="flex items-center justify-between bg-white rounded p-2"
                        >
                          <span className="text-sm">
                            {point.name}{" "}
                            <span className="text-xs text-red-600">({point.category})</span>
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPoint(point)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePoint(point.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                </div>
              </DndContext>
            )}
          </section>
        </div>
          </div>

          {showPreview && (
            <div className="w-[45%] min-w-[380px] border-l bg-gray-50 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-white flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Live Preview</h3>
                  {previewLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                  )}
                </div>
                <span className="text-xs text-gray-500">Sample data</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden p-2">
                {previewError ? (
                  <div className="h-full flex items-center justify-center text-sm text-red-600 p-4 text-center">
                    {previewError}
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title="Template PDF preview"
                    className="w-full h-full border rounded bg-white"
                    data-testid="iframe-template-preview"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating preview…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-3 border-t flex-shrink-0 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-template"
          >
            {saveMutation.isPending
              ? "Saving..."
              : template
              ? "Update Template"
              : "Create Template"}
          </Button>
        </div>

        {pointEditorOpen && (
          <InspectionPointEditor
            open={pointEditorOpen}
            onOpenChange={setPointEditorOpen}
            point={editingPoint}
            categories={categories}
            onSave={handleSavePoint}
          />
        )}

        {bulkOpen && (
          <BulkAddDialog
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            categories={categories}
            onAdd={handleBulkAdd}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inspection Point Editor
// ---------------------------------------------------------------------------

function InspectionPointEditor({
  open,
  onOpenChange,
  point,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  point: InspectionPoint | null;
  categories: TemplateCategory[];
  onSave: (point: InspectionPoint) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(point?.name || "");
  const [category, setCategory] = useState(point?.category || categories[0]?.id || "");
  const [description, setDescription] = useState(point?.description || "");
  const [notes, setNotes] = useState(point?.notes || "");
  const [required, setRequired] = useState(point?.required || false);
  const [inputType, setInputType] = useState<"checkbox" | "text" | "dropdown">(
    point?.inputType || "checkbox",
  );
  const [dropdownOptionsText, setDropdownOptionsText] = useState(
    (point?.dropdownOptions || []).join("\n"),
  );
  const [selectedDamageTypes, setSelectedDamageTypes] = useState<string[]>(
    point?.damageTypes || [],
  );
  const [photoPaths, setPhotoPaths] = useState<string[]>(point?.photoPaths || []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const toggleDamageType = (type: string) => {
    setSelectedDamageTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch("/api/damage-check-templates/upload-photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      const stored: string | undefined = data?.path || data?.url;
      if (!stored) throw new Error("Upload response missing path");
      setPhotoPaths((paths) => [...paths, stored]);
      toast({ title: "Uploaded", description: "Reference photo added" });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload photo",
        variant: "destructive",
      });
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (!category) {
      toast({
        title: "Validation Error",
        description: "Please select a category",
        variant: "destructive",
      });
      return;
    }
    const dropdownOptions =
      inputType === "dropdown"
        ? dropdownOptionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    if (inputType === "dropdown" && (!dropdownOptions || dropdownOptions.length === 0)) {
      toast({
        title: "Validation Error",
        description: "Dropdown input requires at least one option (one per line)",
        variant: "destructive",
      });
      return;
    }

    const newPoint: InspectionPoint = {
      id: point?.id || `point-${Date.now()}`,
      name: name.trim(),
      category,
      damageTypes: inputType === "checkbox" ? selectedDamageTypes : [],
      description: description.trim() || undefined,
      required,
      position: point?.position,
      notes: notes.trim() || undefined,
      photoPaths: photoPaths.length > 0 ? photoPaths : undefined,
      inputType,
      dropdownOptions,
      order: point?.order,
    };
    onSave(newPoint);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{point ? "Edit Inspection Point" : "Add Inspection Point"}</DialogTitle>
          <DialogDescription>
            Define a specific area or item to check during vehicle inspection
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="point-name">Point Name *</Label>
            <Input
              id="point-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Front Bumper, Left Door, Engine Oil"
              data-testid="input-point-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="point-category">Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="point-category">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="point-input-type">Input Type</Label>
              <Select
                value={inputType}
                onValueChange={(val) => setInputType(val as "checkbox" | "text" | "dropdown")}
              >
                <SelectTrigger id="point-input-type" data-testid="select-input-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkbox">Checkbox (damage types)</SelectItem>
                  <SelectItem value="text">Free-text field</SelectItem>
                  <SelectItem value="dropdown">Dropdown (single choice)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="point-description">Description (Optional)</Label>
            <Textarea
              id="point-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What to check for this point..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="point-notes">Internal Notes (Optional)</Label>
            <Textarea
              id="point-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions for the inspector (printed on PDF)…"
              rows={2}
              data-testid="input-point-notes"
            />
          </div>

          {inputType === "checkbox" && (
            <div className="space-y-2">
              <Label>Damage Types</Label>
              <p className="text-xs text-gray-600 mb-2">
                Select which types of damage can be recorded for this inspection point
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DAMAGE_TYPES.map((damageType) => (
                  <div key={damageType.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`damage-${damageType.value}`}
                      checked={selectedDamageTypes.includes(damageType.value)}
                      onChange={() => toggleDamageType(damageType.value)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label
                      htmlFor={`damage-${damageType.value}`}
                      className="cursor-pointer text-sm"
                    >
                      {damageType.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inputType === "dropdown" && (
            <div className="space-y-2">
              <Label htmlFor="dropdown-options">Dropdown Options (one per line) *</Label>
              <Textarea
                id="dropdown-options"
                value={dropdownOptionsText}
                onChange={(e) => setDropdownOptionsText(e.target.value)}
                rows={4}
                placeholder={"Full\n3/4\n1/2\n1/4\nEmpty"}
                data-testid="input-dropdown-options"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Reference Photos (Optional)</Label>
            <div className="space-y-2">
              {photoPaths.length > 0 && (
                <ul className="space-y-1">
                  {photoPaths.map((p, idx) => (
                    <li
                      key={`${p}-${idx}`}
                      className="flex items-center justify-between text-xs bg-gray-50 rounded p-2"
                    >
                      <span className="truncate">{p}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPhotoPaths((paths) => paths.filter((_, i) => i !== idx))
                        }
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                data-testid="input-point-photo"
              />
              {uploadingPhoto && <p className="text-xs text-gray-500">Uploading…</p>}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="point-required"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
              data-testid="checkbox-point-required"
            />
            <Label htmlFor="point-required" className="cursor-pointer">
              Required check point
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()} data-testid="button-save-point">
            {point ? "Update" : "Add"} Point
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bulk add / paste dialog
// ---------------------------------------------------------------------------

function BulkAddDialog({
  open,
  onOpenChange,
  categories,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TemplateCategory[];
  onAdd: (
    parsed: Array<{ name: string; category: string; damageTypes: string[] }>,
  ) => void;
}) {
  const { toast } = useToast();
  const [defaultCategory, setDefaultCategory] = useState(categories[0]?.id || "");
  const [text, setText] = useState("");
  const [defaultDamageTypes, setDefaultDamageTypes] = useState<string[]>([]);

  const toggleDamageType = (type: string) => {
    setDefaultDamageTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleAdd = () => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast({
        title: "Nothing to add",
        description: "Paste at least one inspection point",
        variant: "destructive",
      });
      return;
    }
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const categoryByLabelLower = new Map(
      categories.map((c) => [c.label.toLowerCase(), c]),
    );

    const parsed = lines.map((line) => {
      // Format: "Name" or "Name | Category" or "Name | Category | dmg1,dmg2"
      const parts = line.split("|").map((p) => p.trim());
      const name = parts[0] || "";
      let categoryId = defaultCategory;
      if (parts[1]) {
        const lookup =
          categoryById.get(parts[1]) ||
          categoryByLabelLower.get(parts[1].toLowerCase());
        if (lookup) {
          categoryId = lookup.id;
        }
      }
      let damageTypes = defaultDamageTypes;
      if (parts[2]) {
        damageTypes = parts[2]
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);
      }
      return { name, category: categoryId, damageTypes };
    });

    const invalid = parsed.filter((p) => !p.name || !p.category);
    if (invalid.length > 0) {
      toast({
        title: "Invalid lines",
        description: `${invalid.length} line(s) missing name or category`,
        variant: "destructive",
      });
      return;
    }
    onAdd(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Add Inspection Points</DialogTitle>
          <DialogDescription>
            Paste one inspection point per line. Optional format:{" "}
            <code>Name | Category | damage1,damage2</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Default Category</Label>
              <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                <SelectTrigger data-testid="select-bulk-default-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Damage Types</Label>
              <div className="grid grid-cols-2 gap-1 border rounded p-2 max-h-32 overflow-y-auto">
                {DAMAGE_TYPES.map((dt) => (
                  <div key={dt.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`bulk-dmg-${dt.value}`}
                      checked={defaultDamageTypes.includes(dt.value)}
                      onChange={() => toggleDamageType(dt.value)}
                      className="h-3 w-3 rounded"
                    />
                    <Label
                      htmlFor={`bulk-dmg-${dt.value}`}
                      className="text-xs cursor-pointer"
                    >
                      {dt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-text">Inspection points (one per line)</Label>
            <Textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={
                "Front Bumper\nLeft Door | Exterieur\nFuel Level | Afweez Check | full,empty"
              }
              data-testid="input-bulk-text"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} data-testid="button-confirm-bulk-add">
            Add Points
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
