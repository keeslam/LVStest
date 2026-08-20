import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient , invalidateByPrefix } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  User as UserIcon, 
  Mail, 
  Calendar, 
  Shield, 
  KeyRound,
  AlertTriangle,
  Pencil
} from "lucide-react";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const profileFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  fullName: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const mileageOverridePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
type MileageOverridePasswordValues = z.infer<typeof mileageOverridePasswordSchema>;

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: user?.username || "",
      fullName: user?.fullName || "",
      email: user?.email || "",
    },
  });

  const passwordForm = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const mileageForm = useForm<MileageOverridePasswordValues>({
    resolver: zodResolver(mileageOverridePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (user && open) {
      profileForm.reset({
        username: user.username,
        fullName: user.fullName || "",
        email: user.email || "",
      });
    }
  }, [user, open, profileForm]);

  useEffect(() => {
    if (!open) {
      setActiveTab("profile");
      passwordForm.reset();
      mileageForm.reset();
    }
  }, [open, passwordForm, mileageForm]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await apiRequest("PATCH", `/api/users/${user?.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update profile");
      }
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/user");
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/users/change-password", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to change password");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your password has been changed successfully!",
      });
      passwordForm.reset();
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setMileagePasswordMutation = useMutation({
    mutationFn: async (data: MileageOverridePasswordValues) => {
      const res = await apiRequest("POST", `/api/users/${user?.id}/mileage-override-password`, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to set mileage override password");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Mileage override password has been set successfully.",
      });
      mileageForm.reset();
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createdAt = user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown";

  // Always render the Dialog to prevent unmounting issues
  return (
    <Dialog open={open && !!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        {user && (<Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <UserIcon className="h-4 w-4 mr-1" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="edit" data-testid="tab-edit-profile">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="password" data-testid="tab-change-password">
              <KeyRound className="h-4 w-4 mr-1" />
              Password
            </TabsTrigger>
            <TabsTrigger value="mileage" data-testid="tab-mileage-override">
              <Shield className="h-4 w-4 mr-1" />
              Mileage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">User Information</h3>
                <Badge variant={user.active ? "default" : "destructive"}>
                  {user.active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <UserIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Username</p>
                    <p className="font-medium">{user.username}</p>
                  </div>
                </div>

                {user.fullName && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Full Name</p>
                      <p className="font-medium">{user.fullName}</p>
                    </div>
                  </div>
                )}

                {user.email && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{user.email}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <div className="font-medium mt-1">
                      {user.role === UserRole.ADMIN ? (
                        <Badge variant="destructive">Administrator</Badge>
                      ) : user.role === UserRole.MANAGER ? (
                        <Badge>Manager</Badge>
                      ) : (
                        <Badge variant="outline">{user.role}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Member Since</p>
                    <p className="font-medium">{createdAt}</p>
                  </div>
                </div>
              </div>

              {user.permissions && user.permissions.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Additional Permissions</h4>
                  <div className="flex flex-wrap gap-2">
                    {user.permissions.map((permission) => (
                      <Badge key={permission} variant="outline">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="edit" className="mt-4">
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Username" {...field} data-testid="input-username" />
                      </FormControl>
                      <FormDescription>This is your login name.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-fullname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="email@example.com" type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("profile")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending || !profileForm.formState.isDirty}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate({ currentPassword: data.currentPassword, newPassword: data.newPassword }))} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter current password" {...field} data-testid="input-current-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter new password" {...field} data-testid="input-new-password" />
                      </FormControl>
                      <FormDescription>Password must be at least 6 characters.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm new password" {...field} data-testid="input-confirm-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      passwordForm.reset();
                      setActiveTab("profile");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="mileage" className="mt-4 space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Security Feature</AlertTitle>
              <AlertDescription>
                This password is required when decreasing vehicle mileage to prevent accidental or fraudulent odometer rollbacks.
              </AlertDescription>
            </Alert>

            <Form {...mileageForm}>
              <form onSubmit={mileageForm.handleSubmit((data) => setMileagePasswordMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={mileageForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Account Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter your account password" {...field} data-testid="input-mileage-current-password" />
                      </FormControl>
                      <FormDescription>Enter your account password to verify identity.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={mileageForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Mileage Override Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter new mileage override password" {...field} data-testid="input-mileage-new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={mileageForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm password" {...field} data-testid="input-mileage-confirm-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      mileageForm.reset();
                      setActiveTab("profile");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={setMileagePasswordMutation.isPending}
                    data-testid="button-set-mileage-password"
                  >
                    {setMileagePasswordMutation.isPending ? "Saving..." : "Set Password"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>)}
      </DialogContent>
    </Dialog>
  );
}
