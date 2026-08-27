import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Car, AlertTriangle, Bell, Check, X, Info, ClipboardCheck, MessageSquare } from "lucide-react";
import { Vehicle, Reservation, CustomNotification } from "@shared/schema";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { Link } from "wouter";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useForm, SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Define notification settings schema
const notificationSettingsSchema = z.object({
  apkExpiryDays: z.string(),
  warrantyExpiryDays: z.string(),
  upcomingReservationDays: z.string(),
  emailNotifications: z.boolean(),
  appNotifications: z.boolean(),
});

type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

interface NotificationsPanelProps {
  // Called right before navigating to /notifications/custom - lets a
  // dialog-hosted panel close itself first, so the destination page
  // doesn't render underneath a stale open dialog.
  onNavigateAway?: () => void;
}

// Shared content for the notification center - used both by the full
// /notifications page and by NotificationsDialog, so there is one
// implementation instead of two copies drifting apart.
export function NotificationsPanel({ onNavigateAway }: NotificationsPanelProps = {}) {
  const { t } = useTranslation("notifications");
  const { toast } = useToast();
  const { openReservationDialog } = useGlobalDialog();
  const [activeTab, setActiveTab] = useState<string>("all");
  const today = new Date();

  // Default notification settings (we would normally load these from user preferences)
  const defaultSettings: NotificationSettings = {
    apkExpiryDays: "60",
    warrantyExpiryDays: "60",
    upcomingReservationDays: "2",
    emailNotifications: false,
    appNotifications: true,
  };

  // Setup form
  const form = useForm<NotificationSettings>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: defaultSettings,
  });

  // QueryClient for mutations
  const queryClient = useQueryClient();

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest("POST", `/api/custom-notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      toast({
        title: t('notificationsPage.toasts.markedReadTitle'),
        description: t('notificationsPage.toasts.markedReadDescription'),
      });
    },
  });

  // Mark notification as unread mutation
  const markAsUnreadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest("POST", `/api/custom-notifications/${notificationId}/unread`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      toast({
        title: t('notificationsPage.toasts.markedUnreadTitle'),
        description: t('notificationsPage.toasts.markedUnreadDescription'),
      });
    },
  });

  // Handler functions
  const handleMarkAsRead = (notificationId: number) => {
    markAsReadMutation.mutate(notificationId);
  };

  const handleMarkAsUnread = (notificationId: number) => {
    markAsUnreadMutation.mutate(notificationId);
  };

  // Fetch vehicles
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  // Fetch upcoming reservations
  const { data: upcomingReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations/upcoming"],
  });

  // Fetch custom notifications
  const { data: customNotifications = [] } = useQuery<CustomNotification[]>({
    queryKey: ["/api/custom-notifications"],
  });

  // Calculate notifications based on form values
  const daysForApk = Number(form.watch("apkExpiryDays"));
  const daysForWarranty = Number(form.watch("warrantyExpiryDays"));
  const daysForReservations = Number(form.watch("upcomingReservationDays"));

  // Generate notification lists
  const apkExpiringItems = vehicles
    .filter(vehicle => {
      if (!vehicle.apkDate) return false;
      const apkDate = new Date(vehicle.apkDate);
      const daysUntil = differenceInDays(apkDate, today);
      return daysUntil >= 0 && daysUntil <= daysForApk;
    })
    .sort((a, b) => {
      if (!a.apkDate || !b.apkDate) return 0;
      return new Date(a.apkDate).getTime() - new Date(b.apkDate).getTime();
    });

  const warrantyExpiringItems = vehicles
    .filter(vehicle => {
      if (!vehicle.warrantyEndDate) return false;
      const warrantyDate = new Date(vehicle.warrantyEndDate);
      const daysUntil = differenceInDays(warrantyDate, today);
      return daysUntil >= 0 && daysUntil <= daysForWarranty;
    })
    .sort((a, b) => {
      if (!a.warrantyEndDate || !b.warrantyEndDate) return 0;
      return new Date(a.warrantyEndDate).getTime() - new Date(b.warrantyEndDate).getTime();
    });

  const upcomingReservationItems = upcomingReservations
    .filter(reservation => {
      const startDate = new Date(reservation.startDate);
      const daysUntil = differenceInDays(startDate, today);
      return daysUntil >= 0 && daysUntil <= daysForReservations;
    })
    .sort((a, b) => {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

  const totalNotifications =
    apkExpiringItems.length +
    warrantyExpiringItems.length +
    upcomingReservationItems.length +
    customNotifications.length;

  // Handle form submission
  const onSubmit: SubmitHandler<NotificationSettings> = (data) => {
    // In a real application, save these settings to the user's preferences
    console.log("Notification settings updated:", data);

    toast({
      title: t('notificationsPage.toasts.settingsUpdatedTitle'),
      description: t('notificationsPage.toasts.settingsUpdatedDescription'),
      variant: "default",
    });
  };

  // React to settings changes
  const handleApplySettings = () => {
    form.handleSubmit(onSubmit)();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('notificationsPage.pageTitle')}</h1>
          <p className="text-muted-foreground">
            {t('notificationsPage.pageDescription')}
          </p>
        </div>
        <Button asChild>
          <Link href="/notifications/custom" onClick={() => onNavigateAway?.()}>
            <Bell className="mr-2 h-4 w-4" />
            {t('notificationsPage.manageCustomButton')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Notification Settings */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('notificationsPage.settingsCardTitle')}</CardTitle>
            <CardDescription>
              {t('notificationsPage.settingsCardDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="apkExpiryDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notificationsPage.apkExpiryWarningsLabel')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('notificationsPage.selectDaysPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30">{t('notificationsPage.daysBefore', { count: 30 })}</SelectItem>
                          <SelectItem value="60">{t('notificationsPage.daysBefore', { count: 60 })}</SelectItem>
                          <SelectItem value="90">{t('notificationsPage.daysBefore', { count: 90 })}</SelectItem>
                          <SelectItem value="120">{t('notificationsPage.daysBefore', { count: 120 })}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('notificationsPage.apkExpiryWarningsDescription')}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="warrantyExpiryDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notificationsPage.warrantyExpiryWarningsLabel')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('notificationsPage.selectDaysPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30">{t('notificationsPage.daysBefore', { count: 30 })}</SelectItem>
                          <SelectItem value="60">{t('notificationsPage.daysBefore', { count: 60 })}</SelectItem>
                          <SelectItem value="90">{t('notificationsPage.daysBefore', { count: 90 })}</SelectItem>
                          <SelectItem value="120">{t('notificationsPage.daysBefore', { count: 120 })}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('notificationsPage.warrantyExpiryWarningsDescription')}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="upcomingReservationDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notificationsPage.upcomingReservationAlertsLabel')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('notificationsPage.selectDaysPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">{t('notificationsPage.daysBefore', { count: 1 })}</SelectItem>
                          <SelectItem value="2">{t('notificationsPage.daysBefore', { count: 2 })}</SelectItem>
                          <SelectItem value="3">{t('notificationsPage.daysBefore', { count: 3 })}</SelectItem>
                          <SelectItem value="7">{t('notificationsPage.daysBefore', { count: 7 })}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('notificationsPage.upcomingReservationAlertsDescription')}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <div className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="appNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel>{t('notificationsPage.appNotificationsLabel')}</FormLabel>
                          <FormDescription>
                            {t('notificationsPage.appNotificationsDescription')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emailNotifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel>{t('notificationsPage.emailNotificationsLabel')}</FormLabel>
                          <FormDescription>
                            {t('notificationsPage.emailNotificationsDescription')}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleApplySettings}
                  className="w-full"
                >
                  {t('notificationsPage.applySettingsButton')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Notifications Display */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('notificationsPage.allNotificationsTitle', { count: totalNotifications })}</CardTitle>
            <CardDescription>
              {t('notificationsPage.allNotificationsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-5 m-4">
                <TabsTrigger value="all">
                  {t('notificationsPage.allTab')}
                </TabsTrigger>
                <TabsTrigger value="reservations">
                  {t('notificationsPage.reservationsTab')}
                </TabsTrigger>
                <TabsTrigger value="apk">
                  {t('notificationsPage.apkTab')}
                </TabsTrigger>
                <TabsTrigger value="warranty">
                  {t('notificationsPage.warrantyTab')}
                </TabsTrigger>
                <TabsTrigger value="custom">
                  {t('notificationsPage.customTab')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="m-0">
                {totalNotifications === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <Bell className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">{t('notificationsPage.allCaughtUpTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('notificationsPage.allCaughtUpDescription')}
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Upcoming Reservations Section */}
                    {upcomingReservationItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-y">
                          <h5 className="font-medium">{t('notificationsPage.upcomingReservationsHeading')}</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('notificationsPage.idColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.startDateColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                              <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {upcomingReservationItems.map(reservation => {
                              const vehicle = vehicles.find(v => v.id === reservation.vehicleId);
                              const startDate = new Date(reservation.startDate);
                              const daysUntil = differenceInDays(startDate, today);
                              let statusDisplay = "";

                              if (daysUntil === 0) {
                                statusDisplay = t('notificationsPage.todayStatus');
                              } else if (daysUntil === 1) {
                                statusDisplay = t('notificationsPage.tomorrowStatus');
                              } else {
                                statusDisplay = t('notificationsPage.inDaysStatus', { count: daysUntil });
                              }

                              return (
                                <TableRow key={`res-${reservation.id}`}>
                                  <TableCell>{reservation.id}</TableCell>
                                  <TableCell>
                                    {vehicle ? `${vehicle.brand} ${vehicle.model}` : t('notificationsPage.unknownVehicle')}
                                  </TableCell>
                                  <TableCell>{formatDate(reservation.startDate)}</TableCell>
                                  <TableCell>
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                      {statusDisplay}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button size="sm" onClick={() => openReservationDialog(reservation.id)}>
                                      {t('notificationsPage.viewButton')}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </>
                    )}

                    {/* APK Expirations Section */}
                    {apkExpiringItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-y">
                          <h5 className="font-medium">{t('notificationsPage.apkExpirationsHeading')}</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.licensePlateColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.apkExpiresColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                              <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {apkExpiringItems.map(vehicle => {
                              const apkDate = vehicle.apkDate ? new Date(vehicle.apkDate) : null;
                              const daysUntil = apkDate ? differenceInDays(apkDate, today) : null;
                              let statusClass = "";
                              let statusDisplay = "";

                              if (daysUntil === null) {
                                statusClass = "bg-gray-100 text-gray-800";
                                statusDisplay = t('notificationsPage.notSetStatus');
                              } else if (daysUntil <= 7) {
                                statusClass = "bg-red-100 text-red-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              } else if (daysUntil <= 30) {
                                statusClass = "bg-amber-100 text-amber-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              } else {
                                statusClass = "bg-yellow-100 text-yellow-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              }

                              return (
                                <TableRow key={`apk-${vehicle.id}`}>
                                  <TableCell>{`${vehicle.brand} ${vehicle.model}`}</TableCell>
                                  <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                                  <TableCell>{formatDate(vehicle.apkDate || "")}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 ${statusClass} rounded-full text-xs`}>
                                      {statusDisplay}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button size="sm" asChild>
                                      <Link href={`/vehicles/${vehicle.id}`}>{t('notificationsPage.viewButton')}</Link>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </>
                    )}

                    {/* Warranty Expirations Section */}
                    {warrantyExpiringItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-y">
                          <h5 className="font-medium">{t('notificationsPage.warrantyExpirationsHeading')}</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.licensePlateColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.warrantyExpiresColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                              <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {warrantyExpiringItems.map(vehicle => {
                              const warrantyDate = vehicle.warrantyEndDate ? new Date(vehicle.warrantyEndDate) : null;
                              const daysUntil = warrantyDate ? differenceInDays(warrantyDate, today) : null;
                              let statusClass = "";
                              let statusDisplay = "";

                              if (daysUntil === null) {
                                statusClass = "bg-gray-100 text-gray-800";
                                statusDisplay = t('notificationsPage.notSetStatus');
                              } else if (daysUntil <= 7) {
                                statusClass = "bg-red-100 text-red-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              } else if (daysUntil <= 30) {
                                statusClass = "bg-amber-100 text-amber-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              } else {
                                statusClass = "bg-indigo-100 text-indigo-800";
                                statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                              }

                              return (
                                <TableRow key={`warranty-${vehicle.id}`}>
                                  <TableCell>{`${vehicle.brand} ${vehicle.model}`}</TableCell>
                                  <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                                  <TableCell>{formatDate(vehicle.warrantyEndDate || "")}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 ${statusClass} rounded-full text-xs`}>
                                      {statusDisplay}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button size="sm" asChild>
                                      <Link href={`/vehicles/${vehicle.id}`}>{t('notificationsPage.viewButton')}</Link>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </>
                    )}

                    {/* Custom Notifications Section */}
                    {customNotifications.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-y">
                          <h5 className="font-medium">{t('notificationsPage.customNotificationsHeading')}</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('notificationsPage.titleColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.dateColumn')}</TableHead>
                              <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                              <TableHead className="text-right">{t('notificationsPage.actionsColumn')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {customNotifications.map(notification => (
                              <TableRow key={`custom-all-${notification.id}`}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{notification.title}</span>
                                    <span className="text-sm text-muted-foreground">{notification.description}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{formatDate(notification.date)}</TableCell>
                                <TableCell>
                                  <Badge variant={notification.isRead ? "outline" : "default"}>
                                    {notification.isRead ? t('notificationsPage.readBadge') : t('notificationsPage.unreadBadge')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                  {notification.isRead ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleMarkAsUnread(notification.id)}
                                      disabled={markAsUnreadMutation.isPending}
                                    >
                                      <X className="mr-1 h-4 w-4" />
                                      {t('notificationsPage.markUnreadButton')}
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleMarkAsRead(notification.id)}
                                      disabled={markAsReadMutation.isPending}
                                    >
                                      <Check className="mr-1 h-4 w-4" />
                                      {t('notificationsPage.markReadButton')}
                                    </Button>
                                  )}
                                  <Button size="sm" asChild className="ml-2">
                                    <Link href="/notifications/custom" onClick={() => onNavigateAway?.()}>{t('notificationsPage.manageButton')}</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reservations" className="m-0">
                {upcomingReservationItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <Calendar className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">{t('notificationsPage.noUpcomingReservationsTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('notificationsPage.noUpcomingReservationsDescription')}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('notificationsPage.idColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.startDateColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                        <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingReservationItems.map(reservation => {
                        const vehicle = vehicles.find(v => v.id === reservation.vehicleId);
                        const startDate = new Date(reservation.startDate);
                        const daysUntil = differenceInDays(startDate, today);
                        let statusDisplay = "";

                        if (daysUntil === 0) {
                          statusDisplay = t('notificationsPage.todayStatus');
                        } else if (daysUntil === 1) {
                          statusDisplay = t('notificationsPage.tomorrowStatus');
                        } else {
                          statusDisplay = t('notificationsPage.inDaysStatus', { count: daysUntil });
                        }

                        return (
                          <TableRow key={`res-tab-${reservation.id}`}>
                            <TableCell>{reservation.id}</TableCell>
                            <TableCell>
                              {vehicle ? `${vehicle.brand} ${vehicle.model}` : t('notificationsPage.unknownVehicle')}
                            </TableCell>
                            <TableCell>{formatDate(reservation.startDate)}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                {statusDisplay}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" onClick={() => openReservationDialog(reservation.id)}>
                                {t('notificationsPage.viewButton')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="apk" className="m-0">
                {apkExpiringItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">{t('notificationsPage.noApkExpirationsTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('notificationsPage.noApkExpirationsDescription')}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.licensePlateColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.apkExpiresColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                        <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apkExpiringItems.map(vehicle => {
                        const apkDate = vehicle.apkDate ? new Date(vehicle.apkDate) : null;
                        const daysUntil = apkDate ? differenceInDays(apkDate, today) : null;
                        let statusClass = "";
                        let statusDisplay = "";

                        if (daysUntil === null) {
                          statusClass = "bg-gray-100 text-gray-800";
                          statusDisplay = t('notificationsPage.notSetStatus');
                        } else if (daysUntil <= 7) {
                          statusClass = "bg-red-100 text-red-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        } else if (daysUntil <= 30) {
                          statusClass = "bg-amber-100 text-amber-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        } else {
                          statusClass = "bg-yellow-100 text-yellow-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        }

                        return (
                          <TableRow key={`apk-tab-${vehicle.id}`}>
                            <TableCell>{`${vehicle.brand} ${vehicle.model}`}</TableCell>
                            <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                            <TableCell>{formatDate(vehicle.apkDate || "")}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 ${statusClass} rounded-full text-xs`}>
                                {statusDisplay}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" asChild>
                                <Link href={`/vehicles/${vehicle.id}`}>{t('notificationsPage.viewButton')}</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="warranty" className="m-0">
                {warrantyExpiringItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <Car className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">{t('notificationsPage.noWarrantyExpirationsTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('notificationsPage.noWarrantyExpirationsDescription')}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('notificationsPage.vehicleColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.licensePlateColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.warrantyExpiresColumn')}</TableHead>
                        <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                        <TableHead className="text-right">{t('notificationsPage.actionColumn')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warrantyExpiringItems.map(vehicle => {
                        const warrantyDate = vehicle.warrantyEndDate ? new Date(vehicle.warrantyEndDate) : null;
                        const daysUntil = warrantyDate ? differenceInDays(warrantyDate, today) : null;
                        let statusClass = "";
                        let statusDisplay = "";

                        if (daysUntil === null) {
                          statusClass = "bg-gray-100 text-gray-800";
                          statusDisplay = t('notificationsPage.notSetStatus');
                        } else if (daysUntil <= 7) {
                          statusClass = "bg-red-100 text-red-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        } else if (daysUntil <= 30) {
                          statusClass = "bg-amber-100 text-amber-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        } else {
                          statusClass = "bg-indigo-100 text-indigo-800";
                          statusDisplay = t('notificationsPage.expiresInDays', { count: daysUntil });
                        }

                        return (
                          <TableRow key={`warranty-tab-${vehicle.id}`}>
                            <TableCell>{`${vehicle.brand} ${vehicle.model}`}</TableCell>
                            <TableCell>{formatLicensePlate(vehicle.licensePlate)}</TableCell>
                            <TableCell>{formatDate(vehicle.warrantyEndDate || "")}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 ${statusClass} rounded-full text-xs`}>
                                {statusDisplay}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" asChild>
                                <Link href={`/vehicles/${vehicle.id}`}>{t('notificationsPage.viewButton')}</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="custom" className="m-0">
                {customNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">{t('notificationsPage.noCustomNotificationsTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('notificationsPage.noCustomNotificationsDescription')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-y">
                      <h5 className="font-medium">{t('notificationsPage.customNotificationsHeading')}</h5>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('notificationsPage.titleColumn')}</TableHead>
                          <TableHead>{t('notificationsPage.dateColumn')}</TableHead>
                          <TableHead>{t('notificationsPage.statusColumn')}</TableHead>
                          <TableHead className="text-right">{t('notificationsPage.actionsColumn')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customNotifications.map(notification => {
                          return (
                            <TableRow key={`custom-${notification.id}`}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{notification.title}</span>
                                  <span className="text-sm text-muted-foreground">{notification.description}</span>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(notification.date)}</TableCell>
                              <TableCell>
                                <Badge variant={notification.isRead ? "outline" : "default"}>
                                  {notification.isRead ? t('notificationsPage.readBadge') : t('notificationsPage.unreadBadge')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                {notification.isRead ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleMarkAsUnread(notification.id)}
                                    disabled={markAsUnreadMutation.isPending}
                                  >
                                    <X className="mr-1 h-4 w-4" />
                                    {t('notificationsPage.markUnreadButton')}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    disabled={markAsReadMutation.isPending}
                                  >
                                    <Check className="mr-1 h-4 w-4" />
                                    {t('notificationsPage.markReadButton')}
                                  </Button>
                                )}
                                <Button size="sm" asChild className="ml-2">
                                  <Link href="/notifications/custom" onClick={() => onNavigateAway?.()}>{t('notificationsPage.manageButton')}</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
