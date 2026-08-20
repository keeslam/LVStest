import { useState } from "react";
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

export default function NotificationsPage() {
  const { toast } = useToast();
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
        title: "Notification marked as read",
        description: "The notification has been marked as read.",
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
        title: "Notification marked as unread",
        description: "The notification has been marked as unread.",
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
      title: "Notification settings updated",
      description: "Your custom notification settings have been saved.",
      variant: "default",
    });
  };

  // React to settings changes
  const handleApplySettings = () => {
    form.handleSubmit(onSubmit)();
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground">
            Manage and customize notifications for your car rental business
          </p>
        </div>
        <Button asChild>
          <Link href="/notifications/custom">
            <Bell className="mr-2 h-4 w-4" />
            Manage Custom Notifications
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Notification Settings */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>
              Customize when and how you receive notifications
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
                      <FormLabel>APK Expiration Warnings</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select days" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30">30 days before</SelectItem>
                          <SelectItem value="60">60 days before</SelectItem>
                          <SelectItem value="90">90 days before</SelectItem>
                          <SelectItem value="120">120 days before</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        When to notify about APK inspection expirations
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="warrantyExpiryDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Warranty Expiration Warnings</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select days" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30">30 days before</SelectItem>
                          <SelectItem value="60">60 days before</SelectItem>
                          <SelectItem value="90">90 days before</SelectItem>
                          <SelectItem value="120">120 days before</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        When to notify about warranty expirations
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="upcomingReservationDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Upcoming Reservation Alerts</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select days" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 day before</SelectItem>
                          <SelectItem value="2">2 days before</SelectItem>
                          <SelectItem value="3">3 days before</SelectItem>
                          <SelectItem value="7">7 days before</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        When to notify about upcoming reservations
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
                          <FormLabel>App Notifications</FormLabel>
                          <FormDescription>
                            Show notifications in the app
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
                          <FormLabel>Email Notifications</FormLabel>
                          <FormDescription>
                            Receive notifications by email
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
                  Apply Settings
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Notifications Display */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>All Notifications ({totalNotifications})</CardTitle>
            <CardDescription>
              View and manage your current notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-5 m-4">
                <TabsTrigger value="all">
                  All
                </TabsTrigger>
                <TabsTrigger value="reservations">
                  Reservations
                </TabsTrigger>
                <TabsTrigger value="apk">
                  APK
                </TabsTrigger>
                <TabsTrigger value="warranty">
                  Warranty
                </TabsTrigger>
                <TabsTrigger value="custom">
                  Custom
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="m-0">
                {totalNotifications === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center p-4">
                    <Bell className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                    <h3 className="font-medium">All caught up!</h3>
                    <p className="text-sm text-muted-foreground">
                      No vehicles or reservations require immediate attention.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Upcoming Reservations Section */}
                    {upcomingReservationItems.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-y">
                          <h5 className="font-medium">Upcoming Reservations</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Vehicle</TableHead>
                              <TableHead>Start Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {upcomingReservationItems.map(reservation => {
                              const vehicle = vehicles.find(v => v.id === reservation.vehicleId);
                              const startDate = new Date(reservation.startDate);
                              const daysUntil = differenceInDays(startDate, today);
                              let statusDisplay = "";
                              
                              if (daysUntil === 0) {
                                statusDisplay = "Today";
                              } else if (daysUntil === 1) {
                                statusDisplay = "Tomorrow";
                              } else {
                                statusDisplay = `In ${daysUntil} days`;
                              }
                              
                              return (
                                <TableRow key={`res-${reservation.id}`}>
                                  <TableCell>{reservation.id}</TableCell>
                                  <TableCell>
                                    {vehicle ? `${vehicle.brand} ${vehicle.model}` : "Unknown"}
                                  </TableCell>
                                  <TableCell>{formatDate(reservation.startDate)}</TableCell>
                                  <TableCell>
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                      {statusDisplay}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button size="sm" asChild>
                                      <Link href={`/reservations/${reservation.id}`}>View</Link>
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
                          <h5 className="font-medium">APK Expirations</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Vehicle</TableHead>
                              <TableHead>License Plate</TableHead>
                              <TableHead>APK Expires</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
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
                                statusDisplay = "Not set";
                              } else if (daysUntil <= 7) {
                                statusClass = "bg-red-100 text-red-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
                              } else if (daysUntil <= 30) {
                                statusClass = "bg-amber-100 text-amber-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
                              } else {
                                statusClass = "bg-yellow-100 text-yellow-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
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
                                      <Link href={`/vehicles/${vehicle.id}`}>View</Link>
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
                          <h5 className="font-medium">Warranty Expirations</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Vehicle</TableHead>
                              <TableHead>License Plate</TableHead>
                              <TableHead>Warranty Expires</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
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
                                statusDisplay = "Not set";
                              } else if (daysUntil <= 7) {
                                statusClass = "bg-red-100 text-red-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
                              } else if (daysUntil <= 30) {
                                statusClass = "bg-amber-100 text-amber-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
                              } else {
                                statusClass = "bg-indigo-100 text-indigo-800";
                                statusDisplay = `Expires in ${daysUntil} days`;
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
                                      <Link href={`/vehicles/${vehicle.id}`}>View</Link>
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
                          <h5 className="font-medium">Custom Notifications</h5>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Title</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
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
                                    {notification.isRead ? "Read" : "Unread"}
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
                                      Mark Unread
                                    </Button>
                                  ) : (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleMarkAsRead(notification.id)}
                                      disabled={markAsReadMutation.isPending}
                                    >
                                      <Check className="mr-1 h-4 w-4" />
                                      Mark Read
                                    </Button>
                                  )}
                                  <Button size="sm" asChild className="ml-2">
                                    <Link href="/notifications/custom">Manage</Link>
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
                    <h3 className="font-medium">No upcoming reservations</h3>
                    <p className="text-sm text-muted-foreground">
                      No reservations are starting soon.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingReservationItems.map(reservation => {
                        const vehicle = vehicles.find(v => v.id === reservation.vehicleId);
                        const startDate = new Date(reservation.startDate);
                        const daysUntil = differenceInDays(startDate, today);
                        let statusDisplay = "";
                        
                        if (daysUntil === 0) {
                          statusDisplay = "Today";
                        } else if (daysUntil === 1) {
                          statusDisplay = "Tomorrow";
                        } else {
                          statusDisplay = `In ${daysUntil} days`;
                        }
                        
                        return (
                          <TableRow key={`res-tab-${reservation.id}`}>
                            <TableCell>{reservation.id}</TableCell>
                            <TableCell>
                              {vehicle ? `${vehicle.brand} ${vehicle.model}` : "Unknown"}
                            </TableCell>
                            <TableCell>{formatDate(reservation.startDate)}</TableCell>
                            <TableCell>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                {statusDisplay}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" asChild>
                                <Link href={`/reservations/${reservation.id}`}>View</Link>
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
                    <h3 className="font-medium">No APK expirations</h3>
                    <p className="text-sm text-muted-foreground">
                      No vehicles have APK inspections expiring soon.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>License Plate</TableHead>
                        <TableHead>APK Expires</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
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
                          statusDisplay = "Not set";
                        } else if (daysUntil <= 7) {
                          statusClass = "bg-red-100 text-red-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
                        } else if (daysUntil <= 30) {
                          statusClass = "bg-amber-100 text-amber-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
                        } else {
                          statusClass = "bg-yellow-100 text-yellow-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
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
                                <Link href={`/vehicles/${vehicle.id}`}>View</Link>
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
                    <h3 className="font-medium">No warranty expirations</h3>
                    <p className="text-sm text-muted-foreground">
                      No vehicles have warranties expiring soon.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>License Plate</TableHead>
                        <TableHead>Warranty Expires</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
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
                          statusDisplay = "Not set";
                        } else if (daysUntil <= 7) {
                          statusClass = "bg-red-100 text-red-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
                        } else if (daysUntil <= 30) {
                          statusClass = "bg-amber-100 text-amber-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
                        } else {
                          statusClass = "bg-indigo-100 text-indigo-800";
                          statusDisplay = `Expires in ${daysUntil} days`;
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
                                <Link href={`/vehicles/${vehicle.id}`}>View</Link>
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
                    <h3 className="font-medium">No custom notifications</h3>
                    <p className="text-sm text-muted-foreground">
                      You haven't created any custom notifications yet.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-y">
                      <h5 className="font-medium">Custom Notifications</h5>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
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
                                  {notification.isRead ? "Read" : "Unread"}
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
                                    Mark Unread
                                  </Button>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    disabled={markAsReadMutation.isPending}
                                  >
                                    <Check className="mr-1 h-4 w-4" />
                                    Mark Read
                                  </Button>
                                )}
                                <Button size="sm" asChild className="ml-2">
                                  <Link href="/notifications/custom">Manage</Link>
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