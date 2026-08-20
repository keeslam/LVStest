import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { User, UserRole, UserPermission } from "@shared/schema";
import { Shield, ShieldCheck, User as UserIcon, UserX, Trash2, Plus, Edit, Mail, Calendar, Check, X, Loader2, ArrowLeft } from "lucide-react";
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

export function UsersDialog({ open, onOpenChange }: UsersDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Omit<User, "password"> | null>(null);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const { data: users = [], isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: open && isAdmin,
  });

  const { data: selectedUser, isLoading: loadingUser } = useQuery<Omit<User, "password">>({
    queryKey: ["/api/users", selectedUserId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${selectedUserId}`);
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
    enabled: open && isAdmin && selectedUserId !== null && (viewMode === "view" || viewMode === "edit"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete user');
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateByPrefix('/api/users');
      toast({ title: "Success", description: "User deleted successfully" });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
        return <Badge variant="destructive">Admin</Badge>;
      case UserRole.MANAGER:
        return <Badge variant="default">Manager</Badge>;
      case UserRole.USER:
        return <Badge variant="outline">User</Badge>;
      case UserRole.CLEANER:
        return <Badge variant="secondary">Cleaner</Badge>;
      case UserRole.VIEWER:
        return <Badge variant="secondary">Viewer</Badge>;
      case UserRole.ACCOUNTANT:
        return <Badge variant="secondary">Accountant</Badge>;
      case UserRole.MAINTENANCE:
        return <Badge variant="secondary">Maintenance</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const renderList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
          data-testid="dialog-user-search"
        />
        <Button onClick={() => setViewMode("add")} data-testid="dialog-add-user-button">
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No users found
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
                        {user.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user.fullName || "-"} {user.email ? `• ${user.email}` : ""}
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
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf}
                    onClick={() => handleEditUser(user.id)}
                    data-testid={`dialog-edit-user-${user.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSelf}
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
          Back
        </Button>
        <h2 className="text-lg font-semibold">Add New User</h2>
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
    const createdAt = selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : "Unknown";
    const updatedAt = selectedUser.updatedAt ? new Date(selectedUser.updatedAt).toLocaleDateString() : "Unknown";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h2 className="text-lg font-semibold">User: {selectedUser.username}</h2>
          </div>
          {!isSelf && (
            <Button size="sm" onClick={() => setViewMode("edit")}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">User Information</CardTitle>
              <Badge variant={selectedUser.active ? "success" : "destructive"} className="w-fit">
                {selectedUser.active ? "Active" : "Inactive"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Username</p>
                  <p className="font-medium">{selectedUser.username}</p>
                </div>
              </div>
              {selectedUser.fullName && (
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground text-xs">Full Name</p>
                    <p className="font-medium">{selectedUser.fullName}</p>
                  </div>
                </div>
              )}
              {selectedUser.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium">{selectedUser.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Role</p>
                  {getRoleBadge(selectedUser.role)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Created / Updated</p>
                  <p className="font-medium">{createdAt} / {updatedAt}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Permissions</CardTitle>
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
                      className={`flex items-center gap-2 p-1.5 rounded-md ${hasPermission ? "bg-muted/50" : ""}`}
                    >
                      {hasPermission ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <X className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className={`text-xs ${hasPermission ? "font-medium" : "text-muted-foreground"}`}>
                        {permission}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
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
            Back
          </Button>
          <h2 className="text-lg font-semibold">Edit User: {selectedUser.username}</h2>
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
            <DialogTitle>Access Denied</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">You don't have permission to access this feature.</p>
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
              User Management
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
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user "{userToDelete?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
              data-testid="dialog-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().optional(),
  email: z.string().email("Please enter a valid email address").or(z.literal("")).optional().nullable(),
  fullName: z.string().or(z.literal("")).optional().nullable(),
  role: z.string().default(UserRole.USER),
  permissions: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormInDialogProps {
  user?: Omit<User, "password">;
  isEdit?: boolean;
  onSuccess: () => void;
}

function UserFormInDialog({ user, isEdit = false, onSuccess }: UserFormInDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: user?.username || "",
      password: "",
      email: user?.email || "",
      fullName: user?.fullName || "",
      role: user?.role || UserRole.USER,
      permissions: user?.permissions || [],
      active: user?.active !== undefined ? user?.active : true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (userData: UserFormValues) => {
      const res = await apiRequest("POST", "/api/users", userData);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/users");
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (userData: UserFormValues) => {
      if (!user?.id) throw new Error("User ID required");
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, userData);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/users");
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: UserFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="Enter username" {...field} disabled={isEdit} />
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
                <FormLabel>{isEdit ? "New Password (leave empty to keep)" : "Password"}</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Enter password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter full name" {...field} value={field.value || ""} />
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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter email" {...field} value={field.value || ""} />
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
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                    <SelectItem value={UserRole.MANAGER}>Manager</SelectItem>
                    <SelectItem value={UserRole.USER}>User</SelectItem>
                    <SelectItem value={UserRole.CLEANER}>Cleaner</SelectItem>
                    <SelectItem value={UserRole.VIEWER}>Viewer</SelectItem>
                    <SelectItem value={UserRole.ACCOUNTANT}>Accountant</SelectItem>
                    <SelectItem value={UserRole.MAINTENANCE}>Maintenance</SelectItem>
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
                  <FormLabel>Active</FormLabel>
                  <FormDescription className="text-xs">
                    User can log in when active
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
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
              <FormLabel>Additional Permissions</FormLabel>
              <FormDescription className="text-xs">
                Select additional permissions for this user
              </FormDescription>
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
                        <FormLabel className="text-xs font-normal cursor-pointer">
                          {permission}
                        </FormLabel>
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
            {isPending ? "Saving..." : isEdit ? "Update User" : "Create User"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
