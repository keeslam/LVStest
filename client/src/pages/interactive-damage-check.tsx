import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Vehicle, type Reservation, type DamageCheckFieldsConfig, DEFAULT_DAMAGE_CHECK_FIELDS } from "@shared/schema";
import { displayLicensePlate } from "@/lib/utils";
import { apiRequest, queryClient, invalidateRelatedQueries, invalidateByPrefix } from "@/lib/queryClient";
import { X, Save, Trash2, Plus, Pencil, Eraser, Download, ClipboardCheck, Printer } from "lucide-react";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { ReservationSelector } from "@/components/ui/reservation-selector";

interface DamageMarker {
  id: string;
  x: number;
  y: number;
  type: 'scratch' | 'dent' | 'crack' | 'missing' | 'other';
  severity: 'minor' | 'moderate' | 'severe';
  notes: string;
}

interface DiagramTemplate {
  id: number;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  diagramPath: string;
  description: string | null;
}

interface InteractiveDamageCheckProps {
  onClose?: () => void;
  editingCheckId?: number | null;
  initialVehicleId?: number | null;
  initialReservationId?: number | null;
  compareWithCheckId?: number | null;
  initialCheckType?: 'pickup' | 'return';
  initialMileage?: string;
  initialFuelLevel?: string;
  initialDate?: string;
}

export default function InteractiveDamageCheck({ onClose, editingCheckId: propEditingCheckId, initialVehicleId, initialReservationId, compareWithCheckId, initialCheckType, initialMileage, initialFuelLevel, initialDate }: InteractiveDamageCheckProps = {}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingCheckId, setEditingCheckId] = useState<number | null>(propEditingCheckId || null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(initialReservationId || null);
  const [loadingExistingCheck, setLoadingExistingCheck] = useState(false);
  const [diagramTemplate, setDiagramTemplate] = useState<DiagramTemplate | null>(null);
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<DamageMarker | null>(null);
  const [selectedDamageType, setSelectedDamageType] = useState<'scratch' | 'dent' | 'crack' | 'missing' | 'other' | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPaths, setDrawingPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [checkType, setCheckType] = useState<'pickup' | 'return'>(initialCheckType || 'pickup');
  const [fuelLevel, setFuelLevel] = useState(initialFuelLevel || "");
  const [mileage, setMileage] = useState(initialMileage || "");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedCheckId, setLastSavedCheckId] = useState<number | null>(null);
  
  // Comparison mode state
  const [pickupCheckData, setPickupCheckData] = useState<any | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  
  // Damage check field schema (admin-editable). Fall back to the bundled
  // defaults so the UI still renders if the API fetch is slow / fails.
  const { data: fieldsConfig = DEFAULT_DAMAGE_CHECK_FIELDS } = useQuery<DamageCheckFieldsConfig>({
    queryKey: ['/api/damage-check-fields'],
  });

  // Inspection checklist items — shape: { interior:{key:string}, exterior:{key:string}, delivery:{key:boolean} }
  const [checklistItems, setChecklistItems] = useState<{
    interior: Record<string, string>;
    exterior: Record<string, string>;
    delivery: Record<string, boolean>;
  }>({ interior: {}, exterior: {}, delivery: {} });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renterSignatureRef = useRef<HTMLCanvasElement>(null);
  const customerSignatureRef = useRef<HTMLCanvasElement>(null);
  
  // Signature states
  const [isSigningRenter, setIsSigningRenter] = useState(false);
  const [isSigningCustomer, setIsSigningCustomer] = useState(false);
  const [renterSignature, setRenterSignature] = useState<string | null>(null);
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);

  // Handle initial vehicle ID from props
  useEffect(() => {
    if (initialVehicleId) {
      setSelectedVehicleId(initialVehicleId);
    }
  }, [initialVehicleId]);

  // Fetch and populate initial data from reservation when opening from reservation dialog
  useEffect(() => {
    const fetchReservationData = async () => {
      if (!initialReservationId || editingCheckId) return; // Skip if editing existing check
      
      try {
        const response = await fetch(`/api/reservations/${initialReservationId}`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const reservation = await response.json();
          
          // Populate fuel level based on check type
          if (checkType === 'pickup' && reservation.fuelLevelPickup && !fuelLevel) {
            const capitalizedFuelLevel = reservation.fuelLevelPickup.charAt(0).toUpperCase() + reservation.fuelLevelPickup.slice(1);
            setFuelLevel(capitalizedFuelLevel);
          } else if (checkType === 'return' && reservation.fuelLevelReturn && !fuelLevel) {
            const capitalizedFuelLevel = reservation.fuelLevelReturn.charAt(0).toUpperCase() + reservation.fuelLevelReturn.slice(1);
            setFuelLevel(capitalizedFuelLevel);
          }
          
          // Populate mileage based on check type
          if (checkType === 'pickup' && reservation.pickupMileage && !mileage) {
            setMileage(reservation.pickupMileage.toString());
          } else if (checkType === 'return' && reservation.returnMileage && !mileage) {
            setMileage(reservation.returnMileage.toString());
          }
        }
      } catch (error) {
        console.error('Error fetching reservation data:', error);
      }
    };

    fetchReservationData();
  }, [initialReservationId, checkType, editingCheckId]);

  // Fetch latest vehicle data (fuel level and mileage) when vehicle is selected
  useEffect(() => {
    const fetchLatestVehicleData = async () => {
      if (!selectedVehicleId) return;
      
      try {
        const url = new URL(`/api/vehicles/${selectedVehicleId}/latest-data`, window.location.origin);
        if (checkType) {
          url.searchParams.set('checkType', checkType);
        }
        
        const response = await fetch(url.toString(), {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Only auto-populate if fields are empty (don't override user input or loaded check data)
          if (!fuelLevel && data.fuelLevel) {
            // Capitalize fuel level to match Select options (e.g., "full" -> "Full")
            const capitalizedFuelLevel = data.fuelLevel.charAt(0).toUpperCase() + data.fuelLevel.slice(1);
            setFuelLevel(capitalizedFuelLevel);
          }
          if (!mileage && data.mileage) {
            setMileage(data.mileage.toString());
          }
        }
      } catch (error) {
        console.error('Error fetching latest vehicle data:', error);
      }
    };

    // Only fetch if not editing an existing check
    if (!editingCheckId && selectedVehicleId) {
      fetchLatestVehicleData();
    }
  }, [selectedVehicleId, editingCheckId, checkType]);

  // Sync editingCheckId when prop changes
  useEffect(() => {
    if (propEditingCheckId !== undefined) {
      setEditingCheckId(propEditingCheckId);
    }
  }, [propEditingCheckId]);

  // Parse URL params (for when used as standalone page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vehicleId = params.get('vehicleId');
    const reservationId = params.get('reservationId');
    const checkId = params.get('checkId');
    
    if (vehicleId) {
      setSelectedVehicleId(parseInt(vehicleId));
    }
    if (reservationId) {
      setSelectedReservationId(parseInt(reservationId));
    }
    if (checkId) {
      setEditingCheckId(parseInt(checkId));
    }
  }, []);

  // Load saved check when editing
  useEffect(() => {
    const loadSavedCheck = async () => {
      if (!editingCheckId) return;

      try {
        const response = await fetch(`/api/interactive-damage-checks/${editingCheckId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to load damage check');
        }

        const savedCheck = await response.json();
        
        // Populate form fields
        setSelectedVehicleId(savedCheck.vehicleId);
        setSelectedReservationId(savedCheck.reservationId);
        setCheckType(savedCheck.checkType);
        setFuelLevel(savedCheck.fuelLevel || '');
        setMileage(savedCheck.mileage || '');
        setNotes(savedCheck.notes || '');

        // If this is a return check, try to find and load the pickup check for comparison
        if (savedCheck.checkType === 'return' && savedCheck.reservationId) {
          try {
            const checksResponse = await fetch(`/api/interactive-damage-checks/reservation/${savedCheck.reservationId}`, {
              credentials: 'include',
            });
            
            if (checksResponse.ok) {
              const allChecks = await checksResponse.json();
              const pickupCheck = allChecks.find((c: any) => c.checkType === 'pickup');
              
              if (pickupCheck) {
                setPickupCheckData(pickupCheck);
                setShowComparison(true);
              }
            }
          } catch (err) {
            console.warn('Could not load pickup check for comparison:', err);
          }
        }

        // Load damage markers
        if (savedCheck.damageMarkers) {
          const loadedMarkers = typeof savedCheck.damageMarkers === 'string'
            ? JSON.parse(savedCheck.damageMarkers)
            : savedCheck.damageMarkers;
          setMarkers(loadedMarkers || []);
        }

        // Load drawing paths
        if (savedCheck.drawingPaths) {
          const loadedPaths = typeof savedCheck.drawingPaths === 'string'
            ? JSON.parse(savedCheck.drawingPaths)
            : savedCheck.drawingPaths;
          setDrawingPaths(loadedPaths || []);
        }

        // Load checklist data
        if (savedCheck.checklistData) {
          const loadedChecklist = typeof savedCheck.checklistData === 'string'
            ? JSON.parse(savedCheck.checklistData)
            : savedCheck.checklistData;
          setChecklistItems({
            interior: loadedChecklist.interior || checklistItems.interior,
            exterior: loadedChecklist.exterior || checklistItems.exterior,
            delivery: loadedChecklist.delivery || checklistItems.delivery,
          });
        }

        // Load signatures
        if (savedCheck.renterSignature) {
          setRenterSignature(savedCheck.renterSignature);
        }
        if (savedCheck.customerSignature) {
          setCustomerSignature(savedCheck.customerSignature);
        }

        // Load diagram template
        if (savedCheck.diagramTemplateId) {
          const templateResponse = await fetch(`/api/vehicle-diagram-templates/${savedCheck.diagramTemplateId}`);
          if (templateResponse.ok) {
            const template = await templateResponse.json();
            setDiagramTemplate(template);
          }
        }

        toast({
          title: "Check Loaded",
          description: "Damage check loaded successfully for editing",
        });
      } catch (error) {
        console.error('Error loading damage check:', error);
        toast({
          title: "Error",
          description: "Failed to load damage check",
          variant: "destructive",
        });
      }
    };

    loadSavedCheck();
  }, [editingCheckId, toast]);

  // Load pickup check for comparison when creating return check
  useEffect(() => {
    const loadPickupCheck = async () => {
      if (!compareWithCheckId) return;

      try {
        const response = await fetch(`/api/interactive-damage-checks/${compareWithCheckId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to load pickup check for comparison');
        }

        const pickupCheck = await response.json();
        setPickupCheckData(pickupCheck);
        setShowComparison(true);
        setCheckType('return'); // Automatically set to return check when comparing

        toast({
          title: "Comparison Mode",
          description: "Showing pickup check for comparison",
        });
      } catch (error) {
        console.error('Error loading pickup check for comparison:', error);
        toast({
          title: "Error",
          description: "Failed to load pickup check for comparison",
          variant: "destructive",
        });
      }
    };

    loadPickupCheck();
  }, [compareWithCheckId, toast]);

  // Fetch vehicles
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
  });

  // Fetch reservations
  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ['/api/reservations'],
  });

  // Fetch existing damage checks for selected vehicle/reservation
  const { data: existingChecks = [] } = useQuery<any[]>({
    queryKey: ['/api/interactive-damage-checks', 'reservation', selectedReservationId],
    queryFn: async () => {
      if (!selectedReservationId) return [];
      
      const url = `/api/interactive-damage-checks/reservation/${selectedReservationId}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedReservationId,
  });

  useEffect(() => {
    if (checkType === 'return' && selectedReservationId && !editingCheckId && !compareWithCheckId && existingChecks.length > 0) {
      const pickupCheck = existingChecks.find((c: any) => c.checkType === 'pickup');
      if (pickupCheck && (!pickupCheckData || pickupCheckData.id !== pickupCheck.id)) {
        setPickupCheckData(pickupCheck);
        setShowComparison(true);
      }
    } else if (checkType === 'pickup' && !compareWithCheckId) {
      setPickupCheckData(null);
      setShowComparison(false);
    }
  }, [checkType, selectedReservationId, existingChecks, editingCheckId, compareWithCheckId]);

  // Fetch matching diagram when vehicle is selected
  useEffect(() => {
    const fetchDiagram = async () => {
      if (!selectedVehicleId) return;
      
      try {
        const response = await fetch(`/api/vehicle-diagram-templates/match/${selectedVehicleId}`);
        if (response.ok) {
          const template = await response.json();
          setDiagramTemplate(template);
        } else {
          toast({
            title: "No diagram found",
            description: "No matching vehicle diagram found for this vehicle",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching diagram:", error);
      }
    };

    fetchDiagram();
  }, [selectedVehicleId, toast]);

  // Auto-select vehicle from reservation
  useEffect(() => {
    if (selectedReservationId) {
      const reservation = reservations.find(r => r.id === selectedReservationId);
      if (reservation && reservation.vehicleId) {
        setSelectedVehicleId(reservation.vehicleId);
      }
    }
  }, [selectedReservationId, reservations]);

  // Setup canvas drawing
  useEffect(() => {
    if (!canvasRef.current || !imageRef.current || !diagramTemplate) return;

    const canvas = canvasRef.current;
    const image = imageRef.current;

    const setupCanvas = () => {
      // Use naturalWidth/naturalHeight for the actual image dimensions
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      redrawCanvas();
    };

    // If image is already loaded, setup immediately
    if (image.complete && image.naturalWidth) {
      setupCanvas();
    }
    
    // Also setup when image loads (for first load)
    image.onload = setupCanvas;
    
    return () => {
      image.onload = null;
    };
  }, [diagramTemplate, markers, drawingPaths, pickupCheckData]);

  // Helper function to get color for damage type
  const getDamageTypeColor = (type: string): string => {
    switch (type) {
      case 'dent': return '#3B82F6'; // Blue
      case 'scratch': return '#F97316'; // Orange
      case 'crack': return '#EF4444'; // Red
      case 'missing': return '#A855F7'; // Purple
      case 'other': return '#6B7280'; // Gray
      default: return '#3B82F6';
    }
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pickup check damage in gray (if in comparison mode)
    if (showComparison && pickupCheckData) {
      // Draw pickup drawing paths in gray
      if (pickupCheckData.drawingPaths) {
        const pickupPaths = typeof pickupCheckData.drawingPaths === 'string' 
          ? JSON.parse(pickupCheckData.drawingPaths) 
          : pickupCheckData.drawingPaths;
        
        ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)'; // Gray with transparency
        ctx.lineWidth = 3;
        pickupPaths.forEach((path: string) => {
          const points = path.split(' ');
          ctx.beginPath();
          points.forEach((point: string, i: number) => {
            const [xPercent, yPercent] = point.split(',').map(Number);
            const x = xPercent * canvas.width;
            const y = yPercent * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        });
      }

      // Draw pickup markers in gray
      if (pickupCheckData.damageMarkers) {
        const pickupMarkers = typeof pickupCheckData.damageMarkers === 'string' 
          ? JSON.parse(pickupCheckData.damageMarkers) 
          : pickupCheckData.damageMarkers;
        
        pickupMarkers.forEach((marker: any, index: number) => {
          const x = marker.x * canvas.width;
          const y = marker.y * canvas.height;
          const markerRadius = Math.max(6, canvas.width * 0.005);
          
          // Draw gray marker with border
          ctx.fillStyle = 'rgba(156, 163, 175, 0.7)'; // Gray with transparency
          ctx.strokeStyle = 'rgba(75, 85, 99, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw number
          ctx.fillStyle = 'white';
          const fontSize = Math.max(10, markerRadius * 1.2);
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((index + 1).toString(), x, y);
        });
      }
    }

    // Draw current/new paths - convert from percentages to pixels
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 3;
    drawingPaths.forEach(path => {
      const points = path.split(' ');
      ctx.beginPath();
      points.forEach((point, i) => {
        const [xPercent, yPercent] = point.split(',').map(Number);
        // Convert percentage (0-1) to pixel coordinates
        const x = xPercent * canvas.width;
        const y = yPercent * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Draw current/new markers - convert from percentages to pixels
    markers.forEach(marker => {
      const markerColor = getDamageTypeColor(marker.type);
      
      // Convert percentage coordinates to pixels
      const x = marker.x * canvas.width;
      const y = marker.y * canvas.height;
      
      // Make marker size proportional to canvas size (1% of width for larger dots)
      const markerRadius = Math.max(12, canvas.width * 0.010);
      
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      const fontSize = Math.max(10, markerRadius * 1.2);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((markers.indexOf(marker) + 1).toString(), x, y);
    });
  };

  useEffect(() => {
    redrawCanvas();
  }, [markers, drawingPaths]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Convert click coordinates to percentage (0-1)
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    // Check if clicked on existing marker (convert marker percentages to pixels for distance check)
    const clickRadius = 15 / rect.width; // Click radius as percentage
    const clickedMarker = markers.find(m => {
      const dx = m.x - xPercent;
      const dy = m.y - yPercent;
      return Math.sqrt(dx * dx + dy * dy) < clickRadius;
    });

    if (clickedMarker) {
      setSelectedMarker(clickedMarker);
    } else {
      // Only add marker if a damage type is selected
      if (!selectedDamageType) {
        toast({
          title: "Select Damage Type",
          description: "Please select a damage type (Dent, Scratch, etc.) before marking on the diagram",
          variant: "destructive",
        });
        return;
      }
      
      // Add new marker with percentage coordinates
      const newMarker: DamageMarker = {
        id: Date.now().toString(),
        x: xPercent,
        y: yPercent,
        type: selectedDamageType,
        severity: 'minor',
        notes: '',
      };
      setMarkers([...markers, newMarker]);
      setSelectedMarker(newMarker);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Convert to percentage coordinates (0-1)
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;
    setCurrentPath(`${xPercent},${yPercent}`);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentPath) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Convert to percentage coordinates (0-1)
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;
    setCurrentPath(prev => `${prev} ${xPercent},${yPercent}`);

    // Draw preview - convert percentages to pixels for display
    const ctx = canvas.getContext('2d');
    if (ctx) {
      redrawCanvas();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      const points = (currentPath + ` ${xPercent},${yPercent}`).split(' ');
      ctx.beginPath();
      points.forEach((point, i) => {
        const [pxPercent, pyPercent] = point.split(',').map(Number);
        const px = pxPercent * canvas.width;
        const py = pyPercent * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentPath) return;
    setDrawingPaths([...drawingPaths, currentPath]);
    setCurrentPath("");
  };

  // Touch event handlers for iPad/mobile support
  const [touchStartPos, setTouchStartPos] = useState<{x: number, y: number} | null>(null);
  const [hasTouchMoved, setHasTouchMoved] = useState(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const xPercent = (touch.clientX - rect.left) / rect.width;
    const yPercent = (touch.clientY - rect.top) / rect.height;
    
    setTouchStartPos({ x: xPercent, y: yPercent });
    setHasTouchMoved(false);

    if (isDrawing) {
      setCurrentPath(`${xPercent},${yPercent}`);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling
    
    setHasTouchMoved(true);
    
    if (!isDrawing || !currentPath) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const xPercent = (touch.clientX - rect.left) / rect.width;
    const yPercent = (touch.clientY - rect.top) / rect.height;
    setCurrentPath(prev => `${prev} ${xPercent},${yPercent}`);

    // Draw preview
    const ctx = canvas.getContext('2d');
    if (ctx) {
      redrawCanvas();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      const points = (currentPath + ` ${xPercent},${yPercent}`).split(' ');
      ctx.beginPath();
      points.forEach((point, i) => {
        const [pxPercent, pyPercent] = point.split(',').map(Number);
        const px = pxPercent * canvas.width;
        const py = pyPercent * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    if (isDrawing && currentPath) {
      // Finish drawing path
      setDrawingPaths([...drawingPaths, currentPath]);
      setCurrentPath("");
    } else if (!isDrawing && !hasTouchMoved && touchStartPos) {
      // This was a tap (not a drag), add/select marker
      const canvas = canvasRef.current;
      if (!canvas) return;

      const xPercent = touchStartPos.x;
      const yPercent = touchStartPos.y;

      // Check if tapped on existing marker
      const tapRadius = 15 / canvas.getBoundingClientRect().width;
      const tappedMarker = markers.find(m => {
        const dx = m.x - xPercent;
        const dy = m.y - yPercent;
        return Math.sqrt(dx * dx + dy * dy) < tapRadius;
      });

      if (tappedMarker) {
        setSelectedMarker(tappedMarker);
      } else {
        // Add new marker
        const newMarker: DamageMarker = {
          id: Date.now().toString(),
          x: xPercent,
          y: yPercent,
          type: 'scratch',
          severity: 'minor',
          notes: '',
        };
        setMarkers([...markers, newMarker]);
        setSelectedMarker(newMarker);
      }
    }
    
    setTouchStartPos(null);
    setHasTouchMoved(false);
  };

  const updateMarker = (updates: Partial<DamageMarker>) => {
    if (!selectedMarker) return;
    const updated = markers.map(m => 
      m.id === selectedMarker.id ? { ...m, ...updates } : m
    );
    setMarkers(updated);
    setSelectedMarker(updated.find(m => m.id === selectedMarker.id) || null);
  };

  const deleteMarker = (markerId: string) => {
    setMarkers(markers.filter(m => m.id !== markerId));
    if (selectedMarker?.id === markerId) {
      setSelectedMarker(null);
    }
  };

  const clearDrawings = () => {
    setDrawingPaths([]);
  };

  // Load an existing damage check
  const loadExistingCheck = async (checkId: number) => {
    if (!checkId) return;
    
    setLoadingExistingCheck(true);
    try {
      const response = await fetch(`/api/interactive-damage-checks/${checkId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load damage check');
      }

      const savedCheck = await response.json();
      
      // Set editing mode
      setEditingCheckId(checkId);
      
      // Populate form fields
      setCheckType(savedCheck.checkType);
      setFuelLevel(savedCheck.fuelLevel || '');
      setMileage(savedCheck.mileage || '');
      setNotes(savedCheck.notes || '');

      // Load damage markers
      if (savedCheck.damageMarkers) {
        const loadedMarkers = typeof savedCheck.damageMarkers === 'string'
          ? JSON.parse(savedCheck.damageMarkers)
          : savedCheck.damageMarkers;
        setMarkers(loadedMarkers || []);
      }

      // Load drawing paths
      if (savedCheck.drawingPaths) {
        const loadedPaths = typeof savedCheck.drawingPaths === 'string'
          ? JSON.parse(savedCheck.drawingPaths)
          : savedCheck.drawingPaths;
        setDrawingPaths(loadedPaths || []);
      }

      // Load checklist data
      if (savedCheck.checklistData) {
        const loadedChecklist = typeof savedCheck.checklistData === 'string'
          ? JSON.parse(savedCheck.checklistData)
          : savedCheck.checklistData;
        setChecklistItems({
          interior: loadedChecklist.interior || checklistItems.interior,
          exterior: loadedChecklist.exterior || checklistItems.exterior,
          delivery: loadedChecklist.delivery || checklistItems.delivery,
        });
      }

      // Load signatures
      if (savedCheck.renterSignature) {
        setRenterSignature(savedCheck.renterSignature);
      }
      if (savedCheck.customerSignature) {
        setCustomerSignature(savedCheck.customerSignature);
      }

      toast({
        title: "Check Loaded",
        description: `Loaded damage check from ${new Date(savedCheck.checkDate || savedCheck.createdAt).toLocaleDateString()}`,
      });
    } catch (error) {
      console.error('Error loading damage check:', error);
      toast({
        title: "Error",
        description: "Failed to load damage check",
        variant: "destructive",
      });
    } finally {
      setLoadingExistingCheck(false);
    }
  };

  // Signature handling
  const setupSignatureCanvas = (canvasRef: React.RefObject<HTMLCanvasElement>, setIsSigning: (val: boolean) => void) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2; // Higher resolution
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    const startDrawing = (e: MouseEvent | TouchEvent) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as MouseEvent).clientX - rect.left;
      const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as MouseEvent).clientY - rect.top;
      lastX = x;
      lastY = y;
    };
    
    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as MouseEvent).clientX - rect.left;
      const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as MouseEvent).clientY - rect.top;
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      lastX = x;
      lastY = y;
    };
    
    const stopDrawing = () => {
      isDrawing = false;
    };
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);
    
    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  };
  
  const clearSignature = (canvasRef: React.RefObject<HTMLCanvasElement>, setSignature: (val: string | null) => void) => {
    // Always reset the stored signature — when a saved signature image is
    // displayed the canvas element is unmounted, so canvasRef.current is null.
    // If we bailed out here the "Clear Signature" button would do nothing.
    setSignature(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  
  const saveSignature = (canvasRef: React.RefObject<HTMLCanvasElement>, setSignature: (val: string | null) => void, setIsSigning: (val: boolean) => void) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataUrl = canvas.toDataURL('image/png');
    setSignature(dataUrl);
    setIsSigning(false);
  };

  const handleSave = async () => {
    if (!selectedVehicleId || !diagramTemplate) {
      toast({
        title: "Validation Error",
        description: "Please select a vehicle",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      // Convert canvas to base64 image
      const canvas = canvasRef.current;
      let diagramWithAnnotations = "";
      
      if (canvas && imageRef.current) {
        // Create a temporary canvas with the background image and annotations
        const tempCanvas = document.createElement('canvas');
        const img = imageRef.current;
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx) {
          // Draw background image
          tempCtx.drawImage(img, 0, 0);
          
          // Draw annotations from main canvas
          tempCtx.drawImage(canvas, 0, 0);
          
          diagramWithAnnotations = tempCanvas.toDataURL('image/png');
        }
      }

      const checkData = {
        vehicleId: selectedVehicleId,
        reservationId: selectedReservationId,
        checkType,
        checkDate: new Date().toISOString().split('T')[0], // Format as YYYY-MM-DD
        diagramTemplateId: diagramTemplate.id,
        damageMarkers: JSON.stringify(markers),
        drawingPaths: JSON.stringify(drawingPaths),
        diagramWithAnnotations,
        fuelLevel: fuelLevel || null,
        mileage: mileage ? parseInt(mileage) : null,
        notes: notes || null,
        checklistData: JSON.stringify(checklistItems),
        renterSignature: renterSignature || null,
        customerSignature: customerSignature || null,
      };

      // Use PUT for update, POST for create
      let savedId: number | null = null;
      if (editingCheckId) {
        await apiRequest('PUT', `/api/interactive-damage-checks/${editingCheckId}`, checkData);
        savedId = editingCheckId;
        toast({
          title: "Success",
          description: "Damage check updated successfully",
        });
      } else {
        try {
          const postRes = await apiRequest('POST', '/api/interactive-damage-checks', checkData);
          try {
            const created = await postRes.json();
            if (created?.id) {
              savedId = created.id;
              setEditingCheckId(created.id);
            }
          } catch {
            // ignore JSON parse errors — we'll just leave Print disabled
          }
          toast({
            title: "Success",
            description: "Damage check saved successfully",
          });
        } catch (postError: any) {
          if (postError.message?.includes('already exists') || postError.message?.startsWith('409')) {
            const existingChecksRes = await fetch(`/api/interactive-damage-checks/reservation/${selectedReservationId}`, { credentials: 'include' });
            if (existingChecksRes.ok) {
              const checks = await existingChecksRes.json();
              const existing = checks.find((c: any) => c.checkType === checkType);
              if (existing) {
                setEditingCheckId(existing.id);
                await apiRequest('PUT', `/api/interactive-damage-checks/${existing.id}`, checkData);
                savedId = existing.id;
                toast({
                  title: "Success",
                  description: "Existing damage check updated with your changes",
                });
              } else {
                throw postError;
              }
            } else {
              throw postError;
            }
          } else {
            throw postError;
          }
        }
      }
      if (savedId) setLastSavedCheckId(savedId);

      invalidateRelatedQueries('reservations');
      invalidateRelatedQueries('vehicles');
      invalidateByPrefix('/api/interactive-damage-checks');
      // Active refetch so the vehicle-details and reservation-detail logs
      // update immediately if they're currently visible.
      if (selectedVehicleId) {
        queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/vehicle/${selectedVehicleId}`], refetchType: 'active' });
      }
      if (selectedReservationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/interactive-damage-checks/reservation/${selectedReservationId}`], refetchType: 'active' });
      }

      // Intentionally do NOT close the dialog or navigate away after save —
      // the user wants to stay on this view so they can print the PDF (or
      // keep editing) and close it themselves via the Close button or the X.
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save damage check",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">
              {showComparison ? 'Create Return Check - Compare with Pickup' : 'Interactive Damage Check'}
            </h1>
            <p className="text-gray-600 mt-1">
              {showComparison ? 'Review pickup damage and mark any new damage found on return' : 'iPad-optimized damage inspection interface'}
            </p>
          </div>
          <Button variant="outline" onClick={() => onClose ? onClose() : navigate('/documents')} data-testid="button-close">
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>

        {/* Pickup Check Comparison Panel */}
        {showComparison && pickupCheckData && (
          <Card className="p-4 mb-6 bg-blue-50 border-blue-300">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Pickup Check Reference
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Date:</span>
                    <span className="ml-2 text-blue-900">
                      {pickupCheckData.checkDate ? new Date(pickupCheckData.checkDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  {pickupCheckData.mileage && (
                    <div>
                      <span className="text-blue-700 font-medium">Mileage:</span>
                      <span className="ml-2 text-blue-900">{Number(pickupCheckData.mileage).toLocaleString()} km</span>
                    </div>
                  )}
                  {pickupCheckData.fuelLevel && (
                    <div>
                      <span className="text-blue-700 font-medium">Fuel:</span>
                      <span className="ml-2 text-blue-900">{pickupCheckData.fuelLevel}</span>
                    </div>
                  )}
                  {pickupCheckData.damageMarkers && JSON.parse(pickupCheckData.damageMarkers).length > 0 && (
                    <div>
                      <span className="text-blue-700 font-medium">Existing Damage:</span>
                      <span className="ml-2 text-blue-900 font-semibold">
                        {JSON.parse(pickupCheckData.damageMarkers).length} item(s)
                      </span>
                    </div>
                  )}
                </div>
                {pickupCheckData.notes && (
                  <div className="mt-2 text-sm">
                    <span className="text-blue-700 font-medium">Notes:</span>
                    <span className="ml-2 text-blue-900 italic">{pickupCheckData.notes}</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/api/interactive-damage-checks/${pickupCheckData.id}/pdf`, '_blank')}
                className="bg-white hover:bg-blue-100"
              >
                View Pickup PDF
              </Button>
            </div>
          </Card>
        )}

        {/* Vehicle Selection - Full Width */}
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <Label>Vehicle *</Label>
              <VehicleSelector
                vehicles={vehicles}
                value={selectedVehicleId?.toString() || ""}
                onChange={(val) => setSelectedVehicleId(parseInt(val))}
                placeholder="Select a vehicle"
              />
            </div>

            <div>
              <Label>Reservation (Optional)</Label>
              <ReservationSelector
                reservations={reservations}
                value={selectedReservationId}
                onChange={setSelectedReservationId}
                placeholder="Link to reservation"
                allowNone={true}
              />
            </div>

            <div>
              <Label>Check Type</Label>
              <Select value={checkType} onValueChange={(val: any) => setCheckType(val)}>
                <SelectTrigger data-testid="select-check-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">Pickup Inspection</SelectItem>
                  <SelectItem value="return">Return Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col items-stretch gap-2">
              <Button 
                onClick={handleSave}
                disabled={isSaving || !selectedVehicleId || !diagramTemplate}
                className="w-full"
                data-testid="button-save-check"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Check'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const id = lastSavedCheckId ?? editingCheckId;
                  if (!id) return;
                  window.open(`/api/interactive-damage-checks/${id}/pdf`, '_blank');
                }}
                disabled={isSaving || !(lastSavedCheckId ?? editingCheckId)}
                className="w-full"
                data-testid="button-print-check"
                title={!(lastSavedCheckId ?? editingCheckId) ? 'Save the check first to enable printing' : 'Open the generated PDF in a new tab to print'}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print PDF
              </Button>
            </div>
          </div>

          {/* Load Previous Check Dropdown */}
          {existingChecks.length > 0 && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-sm text-gray-600">Load Previous Damage Check</Label>
                  <Select 
                    value={editingCheckId?.toString() || "new"} 
                    onValueChange={(val) => {
                      if (val === "new") {
                        setEditingCheckId(null);
                        setLastSavedCheckId(null);
                        setMarkers([]);
                        setDrawingPaths([]);
                        setFuelLevel("");
                        setMileage("");
                        setNotes("");
                        setRenterSignature(null);
                        setCustomerSignature(null);
                      } else {
                        loadExistingCheck(parseInt(val));
                      }
                    }}
                    disabled={loadingExistingCheck}
                  >
                    <SelectTrigger className="w-full" data-testid="select-previous-check">
                      <SelectValue placeholder="Create new check..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        <span className="font-medium">+ Create New Check</span>
                      </SelectItem>
                      {existingChecks
                        .sort((a, b) => new Date(b.checkDate || b.createdAt).getTime() - new Date(a.checkDate || a.createdAt).getTime())
                        .map((check) => {
                          const date = new Date(check.checkDate || check.createdAt).toLocaleDateString();
                          const damageCount = check.damageMarkers ? JSON.parse(check.damageMarkers).length : 0;
                          return (
                            <SelectItem key={check.id} value={check.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${check.checkType === 'pickup' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {check.checkType}
                                </span>
                                <span>{date}</span>
                                {damageCount > 0 && (
                                  <span className="text-xs text-gray-500">({damageCount} damage points)</span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-gray-500">
                  {existingChecks.length} check(s) found
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Diagram Canvas - Full Width */}
        <Card className="p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">
              {selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Vehicle Diagram'}
            </h3>
            <div className="flex gap-2">
              <Button 
                variant={isDrawing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsDrawing(!isDrawing)}
                data-testid="button-toggle-drawing"
              >
                {isDrawing ? <Eraser className="h-4 w-4 mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                {isDrawing ? 'Stop Drawing' : 'Draw'}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={clearDrawings}
                disabled={drawingPaths.length === 0}
                data-testid="button-clear-drawings"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Drawings
              </Button>
            </div>
          </div>

          {/* Damage Type Selector */}
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
            <h4 className="font-semibold text-sm mb-3 text-blue-900">Select Damage Type, Then Click on Diagram:</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Button
                variant={selectedDamageType === 'dent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDamageType('dent')}
                className={selectedDamageType === 'dent' ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-blue-50'}
                data-testid="button-select-dent"
              >
                <span className="font-bold bg-white text-blue-600 w-10 h-10 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full flex items-center justify-center mr-2 text-base md:text-sm">1</span>
                Dent
              </Button>
              <Button
                variant={selectedDamageType === 'scratch' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDamageType('scratch')}
                className={selectedDamageType === 'scratch' ? 'bg-orange-600 hover:bg-orange-700' : 'hover:bg-orange-50'}
                data-testid="button-select-scratch"
              >
                <span className="font-bold bg-white text-orange-600 w-10 h-10 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full flex items-center justify-center mr-2 text-base md:text-sm">2</span>
                Scratch
              </Button>
              <Button
                variant={selectedDamageType === 'crack' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDamageType('crack')}
                className={selectedDamageType === 'crack' ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-red-50'}
                data-testid="button-select-crack"
              >
                <span className="font-bold bg-white text-red-600 w-10 h-10 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full flex items-center justify-center mr-2 text-base md:text-sm">3</span>
                Crack
              </Button>
              <Button
                variant={selectedDamageType === 'missing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDamageType('missing')}
                className={selectedDamageType === 'missing' ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-purple-50'}
                data-testid="button-select-missing"
              >
                <span className="font-bold bg-white text-purple-600 w-10 h-10 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full flex items-center justify-center mr-2 text-base md:text-sm">4</span>
                Missing Part
              </Button>
              <Button
                variant={selectedDamageType === 'other' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDamageType('other')}
                className={selectedDamageType === 'other' ? 'bg-gray-600 hover:bg-gray-700' : 'hover:bg-gray-50'}
                data-testid="button-select-other"
              >
                <span className="font-bold bg-white text-gray-600 w-10 h-10 md:w-9 md:h-9 lg:w-7 lg:h-7 rounded-full flex items-center justify-center mr-2 text-base md:text-sm">5</span>
                Other
              </Button>
            </div>
            {selectedDamageType && (
              <p className="text-xs text-blue-700 mt-2 font-medium">
                ✓ Selected: <span className="uppercase">{selectedDamageType}</span> - Now click on the diagram to mark damage locations
              </p>
            )}
          </div>

          {/* Comparison Mode Legend */}
          {showComparison && pickupCheckData && (
            <div className="mb-4 space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Comparison View Legend:</p>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gray-400 border-2 border-gray-600"></div>
                    <span className="text-gray-700">Existing damage from pickup check</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                    <span className="text-gray-700">New damage marked on return</span>
                  </div>
                </div>
              </div>

              {/* Pickup Damage Reference */}
              {pickupCheckData.markers && pickupCheckData.markers.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-900 mb-2">Pickup Check Damage Points (Reference):</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                    {pickupCheckData.markers.map((marker: any, index: number) => (
                      <div 
                        key={index}
                        className="p-2 rounded bg-white border border-green-300"
                      >
                        <span className="font-bold text-gray-600">#{index + 1}</span>
                        <span className="text-gray-700"> - {marker.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {diagramTemplate ? (
            <div 
              ref={containerRef} 
              className="relative bg-white border rounded-lg" 
              style={{ touchAction: isDrawing ? 'none' : 'auto' }}
            >
              <div className="relative w-full" style={{ touchAction: isDrawing ? 'none' : 'auto' }}>
                <img 
                  ref={imageRef}
                  src={`/api/vehicle-diagram-templates/${diagramTemplate.id}/image`}
                  alt="Vehicle diagram"
                  className="w-full h-auto pointer-events-none"
                  crossOrigin="anonymous"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                  style={{ 
                    cursor: isDrawing ? 'crosshair' : 'pointer',
                    touchAction: 'none'
                  }}
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                  data-testid="damage-canvas"
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg">Select a vehicle to load the diagram</p>
              <p className="text-sm mt-2">Vehicle diagrams can be added in Documents → Damage Check → Diagram Templates</p>
            </div>
          )}

          {markers.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Damage Points ({markers.length})</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
                {markers.map((marker, index) => (
                  <div 
                    key={marker.id}
                    className={`p-2 rounded cursor-pointer ${selectedMarker?.id === marker.id ? 'bg-blue-100' : 'bg-white'}`}
                    onClick={() => setSelectedMarker(marker)}
                    data-testid={`marker-summary-${index}`}
                  >
                    <span className="font-medium">#{index + 1}</span> - {marker.type}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Damage Point Details - Directly Below Diagram */}
        {selectedMarker && (
          <Card className="p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">
                Damage Point #{markers.indexOf(selectedMarker) + 1} Details
              </h3>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => deleteMarker(selectedMarker.id)}
                data-testid="button-delete-marker"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Damage Type</Label>
                <Select 
                  value={selectedMarker.type} 
                  onValueChange={(val: any) => updateMarker({ type: val })}
                >
                  <SelectTrigger data-testid="select-damage-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dent">1 - Dent</SelectItem>
                    <SelectItem value="scratch">2 - Scratch</SelectItem>
                    <SelectItem value="crack">3 - Crack</SelectItem>
                    <SelectItem value="missing">4 - Missing Part</SelectItem>
                    <SelectItem value="other">5 - Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Severity</Label>
                <Select 
                  value={selectedMarker.severity} 
                  onValueChange={(val: any) => updateMarker({ severity: val })}
                >
                  <SelectTrigger data-testid="select-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea 
                  placeholder="Describe the damage..." 
                  value={selectedMarker.notes}
                  onChange={(e) => updateMarker({ notes: e.target.value })}
                  rows={3}
                  data-testid="textarea-marker-notes"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Inspection Checklist — paper-style multi-select chips.
            Stored value is a CSV (e.g. "LV,RV") so legacy single-value strings
            like "schoon" or "ja" still load and the PDF renders them as-is. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {fieldsConfig.groups.map((group) => (
            <Card key={group.id} className="p-4">
              <h3 className="font-bold text-center text-lg mb-4 bg-blue-900 text-white py-2 rounded">{group.label}</h3>
              <div className="space-y-3 text-sm">
                {group.fields.map((field) => {
                  if (field.inputType === 'checkbox') {
                    const checked = !!checklistItems[group.id]?.[field.key];
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => setChecklistItems({
                          ...checklistItems,
                          [group.id]: { ...checklistItems[group.id], [field.key]: !checked },
                        })}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded border text-left transition-colors ${
                          checked ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                        data-testid={`checkbox-${group.id}-${field.key}`}
                      >
                        <span className={`inline-flex items-center justify-center w-5 h-5 border-2 rounded ${
                          checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400'
                        }`}>
                          {checked && (
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="2 6 5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span>{field.label}</span>
                      </button>
                    );
                  }
                  // Multi-select chip group — tap to toggle, like circling options on paper.
                  const raw = (checklistItems[group.id]?.[field.key] as string) || '';
                  const selected = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
                  const toggle = (opt: string) => {
                    const next = selected.includes(opt)
                      ? selected.filter(o => o !== opt)
                      : [...selected, opt];
                    setChecklistItems({
                      ...checklistItems,
                      [group.id]: { ...checklistItems[group.id], [field.key]: next.join(',') },
                    });
                  };
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <div className="font-medium text-gray-700">{field.label}</div>
                      <div className="flex flex-wrap gap-1.5" data-testid={`chips-${group.id}-${field.key}`}>
                        {field.options.map((opt) => {
                          const isOn = selected.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggle(opt)}
                              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                isOn
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                              }`}
                              data-testid={`chip-${group.id}-${field.key}-${opt}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        {/* Vehicle Details */}
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-4">Vehicle Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Fuel Level</Label>
              <Select value={fuelLevel} onValueChange={setFuelLevel}>
                <SelectTrigger data-testid="select-fuel-level">
                  <SelectValue placeholder="Select fuel level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Empty">Empty</SelectItem>
                  <SelectItem value="1/4">1/4</SelectItem>
                  <SelectItem value="1/2">1/2</SelectItem>
                  <SelectItem value="3/4">3/4</SelectItem>
                  <SelectItem value="Full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Mileage</Label>
              <Input 
                type="number" 
                placeholder="Current mileage" 
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                data-testid="input-mileage"
              />
            </div>

            <div>
              <Label>General Notes</Label>
              <Textarea 
                placeholder="Add general observations..." 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>
          </div>
        </Card>

        {/* Signatures Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Renter Signature */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Renter Signature</h3>
            {renterSignature ? (
              <div>
                <img src={renterSignature} alt="Renter signature" className="border rounded h-32 w-full object-contain bg-white" />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => clearSignature(renterSignatureRef, setRenterSignature)}
                  className="mt-2"
                  data-testid="button-clear-renter-signature"
                >
                  Clear Signature
                </Button>
              </div>
            ) : (
              <div>
                <canvas
                  ref={renterSignatureRef}
                  className="border rounded h-32 w-full bg-white cursor-crosshair"
                  onMouseEnter={() => !isSigningRenter && setupSignatureCanvas(renterSignatureRef, setIsSigningRenter)}
                  onTouchStart={() => !isSigningRenter && setupSignatureCanvas(renterSignatureRef, setIsSigningRenter)}
                  data-testid="canvas-renter-signature"
                />
                <div className="flex gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => clearSignature(renterSignatureRef, setRenterSignature)}
                    data-testid="button-clear-renter-canvas"
                  >
                    Clear
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => saveSignature(renterSignatureRef, setRenterSignature, setIsSigningRenter)}
                    data-testid="button-save-renter-signature"
                  >
                    Save Signature
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Customer Signature */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Customer Signature</h3>
            {customerSignature ? (
              <div>
                <img src={customerSignature} alt="Customer signature" className="border rounded h-32 w-full object-contain bg-white" />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => clearSignature(customerSignatureRef, setCustomerSignature)}
                  className="mt-2"
                  data-testid="button-clear-customer-signature"
                >
                  Clear Signature
                </Button>
              </div>
            ) : (
              <div>
                <canvas
                  ref={customerSignatureRef}
                  className="border rounded h-32 w-full bg-white cursor-crosshair"
                  onMouseEnter={() => !isSigningCustomer && setupSignatureCanvas(customerSignatureRef, setIsSigningCustomer)}
                  onTouchStart={() => !isSigningCustomer && setupSignatureCanvas(customerSignatureRef, setIsSigningCustomer)}
                  data-testid="canvas-customer-signature"
                />
                <div className="flex gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => clearSignature(customerSignatureRef, setCustomerSignature)}
                    data-testid="button-clear-customer-canvas"
                  >
                    Clear
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => saveSignature(customerSignatureRef, setCustomerSignature, setIsSigningCustomer)}
                    data-testid="button-save-customer-signature"
                  >
                    Save Signature
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Bottom action footer — mirrors the Save / Print buttons from the
            top header so the user doesn't have to scroll back up after
            finishing the damage check. Rendered as a plain block (not
            sticky) because this page is hosted inside a Radix Dialog whose
            transformed positioning breaks `position: sticky` for nested
            children. The user scrolls to the end of the page to use it. */}
        <div className="mt-8 pb-4">
          <Card className="p-4 shadow-lg border-2 border-blue-200 bg-white">
            <div className="flex flex-col sm:flex-row gap-3 justify-end items-stretch sm:items-center">
              <Button
                variant="outline"
                onClick={() => onClose ? onClose() : navigate('/documents')}
                data-testid="button-close-footer"
                className="sm:w-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const id = lastSavedCheckId ?? editingCheckId;
                  if (!id) return;
                  window.open(`/api/interactive-damage-checks/${id}/pdf`, '_blank');
                }}
                disabled={isSaving || !(lastSavedCheckId ?? editingCheckId)}
                data-testid="button-print-check-footer"
                title={!(lastSavedCheckId ?? editingCheckId) ? 'Save the check first to enable printing' : 'Open the generated PDF in a new tab to print'}
                className="sm:w-auto"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print PDF
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !selectedVehicleId || !diagramTemplate}
                data-testid="button-save-check-footer"
                className="sm:w-auto"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Check'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
