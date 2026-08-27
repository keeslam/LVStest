import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { 
  Loader2, Plus, Edit, Trash2, Check, X, CalendarDays, ClipboardCheck, 
  Bell, AlertCircle, Info, ArrowLeft, Search, Filter, CheckCheck, 
  MoreHorizontal, Circle, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { formatDate } from "@/lib/format-utils";

const notificationSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters" }),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  date: z.string().min(1, { message: "Date is required" }),
  type: z.string().min(1, { message: "Type is required" }),
  icon: z.string().optional(),
  link: z.string().optional(),
  priority: z.enum(["low", "normal", "high"]),
  userId: z.number().optional()
});

type NotificationFormData = z.infer<typeof notificationSchema>;

const iconComponents = {
  CalendarDays: <CalendarDays className="h-4 w-4" />,
  ClipboardCheck: <ClipboardCheck className="h-4 w-4" />,
  Bell: <Bell className="h-4 w-4" />,
  AlertCircle: <AlertCircle className="h-4 w-4" />,
  Info: <Info className="h-4 w-4" />
};

type IconName = keyof typeof iconComponents;

const CustomNotificationsPage = () => {
  const { t } = useTranslation("notifications");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<"title" | "date" | "priority">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["/api/custom-notifications"],
    queryFn: async () => {
      const response = await fetch("/api/custom-notifications");
      if (!response.ok) throw new Error("Failed to fetch notifications");
      return response.json();
    }
  });

  const filteredNotifications = useMemo(() => {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    
    return notifications
      .filter((n: any) => {
        const matchesSearch = searchQuery === "" || 
          n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPriority = priorityFilter === "all" || n.priority === priorityFilter;
        const matchesStatus = statusFilter === "all" || 
          (statusFilter === "read" && n.isRead) || 
          (statusFilter === "unread" && !n.isRead);
        return matchesSearch && matchesPriority && matchesStatus;
      })
      .sort((a: any, b: any) => {
        let comparison = 0;
        if (sortColumn === "title") {
          comparison = (a.title || "").localeCompare(b.title || "");
        } else if (sortColumn === "date") {
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        } else if (sortColumn === "priority") {
          comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                       (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [notifications, searchQuery, priorityFilter, statusFilter, sortColumn, sortDirection]);

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;
  const selectedCount = selectedIds.size;

  const createMutation = useMutation({
    mutationFn: async (data: NotificationFormData) => {
      const res = await apiRequest("POST", "/api/custom-notifications", data);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      toast({ title: t('customNotificationsPage.toasts.successTitle'), description: t('customNotificationsPage.toasts.createdDescription') });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: t('customNotificationsPage.toasts.errorTitle'), description: t('customNotificationsPage.toasts.createFailedDescription', { message: error.message }), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<NotificationFormData> }) => {
      const res = await apiRequest("PATCH", `/api/custom-notifications/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      toast({ title: t('customNotificationsPage.toasts.successTitle'), description: t('customNotificationsPage.toasts.updatedDescription') });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t('customNotificationsPage.toasts.errorTitle'), description: t('customNotificationsPage.toasts.updateFailedDescription', { message: error.message }), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/custom-notifications/${id}`);
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
      toast({ title: t('customNotificationsPage.toasts.successTitle'), description: t('customNotificationsPage.toasts.deletedDescription') });
      setIsDeleteDialogOpen(false);
      setSelectedIds(new Set());
    },
    onError: (error: Error) => {
      toast({ title: t('customNotificationsPage.toasts.errorTitle'), description: t('customNotificationsPage.toasts.deleteFailedDescription', { message: error.message }), variant: "destructive" });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/custom-notifications/${id}/read`);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/custom-notifications/${id}/unread`);
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/custom-notifications");
    },
  });

  const bulkMarkAsReadMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => apiRequest("POST", `/api/custom-notifications/${id}/read`)));
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateByPrefix("/api/custom-notifications");
      toast({ title: t('customNotificationsPage.toasts.successTitle'), description: t('customNotificationsPage.toasts.markedAsRead', { count }) });
      setSelectedIds(new Set());
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/custom-notifications/${id}`)));
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateByPrefix("/api/custom-notifications");
      toast({ title: t('customNotificationsPage.toasts.successTitle'), description: t('customNotificationsPage.toasts.bulkDeleted', { count }) });
      setSelectedIds(new Set());
    },
  });

  const createForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      type: "custom",
      icon: "Bell",
      link: "/notifications/custom",
      priority: "normal"
    },
  });

  const editForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      type: "custom",
      icon: "Bell",
      link: "/notifications/custom",
      priority: "normal"
    },
  });

  const onCreateSubmit = (data: NotificationFormData) => {
    createMutation.mutate({ ...data, link: "/notifications/custom" });
  };

  const onEditSubmit = (data: NotificationFormData) => {
    if (selectedNotification) {
      updateMutation.mutate({ id: selectedNotification.id, data: { ...data, link: "/notifications/custom" } });
    }
  };

  const handleEditClick = (notification: any) => {
    setSelectedNotification(notification);
    editForm.reset({
      title: notification.title,
      description: notification.description,
      date: notification.date,
      type: notification.type || "custom",
      icon: notification.icon || "Bell",
      link: notification.link || "/notifications/custom",
      priority: notification.priority || "normal"
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (notification: any) => {
    setSelectedNotification(notification);
    setIsDeleteDialogOpen(true);
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n: any) => n.id)));
    }
  };

  const handleMarkAllRead = () => {
    const unreadIds = filteredNotifications.filter((n: any) => !n.isRead).map((n: any) => n.id);
    if (unreadIds.length > 0) {
      bulkMarkAsReadMutation.mutate(unreadIds);
    }
  };

  const handleBulkMarkRead = () => {
    bulkMarkAsReadMutation.mutate(Array.from(selectedIds));
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleSort = (column: "title" | "date" | "priority") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection(column === "date" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ column }: { column: "title" | "date" | "priority" }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const renderPriorityBadge = (priority: string) => {
    switch(priority) {
      case "high":
        return <Badge variant="destructive" className="text-xs">{t('customNotificationsPage.priorityHigh')}</Badge>;
      case "normal":
        return <Badge variant="secondary" className="text-xs">{t('customNotificationsPage.priorityNormal')}</Badge>;
      case "low":
        return <Badge variant="outline" className="text-xs">{t('customNotificationsPage.priorityLow')}</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{t('customNotificationsPage.priorityNormal')}</Badge>;
    }
  };

  const NotificationForm = ({ form, onSubmit, isLoading, submitText }: any) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('customNotificationsPage.titleFieldLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('customNotificationsPage.titleFieldPlaceholder')} {...field} data-testid="input-notification-title" />
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
              <FormLabel>{t('customNotificationsPage.descriptionFieldLabel')}</FormLabel>
              <FormControl>
                <Textarea placeholder={t('customNotificationsPage.descriptionFieldPlaceholder')} className="resize-none" {...field} data-testid="input-notification-description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('customNotificationsPage.dateFieldLabel')}</FormLabel>
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
                <FormLabel>{t('customNotificationsPage.priorityFieldLabel')}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-notification-priority">
                      <SelectValue placeholder={t('customNotificationsPage.selectPriorityPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">{t('customNotificationsPage.priorityLow')}</SelectItem>
                    <SelectItem value="normal">{t('customNotificationsPage.priorityNormal')}</SelectItem>
                    <SelectItem value="high">{t('customNotificationsPage.priorityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('customNotificationsPage.iconFieldLabel')}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-notification-icon">
                      <SelectValue placeholder={t('customNotificationsPage.selectIconPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="CalendarDays">{t('customNotificationsPage.iconCalendar')}</SelectItem>
                    <SelectItem value="ClipboardCheck">{t('customNotificationsPage.iconClipboard')}</SelectItem>
                    <SelectItem value="Bell">{t('customNotificationsPage.iconBell')}</SelectItem>
                    <SelectItem value="AlertCircle">{t('customNotificationsPage.iconAlert')}</SelectItem>
                    <SelectItem value="Info">{t('customNotificationsPage.iconInfo')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('customNotificationsPage.typeFieldLabel')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('customNotificationsPage.typeFieldPlaceholder')} {...field} data-testid="input-notification-type" />
                </FormControl>
                <FormDescription className="text-xs">{t('customNotificationsPage.typeFieldDescription')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{t('customNotificationsPage.cancelButton')}</Button>
          </DialogClose>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-notification">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitText}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('customNotificationsPage.pageTitle')}</h1>
          <p className="text-muted-foreground">
            {t('customNotificationsPage.notificationCount', { count: notifications.length })}
            {unreadCount > 0 && <span className="text-primary font-medium"> {t('customNotificationsPage.unreadSuffix', { count: unreadCount })}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t('customNotificationsPage.backButton')}
            </Link>
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-notification">
            <Plus className="mr-2 h-4 w-4" /> {t('customNotificationsPage.addNotificationButton')}
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('customNotificationsPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-notifications"
              />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-priority">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t('customNotificationsPage.priorityFilterPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customNotificationsPage.allPriorities')}</SelectItem>
                <SelectItem value="high">{t('customNotificationsPage.priorityHigh')}</SelectItem>
                <SelectItem value="normal">{t('customNotificationsPage.priorityNormal')}</SelectItem>
                <SelectItem value="low">{t('customNotificationsPage.priorityLow')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder={t('customNotificationsPage.statusFilterPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customNotificationsPage.allStatus')}</SelectItem>
                <SelectItem value="unread">{t('customNotificationsPage.unreadOption')}</SelectItem>
                <SelectItem value="read">{t('customNotificationsPage.readOption')}</SelectItem>
              </SelectContent>
            </Select>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={handleMarkAllRead}
                disabled={bulkMarkAsReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                {t('customNotificationsPage.markAllReadButton')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('customNotificationsPage.selectedCount', { count: selectedCount })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkMarkRead}
                  disabled={bulkMarkAsReadMutation.isPending}
                  data-testid="button-bulk-mark-read"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {t('customNotificationsPage.markAsReadButton')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('customNotificationsPage.deleteButton')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('customNotificationsPage.clearButton')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications Table */}
      <Card>
        <CardContent className="p-0">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">
                {notifications.length === 0 ? t('customNotificationsPage.noNotificationsYetTitle') : t('customNotificationsPage.noMatchingNotificationsTitle')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {notifications.length === 0
                  ? t('customNotificationsPage.createFirstNotificationDescription')
                  : t('customNotificationsPage.adjustSearchOrFiltersDescription')}
              </p>
              {notifications.length === 0 && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> {t('customNotificationsPage.addNotificationButton')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort("title")}
                      className="flex items-center font-medium hover:text-primary transition-colors"
                      data-testid="sort-title"
                    >
                      {t('customNotificationsPage.titleColumn')}
                      <SortIcon column="title" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">{t('customNotificationsPage.descriptionColumn')}</TableHead>
                  <TableHead className="w-[100px]">
                    <button
                      onClick={() => handleSort("priority")}
                      className="flex items-center font-medium hover:text-primary transition-colors"
                      data-testid="sort-priority"
                    >
                      {t('customNotificationsPage.priorityColumn')}
                      <SortIcon column="priority" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[120px]">
                    <button
                      onClick={() => handleSort("date")}
                      className="flex items-center font-medium hover:text-primary transition-colors"
                      data-testid="sort-date"
                    >
                      {t('customNotificationsPage.dateColumn')}
                      <SortIcon column="date" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px] text-right">{t('customNotificationsPage.actionsColumn')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification: any) => (
                  <TableRow 
                    key={notification.id} 
                    className={!notification.isRead ? "bg-primary/5" : ""}
                    data-testid={`row-notification-${notification.id}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(notification.id)}
                        onCheckedChange={() => toggleSelect(notification.id)}
                        data-testid={`checkbox-notification-${notification.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      {!notification.isRead && (
                        <Circle className="h-2 w-2 fill-primary text-primary" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {notification.icon && iconComponents[notification.icon as IconName]}
                        <span className={!notification.isRead ? "font-semibold" : ""}>
                          {notification.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-muted-foreground text-sm line-clamp-1">
                        {notification.description}
                      </span>
                    </TableCell>
                    <TableCell>{renderPriorityBadge(notification.priority)}</TableCell>
                    <TableCell className="text-sm">{formatDate(notification.date)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${notification.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditClick(notification)}>
                            <Edit className="mr-2 h-4 w-4" /> {t('customNotificationsPage.editAction')}
                          </DropdownMenuItem>
                          {notification.isRead ? (
                            <DropdownMenuItem onClick={() => markAsUnreadMutation.mutate(notification.id)}>
                              <X className="mr-2 h-4 w-4" /> {t('customNotificationsPage.markAsUnreadAction')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => markAsReadMutation.mutate(notification.id)}>
                              <Check className="mr-2 h-4 w-4" /> {t('customNotificationsPage.markAsReadAction')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(notification)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> {t('customNotificationsPage.deleteAction')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('customNotificationsPage.createDialogTitle')}</DialogTitle>
            <DialogDescription>{t('customNotificationsPage.createDialogDescription')}</DialogDescription>
          </DialogHeader>
          <NotificationForm
            form={createForm}
            onSubmit={onCreateSubmit}
            isLoading={createMutation.isPending}
            submitText={t('customNotificationsPage.createSubmitButton')}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('customNotificationsPage.editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('customNotificationsPage.editDialogDescription')}</DialogDescription>
          </DialogHeader>
          <NotificationForm
            form={editForm}
            onSubmit={onEditSubmit}
            isLoading={updateMutation.isPending}
            submitText={t('customNotificationsPage.updateSubmitButton')}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('customNotificationsPage.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('customNotificationsPage.deleteDialogDescription', { title: selectedNotification?.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('customNotificationsPage.cancelButton')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => selectedNotification && deleteMutation.mutate(selectedNotification.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('customNotificationsPage.deleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomNotificationsPage;
