import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["auth", "common"]);
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
        throw new Error(error.message || t('profileDialog.updateProfileFailed'));
      }
      return await res.json();
    },
    onSuccess: () => {
      invalidateByPrefix("/api/user");
      toast({
        title: t('profileDialog.profileUpdatedTitle'),
        description: t('profileDialog.profileUpdatedDescription'),
      });
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: t('profileDialog.updateFailedTitle'),
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
        throw new Error(errorData.message || t('profileDialog.changePasswordFailed'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('profileDialog.successTitle'),
        description: t('profileDialog.passwordChangedDescription'),
      });
      passwordForm.reset();
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: t('profileDialog.errorTitle'),
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
        throw new Error(error.message || t('profileDialog.setMileagePasswordFailed'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('profileDialog.successTitle'),
        description: t('profileDialog.mileagePasswordSetDescription'),
      });
      mileageForm.reset();
      setActiveTab("profile");
    },
    onError: (error: Error) => {
      toast({
        title: t('profileDialog.errorTitle'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createdAt = user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('profileDialog.unknown');

  // Always render the Dialog to prevent unmounting issues
  return (
    <Dialog open={open && !!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('profileDialog.title')}</DialogTitle>
        </DialogHeader>

        {user && (<Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <UserIcon className="h-4 w-4 mr-1" />
              {t('profileDialog.tabs.profile')}
            </TabsTrigger>
            <TabsTrigger value="edit" data-testid="tab-edit-profile">
              <Pencil className="h-4 w-4 mr-1" />
              {t('profileDialog.tabs.edit')}
            </TabsTrigger>
            <TabsTrigger value="password" data-testid="tab-change-password">
              <KeyRound className="h-4 w-4 mr-1" />
              {t('profileDialog.tabs.password')}
            </TabsTrigger>
            <TabsTrigger value="mileage" data-testid="tab-mileage-override">
              <Shield className="h-4 w-4 mr-1" />
              {t('profileDialog.tabs.mileage')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('profileDialog.userInformation')}</h3>
                <Badge variant={user.active ? "default" : "destructive"}>
                  {user.active ? t('profileDialog.active') : t('profileDialog.inactive')}
                </Badge>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <UserIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('profileDialog.username')}</p>
                    <p className="font-medium">{user.username}</p>
                  </div>
                </div>

                {user.fullName && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('profileDialog.fullName')}</p>
                      <p className="font-medium">{user.fullName}</p>
                    </div>
                  </div>
                )}

                {user.email && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('profileDialog.email')}</p>
                      <p className="font-medium">{user.email}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('profileDialog.role')}</p>
                    <div className="font-medium mt-1">
                      {user.role === UserRole.ADMIN ? (
                        <Badge variant="destructive">{t('profileDialog.administrator')}</Badge>
                      ) : user.role === UserRole.MANAGER ? (
                        <Badge>{t('profileDialog.manager')}</Badge>
                      ) : (
                        <Badge variant="outline">{user.role}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('profileDialog.memberSince')}</p>
                    <p className="font-medium">{createdAt}</p>
                  </div>
                </div>
              </div>

              {user.permissions && user.permissions.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">{t('profileDialog.additionalPermissions')}</h4>
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
                      <FormLabel>{t('profileDialog.username')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('profileDialog.username')} {...field} data-testid="input-username" />
                      </FormControl>
                      <FormDescription>{t('profileDialog.usernameHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileDialog.fullName')}</FormLabel>
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
                      <FormLabel>{t('profileDialog.email')}</FormLabel>
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
                    {t('common:actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending || !profileForm.formState.isDirty}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? t('profileDialog.saving') : t('profileDialog.saveChanges')}
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
                      <FormLabel>{t('profileDialog.currentPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.currentPasswordPlaceholder')} {...field} data-testid="input-current-password" />
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
                      <FormLabel>{t('profileDialog.newPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.newPasswordPlaceholder')} {...field} data-testid="input-new-password" />
                      </FormControl>
                      <FormDescription>{t('profileDialog.newPasswordHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileDialog.confirmNewPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.confirmNewPasswordPlaceholder')} {...field} data-testid="input-confirm-password" />
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
                    {t('common:actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    {changePasswordMutation.isPending ? t('profileDialog.updating') : t('profileDialog.changePassword')}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="mileage" className="mt-4 space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('profileDialog.mileageSecurityTitle')}</AlertTitle>
              <AlertDescription>
                {t('profileDialog.mileageSecurityDescription')}
              </AlertDescription>
            </Alert>

            <Form {...mileageForm}>
              <form onSubmit={mileageForm.handleSubmit((data) => setMileagePasswordMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={mileageForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileDialog.currentAccountPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.currentAccountPasswordPlaceholder')} {...field} data-testid="input-mileage-current-password" />
                      </FormControl>
                      <FormDescription>{t('profileDialog.currentAccountPasswordHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={mileageForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('profileDialog.newMileagePassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.newMileagePasswordPlaceholder')} {...field} data-testid="input-mileage-new-password" />
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
                      <FormLabel>{t('profileDialog.confirmPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t('profileDialog.confirmPasswordPlaceholder')} {...field} data-testid="input-mileage-confirm-password" />
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
                    {t('common:actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={setMileagePasswordMutation.isPending}
                    data-testid="button-set-mileage-password"
                  >
                    {setMileagePasswordMutation.isPending ? t('profileDialog.saving') : t('profileDialog.setPassword')}
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
