import { formatDate, formatDateTime } from "@/lib/format-utils";
import { deviceLabel, isDormant, DORMANT_AFTER_DAYS } from "@/lib/user-activity";
import { presetRightsFor } from "@shared/role-presets";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { User, UserRole, UserPermission } from "@shared/schema";
import { permissionLabel } from "@shared/permission-labels";
import {
  PERMISSION_DEPENDENCIES,
  enableRequiredRights,
  isAdminOnlyRight,
  missingOptional,
  missingRequired,
} from "@shared/permission-dependencies";
import { Shield, ShieldCheck, User as UserIcon, UserX, Trash2, Plus, Edit, Mail, Calendar, Check, X, Loader2, ArrowLeft, AlertTriangle, Monitor, LogOut, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "list" | "add" | "view" | "edit";

/** A row of GET /api/users; `isLastAdmin` is counted by the server (D19). */
type ListedUser = Omit<User, "password"> & { isLastAdmin?: boolean };

/**
 * Server messages are English; the client translates by the stable `code` the
 * server sends (apiRequest copies it onto the thrown Error) and never shows the
 * server's own text.
 */
function userErrorText(error: unknown, fallbackKey: string, t: (key: string) => string): string {
  switch ((error as { code?: string } | null)?.code) {
    case "PASSWORD_REQUIRED":
      return t('usersDialog.passwordRequired');
    case "PASSWORD_TOO_WEAK":
      return t('usersDialog.passwordTooWeak');
    case "USE_CHANGE_PASSWORD":
      return t('usersDialog.useChangePassword');
    case "USERNAME_EXISTS":
      return t('usersDialog.usernameExists');
    case "CANNOT_DELETE_SELF":
      return t('usersDialog.cannotDeleteSelf');
    case "LAST_ADMIN":
      return t('usersDialog.lastAdmin');
    case "PERMISSION_CEILING":
      return t('usersDialog.permissionCeiling');
    case "ADMIN_ACCOUNT_PROTECTED":
      return t('usersDialog.adminAccountProtected');
    default:
      return t(fallbackKey);
  }
}

/**
 * D13: the rights that account holds, for judging dependencies. Role admin
 * passes every check on the server, so for an admin every need is met.
 */
function effectiveRights(role: string | undefined, permissions: readonly string[] | undefined): string[] {
  return role === UserRole.ADMIN ? Object.values(UserPermission) : [...(permissions ?? [])];
}

/**
 * D13: one line under a right, "Heeft nodig: Voertuigen bekijken, ...". Grey
 * when the needed rights are on, amber with a warning icon when not. The rights
 * that only make part of a screen better ("optional") sit in the tooltip.
 */
function PermissionNeeds({ permission, held }: { permission: string; held: readonly string[] }) {
  const { t } = useTranslation(["settings"]);
  const dependency = PERMISSION_DEPENDENCIES[permission];
  if (!dependency || dependency.required.length === 0) return null;

  const satisfied = missingRequired(permission, held).length === 0;
  const optional = missingOptional(permission, held);
  return (
    <p
      className={`flex items-start gap-1 text-[11px] leading-tight ${satisfied ? "text-muted-foreground" : "text-amber-700"}`}
      data-testid={`permission-needs-${permission}`}
      data-satisfied={String(satisfied)}
      title={optional.length > 0 ? t('usersDialog.permissionOptional', { rights: optional.map(permissionLabel).join(", ") }) : undefined}
    >
      {!satisfied && <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />}
      <span>{t('usersDialog.permissionNeeds', { rights: dependency.required.map(permissionLabel).join(", ") })}</span>
    </p>
  );
}

export function UsersDialog({ open, onOpenChange }: UsersDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Omit<User, "password"> | null>(null);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const { data: users = [], isLoading } = useQuery<ListedUser[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error(t('usersDialog.fetchUsersFailed'));
      return response.json();
    },
    enabled: open && isAdmin,
  });

  const { data: selectedUser, isLoading: loadingUser } = useQuery<Omit<User, "password">>({
    queryKey: ["/api/users", selectedUserId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${selectedUserId}`);
      if (!response.ok) throw new Error(t('usersDialog.fetchUserFailed'));
      return response.json();
    },
    enabled: open && isAdmin && selectedUserId !== null && (viewMode === "view" || viewMode === "edit"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/users');
      toast({ title: t('usersDialog.successTitle'), description: t('usersDialog.userDeletedDescription') });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: t('usersDialog.errorTitle'), description: userErrorText(error, 'usersDialog.deleteUserFailed', t), variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.fullName && user.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleViewUser = (userId: number) => {
    setSelectedUserId(userId);
    setViewMode("view");
  };

  const handleEditUser = (userId: number) => {
    setSelectedUserId(userId);
    setViewMode("edit");
  };

  const handleDeleteUser = (user: Omit<User, "password">) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleBack = () => {
    setViewMode("list");
    setSelectedUserId(null);
  };

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      setViewMode("list");
      setSelectedUserId(null);
      setSearchTerm("");
    }
    onOpenChange(newOpen);
  };

  const handleFormSuccess = () => {
    invalidateByPrefix('/api/users');
    setViewMode("list");
    setSelectedUserId(null);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case UserRole.ADMIN:
        return <Badge variant="destructive">{t('usersDialog.roles.admin')}</Badge>;
      case UserRole.MANAGER:
        return <Badge variant="default">{t('usersDialog.roles.manager')}</Badge>;
      case UserRole.USER:
        return <Badge variant="outline">{t('usersDialog.roles.user')}</Badge>;
      case UserRole.CLEANER:
        return <Badge variant="secondary">{t('usersDialog.roles.cleaner')}</Badge>;
      case UserRole.VIEWER:
        return <Badge variant="secondary">{t('usersDialog.roles.viewer')}</Badge>;
      case UserRole.ACCOUNTANT:
        return <Badge variant="secondary">{t('usersDialog.roles.accountant')}</Badge>;
      case UserRole.MAINTENANCE:
        return <Badge variant="secondary">{t('usersDialog.roles.maintenance')}</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const renderList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder={t('usersDialog.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
          data-testid="dialog-user-search"
        />
        <Button onClick={() => setViewMode("add")} data-testid="dialog-add-user-button">
          <Plus className="h-4 w-4 mr-2" />
          {t('usersDialog.addUser')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('usersDialog.noUsersFound')}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {!user.active ? (
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <UserIcon className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.username}</span>
                      <div className="flex items-center gap-1">
                        {user.role === UserRole.ADMIN ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <Shield className="h-3 w-3" />
                        )}
                        {getRoleBadge(user.role)}
                      </div>
                      <Badge variant={user.active ? "success" : "secondary"} className="text-xs">
                        {user.active ? t('usersDialog.active') : t('usersDialog.inactive')}
                      </Badge>
                      {isDormant(user) && (
                        <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-800" data-testid={`badge-dormant-${user.id}`}
                          title={t('usersDialog.dormantHint', { days: DORMANT_AFTER_DAYS })}>
                          {t('usersDialog.dormant')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user.fullName || "-"} {user.email ? `• ${user.email}` : ""}
                      {" • "}{user.lastLoginAt ? t('usersDialog.lastLoginShort', { at: formatDate(user.lastLoginAt) }) : t('usersDialog.neverLoggedIn')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewUser(user.id)}
                    data-testid={`dialog-view-user-${user.id}`}
                  >
                    {t('usersDialog.view')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf}
                    onClick={() => handleEditUser(user.id)}
                    data-testid={`dialog-edit-user-${user.id}`}
                  >
                    {t('usersDialog.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf || user.isLastAdmin === true}
                    title={
                      isSelf
                        ? t('usersDialog.cannotDeleteSelf')
                        : user.isLastAdmin === true
                          ? t('usersDialog.cannotDeleteLastAdmin')
                          : undefined
                    }
                    onClick={() => handleDeleteUser(user)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`dialog-delete-user-${user.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAddUser = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('usersDialog.back')}
        </Button>
        <h2 className="text-lg font-semibold">{t('usersDialog.addNewUserTitle')}</h2>
      </div>
      <UserFormInDialog onSuccess={handleFormSuccess} />
    </div>
  );

  const renderViewUser = () => {
    if (loadingUser || !selectedUser) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    const isSelf = currentUser?.id === selectedUser.id;
    const createdAt = selectedUser.createdAt ? formatDate(selectedUser.createdAt) : t('usersDialog.unknown');
    const updatedAt = selectedUser.updatedAt ? formatDate(selectedUser.updatedAt) : t('usersDialog.unknown');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('usersDialog.back')}
            </Button>
            <h2 className="text-lg font-semibold">{t('usersDialog.userLabel', { username: selectedUser.username })}</h2>
          </div>
          {!isSelf && (
            <Button size="sm" onClick={() => setViewMode("edit")}>
              <Edit className="h-4 w-4 mr-1" />
              {t('usersDialog.edit')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('usersDialog.userInformation')}</CardTitle>
              <Badge variant={selectedUser.active ? "success" : "destructive"} className="w-fit">
                {selectedUser.active ? t('usersDialog.active') : t('usersDialog.inactive')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">{t('usersDialog.username')}</p>
                  <p className="font-medium">{selectedUser.username}</p>
                </div>
              </div>
              {selectedUser.fullName && (
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground text-xs">{t('usersDialog.fullName')}</p>
                    <p className="font-medium">{selectedUser.fullName}</p>
                  </div>
                </div>
              )}
              {selectedUser.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground text-xs">{t('usersDialog.email')}</p>
                    <p className="font-medium">{selectedUser.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">{t('usersDialog.role')}</p>
                  {getRoleBadge(selectedUser.role)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">{t('usersDialog.createdUpdated')}</p>
                  <p className="font-medium">{createdAt} / {updatedAt}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">{t('usersDialog.lastLogin')}</p>
                  <p className="font-medium" data-testid="user-last-login">
                    {selectedUser.lastLoginAt ? formatDateTime(selectedUser.lastLoginAt) : t('usersDialog.neverLoggedIn')}
                    {isDormant(selectedUser) && <Badge variant="outline" className="ml-2 text-xs border-amber-300 bg-amber-50 text-amber-800">{t('usersDialog.dormant')}</Badge>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('usersDialog.permissions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {Object.values(UserPermission).map((permission) => {
                  const hasPermission =
                    selectedUser.role === UserRole.ADMIN ||
                    (selectedUser.permissions && selectedUser.permissions.includes(permission));
                  return (
                    <div
                      key={permission}
                      className={`flex items-start gap-2 p-1.5 rounded-md ${hasPermission ? "bg-muted/50" : ""}`}
                    >
                      {hasPermission ? (
                        <Check className="mt-0.5 h-3 w-3 text-primary" />
                      ) : (
                        <X className="mt-0.5 h-3 w-3 text-muted-foreground" />
                      )}
                      <div className="space-y-0.5">
                        <span className={`text-xs ${hasPermission ? "font-medium" : "text-muted-foreground"}`}>
                          {permissionLabel(permission)}
                        </span>
                        {isAdminOnlyRight(permission) && (
                          <p className="text-[11px] leading-tight text-muted-foreground" data-testid={`permission-admin-only-${permission}`}>
                            {t('usersDialog.adminOnlyRight')}
                          </p>
                        )}
                        {/* A right the account does not hold has nothing to depend on. */}
                        {hasPermission && selectedUser.role !== UserRole.ADMIN && (
                          <PermissionNeeds
                            permission={permission}
                            held={effectiveRights(selectedUser.role, selectedUser.permissions)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <UserSessionsCard userId={selectedUser.id} isSelf={isSelf} />
      </div>
    );
  };

  const renderEditUser = () => {
    if (loadingUser || !selectedUser) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('usersDialog.back')}
          </Button>
          <h2 className="text-lg font-semibold">{t('usersDialog.editUserLabel', { username: selectedUser.username })}</h2>
        </div>
        <UserFormInDialog user={selectedUser} isEdit onSuccess={handleFormSuccess} />
      </div>
    );
  };

  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('usersDialog.accessDeniedTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">{t('usersDialog.accessDeniedMessage')}</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              {t('usersDialog.userManagementTitle')}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(85vh-100px)] px-6 pb-6">
            <div className="pt-4">
              {viewMode === "list" && renderList()}
              {viewMode === "add" && renderAddUser()}
              {viewMode === "view" && renderViewUser()}
              {viewMode === "edit" && renderEditUser()}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('usersDialog.deleteUserTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('usersDialog.deleteUserConfirm', { username: userToDelete?.username })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
              data-testid="dialog-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? t('usersDialog.deleting') : t('usersDialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { makeUserFormSchema, type UserFormValues } from "@/lib/user-form-schema";
import { apiRequest , invalidateByPrefix } from "@/lib/queryClient";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

interface UserFormInDialogProps {
  user?: Omit<User, "password">;
  isEdit?: boolean;
  onSuccess: () => void;
}

function UserFormInDialog({ user, isEdit = false, onSuccess }: UserFormInDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserFormValues>({
    // Built per render so the messages follow the language switch (A-17-6).
    resolver: zodResolver(makeUserFormSchema((key) => t(key), isEdit)),
    defaultValues: {
      username: user?.username || "",
      password: "",
      email: user?.email || "",
      fullName: user?.fullName || "",
      role: user?.role || UserRole.USER,
      // B-65: a new account starts with the rights of its default role.
      permissions: user ? user.permissions || [] : presetRightsFor(UserRole.USER),
      active: user?.active !== undefined ? user?.active : true,
      hidePrices: (user as any)?.hidePrices || false,
    },
  });

  // D13: the rights as they are ticked right now, and the role they would apply to.
  const tickedRole = form.watch("role");
  const tickedRights = form.watch("permissions") ?? [];
  const heldRights = effectiveRights(tickedRole, tickedRights);
  const isAdminTarget = tickedRole === UserRole.ADMIN;
  const anyRequiredMissing = !isAdminTarget && tickedRights.some((right) => missingRequired(right, tickedRights).length > 0);

  // B-65: rights from the role's preset, or copied from a colleague. Both only fill the boxes;
  // nothing is saved until the form is. A right only an admin can use is left off for others.
  const { data: colleagues = [] } = useQuery<ListedUser[]>({ queryKey: ["/api/users"] });
  const copyCandidates = colleagues.filter((u) => u.id !== user?.id && u.role !== UserRole.ADMIN);
  const applyRights = (rights: readonly string[]) =>
    form.setValue("permissions", isAdminTarget ? [...rights] : rights.filter((right) => !isAdminOnlyRight(right)), { shouldDirty: true });

  const createMutation = useMutation({
    mutationFn: async (userData: UserFormValues) => {
      // apiRequest throws on a non-2xx answer and carries the body's `code` on the error.
      const res = await apiRequest("POST", "/api/users", userData);
      return res.json();
    },
    onSuccess: (_created, variables) => {
      invalidateByPrefix("/api/users");
      // A-17-2 / A-17-7: the form used to close without a word.
      toast({
        title: t('usersDialog.successTitle'),
        description: t('usersDialog.userCreatedDescription', { username: variables.username }),
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: t('usersDialog.errorTitle'), description: userErrorText(error, 'usersDialog.createUserFailed', t), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (userData: UserFormValues) => {
      if (!user?.id) throw new Error(t('usersDialog.userIdRequired'));
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, userData);
      return res.json();
    },
    onSuccess: (_updated, variables) => {
      invalidateByPrefix("/api/users");
      toast({
        title: t('usersDialog.successTitle'),
        description: t('usersDialog.userSavedDescription', { username: user?.username ?? variables.username }),
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: t('usersDialog.errorTitle'), description: userErrorText(error, 'usersDialog.updateUserFailed', t), variant: "destructive" });
    },
  });

  const onSubmit = (data: UserFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      // A new account needs a real password (the schema checks it, and the
      // server answers 400 PASSWORD_REQUIRED for a blank one). Only the edit
      // form treats a blank password as "keep the current one".
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      {/* noValidate: the browser's own e-mail check speaks the browser's language; the schema's message is Dutch (A-17-6). */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('usersDialog.username')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('usersDialog.usernamePlaceholder')} {...field} disabled={isEdit} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isEdit ? t('usersDialog.newPasswordLeaveEmpty') : t('usersDialog.password')}</FormLabel>
                <FormControl>
                  <Input type="password" placeholder={t('usersDialog.passwordPlaceholder')} {...field} />
                </FormControl>
                <FormDescription className="text-xs">{t('usersDialog.passwordHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('usersDialog.fullName')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('usersDialog.fullNamePlaceholder')} {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('usersDialog.email')}</FormLabel>
                <FormControl>
                  <Input type="email" placeholder={t('usersDialog.emailPlaceholder')} {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('usersDialog.role')}</FormLabel>
                <Select
                  onValueChange={(role) => {
                    field.onChange(role);
                    // A new account starts with the role's rights; an existing one keeps its own
                    // until "Rechten van de rol" is clicked below.
                    if (!isEdit) form.setValue("permissions", presetRightsFor(role), { shouldDirty: true });
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('usersDialog.selectRole')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={UserRole.ADMIN}>{t('usersDialog.roles.admin')}</SelectItem>
                    <SelectItem value={UserRole.MANAGER}>{t('usersDialog.roles.manager')}</SelectItem>
                    <SelectItem value={UserRole.USER}>{t('usersDialog.roles.user')}</SelectItem>
                    <SelectItem value={UserRole.CLEANER}>{t('usersDialog.roles.cleaner')}</SelectItem>
                    <SelectItem value={UserRole.VIEWER}>{t('usersDialog.roles.viewer')}</SelectItem>
                    <SelectItem value={UserRole.ACCOUNTANT}>{t('usersDialog.roles.accountant')}</SelectItem>
                    <SelectItem value={UserRole.MAINTENANCE}>{t('usersDialog.roles.maintenance')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>{t('usersDialog.active')}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('usersDialog.activeHint')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hidePrices"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>{t('usersDialog.hidePrices')}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('usersDialog.hidePricesHint')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-hide-prices" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="permissions"
          render={() => (
            <FormItem>
              <FormLabel>{t('usersDialog.additionalPermissions')}</FormLabel>
              <FormDescription className="text-xs">
                {t('usersDialog.selectAdditionalPermissions')}
              </FormDescription>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!anyRequiredMissing}
                  onClick={() => form.setValue("permissions", enableRequiredRights(form.getValues("permissions") ?? []), { shouldDirty: true })}
                  data-testid="button-enable-required-rights"
                >
                  {t('usersDialog.enableRequiredRights')}
                </Button>
                <span className="text-xs text-muted-foreground">{t('usersDialog.enableRequiredRightsHint')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1" data-testid="rights-presets">
                <Button type="button" variant="outline" size="sm" onClick={() => applyRights(presetRightsFor(tickedRole))} data-testid="button-role-preset">
                  {t('usersDialog.rolePreset', { role: t(`usersDialog.roles.${tickedRole}`) })}
                </Button>
                {copyCandidates.length > 0 && (
                  <Select value="" onValueChange={(id) => {
                    const source = copyCandidates.find((u) => String(u.id) === id);
                    if (source) {
                      applyRights(source.permissions ?? []);
                      toast({ title: t('usersDialog.rightsCopied', { username: source.username }) });
                    }
                  }}>
                    <SelectTrigger className="h-8 w-auto min-w-[14rem] text-sm" data-testid="select-copy-rights">
                      <SelectValue placeholder={t('usersDialog.copyRightsFrom')} />
                    </SelectTrigger>
                    <SelectContent>
                      {copyCandidates.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.fullName ? `${u.fullName} (${u.username})` : u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {Object.values(UserPermission).map((permission) => (
                  <FormField
                    key={permission}
                    control={form.control}
                    name="permissions"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(permission)}
                            // D13: a right only an administrator can use stays off for a
                            // non-admin account (an already ticked one can still be removed).
                            disabled={isAdminOnlyRight(permission) && !isAdminTarget && !field.value?.includes(permission)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) {
                                field.onChange([...current, permission]);
                              } else {
                                field.onChange(current.filter((p) => p !== permission));
                              }
                            }}
                          />
                        </FormControl>
                        <div className="space-y-0.5">
                          <FormLabel className="text-xs font-normal cursor-pointer">
                            {permissionLabel(permission)}
                          </FormLabel>
                          {isAdminOnlyRight(permission) && (
                            <p className="text-[11px] leading-tight text-muted-foreground" data-testid={`permission-admin-only-${permission}`}>
                              {t('usersDialog.adminOnlyRight')}
                            </p>
                          )}
                          <PermissionNeeds permission={permission} held={heldRights} />
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? t('usersDialog.saving') : isEdit ? t('usersDialog.updateUser') : t('usersDialog.createUser')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

interface UserSessionRow { id: number; ipAddress: string | null; userAgent: string | null; lastActivity: string; createdAt: string; current: boolean }

/**
 * B-65: where this account is logged in, and "Overal uitloggen". On your own account the
 * session you are using stays; every other browser has to log in again.
 */
function UserSessionsCard({ userId, isSelf }: { userId: number; isSelf: boolean }) {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const key = [`/api/users/${userId}/sessions`];
  const { data: sessions = [], isLoading } = useQuery<UserSessionRow[]>({ queryKey: key });
  const revoke = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/users/${userId}/revoke-sessions`)).json() as Promise<{ revoked: number }>,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: t('usersDialog.sessions.revoked', { count: r.revoked }) });
      setConfirming(false);
    },
    onError: () => { toast({ title: t('usersDialog.sessions.revokeFailed'), variant: "destructive" }); setConfirming(false); },
  });
  const others = sessions.filter((s) => !s.current).length;
  return (
    <Card data-testid="user-sessions-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Monitor className="h-4 w-4" />{t('usersDialog.sessions.title')}</CardTitle>
        <Button size="sm" variant="outline" disabled={(isSelf ? others : sessions.length) === 0 || revoke.isPending}
          onClick={() => setConfirming(true)} data-testid="button-revoke-sessions">
          <LogOut className="h-4 w-4 mr-1" />{t('usersDialog.sessions.revokeAll')}
        </Button>
      </CardHeader>
      <CardContent className="text-sm">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : sessions.length === 0 ? (
          <p className="text-muted-foreground">{t('usersDialog.sessions.none')}</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => {
              const d = deviceLabel(s.userAgent);
              const name = [d.browser, d.os].filter(Boolean).join(t('usersDialog.sessions.on')) || t('usersDialog.sessions.unknownDevice');
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid={`user-session-${s.id}`}>
                  <span className="font-medium">{name}{s.current && <Badge variant="secondary" className="ml-2 text-[11px]">{t('usersDialog.sessions.thisDevice')}</Badge>}</span>
                  <span className="text-xs text-muted-foreground">{s.ipAddress ?? "—"} · {t('usersDialog.sessions.lastActive', { at: formatDateTime(s.lastActivity) })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('usersDialog.sessions.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t(isSelf ? 'usersDialog.sessions.confirmSelf' : 'usersDialog.sessions.confirmOther')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); revoke.mutate(); }} data-testid="button-confirm-revoke-sessions">
              {t('usersDialog.sessions.revokeAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
