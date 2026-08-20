import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Vehicle, Reservation, CustomNotification } from "@shared/schema";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { Link, useLocation } from "wouter";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
import {
  Bell,
  Calendar,
  Car,
  AlertTriangle,
  ClipboardCheck,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Loader2,
  Info,
  Settings,
  ExternalLink,
} from "lucide-react";

interface NotificationCenterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const notificationSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters" }),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  date: z.string().min(1, { message: "Date is required" }),
  priority: z.enum(["low", "normal", "high"]),
});

type NotificationFormData = z.infer<typeof notificationSchema>;

export function NotificationCenterDialog({ open, onOpenChange }: NotificationCenterDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { openReservationDialog, openVehicleDialog, openAPKDialog, openSpareAssignmentDialog } = useGlobalDialog();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNotification, setEditingNotification] = useState<CustomNotification | null>(null);
  const [deleteNotification, setDeleteNotification] = useState<CustomNotification | null>(null);
  const today = new Date();

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: apkExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/apk-expiring"],
  });

  const { data: warrantyExpiringVehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles/warranty-expiring"],
  });

  const { data: upcomingReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
  });

  const { data: upcomingMaintenanceReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming-maintenance"],
  });

  const { data: customNotifications = [] } = useQuery<CustomNotification[]>({
    queryKey: ["/api/custom-notifications"],
  });

  const { data: placeholderReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/placeholder-reservations/needing-assignment"],
  });

  const form = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      priority: "normal",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: NotificationFormData) => {
      const res = await apiRequest("POST", "/api/custom-notifications", {
        ...data,
        type: "custom",
        icon: "Bell",
        link: "/notifications",
      });
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      invalidateByPrefix("/api/custom-notifications/unread");
      toast({ title: "Created", description: "Notification created successfully" });
      setShowCreateForm(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<NotificationFormData> }) => {
      const res = await apiRequest("PATCH", `/api/custom-notifications/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      invalidateByPrefix("/api/custom-notifications/unread");
      toast({ title: "Updated", description: "Notification updated successfully" });
      setEditingNotification(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/custom-notifications/${id}`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      invalidateByPrefix("/api/custom-notifications/unread");
      toast({ title: "Deleted", description: "Notification deleted successfully" });
      setDeleteNotification(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/custom-notifications/${id}/read`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      invalidateByPrefix("/api/custom-notifications/unread");
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/custom-notifications/${id}/unread`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      invalidateByPrefix("/api/custom-notifications/unread");
    },
  });

  const isDismissed = (key: string): boolean => {
    const dismissedTimestamp = localStorage.getItem(key);
    if (!dismissedTimestamp) return false;
    const dismissedDate = new Date(parseInt(dismissedTimestamp));
    const daysSinceDismissal = differenceInDays(today, dismissedDate);
    if (daysSinceDismissal > 7) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  };

  const apkExpiringItems = apkExpiringVehicles
    .filter((v) => !isDismissed(`dismissed_apk_${v.id}`))
    .sort((a, b) => new Date(a.apkDate || "").getTime() - new Date(b.apkDate || "").getTime());

  const warrantyExpiringItems = warrantyExpiringVehicles
    .filter((v) => !isDismissed(`dismissed_warranty_${v.id}`))
    .sort((a, b) => new Date(a.warrantyEndDate || "").getTime() - new Date(b.warrantyEndDate || "").getTime());

  const upcomingReservationItems = upcomingReservations
    .filter((r) => {
      const daysUntil = differenceInDays(new Date(r.startDate), today);
      return daysUntil >= 0 && daysUntil <= 2;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const upcomingMaintenanceItems = upcomingMaintenanceReservations
    .filter((r) => {
      const daysUntil = differenceInDays(new Date(r.startDate), today);
      return daysUntil >= 0 && daysUntil <= 7;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const nonSpareCustomNotifications = customNotifications.filter(
    (n) => !n.title.includes("Spare Vehicle Assignment")
  );

  const totalNotifications =
    apkExpiringItems.length +
    warrantyExpiringItems.length +
    upcomingReservationItems.length +
    upcomingMaintenanceItems.length +
    placeholderReservations.length +
    nonSpareCustomNotifications.filter((n) => !n.isRead).length;

  const handleEditClick = (notification: CustomNotification) => {
    setEditingNotification(notification);
    form.reset({
      title: notification.title,
      description: notification.description,
      date: notification.date,
      priority: (notification.priority as "low" | "normal" | "high") || "normal",
    });
  };

  const handleSubmit = (data: NotificationFormData) => {
    if (editingNotification) {
      updateMutation.mutate({ id: editingNotification.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setEditingNotification(null);
    form.reset();
  };

  const renderPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case "low":
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Normal</Badge>;
    }
  };

  const NotificationCard = ({
    icon,
    title,
    description,
    date,
    onView,
    onDismiss,
  }: {
    icon: ReactNode;
    title: string;
    description: string;
    date: string;
    onView?: () => void;
    onDismiss?: () => void;
  }) => (
    <div className="flex items-start gap-3 p-3 border-b hover:bg-muted/50 transition-colors">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatDate(date)}</p>
      </div>
      <div className="flex gap-1">
        {onView && (
          <Button variant="ghost" size="sm" onClick={onView}>
            View
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const CustomNotificationCard = ({ notification }: { notification: CustomNotification }) => (
    <div className="flex items-start gap-3 p-3 border-b hover:bg-muted/50 transition-colors group">
      <div className="mt-0.5">
        <Bell className={notification.isRead ? "h-5 w-5 text-muted-foreground" : "h-5 w-5 text-primary"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium text-sm ${notification.isRead ? "text-muted-foreground" : ""}`}>
            {notification.title}
          </p>
          {renderPriorityBadge(notification.priority || "normal")}
          {!notification.isRead && <Badge className="text-xs">New</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{notification.description}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatDate(notification.date)}</p>
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleEditClick(notification)}
            data-testid={`button-edit-notification-${notification.id}`}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive border-destructive/50 hover:bg-destructive/10"
            onClick={() => setDeleteNotification(notification)}
            data-testid={`button-delete-notification-${notification.id}`}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
          {notification.isRead ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAsUnreadMutation.mutate(notification.id)}
            >
              Mark unread
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAsReadMutation.mutate(notification.id)}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark read
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const EmptyState = ({ icon, title, description }: { icon: ReactNode; title: string; description: string }) => (
    <div className="flex flex-col items-center justify-center h-[200px] text-center p-4">
      <div className="text-muted-foreground mb-2 opacity-50">{icon}</div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );

  const NotificationForm = () => (
    <div className="p-4 border-b bg-muted/30">
      <h4 className="font-medium mb-3">{editingNotification ? "Edit Notification" : "New Notification"}</h4>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Notification title" {...field} data-testid="input-notification-title" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Description" className="resize-none h-20" {...field} data-testid="input-notification-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-notification-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-notification-priority">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={handleCancelForm} data-testid="button-cancel-notification">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-notification"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingNotification ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Center
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalNotifications === 0
                    ? "No new notifications"
                    : `${totalNotifications} notification${totalNotifications !== 1 ? "s" : ""} requiring attention`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  onClick={() => onOpenChange(false)}
                  data-testid="button-notification-settings"
                >
                  <Link href="/notifications">
                    <Settings className="h-4 w-4 mr-1" />
                    Settings & Overview
                  </Link>
                </Button>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid grid-cols-6 m-2">
              <TabsTrigger value="all" className="text-xs" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="reservations" className="text-xs" data-testid="tab-reservations">Reservations</TabsTrigger>
              <TabsTrigger value="maintenance" className="text-xs" data-testid="tab-maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="apk" className="text-xs" data-testid="tab-apk">APK</TabsTrigger>
              <TabsTrigger value="warranty" className="text-xs" data-testid="tab-warranty">Warranty</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs" data-testid="tab-custom">
                Custom
                {nonSpareCustomNotifications.filter((n) => !n.isRead).length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                    {nonSpareCustomNotifications.filter((n) => !n.isRead).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(85vh-180px)]">
              <TabsContent value="all" className="m-0">
                {totalNotifications === 0 ? (
                  <EmptyState
                    icon={<Bell className="h-8 w-8" />}
                    title="All caught up!"
                    description="No notifications require your attention."
                  />
                ) : (
                  <div>
                    {upcomingReservationItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Upcoming Reservations</div>
                        {upcomingReservationItems.map((r) => {
                          const vehicle = vehicles.find((v) => v.id === r.vehicleId);
                          return (
                            <NotificationCard
                              key={`res-${r.id}`}
                              icon={<Calendar className="h-5 w-5 text-blue-500" />}
                              title={`Reservation #${r.id} starting soon`}
                              description={`${vehicle?.brand} ${vehicle?.model} - ${formatLicensePlate(vehicle?.licensePlate || "")}`}
                              date={r.startDate}
                              onView={() => {
                                onOpenChange(false);
                                openReservationDialog(r.id);
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                    {upcomingMaintenanceItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Upcoming Maintenance</div>
                        {upcomingMaintenanceItems.map((m) => {
                          const vehicle = vehicles.find((v) => v.id === m.vehicleId);
                          return (
                            <NotificationCard
                              key={`maint-${m.id}`}
                              icon={<ClipboardCheck className="h-5 w-5 text-purple-500" />}
                              title={`${m.maintenanceCategory || "Maintenance"} scheduled`}
                              description={`${vehicle?.brand} ${vehicle?.model} - ${formatLicensePlate(vehicle?.licensePlate || "")}`}
                              date={m.startDate}
                              onView={() => {
                                onOpenChange(false);
                                if (m.vehicleId) openVehicleDialog(m.vehicleId);
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                    {placeholderReservations.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Spare Vehicle Needed</div>
                        {placeholderReservations.map((p) => (
                          <NotificationCard
                            key={`spare-${p.id}`}
                            icon={<Car className="h-5 w-5 text-orange-500" />}
                            title={`Spare needed for ${p.customer?.name || "Customer"}`}
                            description={`Reservation #${p.id} needs a spare vehicle`}
                            date={p.startDate}
                            onView={() => {
                              onOpenChange(false);
                              openSpareAssignmentDialog(p.id);
                            }}
                          />
                        ))}
                      </>
                    )}
                    {apkExpiringItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">APK Expiring</div>
                        {apkExpiringItems.map((v) => (
                          <NotificationCard
                            key={`apk-${v.id}`}
                            icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
                            title={`APK expiring - ${formatLicensePlate(v.licensePlate)}`}
                            description={`${v.brand} ${v.model}`}
                            date={v.apkDate || ""}
                            onView={() => {
                              onOpenChange(false);
                              openAPKDialog(v.id);
                            }}
                            onDismiss={() => {
                              localStorage.setItem(`dismissed_apk_${v.id}`, Date.now().toString());
                              invalidateByPrefix("/api/vehicles/apk-expiring");
                            }}
                          />
                        ))}
                      </>
                    )}
                    {warrantyExpiringItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Warranty Expiring</div>
                        {warrantyExpiringItems.map((v) => (
                          <NotificationCard
                            key={`warranty-${v.id}`}
                            icon={<Car className="h-5 w-5 text-indigo-500" />}
                            title={`Warranty expiring - ${formatLicensePlate(v.licensePlate)}`}
                            description={`${v.brand} ${v.model}`}
                            date={v.warrantyEndDate || ""}
                            onView={() => {
                              onOpenChange(false);
                              openVehicleDialog(v.id);
                            }}
                            onDismiss={() => {
                              localStorage.setItem(`dismissed_warranty_${v.id}`, Date.now().toString());
                              invalidateByPrefix("/api/vehicles/warranty-expiring");
                            }}
                          />
                        ))}
                      </>
                    )}
                    {nonSpareCustomNotifications.filter((n) => !n.isRead).length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Custom Notifications</div>
                        {nonSpareCustomNotifications
                          .filter((n) => !n.isRead)
                          .map((n) => (
                            <CustomNotificationCard key={`custom-${n.id}`} notification={n} />
                          ))}
                      </>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reservations" className="m-0">
                {upcomingReservationItems.length === 0 ? (
                  <EmptyState
                    icon={<Calendar className="h-8 w-8" />}
                    title="No upcoming reservations"
                    description="No reservations starting in the next 2 days."
                  />
                ) : (
                  upcomingReservationItems.map((r) => {
                    const vehicle = vehicles.find((v) => v.id === r.vehicleId);
                    return (
                      <NotificationCard
                        key={`res-tab-${r.id}`}
                        icon={<Calendar className="h-5 w-5 text-blue-500" />}
                        title={`Reservation #${r.id} starting soon`}
                        description={`${vehicle?.brand} ${vehicle?.model} - ${formatLicensePlate(vehicle?.licensePlate || "")}`}
                        date={r.startDate}
                        onView={() => {
                          onOpenChange(false);
                          openReservationDialog(r.id);
                        }}
                      />
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="m-0">
                {upcomingMaintenanceItems.length === 0 ? (
                  <EmptyState
                    icon={<ClipboardCheck className="h-8 w-8" />}
                    title="No upcoming maintenance"
                    description="No maintenance scheduled in the next 7 days."
                  />
                ) : (
                  upcomingMaintenanceItems.map((m) => {
                    const vehicle = vehicles.find((v) => v.id === m.vehicleId);
                    return (
                      <NotificationCard
                        key={`maint-tab-${m.id}`}
                        icon={<ClipboardCheck className="h-5 w-5 text-purple-500" />}
                        title={`${m.maintenanceCategory || "Maintenance"} scheduled`}
                        description={`${vehicle?.brand} ${vehicle?.model} - ${formatLicensePlate(vehicle?.licensePlate || "")}`}
                        date={m.startDate}
                        onView={() => {
                          onOpenChange(false);
                          if (m.vehicleId) openVehicleDialog(m.vehicleId);
                        }}
                      />
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="apk" className="m-0">
                {apkExpiringItems.length === 0 ? (
                  <EmptyState
                    icon={<AlertTriangle className="h-8 w-8" />}
                    title="No APK expirations"
                    description="No vehicles have APK expiring soon."
                  />
                ) : (
                  apkExpiringItems.map((v) => (
                    <NotificationCard
                      key={`apk-tab-${v.id}`}
                      icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
                      title={`APK expiring - ${formatLicensePlate(v.licensePlate)}`}
                      description={`${v.brand} ${v.model}`}
                      date={v.apkDate || ""}
                      onView={() => {
                        onOpenChange(false);
                        openAPKDialog(v.id);
                      }}
                      onDismiss={() => {
                        localStorage.setItem(`dismissed_apk_${v.id}`, Date.now().toString());
                        invalidateByPrefix("/api/vehicles/apk-expiring");
                      }}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="warranty" className="m-0">
                {warrantyExpiringItems.length === 0 ? (
                  <EmptyState
                    icon={<Car className="h-8 w-8" />}
                    title="No warranty expirations"
                    description="No vehicles have warranties expiring soon."
                  />
                ) : (
                  warrantyExpiringItems.map((v) => (
                    <NotificationCard
                      key={`warranty-tab-${v.id}`}
                      icon={<Car className="h-5 w-5 text-indigo-500" />}
                      title={`Warranty expiring - ${formatLicensePlate(v.licensePlate)}`}
                      description={`${v.brand} ${v.model}`}
                      date={v.warrantyEndDate || ""}
                      onView={() => {
                        onOpenChange(false);
                        openVehicleDialog(v.id);
                      }}
                      onDismiss={() => {
                        localStorage.setItem(`dismissed_warranty_${v.id}`, Date.now().toString());
                        invalidateByPrefix("/api/vehicles/warranty-expiring");
                      }}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="custom" className="m-0">
                <div className="p-3 border-b bg-blue-50 dark:bg-blue-950/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">Manage Custom Notifications</h3>
                      <p className="text-xs text-muted-foreground">Create, edit, and delete your own reminders</p>
                    </div>
                    {!showCreateForm && !editingNotification && (
                      <Button onClick={() => setShowCreateForm(true)} size="sm" data-testid="button-add-notification">
                        <Plus className="h-4 w-4 mr-1" />
                        Add New
                      </Button>
                    )}
                  </div>
                </div>

                {(showCreateForm || editingNotification) && <NotificationForm />}

                {customNotifications.length === 0 && !showCreateForm ? (
                  <EmptyState
                    icon={<MessageSquare className="h-8 w-8" />}
                    title="No custom notifications yet"
                    description="Click 'Add New' above to create reminders and notes for your team."
                  />
                ) : (
                  <>
                    {nonSpareCustomNotifications.filter((n) => !n.isRead).length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Unread</div>
                        {nonSpareCustomNotifications
                          .filter((n) => !n.isRead)
                          .map((n) => (
                            <CustomNotificationCard key={`unread-${n.id}`} notification={n} />
                          ))}
                      </>
                    )}
                    {nonSpareCustomNotifications.filter((n) => n.isRead).length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium">Read</div>
                        {nonSpareCustomNotifications
                          .filter((n) => n.isRead)
                          .map((n) => (
                            <CustomNotificationCard key={`read-${n.id}`} notification={n} />
                          ))}
                      </>
                    )}
                  </>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteNotification} onOpenChange={() => setDeleteNotification(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteNotification?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteNotification && deleteMutation.mutate(deleteNotification.id)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
